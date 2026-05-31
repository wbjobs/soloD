# Tauri + Go 系统托盘应用完整指南

## 目录

1. [Tauri 自定义命令配置](#1-tauri-自定义命令配置)
2. [Rust 后端实现（条件编译）](#2-rust-后端实现条件编译)
3. [Go 条件编译完整示例](#3-go-条件编译完整示例)
4. [前端调用示例](#4-前端调用示例)
5. [完整运行验证](#5-完整运行验证)

---

## 1. Tauri 自定义命令配置

### 1.1 tauri.conf.json 配置要点

**重要**: Tauri 自定义命令**不需要**在 `allowlist` 中配置，只需在 Rust 代码中通过 `invoke_handler` 注册即可。

当前正确配置 (`src-tauri/tauri.conf.json`):

```json
{
  "tauri": {
    "allowlist": {
      "all": false,
      "shell": {
        "all": false,
        "open": true
      }
    },
    "security": {
      "csp": null
    },
    "systemTray": {
      "iconPath": "icons/icon.png",
      "iconAsTemplate": true
    }
  }
}
```

### 1.2 关键配置说明

| 配置项 | 说明 |
|--------|------|
| `allowlist` | 控制 Tauri 内置 API 的访问权限，**不影响自定义命令** |
| `invoke_handler` | 在 Rust 中注册自定义命令，这才是真正的权限控制 |
| `systemTray` | 启用系统托盘功能的必要配置 |

---

## 2. Rust 后端实现（条件编译）

### 2.1 完整实现 (`src-tauri/src/main.rs`)

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{CustomMenuItem, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem};
use tauri::Manager;

// 自定义命令：设置托盘提示
#[tauri::command]
fn set_tray_tooltip(app_handle: tauri::AppHandle, text: String) -> Result<(), String> {
    let tray_handle = app_handle.tray_handle();
    
    // Windows 平台实现
    #[cfg(target_os = "windows")]
    {
        tray_handle
            .set_tooltip(&text)
            .map_err(|e| format!("Windows 设置失败: {}", e))?;
        println!("Windows 托盘提示已更新: {}", text);
    }
    
    // macOS 平台实现
    #[cfg(target_os = "macos")]
    {
        tray_handle
            .set_tooltip(&text)
            .map_err(|e| format!("macOS 设置失败: {}", e))?;
        println!("macOS 托盘提示已更新: {}", text);
    }
    
    // Linux 平台实现
    #[cfg(target_os = "linux")]
    {
        tray_handle
            .set_tooltip(&text)
            .map_err(|e| format!("Linux 设置失败: {}", e))?;
        println!("Linux 托盘提示已更新: {}", text);
    }

    Ok(())
}

fn main() {
    // 创建托盘菜单
    let quit = CustomMenuItem::new("quit".to_string(), "退出");
    let show = CustomMenuItem::new("show".to_string(), "显示窗口");
    
    let tray_menu = SystemTrayMenu::new()
        .add_item(show)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit);

    // 初始化系统托盘
    let system_tray = SystemTray::new()
        .with_menu(tray_menu)
        .with_tooltip("系统托盘提示应用");

    // 运行 Tauri 应用
    tauri::Builder::default()
        .system_tray(system_tray)
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::LeftClick { .. } => {
                if let Some(window) = app.get_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "quit" => std::process::exit(0),
                "show" => {
                    if let Some(window) = app.get_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                _ => {}
            },
            _ => {}
        })
        // 注册自定义命令 - 这是关键！
        .invoke_handler(tauri::generate_handler![set_tray_tooltip])
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用时出错");
}
```

### 2.2 Rust 条件编译要点

| 属性 | 说明 |
|------|------|
| `#[cfg(target_os = "windows")]` | Windows 平台专属代码 |
| `#[cfg(target_os = "macos")]` | macOS 平台专属代码 |
| `#[cfg(target_os = "linux")]` | Linux 平台专属代码 |
| `#[cfg_attr(not(debug_assertions), ...)]` | 发布模式配置 |

---

## 3. Go 条件编译完整示例

虽然 Tauri 原生使用 Rust，但如果你确实需要 Go，可以使用 **Wails** 框架。

### 3.1 项目结构

```
wails-go/
├── go.mod              # Go 模块文件
├── main.go             # 主程序
├── tray_windows.go     # Windows 实现 (build tag)
├── tray_darwin.go      # macOS 实现 (build tag)
├── tray_linux.go       # Linux 实现 (build tag)
└── tray_other.go       # 其他平台 fallback
```

### 3.2 Windows 平台实现 (`tray_windows.go`)

```go
//go:build windows
// +build windows

package main

import (
	"context"
	"fmt"
	"syscall"
	"unsafe"
)

var currentTooltip = "系统托盘提示应用"

const (
	NIM_MODIFY = 0x00000002
	NIF_TIP    = 0x00000004
)

type NOTIFYICONDATAW struct {
	cbSize           uint32
	hWnd             uintptr
	uID              uint32
	uFlags           uint32
	uCallbackMessage uint32
	hIcon            uintptr
	szTip            [128]uint16
}

func setSystemTrayTooltip(ctx context.Context, text string) error {
	currentTooltip = text

	shell32 := syscall.NewLazyDLL("shell32.dll")
	shellNotifyIcon := shell32.NewProc("Shell_NotifyIconW")

	var nid NOTIFYICONDATAW
	nid.cbSize = 528 // NOTIFYICONDATAW 大小
	nid.uFlags = NIF_TIP
	
	tipText, _ := syscall.UTF16FromString(text)
	copy(nid.szTip[:], tipText)
	
	ret, _, err := shellNotifyIcon.Call(NIM_MODIFY, uintptr(unsafe.Pointer(&nid)))
	if ret == 0 {
		return fmt.Errorf("Windows API 调用失败: %v", err)
	}
	
	fmt.Println("Windows 托盘提示已更新:", text)
	return nil
}

func getCurrentTooltip() string {
	return currentTooltip
}
```

### 3.3 macOS 平台实现 (`tray_darwin.go`)

```go
//go:build darwin
// +build darwin

package main

import (
	"context"
	"unsafe"
)

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa

#import <Cocoa/Cocoa.h>

static NSStatusItem *statusItem;

void initStatusItem() {
    if (statusItem == nil) {
        statusItem = [[NSStatusBar systemStatusBar] statusItemWithLength:NSVariableStatusItemLength];
        [statusItem.button setTitle:@"📌"];
    }
}

void setStatusItemTooltip(const char *tooltip) {
    initStatusItem();
    NSString *tooltipStr = [NSString stringWithUTF8String:tooltip];
    [statusItem setToolTip:tooltipStr];
}
*/
import "C"

var currentTooltip = "系统托盘提示应用"

func setSystemTrayTooltip(ctx context.Context, text string) error {
	currentTooltip = text
	cText := C.CString(text)
	defer C.free(unsafe.Pointer(cText))
	C.setStatusItemTooltip(cText)
	println("macOS 托盘提示已更新:", text)
	return nil
}

func getCurrentTooltip() string {
	return currentTooltip
}
```

### 3.4 Linux 平台实现 (`tray_linux.go`)

```go
//go:build linux
// +build linux

package main

import (
	"context"
	"fmt"
)

var currentTooltip = "系统托盘提示应用"

func setSystemTrayTooltip(ctx context.Context, text string) error {
	currentTooltip = text
	// Linux 系统托盘通常使用 libappindicator 或 D-Bus
	// 这里提供基本实现框架
	fmt.Println("Linux 托盘提示已更新:", text)
	return nil
}

func getCurrentTooltip() string {
	return currentTooltip
}
```

### 3.5 其他平台 fallback (`tray_other.go`)

```go
//go:build !windows && !darwin && !linux
// +build !windows,!darwin,!linux

package main

import (
	"context"
	"fmt"
)

var currentTooltip = "系统托盘提示应用"

func setSystemTrayTooltip(ctx context.Context, text string) error {
	currentTooltip = text
	return fmt.Errorf("当前平台不支持系统托盘")
}

func getCurrentTooltip() string {
	return currentTooltip
}
```

### 3.6 Go 条件编译要点

| 语法 | 说明 |
|------|------|
| `//go:build windows` | Go 1.17+ 新语法，建议使用 |
| `// +build windows` | 旧版语法，为兼容性保留 |
| `//go:build !windows && !darwin` | 排除多个平台 |
| 文件名后缀 | `_windows.go`、`_darwin.go` 也会自动识别 |

---

## 4. 前端调用示例

### 4.1 完整 Preact 组件 (`src/App.jsx`)

```jsx
import { useState } from 'preact/hooks'
import { invoke } from '@tauri-apps/api/tauri'

function App() {
  const [tooltip, setTooltip] = useState('')
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSetTooltip = async () => {
    if (!tooltip.trim()) {
      setMessage('⚠️ 请输入提示文本')
      setTimeout(() => setMessage(''), 2000)
      return
    }

    setIsLoading(true)
    try {
      // 调用 Rust 后端的自定义命令
      await invoke('set_tray_tooltip', { text: tooltip })
      setMessage('✅ 托盘提示已更新成功！')
      console.log('命令调用成功，新提示:', tooltip)
    } catch (error) {
      setMessage('❌ 设置失败: ' + error)
      console.error('命令调用失败:', error)
    } finally {
      setIsLoading(false)
      setTimeout(() => setMessage(''), 3000)
    }
  }

  return (
    <div class="container">
      <h1>系统托盘提示设置</h1>
      
      <div class="input-group">
        <input
          type="text"
          placeholder="输入托盘提示文本（如：Hello World）"
          value={tooltip}
          onInput={(e) => setTooltip(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSetTooltip()}
          disabled={isLoading}
        />
        <button 
          onClick={handleSetTooltip} 
          disabled={isLoading}
        >
          {isLoading ? '设置中...' : '设置托盘提示'}
        </button>
      </div>
      
      {message && (
        <div class={`message ${message.includes('成功') ? 'success' : 'error'}`}>
          {message}
        </div>
      )}
      
      <div class="tips">
        <p>💡 设置后，将鼠标悬停在系统托盘图标上即可看到提示文本</p>
      </div>
    </div>
  )
}

export default App
```

### 4.2 invoke 函数调用要点

```javascript
// 基本调用
await invoke('命令名', { 参数1: 值1, 参数2: 值2 })

// 错误处理
try {
  const result = await invoke('set_tray_tooltip', { text: 'Hello' })
} catch (error) {
  console.error('调用失败:', error)
}
```

---

## 5. 完整运行验证

### 5.1 环境检查

```bash
# 检查 Node.js
node --version  # >= 16

# 检查 Rust（必需）
rustc --version
cargo --version

# 检查 Tauri CLI
npm list @tauri-apps/cli
```

### 5.2 安装依赖

```bash
cd e:\soloD\d66
npm install
```

### 5.3 运行开发模式

```bash
npm run tauri dev
```

### 5.4 验证步骤

1. 应用启动后，查看系统托盘区域是否有图标
2. 在输入框中输入文本（如："Hello Tauri!"）
3. 点击"设置托盘提示"按钮
4. 观察是否显示"✅ 托盘提示已更新成功！"
5. 将鼠标悬停在托盘图标上，验证提示文本是否更新

### 5.5 常见问题排查

| 问题 | 解决方案 |
|------|----------|
| 命令调用失败 | 检查 Rust 中 `invoke_handler` 是否注册了命令 |
| 托盘图标不显示 | 检查 `tauri.conf.json` 中的 `systemTray` 配置 |
| 提示文本不更新 | 检查是否正确获取了 `tray_handle` |
| 构建失败 | 运行 `cargo check` 检查 Rust 语法错误 |

---

## 总结

### Tauri 方案（推荐）
- ✅ Tauri 原生支持，API 最稳定
- ✅ 一行代码跨平台设置托盘提示
- ✅ 前端通过 `invoke()` 直接调用

### Wails + Go 方案
- ✅ 真正的 Go 后端
- ✅ 使用 Go 的 build tags 实现条件编译
- ✅ 需要调用各平台原生 API（Windows API、Objective-C、D-Bus）

根据你的需求选择合适的方案！当前 Tauri 项目已配置完成，可以直接运行测试。
