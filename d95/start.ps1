# 安全报告分析工具 - 启动脚本
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   安全报告分析工具 - 启动脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 Ollama 是否可用
Write-Host "[1/3] 检查 Ollama 服务..." -ForegroundColor Yellow
try {
    $ollamaVersion = ollama --version
    Write-Host "✅ Ollama 已安装: $ollamaVersion" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Ollama 未检测到，请确保已安装并运行" -ForegroundColor Yellow
    Write-Host "   下载地址: https://ollama.ai/download" -ForegroundColor Gray
}
Write-Host ""

# 检查 Llama 3 模型
Write-Host "[2/3] 检查 Llama 3 模型..." -ForegroundColor Yellow
try {
    $models = ollama list | Select-String "llama3"
    if ($models) {
        Write-Host "✅ Llama 3 模型已安装" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Llama 3 模型未检测到，正在安装..." -ForegroundColor Yellow
        ollama pull llama3
    }
} catch {
    Write-Host "⚠️  无法检查模型，请手动运行: ollama pull llama3" -ForegroundColor Yellow
}
Write-Host ""

# 启动服务
Write-Host "[3/3] 启动前后端服务..." -ForegroundColor Yellow
Write-Host ""

Write-Host "📦 正在启动后端服务 (端口: 3001)..." -ForegroundColor Cyan
$backendJob = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\server'; npm install; npm run dev" -PassThru

Start-Sleep -Seconds 3

Write-Host "🎨 正在启动前端服务 (端口: 3000)..." -ForegroundColor Cyan
$frontendJob = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\client'; npm install; npm run dev" -PassThru

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   服务启动中，请稍候..." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 前端地址: http://localhost:3000" -ForegroundColor Cyan
Write-Host "🔧 后端地址: http://localhost:3001" -ForegroundColor Cyan
Write-Host ""
Write-Host "按任意键关闭此窗口（服务将继续运行）..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
