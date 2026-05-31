@echo off
echo ========================================
echo    实时视频会议应用 - 快速启动脚本
echo ========================================
echo.

echo [1/4] 检查 Rust 和 wasm-pack...
rustc --version >nul 2>&1
if errorlevel 1 (
    echo 错误: 未找到 Rust，请先安装 Rust
    echo 下载地址: https://rustup.rs/
    pause
    exit /b 1
)

wasm-pack --version >nul 2>&1
if errorlevel 1 (
    echo 正在安装 wasm-pack...
    cargo install wasm-pack
)

echo.
echo [2/4] 构建 Rust Wasm 模块...
cd rust-wasm
wasm-pack build --target web
if errorlevel 1 (
    echo 错误: Wasm 构建失败
    pause
    exit /b 1
)
cd ..

echo.
echo [3/4] 安装服务端依赖...
cd node-server
if not exist "node_modules" (
    npm install
)
cd ..

echo.
echo [4/4] 安装前端依赖...
cd react-frontend
if not exist "node_modules" (
    npm install
)
cd ..

echo.
echo ========================================
echo    安装完成！
echo ========================================
echo.
echo 请按以下步骤启动：
echo.
echo 1. 打开一个新的终端窗口，运行:
echo    cd node-server ^&^& npm start
echo.
echo 2. 打开另一个终端窗口，运行:
echo    cd react-frontend ^&^& npm run dev
echo.
echo 3. 在浏览器中打开: http://localhost:3000
echo.
pause
