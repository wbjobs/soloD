#![no_std]
#![no_main]

use aya_ebpf::{
    bindings::xdp_action,
    macros::{map, tracepoint},
    maps::{HashMap, PerfEventArray},
    programs::TracePointContext,
    EbpfContext,
};
use aya_log_ebpf::info;

#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct SyscallEvent {
    pub timestamp: u64,
    pub pid: u32,
    pub comm: [u8; 16],
    pub syscall_type: SyscallType,
    pub args: SyscallArgs,
}

#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyscallType {
    Openat,
    Execve,
    Connect,
}

#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub union SyscallArgs {
    pub openat: OpenatArgs,
    pub execve: ExecveArgs,
    pub connect: ConnectArgs,
}

#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct OpenatArgs {
    pub dfd: i32,
    pub filename: [u8; 256],
    pub flags: i32,
    pub mode: u16,
}

#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct ExecveArgs {
    pub filename: [u8; 256],
}

#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct ConnectArgs {
    pub fd: i32,
    pub addr: [u8; 64],
    pub addrlen: i32,
}

#[map]
pub static EVENTS: PerfEventArray<SyscallEvent> = PerfEventArray::with_max_entries(1024, 0);

#[map]
pub static TARGET_PIDS: HashMap<u32, u8> = HashMap::with_max_entries(1024, 0);

#[tracepoint(name = "sys_enter_openat")]
pub fn sys_enter_openat(ctx: TracePointContext) -> u32 {
    match try_sys_enter_openat(ctx) {
        Ok(ret) => ret,
        Err(ret) => ret,
    }
}

fn try_sys_enter_openat(ctx: TracePointContext) -> Result<u32, u32> {
    let pid = ctx.pid() as u32;
    
    if !is_target_pid(pid) {
        return Ok(0);
    }

    let dfd: i32 = unsafe { ctx.read_at(16)? };
    let filename_ptr: u64 = unsafe { ctx.read_at(24)? };
    let flags: i32 = unsafe { ctx.read_at(32)? };
    let mode: u16 = unsafe { ctx.read_at(40)? };

    let mut filename = [0u8; 256];
    unsafe {
        let _ = ctx.read_user_str_at(filename_ptr as *const u8, &mut filename);
    }

    let mut comm = [0u8; 16];
    let _ = ctx.read_comm(&mut comm);

    let event = SyscallEvent {
        timestamp: ctx.ktime(),
        pid,
        comm,
        syscall_type: SyscallType::Openat,
        args: SyscallArgs {
            openat: OpenatArgs {
                dfd,
                filename,
                flags,
                mode,
            },
        },
    };

    EVENTS.output(&ctx, &event, 0);

    Ok(0)
}

#[tracepoint(name = "sys_enter_execve")]
pub fn sys_enter_execve(ctx: TracePointContext) -> u32 {
    match try_sys_enter_execve(ctx) {
        Ok(ret) => ret,
        Err(ret) => ret,
    }
}

fn try_sys_enter_execve(ctx: TracePointContext) -> Result<u32, u32> {
    let pid = ctx.pid() as u32;
    
    if !is_target_pid(pid) {
        return Ok(0);
    }

    let filename_ptr: u64 = unsafe { ctx.read_at(16)? };

    let mut filename = [0u8; 256];
    unsafe {
        let _ = ctx.read_user_str_at(filename_ptr as *const u8, &mut filename);
    }

    let mut comm = [0u8; 16];
    let _ = ctx.read_comm(&mut comm);

    let event = SyscallEvent {
        timestamp: ctx.ktime(),
        pid,
        comm,
        syscall_type: SyscallType::Execve,
        args: SyscallArgs {
            execve: ExecveArgs { filename },
        },
    };

    EVENTS.output(&ctx, &event, 0);

    Ok(0)
}

#[tracepoint(name = "sys_enter_connect")]
pub fn sys_enter_connect(ctx: TracePointContext) -> u32 {
    match try_sys_enter_connect(ctx) {
        Ok(ret) => ret,
        Err(ret) => ret,
    }
}

fn try_sys_enter_connect(ctx: TracePointContext) -> Result<u32, u32> {
    let pid = ctx.pid() as u32;
    
    if !is_target_pid(pid) {
        return Ok(0);
    }

    let fd: i32 = unsafe { ctx.read_at(16)? };
    let addr_ptr: u64 = unsafe { ctx.read_at(24)? };
    let addrlen: i32 = unsafe { ctx.read_at(32)? };

    let mut addr = [0u8; 64];
    unsafe {
        let _ = ctx.read_user_at(addr_ptr as *const u8, &mut addr);
    }

    let mut comm = [0u8; 16];
    let _ = ctx.read_comm(&mut comm);

    let event = SyscallEvent {
        timestamp: ctx.ktime(),
        pid,
        comm,
        syscall_type: SyscallType::Connect,
        args: SyscallArgs {
            connect: ConnectArgs { fd, addr, addrlen },
        },
    };

    EVENTS.output(&ctx, &event, 0);

    Ok(0)
}

#[inline(always)]
fn is_target_pid(pid: u32) -> bool {
    unsafe { TARGET_PIDS.get(&pid).is_some() } || TARGET_PIDS.is_empty()
}

#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    unsafe { core::hint::unreachable_unchecked() }
}
