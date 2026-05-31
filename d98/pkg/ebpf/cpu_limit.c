//go:build ignore

#include "vmlinux.h"
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>
#include <bpf/bpf_core_read.h>

#define MAX_ENTRIES 4096
#define TIMEOUT_NS 100000000ULL        // 100ms CPU时间
#define MEMORY_LIMIT_BYTES 5242880ULL  // 5MB 内存限制

// 事件类型
#define EVENT_TYPE_CPU_TIMEOUT  1
#define EVENT_TYPE_MEMORY_LIMIT 2

// CPU时间跟踪
struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, MAX_ENTRIES);
    __type(key, pid_t);
    __type(value, u64);
} start_times SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, MAX_ENTRIES);
    __type(key, pid_t);
    __type(value, u64);
} cpu_time SEC(".maps");

// 内存使用跟踪 - 按进程跟踪总分配内存
struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, MAX_ENTRIES);
    __type(key, pid_t);
    __type(value, u64);
} mem_allocated SEC(".maps");

// 跟踪mmap的分配大小（用于munmap时减去）
struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, MAX_ENTRIES);
    __type(key, u64);  // addr作为key
    __type(value, u64); // 分配大小
} mmap_sizes SEC(".maps");

// 被监控的进程组
struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, MAX_ENTRIES);
    __type(key, pid_t);
    __type(value, u8);
} monitored_pgids SEC(".maps");

// 事件环形缓冲区
struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 1 << 16);
} events SEC(".maps");

// 通用事件结构
struct event {
    pid_t pid;
    pid_t pgid;
    u64 cpu_ns;
    u64 mem_bytes;
    u8 event_type;
    u8 killed;
};

static __always_inline pid_t get_current_pgid(void) {
    struct task_struct *task = (struct task_struct *)bpf_get_current_task();
    pid_t pgid = 0;
    
    if (!task) return 0;
    
    struct task_struct *group_leader = NULL;
    bpf_probe_read_kernel(&group_leader, sizeof(group_leader), &task->group_leader);
    if (!group_leader) return 0;
    
    bpf_probe_read_kernel(&pgid, sizeof(pgid), &group_leader->pid);
    return pgid;
}

static __always_inline u8 is_pgid_monitored(pid_t pgid) {
    u8 *is_monitored = bpf_map_lookup_elem(&monitored_pgids, &pgid);
    return is_monitored ? *is_monitored : 0;
}

static __always_inline void send_memory_event(pid_t pid, pid_t pgid, u64 mem_bytes) {
    struct event *e = bpf_ringbuf_reserve(&events, sizeof(*e), 0);
    if (e) {
        e->pid = pid;
        e->pgid = pgid;
        e->cpu_ns = 0;
        e->mem_bytes = mem_bytes;
        e->event_type = EVENT_TYPE_MEMORY_LIMIT;
        e->killed = 1;
        bpf_ringbuf_submit(e, 0);
    }
}

static __always_inline void add_memory(pid_t pid, pid_t pgid, u64 size) {
    u64 *current = bpf_map_lookup_elem(&mem_allocated, &pid);
    u64 new_total;
    
    if (current) {
        new_total = *current + size;
        __sync_fetch_and_add(current, size);
    } else {
        new_total = size;
        bpf_map_update_elem(&mem_allocated, &pid, &size, BPF_ANY);
    }
    
    if (new_total >= MEMORY_LIMIT_BYTES) {
        send_memory_event(pid, pgid, new_total);
    }
}

static __always_inline void sub_memory(pid_t pid, u64 size) {
    u64 *current = bpf_map_lookup_elem(&mem_allocated, &pid);
    if (current && *current >= size) {
        __sync_fetch_and_sub(current, size);
    }
}

SEC("tracepoint/sched/sched_switch")
int tracepoint__sched__sched_switch(struct trace_event_raw_sched_switch *ctx) {
    pid_t prev_pid = BPF_CORE_READ(ctx, prev_pid);
    pid_t next_pid = BPF_CORE_READ(ctx, next_pid);
    u64 now = bpf_ktime_get_ns();

    if (prev_pid != 0) {
        u64 *start = bpf_map_lookup_elem(&start_times, &prev_pid);
        if (start) {
            u64 delta = now - *start;
            u64 *total = bpf_map_lookup_elem(&cpu_time, &prev_pid);
            if (total) {
                __sync_fetch_and_add(total, delta);
            } else {
                bpf_map_update_elem(&cpu_time, &prev_pid, &delta, BPF_ANY);
                total = &delta;
            }

            pid_t prev_pgid = get_current_pgid();
            u8 *is_monitored = bpf_map_lookup_elem(&monitored_pgids, &prev_pgid);
            
            if (is_monitored && *total >= TIMEOUT_NS) {
                struct event *e = bpf_ringbuf_reserve(&events, sizeof(*e), 0);
                if (e) {
                    e->pid = prev_pid;
                    e->pgid = prev_pgid;
                    e->cpu_ns = *total;
                    e->mem_bytes = 0;
                    e->event_type = EVENT_TYPE_CPU_TIMEOUT;
                    e->killed = 1;
                    bpf_ringbuf_submit(e, 0);
                }
            }
        }
    }

    if (next_pid != 0) {
        bpf_map_update_elem(&start_times, &next_pid, &now, BPF_ANY);
    }

    return 0;
}

