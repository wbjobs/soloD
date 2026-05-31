# Social Graph 启动脚本
# 注意：需要先安装 Go 1.21+

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Social Graph - 社交媒体关系图谱工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 Go 是否安装
try {
    $goVersion = go version
    Write-Host "✅ Go 已安装: $goVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Go 未安装，请先安装 Go 1.21+" -ForegroundColor Red
    Write-Host "   下载地址: https://golang.org/dl/" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   安装后重新运行此脚本" -ForegroundColor Yellow
    exit 1
}

# 检查 Node.js 是否安装
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js 已安装: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js 未安装" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "📦 正在安装后端依赖..." -ForegroundColor Yellow
Set-Location backend
go mod download
Write-Host "✅ 后端依赖安装完成" -ForegroundColor Green
Set-Location ..

Write-Host ""
Write-Host "📦 正在安装前端依赖..." -ForegroundColor Yellow
Set-Location frontend
npm install
Write-Host "✅ 前端依赖安装完成" -ForegroundColor Green
Set-Location ..

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  启动说明" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📌 终端 1 - 启动后端:" -ForegroundColor Yellow
Write-Host "   cd backend"
Write-Host "   go run main.go"
Write-Host "   后端地址: http://localhost:8080"
Write-Host ""
Write-Host "📌 终端 2 - 启动前端:" -ForegroundColor Yellow
Write-Host "   cd frontend"
Write-Host "   npm run dev"
Write-Host "   前端地址: http://localhost:5173"
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
