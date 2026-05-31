#include <vmlinux.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>
#include <bpf/bpf_core_read.h>

#define TASK_COMM_LEN 16

struct event {
    __u32 pid;
    char comm[TASK_COMM_LEN];
    char syscall_name[32];
    char args[256];
    __u64 timestamp;
} __attribute__((packed));

struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 1 << 24);
} events SEC(".maps");

const volatile __u32 target_pid = 0;

static __always_inline void *__memcpy(void *dst, const void *src, __u64 len) {
    char *d = dst;
    const char *s = src;
    __u64 i;
    for (i = 0; i < len; i++) {
        d[i] = s[i];
    }
    return dst;
}

SEC("tracepoint/syscalls/sys_enter_openat")
int tracepoint_sys_enter_openat(struct trace_event_raw_sys_enter *ctx) {
    __u32 pid = bpf_get_current_pid_tgid() >> 32;
    
    if (target_pid != 0 && pid != target_pid) {
        return 0;
    }
    
    struct event *e;
    e = bpf_ringbuf_reserve(&events, sizeof(*e), 0);
    if (!e) {
        return 0;
    }
    
    e->pid = pid;
    bpf_get_current_comm(&e->comm, sizeof(e->comm));
    
    const char name_openat[] = "openat";
    __memcpy(e->syscall_name, name_openat, sizeof(name_openat));
    
    const char *filename = (const char *)ctx->args[1];
    bpf_probe_read_user_str(e->args, sizeof(e->args), filename);
    
    e->timestamp = bpf_ktime_get_ns();
    
    bpf_ringbuf_submit(e, 0);
    return 0;
}

SEC("tracepoint/syscalls/sys_enter_read")
int tracepoint_sys_enter_read(struct trace_event_raw_sys_enter *ctx) {
    __u32 pid = bpf_get_current_pid_tgid() >> 32;
    
    if (target_pid != 0 && pid != target_pid) {
        return 0;
    }
    
    struct event *e;
    e = bpf_ringbuf_reserve(&events, sizeof(*e), 0);
    if (!e) {
        return 0;
    }
    
    e->pid = pid;
    bpf_get_current_comm(&e->comm, sizeof(e->comm));
    
    const char name_read[] = "read";
    __memcpy(e->syscall_name, name_read, sizeof(name_read));
    
    int fd = (int)ctx->args[0];
    __u64 count = (__u64)ctx->args[2];
    char buf[256];
    char format[] = "fd=%d, count=%llu";
    char *p = buf;
    char *end = buf + sizeof(buf) - 1;
    
    const char *fmt = "fd=";
    for (const char *c = fmt; *c && p < end; p++, c++) *p = *c;
    
    char digits[32];
    int i = 0;
    int fd_val = fd;
    if (fd_val < 0) {
        *p++ = '-';
        fd_val = -fd_val;
    }
    if (fd_val == 0) {
        *p++ = '0';
    } else {
        while (fd_val > 0 && i < 32) {
            digits[i++] = '0' + (fd_val % 10);
            fd_val /= 10;
        }
        while (i > 0) *p++ = digits[--i];
    }
    
    const char *fmt2 = ", count=";
    for (const char *c = fmt2; *c && p < end; p++, c++) *p = *c;
    
    __u64 count_val = count;
    i = 0;
    if (count_val == 0) {
        *p++ = '0';
    } else {
        while (count_val > 0 && i < 32) {
            digits[i++] = '0' + (count_val % 10);
            count_val /= 10;
        }
        while (i > 0) *p++ = digits[--i];
    }
    *p = 0;
    __memcpy(e->args, buf, sizeof(buf));
    
    e->timestamp = bpf_ktime_get_ns();
    
    bpf_ringbuf_submit(e, 0);
    return 0;
}

char LICENSE[] SEC("license") = "GPL";
