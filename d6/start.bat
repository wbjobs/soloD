@echo off
echo ========================================
echo 三维城市热力图与路径规划系统
echo ========================================
echo.

echo [1/3] 检查后端依赖...
cd backend
if not exist "node_modules" (
    echo 正在安装后端依赖...
    npm install
)
cd ..

echo.
echo [2/3] 启动后端服务...
cd backend
start "City3D Backend" cmd /k "npm start"
cd ..

echo.
echo [3/3] 启动前端服务...
cd frontend
start "City3D Frontend" cmd /k "npx serve -p 8080"
cd ..

echo.
echo ========================================
echo 服务启动完成！
echo 后端服务: http://localhost:3000
echo 前端页面: http://localhost:8080
echo ========================================
echo.
echo 按任意键关闭此窗口（服务将继续运行）...
pause > nul
