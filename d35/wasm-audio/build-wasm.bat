@echo off
echo 构建 WebAssembly 模块...

where wasm-pack >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: 未找到 wasm-pack
    echo 请先安装: cargo install wasm-pack
    pause
    exit /b 1
)

wasm-pack build --target web --out-dir pkg

echo.
echo 构建完成!
echo 输出目录: pkg/
echo.
echo 现在请将 pkg 目录链接到 frontend:
echo cd ../frontend
echo npm install ../wasm-audio/pkg
pause
