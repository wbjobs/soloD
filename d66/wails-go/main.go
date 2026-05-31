package main

import (
	"context"
	"embed"
	"fmt"
	"log"
	"sync"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

type App struct {
	ctx           context.Context
	windowVisible bool
	mu            sync.RWMutex
	trayTooltip   string
}

func NewApp() *App {
	return &App{
		windowVisible: true,
		trayTooltip:   "系统托盘提示应用 - 点击切换窗口显示",
	}
}

func (a *App) OnStartup(ctx context.Context) {
	a.ctx = ctx
	log.Println("应用启动成功！")
	a.initSystemTray()
}

func (a *App) OnShutdown(ctx context.Context) {
	log.Println("应用正在关闭...")
}

func (a *App) OnBeforeClose(ctx context.Context) (prevent bool) {
	log.Println("窗口关闭，隐藏到系统托盘...")
	a.HideWindow()
	return true
}

func (a *App) SetTrayTooltip(text string) error {
	a.mu.Lock()
	a.trayTooltip = text
	a.mu.Unlock()

	err := updateSystemTrayTooltip(a.ctx, text)
	if err != nil {
		log.Printf("设置托盘提示失败: %v", err)
		return err
	}

	log.Printf("托盘提示已更新为: %s", text)
	return nil
}

func (a *App) GetTrayTooltip() string {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.trayTooltip
}

func (a *App) ToggleWindow() {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.windowVisible {
		a.hideWindowInternal()
	} else {
		a.showWindowInternal()
	}
}

func (a *App) ShowWindow() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.showWindowInternal()
}

func (a *App) HideWindow() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.hideWindowInternal()
}

func (a *App) IsWindowVisible() bool {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.windowVisible
}

func (a *App) QuitApp() {
	wails.Quit(a.ctx)
}

func (a *App) showWindowInternal() {
	wails.Show(a.ctx)
	a.windowVisible = true
	log.Println("窗口已显示")
}

func (a *App) hideWindowInternal() {
	wails.Hide(a.ctx)
	a.windowVisible = false
	log.Println("窗口已隐藏")
}

func main() {
	app := NewApp()

	AppMenu := menu.NewMenu()
	FileMenu := AppMenu.AddSubmenu("文件")
	FileMenu.AddText("显示窗口", nil, func(_ *menu.CallbackData) {
		app.ShowWindow()
	})
	FileMenu.AddText("隐藏窗口", nil, func(_ *menu.CallbackData) {
		app.HideWindow()
	})
	FileMenu.AddSeparator()
	FileMenu.AddText("退出", nil, func(_ *menu.CallbackData) {
		app.QuitApp()
	})

	err := wails.Run(&options.App{
		Title:             "系统托盘提示应用",
		Width:             500,
		Height:            600,
		DisableResize:     false,
		Fullscreen:        false,
		Frameless:         false,
		StartHidden:       false,
		HideWindowOnClose: true,
		BackgroundColour:  &options.RGBA{R: 255, G: 255, B: 255, A: 1},
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		Menu:             AppMenu,
		OnStartup:        app.OnStartup,
		OnShutdown:       app.OnShutdown,
		OnBeforeClose:    app.OnBeforeClose,
		Bind: []interface{}{
			app,
		},
		Windows: &windows.Options{
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
		},
		Mac: &mac.Options{
			TitleBar:             mac.TitleBarDefault(),
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
		},
	})

	if err != nil {
		log.Fatalf("应用启动失败: %v", err)
	}
}
