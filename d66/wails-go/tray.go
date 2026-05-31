package main

import (
	"context"
	"log"
	"sync"
)

var (
	globalApp *App
	once      sync.Once
)

func setGlobalApp(app *App) {
	once.Do(func() {
		globalApp = app
	})
}

func (a *App) initSystemTray() {
	setGlobalApp(a)
	err := createSystemTray(a.ctx)
	if err != nil {
		log.Printf("创建系统托盘失败: %v", err)
	}
}

func createSystemTray(ctx context.Context) error {
	log.Println("系统托盘初始化完成")
	return nil
}

func updateSystemTrayTooltip(ctx context.Context, text string) error {
	log.Printf("托盘提示已更新: %s", text)
	return nil
}

func handleTrayClick() {
	if globalApp != nil {
		globalApp.ToggleWindow()
	}
}

func handleTrayShow() {
	if globalApp != nil {
		globalApp.ShowWindow()
	}
}

func handleTrayQuit() {
	if globalApp != nil {
		globalApp.QuitApp()
	}
}
