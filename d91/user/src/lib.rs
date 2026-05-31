use serde::{Deserialize, Serialize};
use std::ffi::CStr;
use std::str;

/// 风险级别
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum RiskLevel {
    /// 低风险 - 正常操作
    Low = 1,
    /// 中风险 - 需要关注
    Medium = 2,
    /// 高风险 - 可疑操作
    High = 3,
    /// 严重风险 - 危险操作
    Critical = 4,
}

/// 风险评估结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskAssessment {
    pub level: RiskLevel,
    pub score: u8,
    pub reason: String,
}

/// 安全检测规则
pub struct SecurityRule {
    pub name: &'static str,
    pub description: &'static str,
    pub risk_level: RiskLevel,
    pub risk_score: u8,
    pub check_fn: fn(&SyscallEvent, &str) -> bool,
}

/// 获取所有安全检测规则
pub fn get_security_rules() -> Vec<SecurityRule> {
    vec![
        // ============== 高危规则 ==============
        SecurityRule {
            name: "ETC_PASSWD_WRITE",
            description: "尝试修改 /etc/passwd 文件",
            risk_level: RiskLevel::Critical,
            risk_score: 95,
            check_fn: |_, filename| {
                filename.contains("/etc/passwd") || filename.contains("/etc/shadow")
            },
        },
        SecurityRule {
            name: "SHELL_EXEC",
            description: "执行敏感shell命令",
            risk_level: RiskLevel::Critical,
            risk_score: 90,
            check_fn: |event, filename| {
                event.syscall_type == SyscallType::Execve
                    && (filename.contains("/bin/bash")
                        || filename.contains("/bin/sh")
                        || filename.contains("/bin/zsh")
                        || filename.contains("/usr/bin/sudo"))
            },
        },
        SecurityRule {
            name: "NETWORK_OUTBOUND",
            description: "发起外部网络连接",
            risk_level: RiskLevel::High,
            risk_score: 75,
            check_fn: |event, _| event.syscall_type == SyscallType::Connect,
        },
        SecurityRule {
            name: "PRIVILEGE_ESCALATION",
            description: "可能的权限提升尝试",
            risk_level: RiskLevel::Critical,
            risk_score: 90,
            check_fn: |_, filename| {
                filename.contains("/etc/sudoers")
                    || filename.contains("/bin/su")
                    || filename.contains("pkexec")
            },
        },
        // ============== 中风险规则 ==============
        SecurityRule {
            name: "TEMP_EXECUTE",
            description: "执行临时目录中的文件",
            risk_level: RiskLevel::High,
            risk_score: 70,
            check_fn: |event, filename| {
                event.syscall_type == SyscallType::Execve
                    && (filename.starts_with("/tmp/") || filename.starts_with("/var/tmp/"))
            },
        },
        SecurityRule {
            name: "ETC_MODIFICATION",
            description: "修改系统配置文件",
            risk_level: RiskLevel::Medium,
            risk_score: 50,
            check_fn: |_, filename| filename.contains("/etc/") && !filename.contains("/etc/passwd"),
        },
        SecurityRule {
            name: "SSH_ACCESS",
            description: "SSH相关操作",
            risk_level: RiskLevel::Medium,
            risk_score: 55,
            check_fn: |_, filename| filename.contains(".ssh/") || filename.contains("sshd_config"),
        },
        // ============== 低风险规则 ==============
        SecurityRule {
            name: "HOME_ACCESS",
            description: "访问用户主目录",
            risk_level: RiskLevel::Low,
            risk_score: 15,
            check_fn: |_, filename| filename.starts_with("/home/") && filename.split('/').count() > 3,
        },
    ]
}

/// 评估系统调用事件的风险
pub fn assess_risk(event: &SyscallEvent) -> RiskAssessment {
    let filename = match event.syscall_type {
        SyscallType::Openat => event.filename_openat().unwrap_or_default(),
        SyscallType::Execve => event.filename_execve().unwrap_or_default(),
        SyscallType::Connect => String::new(),
    };

    let rules = get_security_rules();
    let mut max_score = 0;
    let mut max_level = RiskLevel::Low;
    let mut reasons = Vec::new();

    for rule in rules {
        if (rule.check_fn)(event, &filename) {
            if rule.risk_score > max_score {
                max_score = rule.risk_score;
                max_level = rule.risk_level;
            }
            reasons.push(rule.description.to_string());
        }
    }

    if reasons.is_empty() {
        RiskAssessment {
            level: RiskLevel::Low,
            score: 10,
            reason: "正常操作".to_string(),
        }
    } else {
        RiskAssessment {
            level: max_level,
            score: max_score,
            reason: reasons.join("; "),
        }
    }
}

