import os
import subprocess
import sys

proto_dir = os.path.join(os.path.dirname(__file__), "proto")
output_dir = os.path.join(os.path.dirname(__file__), "proto")

os.makedirs(output_dir, exist_ok=True)

proto_file = os.path.join(proto_dir, "raft.proto")

cmd = [
    sys.executable, "-m", "grpc_tools.protoc",
    f"-I{proto_dir}",
    f"--python_out={output_dir}",
    f"--grpc_python_out={output_dir}",
    proto_file
]

print("Generating gRPC code...")
result = subprocess.run(cmd, capture_output=True, text=True)
if result.returncode != 0:
    print(f"Error: {result.stderr}")
    sys.exit(1)
print("gRPC code generated successfully!")
