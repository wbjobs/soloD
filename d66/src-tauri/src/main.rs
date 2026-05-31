#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{CustomMenuItem, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem};
use tauri::Manager;

#[tauri::command]
fn set_tray_tooltip(app_handle: tauri::AppHandle, text: String) -> Result<(), String> {
    let tray_handle = app_handle.tray_handle();
    
    #[cfg(target_os = "windows")]
    {
        tray_handle
            .set_tooltip(&text)
            .map_err(|e| format!("Windows 设置托盘提示失败: {}", e))?;
    }
    
    #[cfg(target_os = "macos")]
    {
        tray_handle
            .set_tooltip(&text)
            .map_err(|e| format!("macOS 设置托盘提示失败: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        tray_handle
            .set_tooltip(&text)
            .map_err(|e| format!("Linux 设置托盘提示失败: {}", e))?;
    }

    Ok(())
}

fn main() {
    let quit = CustomMenuItem::new("quit".to_string(), "退出");
    let show = CustomMenuItem::new("show".to_string(), "显示窗口");
    
    let tray_menu = SystemTrayMenu::new()
        .add_item(show)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit);

    let system_tray = SystemTray::new()
        .with_menu(tray_menu)
        .with_tooltip("系统托盘提示应用");

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
                "quit" => {
                    std::process::exit(0);
                }
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
        .invoke_handler(tauri::generate_handler![set_tray_tooltip])
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用时出错");
}