#[repr(C)]
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct SyscallEvent {
    pub timestamp: u64,
    pub pid: u32,
    pub comm: [u8; 16],
    pub syscall_type: SyscallType,
    pub args: SyscallArgs,
}

#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SyscallType {
    Openat,
    Execve,
    Connect,
}

#[repr(C)]
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub union SyscallArgs {
    pub openat: OpenatArgs,
    pub execve: ExecveArgs,
    pub connect: ConnectArgs,
}

#[repr(C)]
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct OpenatArgs {
    pub dfd: i32,
    pub filename: [u8; 256],
    pub flags: i32,
    pub mode: u16,
}

#[repr(C)]
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct ExecveArgs {
    pub filename: [u8; 256],
}

#[repr(C)]
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct ConnectArgs {
    pub fd: i32,
    pub addr: [u8; 64],
    pub addrlen: i32,
}

/// Safely convert a null-terminated byte array to a UTF-8 string
/// Handles invalid UTF-8 by replacing with � character
fn bytes_to_utf8_string(bytes: &[u8]) -> String {
    // Find the null terminator
    let null_pos = bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len());
    let slice = &bytes[..null_pos];
    
    // Convert to UTF-8, replacing invalid sequences
    String::from_utf8_lossy(slice).to_string()
}

/// Convert C string to Rust string with proper UTF-8 handling
fn cstr_to_utf8(ptr: *const u8, max_len: usize) -> String {
    unsafe {
        let slice = std::slice::from_raw_parts(ptr, max_len);
        bytes_to_utf8_string(slice)
    }
}

impl SyscallEvent {
    pub fn comm_str(&self) -> String {
        cstr_to_utf8(self.comm.as_ptr(), 16)
    }

    pub fn filename_openat(&self) -> Option<String> {
        if self.syscall_type == SyscallType::Openat {
            unsafe {
                Some(cstr_to_utf8(self.args.openat.filename.as_ptr(), 256))
            }
        } else {
            None
        }
    }

    pub fn filename_execve(&self) -> Option<String> {
        if self.syscall_type == SyscallType::Execve {
            unsafe {
                Some(cstr_to_utf8(self.args.execve.filename.as_ptr(), 256))
            }
        } else {
            None
        }
    }

    pub fn addr_hex(&self) -> Option<String> {
        if self.syscall_type == SyscallType::Connect {
            unsafe {
                let addr_bytes = &self.args.connect.addr[..(self.args.connect.addrlen as usize).min(64)];
                Some(format!("0x{}", hex::encode(addr_bytes)))
            }
        } else {
            None
        }
    }

    pub fn to_json(&self) -> serde_json::Value {
        let syscall_name = match self.syscall_type {
            SyscallType::Openat => "openat",
            SyscallType::Execve => "execve",
            SyscallType::Connect => "connect",
        };

        let mut args = serde_json::Map::new();

        match self.syscall_type {
            SyscallType::Openat => unsafe {
                args.insert("dfd".to_string(), self.args.openat.dfd.into());
                args.insert(
                    "filename".to_string(),
                    self.filename_openat().unwrap_or_default().into(),
                );
                args.insert("flags".to_string(), self.args.openat.flags.into());
                args.insert("mode".to_string(), self.args.openat.mode.into());
            },
            SyscallType::Execve => unsafe {
                args.insert(
                    "filename".to_string(),
                    self.filename_execve().unwrap_or_default().into(),
                );
            },
            SyscallType::Connect => unsafe {
                args.insert("fd".to_string(), self.args.connect.fd.into());
                args.insert("addrlen".to_string(), self.args.connect.addrlen.into());
                if let Some(addr_hex) = self.addr_hex() {
                    args.insert("addr_hex".to_string(), addr_hex.into());
                }
            }
        }

        // 评估风险
        let risk = assess_risk(self);
        let risk_level_str = match risk.level {
            RiskLevel::Low => "low",
            RiskLevel::Medium => "medium",
            RiskLevel::High => "high",
            RiskLevel::Critical => "critical",
        };

        serde_json::json!({
            "timestamp": self.timestamp,
            "pid": self.pid,
            "comm": self.comm_str(),
            "syscall": syscall_name,
            "args": args,
            "risk": {
                "level": risk_level_str,
                "score": risk.score,
                "reason": risk.reason
            }
        })
    }
}
