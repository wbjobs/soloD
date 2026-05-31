@echo off
echo ========================================
echo 音频处理应用 - 启动脚本
echo ========================================
echo.

echo [1/4] 检查环境...
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: 未找到 Python，请先安装 Python 3.8+
    pause
    exit /b 1
)

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo 警告: 未找到 Node.js，前端可能无法运行
)

where ffmpeg >nul 2>&1
if %errorlevel% neq 0 (
    echo 警告: 未找到 FFmpeg，音频降噪功能可能无法使用
)

where redis-server >nul 2>&1
if %errorlevel% neq 0 (
    echo 警告: 未找到 Redis，任务队列可能无法使用
)
echo.

echo [2/4] 安装后端依赖...
cd backend
if not exist venv (
    echo 创建虚拟环境...
    python -m venv venv
)
call venv\Scripts\activate
pip install -r requirements.txt
cd ..
echo.

echo [3/4] 安装前端依赖...
cd frontend
if not exist node_modules (
    echo 安装 npm 包...
    call npm install
)
cd ..
echo.

echo [4/4] 启动服务...
echo 请手动打开三个终端分别执行以下命令:
echo.
echo 终端 1 (Redis):
echo   redis-server
echo.
echo 终端 2 (后端):
echo   cd backend
echo   venv\Scripts\activate
echo   celery -A main worker --loglevel=info --pool=solo
echo.
echo 终端 3 (后端API):
echo   cd backend
echo   venv\Scripts\activate
echo   python main.py
echo.
echo 终端 4 (前端):
echo   cd frontend
echo   npm run dev
echo.
echo ========================================
echo 提示: 
echo - WASM 模块需要使用 wasm-pack 编译
echo - 请确保 Redis、FFmpeg 已正确安装
echo ========================================
pause