SEC("tracepoint/syscalls/sys_enter_mmap")
int tracepoint__syscalls__sys_enter_mmap(struct trace_event_raw_sys_enter *ctx) {
    pid_t pid = bpf_get_current_pid_tgid() >> 32;
    pid_t pgid = get_current_pgid();
    
    if (!is_pgid_monitored(pgid)) {
        return 0;
    }
    
    // ctx->args[1] 是 mmap 的 length 参数
    u64 length = (u64)ctx->args[1];
    u64 addr = (u64)ctx->args[0];
    
    // 只跟踪实际分配的内存（忽略MAP_ANONYMOUS以外的特殊情况）
    if (length > 0 && length < 1ULL << 40) { // 合理范围检查
        bpf_map_update_elem(&mmap_sizes, &addr, &length, BPF_ANY);
        add_memory(pid, pgid, length);
    }
    
    return 0;
}

SEC("tracepoint/syscalls/sys_enter_munmap")
int tracepoint__syscalls__sys_enter_munmap(struct trace_event_raw_sys_enter *ctx) {
    pid_t pid = bpf_get_current_pid_tgid() >> 32;
    pid_t pgid = get_current_pgid();
    
    if (!is_pgid_monitored(pgid)) {
        return 0;
    }
    
    u64 addr = (u64)ctx->args[0];
    u64 *length = bpf_map_lookup_elem(&mmap_sizes, &addr);
    
    if (length) {
        sub_memory(pid, *length);
        bpf_map_delete_elem(&mmap_sizes, &addr);
    }
    
    return 0;
}

SEC("tracepoint/syscalls/sys_enter_brk")
int tracepoint__syscalls__sys_enter_brk(struct trace_event_raw_sys_enter *ctx) {
    pid_t pid = bpf_get_current_pid_tgid() >> 32;
    pid_t pgid = get_current_pgid();
    
    if (!is_pgid_monitored(pgid)) {
        return 0;
    }
    
    // brk参数是新的program break地址
    // 我们近似跟踪brk增加的内存（简化处理）
    u64 new_brk = (u64)ctx->args[0];
    
    // 简化处理：每次brk调用假设最多增加4KB
    // 更精确需要跟踪旧的brk值，但简化起见做近似
    if (new_brk != 0) {
        add_memory(pid, pgid, 4096);
    }
    
    return 0;
}

SEC("tracepoint/syscalls/sys_enter_mremap")
int tracepoint__syscalls__sys_enter_mremap(struct trace_event_raw_sys_enter *ctx) {
    pid_t pid = bpf_get_current_pid_tgid() >> 32;
    pid_t pgid = get_current_pgid();
    
    if (!is_pgid_monitored(pgid)) {
        return 0;
    }
    
    // mremap: args[2] 是 new_size
    u64 new_size = (u64)ctx->args[2];
    u64 old_size = (u64)ctx->args[1];
    
    // 如果new_size > old_size，增加配额
    if (new_size > old_size) {
        add_memory(pid, pgid, new_size - old_size);
    }
    
    return 0;
}

SEC("tracepoint/sched/sched_process_exit")
int tracepoint__sched__sched_process_exit(struct trace_event_raw_sched_process_exit *ctx) {
    pid_t pid = bpf_get_current_pid_tgid() >> 32;
    
    bpf_map_delete_elem(&start_times, &pid);
    bpf_map_delete_elem(&cpu_time, &pid);
    bpf_map_delete_elem(&mem_allocated, &pid);
    
    return 0;
}

SEC("tracepoint/sched/sched_process_fork")
int tracepoint__sched__sched_process_fork(struct trace_event_raw_sched_process_fork *ctx) {
    pid_t child_pid = BPF_CORE_READ(ctx, child_pid);
    u64 now = bpf_ktime_get_ns();
    u64 initial_mem = 0;
    
    bpf_map_update_elem(&start_times, &child_pid, &now, BPF_ANY);
    bpf_map_update_elem(&mem_allocated, &child_pid, &initial_mem, BPF_ANY);
    
    return 0;
}

char LICENSE[] SEC("license") = "GPL";
