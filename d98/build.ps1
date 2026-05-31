param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("all", "build", "wasm", "run", "clean", "deps", "help")]
    [string]$Command = "help"
)

function Show-Help {
    Write-Host "可用的命令:"
    Write-Host "  build    - 构建Go服务器"
    Write-Host "  wasm     - 编译Rust Wasm示例"
    Write-Host "  run      - 运行Go服务器"
    Write-Host "  clean    - 清理构建产物"
    Write-Host "  deps     - 安装依赖"
    Write-Host "  help     - 显示帮助"
}

function Install-Deps {
    Write-Host "安装Go依赖..."
    go mod tidy
    Write-Host "安装Rust wasm目标..."
    rustup target add wasm32-unknown-unknown
}

function Build-Go {
    Write-Host "构建Go服务器..."
    if (-not (Test-Path "bin")) {
        New-Item -ItemType Directory -Path "bin" | Out-Null
    }
    go build -o bin/server.exe cmd/server/main.go
    Write-Host "构建完成: bin/server.exe"
}

function Build-Wasm {
    Write-Host "编译Rust Wasm示例..."
    Set-Location examples/rust
    cargo build --release --target wasm32-unknown-unknown
    Set-Location ../..
    Write-Host "Wasm文件已生成: examples/rust/target/wasm32-unknown-unknown/release/wasm_math.wasm"
}

function Run-Server {
    Write-Host "启动Go服务器..."
    go run cmd/server/main.go
}

function Clean {
    Write-Host "清理构建产物..."
    if (Test-Path "bin") {
        Remove-Item -Recurse -Force bin
    }
    if (Test-Path "uploads") {
        Get-ChildItem uploads -File | Remove-Item -Force
    }
    Set-Location examples/rust
    cargo clean
    Set-Location ../..
}

switch ($Command) {
    "help" { Show-Help }
    "deps" { Install-Deps }
    "build" { Build-Go }
    "wasm" { Build-Wasm }
    "run" { Run-Server }
    "clean" { Clean }
    "all" {
        Install-Deps
        Build-Go
        Build-Wasm
    }
}
