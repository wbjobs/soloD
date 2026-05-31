import subprocess
import os

def build_proto():
    proto_dir = os.path.join(os.path.dirname(__file__), "..", "proto")
    output_dir = os.path.join(os.path.dirname(__file__), "proto")
    
    cmd = [
        "python", "-m", "grpc_tools.protoc",
        f"-I{proto_dir}",
        f"--python_out={output_dir}",
        f"--grpc_python_out={output_dir}",
        os.path.join(proto_dir, "syscall.proto")
    ]
    
    subprocess.run(cmd, check=True)
    print("Proto files built successfully")

if __name__ == "__main__":
    build_proto()
