use p2p_cdn::{DhtNode, NodeId, NodeInfo, MIGRATION_INTERVAL};
use std::net::SocketAddr;
use std::time::Duration;
use tracing::{info, warn};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let args: Vec<String> = std::env::args().collect();

    let listen_port = if args.len() > 1 {
        args[1].parse()?
    } else {
        8081
    };

    let bootstrap_port = if args.len() > 2 {
        args[2].parse()?
    } else {
        8080
    };

    let listen_addr: SocketAddr = format!("0.0.0.0:{}", listen_port).parse()?;
    let bootstrap_addr: SocketAddr = format!("127.0.0.1:{}", bootstrap_port).parse()?;

    let bootstrap_id = NodeId::from_hash(b"bootstrap-node-1");
    let bootstrap_nodes = vec![NodeInfo::new(bootstrap_id, bootstrap_addr)];

    info!("Starting P2P CDN node...");
    info!("Listen address: {}", listen_addr);
    info!("Bootstrap node: {}", bootstrap_addr);

    let (node, mut incoming_rx) = DhtNode::new(listen_addr, bootstrap_nodes).await?;
    let node_arc = std::sync::Arc::new(node);

    let node_clone = node_arc.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(3)).await;
        if let Err(e) = node_clone.bootstrap().await {
            warn!("Bootstrap warning: {}", e);
        }
    });

    let node_clone = node_arc.clone();
    tokio::spawn(async move {
        while let Some((request, addr)) = incoming_rx.recv().await {
            if let Err(e) = node_clone.handle_request(request, addr).await {
                warn!("Error handling request: {}", e);
            }
        }
    });

    let node_clone = node_arc.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(300));
        loop {
            interval.tick().await;
            let _ = node_clone.cleanup_routing_table().await;
            let _ = node_clone.republish_data().await;
        }
    });

    let node_clone = node_arc.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(60));
        loop {
            interval.tick().await;
            let alive = node_clone.probe_suspected_nodes().await;
            if alive > 0 {
                info!("Probe completed: {} suspected nodes are alive", alive);
            }
        }
    });

    let node_clone = node_arc.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(MIGRATION_INTERVAL);
        loop {
            interval.tick().await;
            match node_clone.migrate_replicas().await {
                Ok((added, removed)) => {
                    if added > 0 || removed > 0 {
                        info!("Replica migration: added {}, removed {}", added, removed);
                    }
                }
                Err(e) => warn!("Migration error: {}", e),
            }
        }
    });

    let node_clone = node_arc.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(30));
        loop {
            interval.tick().await;
            let stats = node_clone.get_routing_table_stats().await;
            let storage = node_clone.storage();
            let all_data = storage.get_all_with_hotness();
            
            let hot_count = all_data.iter().filter(|(_, h, _)| matches!(h, p2p_cdn::HotnessLevel::Hot)).count();
            let warm_count = all_data.iter().filter(|(_, h, _)| matches!(h, p2p_cdn::HotnessLevel::Warm)).count();
            let cold_count = all_data.iter().filter(|(_, h, _)| matches!(h, p2p_cdn::HotnessLevel::Cold)).count();
            
            info!(
                "Routing table: alive={}, suspected={}, offline={}, replacement={}",
                stats.total_alive, stats.total_suspected, stats.total_offline, stats.total_replacement
            );
            info!(
                "Data hotness: hot={}, warm={}, cold={}, total={}",
                hot_count, warm_count, cold_count, all_data.len()
            );
        }
    });

    info!("Node running. Press Ctrl+C to exit.");

    tokio::signal::ctrl_c().await?;
    info!("Shutting down...");

    Ok(())
}
