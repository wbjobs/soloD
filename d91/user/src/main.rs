use aya::{
    include_bytes_aligned,
    maps::{HashMap, MapData},
    programs::TracePoint,
    Bpf,
};
use axum::{
    extract::State,
    http::{HeaderValue, StatusCode},
    response::IntoResponse,
    routing::get,
    Router,
};
use axum_extra::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use clap::Parser;
use nix::sys::capability::{CapSet, Capability, CapFlags};
use secmon::SyscallEvent;
use std::{
    net::SocketAddr,
    sync::{Arc, Mutex},
};
use tokio::sync::broadcast;
use tower_http::cors::{Any, CorsLayer};
use tracing::{debug, error, info, warn};

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[arg(short, long)]
    pid: Vec<u32>,

    #[arg(short, long, default_value_t = 3030)]
    port: u16,
}

struct AppState {
    tx: broadcast::Sender<serde_json::Value>,
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: Arc<AppState>) {
    let mut rx = state.tx.subscribe();

    info!("New WebSocket connection established");

    tokio::spawn(async move {
        while let Ok(event) = rx.recv().await {
            if let Ok(json_str) = serde_json::to_string(&event) {
                if socket.send(Message::Text(json_str)).await.is_err() {
                    break;
                }
            }
        }
    });
}

async fn health_handler() -> impl IntoResponse {
    StatusCode::OK
}

fn check_permissions() -> Result<(), Box<dyn std::error::Error>> {
    // Check if running as root
    let euid = unsafe { libc::geteuid() };
    if euid != 0 {
        return Err(
            "ERROR: This program requires root privileges to load eBPF programs.\n\
             Please run with 'sudo' or ensure CAP_SYS_ADMIN, CAP_BPF, and CAP_PERFMON capabilities are set.\n\
             Example: sudo ./target/release/secmon".into()
        );
    }

    // Check for required capabilities
    if let Ok(current) = CapSet::from_pid(nix::unistd::Pid::this(), CapSet::Effective) {
        let required_caps = [
            (Capability::CAP_SYS_ADMIN, "Required for eBPF program loading"),
            (Capability::CAP_BPF, "Required for BPF operations"),
            (Capability::CAP_PERFMON, "Required for performance monitoring"),
        ];

        for (cap, desc) in required_caps.iter() {
            if !current.has_cap(*cap, CapFlags::empty()) {
                warn!("Capability {:?} not found ({}). This may cause issues.", cap, desc);
            }
        }
    }

    info!("Root privileges confirmed - eBPF loading should work");
    Ok(())
}

fn load_bpf() -> Result<Bpf, Box<dyn std::error::Error>> {
    // Try to load from common locations
    let possible_paths = [
        "./target/release/secmon-ebpf.o",
        "./ebpf/target/release/secmon-ebpf",
        "/usr/lib/secmon/secmon-ebpf.o",
    ];

    for path in &possible_paths {
        if std::path::Path::new(path).exists() {
            info!("Loading eBPF program from: {}", path);
            let bytes = std::fs::read(path)?;
            return Ok(Bpf::load(&bytes)?);
        }
    }

    // Fallback: try to find in target directory
    let target_path = std::path::Path::new("target");
    if target_path.exists() {
        if let Ok(entries) = std::fs::read_dir(target_path) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let obj_path = path.join("release/secmon-ebpf.o");
                    if obj_path.exists() {
                        info!("Loading eBPF program from: {}", obj_path.display());
                        let bytes = std::fs::read(obj_path)?;
                        return Ok(Bpf::load(&bytes)?);
                    }
                }
            }
        }
    }

    Err("Could not find eBPF object file. Please build using: ./build-ebpf.sh".into())
}

fn attach_tracepoints(bpf: &mut Bpf) -> Result<(), Box<dyn std::error::Error>> {
    let tracepoints = [
        ("sys_enter_openat", "syscalls"),
        ("sys_enter_execve", "syscalls"),
        ("sys_enter_connect", "syscalls"),
    ];

    for (name, category) in tracepoints {
        let program: &mut TracePoint = bpf.program_mut(name).unwrap().try_into()?;
        program.load()?;
        program.attach(category, name)?;
        info!("Attached tracepoint: {}", name);
    }

    Ok(())
}

fn set_target_pids(bpf: &mut Bpf, pids: &[u32]) -> Result<(), Box<dyn std::error::Error>> {
    let mut target_pids: HashMap<_, u32, u8> = HashMap::try_from(bpf.map_mut("TARGET_PIDS").unwrap())?;

    for &pid in pids {
        target_pids.insert(pid, 1, 0)?;
        info!("Monitoring PID: {}", pid);
    }

    Ok(())
}

fn process_events(
    bpf: &mut Bpf,
    tx: broadcast::Sender<serde_json::Value>,
) -> Result<(), Box<dyn std::error::Error>> {
    use aya::maps::PerfEventArray;
    
    let mut events: PerfEventArray<_, SyscallEvent> = PerfEventArray::try_from(bpf.map_mut("EVENTS").unwrap())?;
    
    let mut buffers = events.buffers(None, 1024)?;

    std::thread::spawn(move || {
        loop {
            match buffers.read_events() {
                Ok(mut events) => {
                    for event in events.iter() {
                        let json = event.to_json();
                        debug!("Event: {:?}", json);
                        let _ = tx.send(json);
                    }
                }
                Err(e) => {
                    error!("Error reading events: {}", e);
                }
            }
        }
    });

    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let args = Args::parse();

    info!("Starting Security Monitor...");

    // Check permissions before proceeding
    if let Err(e) = check_permissions() {
        error!("{}", e);
        std::process::exit(1);
    }

    // Load eBPF program with better error handling
    let mut bpf = match load_bpf() {
        Ok(bpf) => {
            info!("eBPF program loaded successfully");
            bpf
        }
        Err(e) => {
            error!("Failed to load eBPF program: {}", e);
            error!("Hint: Make sure you ran 'make build-ebpf' to compile the eBPF program");
            std::process::exit(1);
        }
    };

    // Attach tracepoints
    if let Err(e) = attach_tracepoints(&mut bpf) {
        error!("Failed to attach tracepoints: {}", e);
        error!("Hint: Ensure your kernel supports eBPF tracepoints (Linux >= 5.8)");
        std::process::exit(1);
    }
    info!("Tracepoints attached");

    if !args.pid.is_empty() {
        set_target_pids(&mut bpf, &args.pid)?;
    } else {
        info!("No target PIDs specified - monitoring all processes");
    }

    let (tx, _rx) = broadcast::channel(1000);

    process_events(&mut bpf, tx.clone())?;
    info!("Event processing started");

    let app_state = Arc::new(AppState { tx });

    // Configure CORS to allow WebSocket connections from any origin
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/ws", get(ws_handler))
        .route("/health", get(health_handler))
        .layer(cors)
        .with_state(app_state);

    let addr = SocketAddr::from(([0, 0, 0, 0], args.port));
    info!("WebSocket server listening on ws://{}", addr);
    info!("Accepting connections from any origin (CORS enabled)");

    if let Err(e) = axum::Server::bind(&addr)
        .serve(app.into_make_service())
        .await
    {
        error!("Server error: {}", e);
        std::process::exit(1);
    }

    Ok(())
}
