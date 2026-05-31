@echo off
echo ========================================
echo   果冻软体物理模拟器 - 启动服务器
echo ========================================
echo.

python --version >nul 2>&1
if %errorlevel% equ 0 (
    echo 使用 Python HTTP 服务器...
    echo 请在浏览器中打开: http://localhost:8080
    echo.
    echo 按 Ctrl+C 停止服务器
    echo.
    python -m http.server 8080
) else (
    echo Python 未找到，尝试使用 PowerShell...
    echo 请在浏览器中打开: http://localhost:8080
    echo.
    echo 按 Ctrl+C 停止服务器
    echo.
    powershell -Command "$listener = New-Object System.Net.HttpListener; $listener.Prefixes.Add('http://localhost:8080/'); $listener.Start(); Write-Host 'Server running...'; while($listener.IsListening) { $context = $listener.GetContext(); $request = $context.Request; $response = $context.Response; $path = $request.Url.LocalPath; if($path -eq '/') { $path = '/index.html' }; $file = Join-Path $PWD $path.TrimStart('/'); if(Test-Path $file) { $content = [System.IO.File]::ReadAllBytes($file); $response.ContentLength64 = $content.Length; $response.OutputStream.Write($content, 0, $content.Length) } else { $response.StatusCode = 404 }; $response.Close() }"
)
