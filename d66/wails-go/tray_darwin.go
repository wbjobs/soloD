//go:build darwin
// +build darwin

package main

import (
	"context"
	"log"
	"unsafe"
)

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa -framework Foundation

#import <Cocoa/Cocoa.h>

static NSStatusItem *statusItem;

@interface TrayHandler : NSObject
- (void)handleClick:(NSStatusItem*)sender;
- (void)handleRightClick:(NSStatusItem*)sender;
@end

@implementation TrayHandler
- (void)handleClick:(NSStatusItem*)sender {
    NSLog(@"托盘图标被点击");
    handleTrayClickGo();
}
- (void)handleRightClick:(NSStatusItem*)sender {
    NSLog(@"托盘图标右键点击");
}
@end

static TrayHandler *handler;

void initStatusItem() {
    @autoreleasepool {
        if (statusItem == nil) {
            statusItem = [[NSStatusBar systemStatusBar] statusItemWithLength:NSVariableStatusItemLength];
            [statusItem.button setTitle:@"📌"];
            [statusItem setToolTip:@"系统托盘提示应用"];

            handler = [[TrayHandler alloc] init];
            [statusItem.button setTarget:handler];
            [statusItem.button setAction:@selector(handleClick:)];
            [statusItem.button sendActionOn:NSLeftMouseUp];
        }
    }
}

void setStatusItemTooltip(const char *tooltip) {
    @autoreleasepool {
        NSString *tooltipStr = [NSString stringWithUTF8String:tooltip];
        [statusItem setToolTip:tooltipStr];
    }
}
*/
import "C"

//export handleTrayClickGo
func handleTrayClickGo() {
	handleTrayClick()
}

func createSystemTray(ctx context.Context) error {
	C.initStatusItem()
	log.Println("macOS 系统托盘已创建")
	return nil
}

func updateSystemTrayTooltip(ctx context.Context, text string) error {
	cText := C.CString(text)
	defer C.free(unsafe.Pointer(cText))
	C.setStatusItemTooltip(cText)
	return nil
}
