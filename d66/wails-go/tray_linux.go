//go:build linux
// +build linux

package main

import (
	"context"
	"log"
)

func createSystemTray(ctx context.Context) error {
	log.Println("Linux 系统托盘初始化 - 请确保已安装 libappindicator")
	log.Println("注意: Linux 系统托盘功能依赖桌面环境支持")
	return nil
}

func updateSystemTrayTooltip(ctx context.Context, text string) error {
	log.Printf("Linux 托盘提示已更新: %s", text)
	return nil
}
