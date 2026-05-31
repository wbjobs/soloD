@echo off
echo 正在编译 Publisher...
g++ publisher.cpp -o publisher.exe -lzmq -std=c++17 -O2
if %errorlevel% equ 0 (
    echo 编译成功！
    echo 可执行文件: publisher.exe
) else (
    echo 编译失败！
    echo 请确保已安装 ZeroMQ 和 g++
    echo 可以使用 MSYS2 安装: pacman -S mingw-w64-x86_64-zeromq
)
pause
