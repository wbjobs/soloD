@echo off
echo ========================================
echo   气象粒子系统 - 全栈应用启动
echo ========================================
echo.

echo [1/3] 安装后端依赖...
cd backend
if not exist "venv" (
    python -m venv venv
)
call venv\Scripts\activate.bat
pip install -r requirements.txt -q

echo.
echo [2/3] 安装前端依赖...
cd ..\frontend
if not exist "node_modules" (
    npm install
)

echo.
echo [3/3] 启动服务...
echo.
echo 请打开两个终端分别运行:
echo   后端: cd backend && venv\Scripts\activate.bat && uvicorn main:app --reload
echo   前端: cd frontend && npm run dev
echo.
echo 按任意键退出...
pause >nul
