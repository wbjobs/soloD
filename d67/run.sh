#!/bin/bash

set -e

echo "=== CryptoFS - 加密 FUSE 文件系统 ==="
echo ""

if ! command -v go &> /dev/null; then
    echo "错误: Go 未安装，请先安装 Go 1.21+"
    exit 1
fi

if [ "$EUID" -ne 0 ]; then
    echo "注意: 建议使用 sudo 运行以获得完整的 FUSE 挂载权限"
    echo ""
fi

echo "步骤 1: 下载依赖..."
go mod download

echo ""
echo "步骤 2: 编译加密工具..."
go build -o encrypt encrypt.go

echo ""
echo "步骤 3: 加密测试文件（生成 .enc 后缀）..."
echo 'Hello, CryptoFS!
This is a secret message encrypted with XOR.
The .enc suffix will be hidden when viewed through the mount point.
File: secret.txt
Encrypted file: secret.txt.enc (in encrypted_storage/)' > temp_test.txt
./encrypt temp_test.txt encrypted_storage/secret.txt
rm temp_test.txt

echo 'Another test document - this one has a different name.' > temp_test2.txt
./encrypt temp_test2.txt encrypted_storage/document.txt
rm temp_test2.txt

echo ""
echo "步骤 4: 编译文件系统..."
go build -o cryptofs main.go

echo ""
echo "======================================"
echo "准备就绪！"
echo ""
echo "当前目录文件："
ls -la encrypted_storage/
echo ""
echo "======================================"
echo "挂载和卸载说明："
echo ""
echo "1. 挂载文件系统（普通模式）："
echo "   sudo ./cryptofs encrypted_storage mount_point"
echo ""
echo "2. 挂载文件系统（启用访问日志）："
echo "   sudo ./cryptofs -v encrypted_storage mount_point"
echo "   # 当文件被读取时会输出: [TIME] ACCESSED: filename"
echo ""
echo "3. 查看挂载的文件（.enc 后缀被隐藏）："
echo "   ls -la mount_point/"
echo "   cat mount_point/secret.txt"
echo "   cat mount_point/document.txt"
echo ""
echo "4. 测试只读权限（所有写操作都应该失败）："
echo "   touch mount_point/new.txt      # Operation not permitted"
echo "   rm mount_point/secret.txt       # Operation not permitted"
echo "   mkdir mount_point/subdir        # Operation not permitted"
echo ""
echo "5. 卸载文件系统（三种方法）："
echo "   方法一: 在运行程序的终端按 Ctrl+C"
echo "   方法二: fusermount -u mount_point  (推荐)"
echo "   方法三: umount mount_point         (需要 root)"
echo ""
echo "6. 强制卸载（如果挂载卡住）："
echo "   fusermount -uz mount_point"
echo "======================================"
