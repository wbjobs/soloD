//go:build windows
// +build windows

package main

import (
	"context"
	"log"
	"syscall"
	"unsafe"
)

const (
	WM_USER          = 0x0400
	WM_TRAYMESSAGE   = WM_USER + 1
	NIM_ADD          = 0x00000000
	NIM_MODIFY       = 0x00000002
	NIM_DELETE       = 0x00000004
	NIF_MESSAGE      = 0x00000001
	NIF_ICON         = 0x00000002
	NIF_TIP          = 0x00000004
	NOTIFYICONDATAW_SIZE = 504

	ID_TRAY_ICON    = 1001
	WM_LBUTTONUP    = 0x0202
	WM_RBUTTONUP    = 0x0205
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

var (
	shell32           = syscall.NewLazyDLL("shell32.dll")
	procShellNotifyIconW = shell32.NewProc("Shell_NotifyIconW")

	user32            = syscall.NewLazyDLL("user32.dll")
	procLoadIconW     = user32.NewProc("LoadIconW")
	procCreateWindowExW = user32.NewProc("CreateWindowExW")
	procDefWindowProcW = user32.NewProc("DefWindowProcW")
	procRegisterClassW = user32.NewProc("RegisterClassW")
	procGetMessageW   = user32.NewProc("GetMessageW")
	procTranslateMessage = user32.NewProc("TranslateMessage")
	procDispatchMessageW = user32.NewProc("DispatchMessageW")
	procPostQuitMessage = user32.NewProc("PostQuitMessage")

	messageWindow     uintptr
)

func createSystemTray(ctx context.Context) error {
	go runMessageLoop(ctx)
	log.Println("Windows 系统托盘已创建")
	return nil
}

func runMessageLoop(ctx context.Context) {
	className, _ := syscall.UTF16PtrFromString("TrayTooltipWindowClass")
	
	wc := struct {
		cbSize        uint32
		style         uint32
		lpfnWndProc   uintptr
		cbClsExtra    int32
		cbWndExtra    int32
		hInstance     uintptr
		hIcon         uintptr
		hCursor       uintptr
		hbrBackground uintptr
		lpszMenuName  *uint16
		lpszClassName *uint16
		hIconSm       uintptr
	}{
		cbSize:        48,
		lpfnWndProc:   syscall.NewCallback(windowProc),
		hInstance:     0,
		lpszClassName: className,
	}

	procRegisterClassW.Call(uintptr(unsafe.Pointer(&wc)))

	windowName, _ := syscall.UTF16PtrFromString("TrayTooltipMessageWindow")
	messageWindow, _, _ = procCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(windowName)),
		0, 0, 0, 0, 0, 0, 0, 0, 0,
	)

	addTrayIcon()

	var msg struct {
		hwnd    uintptr
		message uint32
		wParam  uintptr
		lParam  uintptr
		time    uint32
		pt_x    int32
		pt_y    int32
	}

	for {
		ret, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
		if ret == 0 {
			break
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&msg)))
		procDispatchMessageW.Call(uintptr(unsafe.Pointer(&msg)))
	}
}

func windowProc(hwnd uintptr, msg uint32, wParam, lParam uintptr) uintptr {
	switch msg {
	case WM_TRAYMESSAGE:
		switch lParam {
		case WM_LBUTTONUP:
			log.Println("托盘图标左键点击")
			handleTrayClick()
		case WM_RBUTTONUP:
			log.Println("托盘图标右键点击")
		}
		return 0
	}
	ret, _, _ := procDefWindowProcW.Call(hwnd, uintptr(msg), wParam, lParam)
	return ret
}

func addTrayIcon() {
	var nid NOTIFYICONDATAW
	nid.cbSize = NOTIFYICONDATAW_SIZE
	nid.hWnd = messageWindow
	nid.uID = ID_TRAY_ICON
	nid.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP
	nid.uCallbackMessage = WM_TRAYMESSAGE
	nid.hIcon, _, _ = procLoadIconW.Call(0, uintptr(32512))

	tipText, _ := syscall.UTF16FromString("系统托盘提示应用")
	copy(nid.szTip[:], tipText)

	procShellNotifyIconW.Call(NIM_ADD, uintptr(unsafe.Pointer(&nid)))
}

func updateSystemTrayTooltip(ctx context.Context, text string) error {
	var nid NOTIFYICONDATAW
	nid.cbSize = NOTIFYICONDATAW_SIZE
	nid.hWnd = messageWindow
	nid.uID = ID_TRAY_ICON
	nid.uFlags = NIF_TIP

	tipText, err := syscall.UTF16FromString(text)
	if err != nil {
		return err
	}
	copy(nid.szTip[:], tipText)

	ret, _, _ := procShellNotifyIconW.Call(NIM_MODIFY, uintptr(unsafe.Pointer(&nid)))
	if ret == 0 {
		log.Printf("更新托盘提示成功: %s", text)
	}
	return nil
}

func removeTrayIcon() {
	var nid NOTIFYICONDATAW
	nid.cbSize = NOTIFYICONDATAW_SIZE
	nid.hWnd = messageWindow
	nid.uID = ID_TRAY_ICON
	procShellNotifyIconW.Call(NIM_DELETE, uintptr(unsafe.Pointer(&nid)))
}
