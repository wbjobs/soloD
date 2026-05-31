# 系统托盘提示应用 (Wails + Go)

使用 Go + Wails 构建的跨平台系统托盘应用，支持设置托盘提示文本和点击托盘图标切换窗口显示/隐藏。

## ✨ 功能特性

- 🖱️ **托盘图标点击事件**: 左键点击切换窗口显示/隐藏
- 💬 **自定义托盘提示**: 可通过前端界面设置托盘图标的悬停提示文本
- 🪟 **窗口管理**: 关闭窗口不会退出应用，只会隐藏到托盘
- 🎯 **跨平台支持**: Windows、macOS、Linux (使用 Go 条件编译)
- 🔒 **线程安全**: 使用 sync.RWMutex 保证并发安全

## 📁 项目结构

```
wails-go/
├── main.go              # 主程序，应用核心逻辑
├── tray.go              # 通用托盘接口
├── tray_windows.go      # Windows 平台实现 (Win32 API)
├── tray_darwin.go       # macOS 平台实现 (Objective-C)
├── tray_linux.go        # Linux 平台实现
├── go.mod               # Go 模块依赖
├── wails.json           # Wails 项目配置
└── frontend/
    └── dist/
        └── index.html   # 前端界面
```

## 🔧 核心技术实现

### 1. Go 条件编译 (Build Tags)

使用 Go 的构建标签实现跨平台代码分离：

```go
//go:build windows
// +build windows

package main

// Windows 平台专用代码...
```

| 平台 | Build Tag | 实现方式 |
|------|-----------|----------|
| Windows | `//go:build windows` | Win32 API (Shell_NotifyIcon) |
| macOS | `//go:build darwin` | Objective-C (NSStatusItem) |
| Linux | `//go:build linux` | libappindicator (可选) |

### 2. 托盘图标点击事件监听

**Windows 平台** (`tray_windows.go`):
- 创建隐藏消息窗口接收托盘消息
- 监听 `WM_LBUTTONUP` 事件
- 使用 `Shell_NotifyIconW` 管理托盘图标

```go
func windowProc(hwnd uintptr, msg uint32, wParam, lParam uintptr) uintptr {
    switch msg {
    case WM_TRAYMESSAGE:
        switch lParam {
        case WM_LBUTTONUP:
            handleTrayClick()  // 切换窗口显示/隐藏
        }
    }
}
```

**macOS 平台** (`tray_darwin.go`):
- 使用 cgo 调用 Objective-C 代码
- 通过 `NSStatusItem` 设置点击回调
- 使用 Go 的 `//export` 导出函数供 C 调用

```objective-c
- (void)handleClick:(NSStatusItem*)sender {
    handleTrayClickGo();  // 调用 Go 函数
}
```

### 3. 窗口显示/隐藏切换逻辑

`main.go` 中的核心方法：

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

### 4. 前端与 Go 交互

通过 Wails 绑定的 Go 方法，前端可以直接调用：

```javascript
// 设置托盘提示
await window.go.main.App.SetTrayTooltip(text);

// 隐藏窗口
await window.go.main.App.HideWindow();

// 退出应用
await window.go.main.App.QuitApp();

// 获取窗口状态
const visible = await window.go.main.App.IsWindowVisible();
```

## 🚀 快速开始

### 前置要求

1. **Go 1.18+**
   ```bash
   go version
   ```

2. **Wails CLI**
   ```bash
   go install github.com/wailsapp/wails/v2/cmd/wails@latest
   ```

3. **平台特定依赖**
   - **Windows**: MinGW 或 MSVC
   - **macOS**: Xcode 命令行工具
   - **Linux**: `libgtk-3-dev libwebkit2gtk-4.0-dev`

### 运行开发模式

```bash
cd wails-go
wails dev
```

### 构建生产版本

```bash
wails build
```

## 📋 Go 后端 API

所有绑定到前端的方法：

| 方法 | 说明 |
|------|------|
| `SetTrayTooltip(text string) error` | 设置系统托盘图标提示文本 |
| `GetTrayTooltip() string` | 获取当前托盘提示文本 |
| `ToggleWindow()` | 切换窗口显示/隐藏状态 |
| `ShowWindow()` | 显示主窗口 |
| `HideWindow()` | 隐藏主窗口 |
| `IsWindowVisible() bool` | 获取窗口可见状态 |
| `QuitApp()` | 退出应用 |

## 🔄 事件处理流程

### 托盘图标点击 -> 切换窗口

```
用户点击托盘图标
       ↓
平台原生事件回调
       ↓
handleTrayClick() 函数
       ↓
globalApp.ToggleWindow()
       ↓
切换 windowVisible 状态
       ↓
调用 wails.Show() 或 wails.Hide()
```

## 💡 设计亮点

### 1. 线程安全

使用 `sync.RWMutex` 保证状态读写的线程安全：

```go
type App struct {
    ctx           context.Context
    windowVisible bool
    mu            sync.RWMutex  // 读写锁
    trayTooltip   string
}
```

### 2. 优雅的窗口关闭处理

```go
func (a *App) OnBeforeClose(ctx context.Context) (prevent bool) {
    log.Println("窗口关闭，隐藏到系统托盘...")
    a.HideWindow()
    return true  // 阻止窗口关闭，只隐藏
}
```

### 3. 跨平台统一接口

通过 `createSystemTray` 和 `updateSystemTrayTooltip` 两个通用函数，隐藏平台差异。

## 🐛 常见问题

### Q: Windows 托盘图标不显示？
A: 确保消息窗口已创建，检查 `Shell_NotifyIconW` 调用返回值。

### Q: macOS 点击事件不触发？
A: 确认已设置 `sendActionOn` 和 `target` 属性，检查 cgo 导出函数是否正确。

### Q: 开发模式下前端无法连接到 Go？
A: 检查 Wails 开发服务器是否正常启动，查看控制台日志。

## 📝 后续优化建议

1. 添加右键菜单支持
2. 集成系统通知功能
3. 添加托盘图标自定义支持
4. 实现自动启动功能
5. 添加更多托盘交互事件

## 📄 License

MIT License
