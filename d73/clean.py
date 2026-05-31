import shutil
import os

dirs_to_clean = [
    "data",
    "__pycache__",
    "raft/__pycache__",
    "storage/__pycache__",
    "rpc/__pycache__",
    "http_server/__pycache__",
    "proto/__pycache__"
]

files_to_clean = [
    "proto/raft_pb2.py",
    "proto/raft_pb2_grpc.py"
]

for d in dirs_to_clean:
    if os.path.exists(d) and os.path.isdir(d):
        print(f"Removing directory: {d}")
        shutil.rmtree(d)

for f in files_to_clean:
    if os.path.exists(f):
        print(f"Removing file: {f}")
        os.remove(f)

print("Cleanup completed!")
