#include <vmlinux.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>
#include <bpf/bpf_core_read.h>

#define TASK_COMM_LEN 16
#define PATH_MAX 4096

struct event {
    __u32 pid;
    __u32 tgid;
    char comm[TASK_COMM_LEN];
    char syscall[16];
    char path[PATH_MAX];
    __u64 timestamp;
    __s64 retval;
    __u64 duration_ns;
};

struct syscall_key {
    __u32 pid;
    __u32 syscall_id;
};

struct {
    __uint(type, BPF_MAP_TYPE_PERF_EVENT_ARRAY);
    __uint(key_size, sizeof(__u32));
    __uint(value_size, sizeof(__u32));
} events SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 1024);
    __type(key, struct syscall_key);
    __type(value, __u64);
} start_times SEC(".maps");

static inline bool is_target_process(const char *comm) {
    const char *target = "nginx";
    for (int i = 0; i < 5; i++) {
        if (comm[i] != target[i]) return false;
    }
    return comm[5] == '\0';
}

SEC("tracepoint/syscalls/sys_enter_openat")
int tracepoint_sys_enter_openat(struct trace_event_raw_sys_enter *ctx) {
    struct task_struct *task = (struct task_struct *)bpf_get_current_task();
    char comm[TASK_COMM_LEN];
    bpf_get_current_comm(&comm, sizeof(comm));
    
    if (!is_target_process(comm)) {
        return 0;
    }

    __u32 pid = bpf_get_current_pid_tgid() >> 32;
    struct syscall_key key = {.pid = pid, .syscall_id = 257};
    
    __u64 start_time = bpf_ktime_get_ns();
    bpf_map_update_elem(&start_times, &key, &start_time, BPF_ANY);

    struct event e = {};
    e.pid = pid;
    e.tgid = bpf_get_current_pid_tgid() & 0xFFFFFFFF;
    __builtin_memcpy(&e.comm, comm, TASK_COMM_LEN);
    __builtin_memcpy(&e.syscall, "openat", 7);
    e.timestamp = start_time;
    e.duration_ns = 0;
    
    const char *pathname = (const char *)ctx->args[1];
    bpf_probe_read_user_str(&e.path, sizeof(e.path), pathname);
    
    bpf_perf_event_output(ctx, &events, BPF_F_CURRENT_CPU, &e, sizeof(e));
    return 0;
}

SEC("tracepoint/syscalls/sys_exit_openat")
int tracepoint_sys_exit_openat(struct trace_event_raw_sys_exit *ctx) {
    struct task_struct *task = (struct task_struct *)bpf_get_current_task();
    char comm[TASK_COMM_LEN];
    bpf_get_current_comm(&comm, sizeof(comm));
    
    if (!is_target_process(comm)) {
        return 0;
    }

    __u32 pid = bpf_get_current_pid_tgid() >> 32;
    struct syscall_key key = {.pid = pid, .syscall_id = 257};
    
    __u64 *start_time = bpf_map_lookup_elem(&start_times, &key);
    __u64 duration = 0;
    if (start_time) {
        duration = bpf_ktime_get_ns() - *start_time;
        bpf_map_delete_elem(&start_times, &key);
    }

    struct event e = {};
    e.pid = pid;
    e.tgid = bpf_get_current_pid_tgid() & 0xFFFFFFFF;
    __builtin_memcpy(&e.comm, comm, TASK_COMM_LEN);
    __builtin_memcpy(&e.syscall, "openat_ret", 11);
    e.timestamp = bpf_ktime_get_ns();
    e.retval = ctx->ret;
    e.duration_ns = duration;
    
    bpf_perf_event_output(ctx, &events, BPF_F_CURRENT_CPU, &e, sizeof(e));
    return 0;
}

SEC("tracepoint/syscalls/sys_enter_read")
int tracepoint_sys_enter_read(struct trace_event_raw_sys_enter *ctx) {
    struct task_struct *task = (struct task_struct *)bpf_get_current_task();
    char comm[TASK_COMM_LEN];
    bpf_get_current_comm(&comm, sizeof(comm));
    
    if (!is_target_process(comm)) {
        return 0;
    }

    __u32 pid = bpf_get_current_pid_tgid() >> 32;
    struct syscall_key key = {.pid = pid, .syscall_id = 0};
    
    __u64 start_time = bpf_ktime_get_ns();
    bpf_map_update_elem(&start_times, &key, &start_time, BPF_ANY);

    struct event e = {};
    e.pid = pid;
    e.tgid = bpf_get_current_pid_tgid() & 0xFFFFFFFF;
    __builtin_memcpy(&e.comm, comm, TASK_COMM_LEN);
    __builtin_memcpy(&e.syscall, "read", 5);
    e.timestamp = start_time;
    e.duration_ns = 0;
    
    __u64 fd = ctx->args[0];
    __builtin_snprintf(e.path, sizeof(e.path), "fd=%lld", fd);
    
    bpf_perf_event_output(ctx, &events, BPF_F_CURRENT_CPU, &e, sizeof(e));
    return 0;
}

SEC("tracepoint/syscalls/sys_exit_read")
int tracepoint_sys_exit_read(struct trace_event_raw_sys_exit *ctx) {
    struct task_struct *task = (struct task_struct *)bpf_get_current_task();
    char comm[TASK_COMM_LEN];
    bpf_get_current_comm(&comm, sizeof(comm));
    
    if (!is_target_process(comm)) {
        return 0;
    }

    __u32 pid = bpf_get_current_pid_tgid() >> 32;
    struct syscall_key key = {.pid = pid, .syscall_id = 0};
    
    __u64 *start_time = bpf_map_lookup_elem(&start_times, &key);
    __u64 duration = 0;
    if (start_time) {
        duration = bpf_ktime_get_ns() - *start_time;
        bpf_map_delete_elem(&start_times, &key);
    }

    struct event e = {};
    e.pid = pid;
    e.tgid = bpf_get_current_pid_tgid() & 0xFFFFFFFF;
    __builtin_memcpy(&e.comm, comm, TASK_COMM_LEN);
    __builtin_memcpy(&e.syscall, "read_ret", 9);
    e.timestamp = bpf_ktime_get_ns();
    e.retval = ctx->ret;
    e.duration_ns = duration;
    
    bpf_perf_event_output(ctx, &events, BPF_F_CURRENT_CPU, &e, sizeof(e));
    return 0;
}

char LICENSE[] SEC("license") = "GPL";
