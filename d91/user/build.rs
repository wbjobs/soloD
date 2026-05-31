// eBPF program is built separately using cargo-ebpf
// See ../build-ebpf.sh or Makefile build-ebpf target

fn main() {
    // Rerun build script if eBPF source changes
    println!("cargo:rerun-if-changed=../ebpf/src/lib.rs");
    println!("cargo:rerun-if-changed=../ebpf/Cargo.toml");
}
