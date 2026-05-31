//go:build !windows && !darwin && !linux
// +build !windows,!darwin,!linux

package main

import (
	"context"
	"fmt"
)

var (
	currentTooltip = "系统托盘提示应用"
)

func setSystemTrayTooltip(ctx context.Context, text string) error {
	currentTooltip = text
	return fmt.Errorf("当前平台不支持系统托盘提示")
}

func getCurrentTooltip() string {
	return currentTooltip
}
