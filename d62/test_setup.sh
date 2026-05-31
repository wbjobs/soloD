#!/bin/bash

echo "============================================================"
echo "  System Call Monitor - Setup Verification"
echo "============================================================"

PASS=0
FAIL=0

check() {
    if eval "$2"; then
        echo "✓ $1"
        ((PASS++))
    else
        echo "✗ $1"
        ((FAIL++))
    fi
}

echo -e "\n=== System Checks ==="

check "Kernel version >= 4.15" "uname -r | awk -F. '{ if (\$1 >= 5 || (\$1 == 4 && \$2 >= 15)) exit 0; else exit 1 }'"

check "debugfs mounted" "mount | grep -q debugfs"

check "sys_enter_openat tracepoint exists" "[ -d /sys/kernel/debug/tracing/events/syscalls/sys_enter_openat ]"

echo -e "\n=== bcc Installation ==="

check "bpfcc-tools installed" "dpkg -l | grep -q bpfcc-tools"

check "python3-bpfcc installed" "dpkg -l | grep -q python3-bpfcc"

check "Python bcc module (user)" "python3 -c 'from bcc import BPF' 2>/dev/null"

echo -e "\n=== Go Installation ==="

check "Go available" "which go >/dev/null"

check "Go version >= 1.18" "go version | awk '{ split(\$3, v, \".\"); if (v[1] >= 2 || (v[1] == 1 && v[2] >= 18)) exit 0; else exit 1 }'"

check "gorilla/websocket package" "cd $(dirname "$0") && go list -m all | grep -q gorilla/websocket"

echo -e "\n=== Node.js Installation ==="

check "Node.js available" "which node >/dev/null"

check "npm available" "which npm >/dev/null"

check "Frontend dependencies installed" "[ -d \"$(dirname \"$0\")/frontend/node_modules\" ]"

echo -e "\n============================================================"
echo "  Results: $PASS passed, $FAIL failed"
echo "============================================================"

if [ $FAIL -gt 0 ]; then
    echo -e "\n⚠️  Some checks failed. Please see README_SYSCALL.md for fixes."
    exit 1
else
    echo -e "\n✅ All checks passed! Ready to run the system."
    exit 0
fi
