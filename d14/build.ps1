# Wasm 图像处理应用构建脚本

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Wasm 图像处理应用构建脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 Rust 工具链
Write-Host "[1/4] 检查 Rust 工具链..." -ForegroundColor Yellow
try {
    $rustcVersion = rustc --version
    Write-Host "✓ Rust 已安装: $rustcVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Rust 未安装，请先安装 Rust: https://rustup.rs/" -ForegroundColor Red
    exit 1
}

# 检查 wasm-pack
Write-Host ""
Write-Host "[2/4] 检查 wasm-pack..." -ForegroundColor Yellow
try {
    $wasmPackVersion = wasm-pack --version
    Write-Host "✓ wasm-pack 已安装: $wasmPackVersion" -ForegroundColor Green
} catch {
    Write-Host "⚠ wasm-pack 未安装，正在安装..." -ForegroundColor Yellow
    cargo install wasm-pack
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ wasm-pack 安装失败" -ForegroundColor Red
        exit 1
    }
    Write-Host "✓ wasm-pack 安装成功" -ForegroundColor Green
}

# 构建 Wasm 模块
Write-Host ""
Write-Host "[3/4] 构建 Rust Wasm 模块..." -ForegroundColor Yellow
wasm-pack build --target web --out-dir pkg
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Wasm 模块构建失败" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Wasm 模块构建成功" -ForegroundColor Green

# 安装前端依赖
Write-Host ""
Write-Host "[4/4] 安装前端依赖..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ 前端依赖安装失败" -ForegroundColor Red
    exit 1
}
Write-Host "✓ 前端依赖安装成功" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  构建完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "运行以下命令启动开发服务器:" -ForegroundColor White
Write-Host "  npm run dev" -ForegroundColor Cyan
Write-Host ""
Write-Host "运行以下命令构建生产版本:" -ForegroundColor White
Write-Host "  npm run build" -ForegroundColor Cyan
Write-Host ""
