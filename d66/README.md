# 跨平台系统托盘应用

本项目包含两个版本的实现，你可以根据技术栈选择合适的版本：

| 版本 | 技术栈 | 位置 | 特点 |
|------|--------|------|------|
| **Tauri + Rust** | Rust + Preact | 根目录 | Tauri 原生支持，稳定成熟 |
| **Wails + Go** | Go + HTML | `wails-go/` 目录 | Go 后端，条件编译示例 |

---

## 🎯 功能需求完成情况

### ✅ 已完成功能

1. **前端界面** (两个版本均实现)
   - 极简窗口设计，输入框用于输入托盘提示文本
   - "设置"按钮触发后端命令
   - 实时状态反馈和错误处理

2. **Go 后端 - 条件编译实现** (`wails-go/` 目录)
   - ✅ Windows 平台: 使用 Win32 API (`Shell_NotifyIconW`)
   - ✅ macOS 平台: 使用 Objective-C (`NSStatusItem`)
   - ✅ Linux 平台: 基础框架实现
   - ✅ 使用 Go Build Tags 实现平台代码分离
   - ✅ `SetTrayTooltip` 函数接收前端字符串参数

3. **托盘图标点击事件**
   - ✅ 左键点击切换窗口显示/隐藏
   - ✅ 关闭窗口不会退出应用，只会隐藏到托盘
   - ✅ 窗口状态实时同步显示

4. **跨平台兼容性**
   - ✅ 平台特定代码隔离，互不影响
   - ✅ 统一的 Go 接口封装平台差异
   - ✅ 线程安全的状态管理

---

## 📂 项目结构总览

```
d66/
├── 📁 wails-go/              # Wails + Go 版本（推荐学习条件编译）
│   ├── main.go              # 主程序，核心逻辑
│   ├── tray.go              # 通用托盘接口
│   ├── tray_windows.go      # Windows 实现 (Build Tag)
│   ├── tray_darwin.go       # macOS 实现 (Build Tag)
│   ├── tray_linux.go        # Linux 实现 (Build Tag)
│   ├── go.mod
│   ├── wails.json
│   ├── README.md            # 详细使用文档
│   └── frontend/dist/
│       └── index.html
│
├── 📁 src-tauri/            # Tauri + Rust 版本
│   ├── src/main.rs          # Rust 后端
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── 📁 src/                  # Preact 前端
│   ├── App.jsx
│   └── index.css
├── TAURI_GO_GUIDE.md        # 技术实现详解
└── README.md                # 本文档
```

---

## 🚀 快速开始

### 选项 1: Wails + Go 版本（学习 Go 条件编译）

```bash
# 1. 安装 Wails
go install github.com/wailsapp/wails/v2/cmd/wails@latest

# 2. 进入目录
cd wails-go

# 3. 运行开发模式
wails dev
```

### 选项 2: Tauri + Rust 版本（生产使用）

```bash
# 1. 安装依赖
npm install

# 2. 运行开发模式
npm run tauri dev
```

---

## 🔧 Go 条件编译核心实现说明

### Build Tags 使用方式

```go
// 只在 Windows 平台编译
//go:build windows
// +build windows

package main

// Windows 专用代码...
```

### 各平台实现文件对应关系

| 文件名 | 平台 | 技术 |
|--------|------|------|
| `tray_windows.go` | Windows | Win32 API + 消息循环 |
| `tray_darwin.go` | macOS | cgo + Objective-C |
| `tray_linux.go` | Linux | 框架代码 |
| `tray.go` | 通用 | 统一接口封装 |

### 托盘点击事件处理流程

```
1. 用户点击托盘图标
   ↓
2. 平台原生事件触发 (WindowProc / Objective-C)
   ↓
3. 调用 Go 函数 handleTrayClick()
   ↓
4. globalApp.ToggleWindow()
   ↓
5. 根据当前状态调用 wails.Show() 或 wails.Hide()
```

### 关键代码示例

**窗口切换逻辑** (`main.go`):
```go
func (a *App) ToggleWindow() {
    a.mu.Lock()
    defer a.mu.Unlock()

    if a.windowVisible {
        wails.Hide(a.ctx)
        a.windowVisible = false
    } else {
        wails.Show(a.ctx)
        a.windowVisible = true
    }
}
```

**Windows 事件处理** (`tray_windows.go`):
```go
func windowProc(hwnd uintptr, msg uint32, wParam, lParam uintptr) uintptr {
    switch msg {
    case WM_TRAYMESSAGE:
        switch lParam {
        case WM_LBUTTONUP:
            handleTrayClick()  // 切换窗口
        }
    }
    return DefWindowProc(...)
}
```

---

## 📖 更多文档

- **`TAURI_GO_GUIDE.md`**: 完整的技术实现详解，包括：
  - Tauri 自定义命令配置
  - Rust 条件编译示例
  - Go 条件编译详解
  - 前端调用示例

- **`wails-go/README.md`**: Wails + Go 版本的详细使用说明

---

## ✨ 功能清单确认

| 需求 | 完成情况 | 位置 |
|------|----------|------|
| 前端输入框 + 设置按钮 | ✅ | 两个版本均有 |
| 设置托盘提示文本 | ✅ | `SetTrayTooltip` |
| Go 后端实现 | ✅ | `wails-go/` |
| Go 条件编译 (Build Tags) | ✅ | `tray_*.go` |
| Windows 托盘实现 | ✅ | `tray_windows.go` |
| macOS 托盘实现 | ✅ | `tray_darwin.go` |
| Linux 托盘实现 | ✅ | `tray_linux.go` |
| 点击托盘切换窗口 | ✅ | `ToggleWindow()` |
| 关闭窗口隐藏到托盘 | ✅ | `OnBeforeClose()` |

---

## 🎓 学习建议

如果你想学习 **Go 的条件编译和跨平台系统编程**，建议深入研究 `wails-go/` 目录下的代码。

如果你需要 **生产环境的稳定版本**，建议使用 Tauri + Rust 版本，Tauri 对系统托盘的封装更加成熟。
