//go:build ignore

#include "vmlinux.h"
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>
#include <bpf/bpf_core_read.h>

#define TASK_COMM_LEN 16
#define MAX_FILENAME_LEN 256
#define MAX_IGNORE_RULES 100
#define MAX_PATH_PREFIX 64

char LICENSE[] SEC("license") = "Dual BSD/GPL";

struct event {
    __u64 timestamp;
    __u64 sequence;
    __u32 pid;
    __u32 tgid;
    __s32 cpu_id;
    __s32 syscall_type;
    char comm[TASK_COMM_LEN];
    char filename[MAX_FILENAME_LEN];
} __attribute__((packed));

struct ignore_rule_key {
    char prefix[MAX_PATH_PREFIX];
} __attribute__((packed));

struct ignore_rule_value {
    __u32 rule_type; 
    __u32 enabled;
} __attribute__((packed));

struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 8 * 1024 * 1024);
} events SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 1024);
    __type(key, __u32);
    __type(value, __u32);
} target_pids SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_PERCPU_ARRAY);
    __uint(max_entries, 1);
    __type(key, __u32);
    __type(value, __u64);
} seq_counters SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, MAX_IGNORE_RULES);
    __type(key, struct ignore_rule_key);
    __type(value, struct ignore_rule_value);
} ignore_rules SEC(".maps");

static __always_inline bool is_target_pid(__u32 pid) {
    __u32 *val = bpf_map_lookup_elem(&target_pids, &pid);
    return val != NULL;
}

static __always_inline __u64 get_next_sequence() {
    __u32 key = 0;
    __u64 *seq = bpf_map_lookup_elem(&seq_counters, &key);
    if (!seq) {
        return 0;
    }
    __sync_fetch_and_add(seq, 1);
    return *seq;
}

static __always_inline int str_prefix_match(const char *str, const char *prefix) {
    if (!str || !prefix) {
        return 0;
    }
    
    #pragma unroll(64)
    for (int i = 0; i < MAX_PATH_PREFIX; i++) {
        if (prefix[i] == '\0') {
            return 1;
        }
        if (str[i] != prefix[i]) {
            return 0;
        }
        if (str[i] == '\0') {
            return 0;
        }
    }
    return 1;
}

static __always_inline bool should_ignore_path(const char *filename) {
    struct ignore_rule_key key = {};
    
    if (!filename) {
        return false;
    }
    
    __builtin_memcpy(key.prefix, filename, MAX_PATH_PREFIX - 1);
    key.prefix[MAX_PATH_PREFIX - 1] = '\0';
    
    #pragma unroll(32)
    for (int i = 0; i < 32 && i < MAX_PATH_PREFIX; i++) {
        if (key.prefix[i] == '\0') {
            break;
        }
        
        struct ignore_rule_key current_key = {};
        __builtin_memcpy(current_key.prefix, key.prefix, i + 1);
        current_key.prefix[i + 1] = '\0';
        
        struct ignore_rule_value *val = bpf_map_lookup_elem(&ignore_rules, &current_key);
        if (val && val->enabled) {
            return true;
        }
    }
    
    struct ignore_rule_value *exact_val = bpf_map_lookup_elem(&ignore_rules, &key);
    if (exact_val && exact_val->enabled) {
        return true;
    }
    
    return false;
}

SEC("tracepoint/syscalls/sys_enter_openat")
int tracepoint_openat(struct trace_event_raw_sys_enter *ctx) {
    struct event *e;
    __u32 pid = bpf_get_current_pid_tgid() >> 32;
    __u32 tgid = bpf_get_current_pid_tgid() & 0xFFFFFFFF;

    if (!is_target_pid(tgid)) {
        return 0;
    }

    char filename[MAX_FILENAME_LEN] = {};
    const char *user_filename = (const char *)ctx->args[1];
    bpf_probe_read_user_str(&filename, sizeof(filename), user_filename);

    if (should_ignore_path(filename)) {
        return 0;
    }

    e = bpf_ringbuf_reserve(&events, sizeof(*e), BPF_RB_FORCE_WAKEUP);
    if (!e) {
        return 0;
    }

    e->timestamp = bpf_ktime_get_boot_ns();
    e->sequence = get_next_sequence();
    e->pid = pid;
    e->tgid = tgid;
    e->cpu_id = bpf_get_smp_processor_id();
    e->syscall_type = 0;

    __builtin_memset(e->comm, 0, sizeof(e->comm));
    bpf_get_current_comm(&e->comm, sizeof(e->comm));

    __builtin_memcpy(e->filename, filename, sizeof(e->filename));

    bpf_ringbuf_submit(e, 0);
    return 0;
}

SEC("tracepoint/syscalls/sys_enter_execve")
int tracepoint_execve(struct trace_event_raw_sys_enter *ctx) {
    struct event *e;
    __u32 pid = bpf_get_current_pid_tgid() >> 32;
    __u32 tgid = bpf_get_current_pid_tgid() & 0xFFFFFFFF;

    if (!is_target_pid(tgid)) {
        return 0;
    }

    char filename[MAX_FILENAME_LEN] = {};
    const char *user_filename = (const char *)ctx->args[0];
    bpf_probe_read_user_str(&filename, sizeof(filename), user_filename);

    if (should_ignore_path(filename)) {
        return 0;
    }

    e = bpf_ringbuf_reserve(&events, sizeof(*e), BPF_RB_FORCE_WAKEUP);
    if (!e) {
        return 0;
    }

    e->timestamp = bpf_ktime_get_boot_ns();
    e->sequence = get_next_sequence();
    e->pid = pid;
    e->tgid = tgid;
    e->cpu_id = bpf_get_smp_processor_id();
    e->syscall_type = 1;

    __builtin_memset(e->comm, 0, sizeof(e->comm));
    bpf_get_current_comm(&e->comm, sizeof(e->comm));

    __builtin_memcpy(e->filename, filename, sizeof(e->filename));

    bpf_ringbuf_submit(e, 0);
    return 0;
}
