from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import win32com.client as win32
import pythoncom
import json
import asyncio
from typing import Optional

app = FastAPI(title="手势 PPT 控制系统后端")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PowerPointController:
    def __init__(self):
        self.powerpoint: Optional[win32.dynamic.CDispatch] = None
        self.presentation: Optional[win32.dynamic.CDispatch] = None
        self.slide_show: Optional[win32.dynamic.CDispatch] = None
        self.initialized = False

    def initialize(self):
        try:
            pythoncom.CoInitialize()
            self.powerpoint = win32.GetActiveObject("PowerPoint.Application")
            self.initialized = True
            return True
        except Exception as e:
            print(f"获取 PowerPoint 实例失败: {e}")
            return False

    def get_active_presentation(self):
        try:
            if self.powerpoint and self.powerpoint.Presentations.Count > 0:
                self.presentation = self.powerpoint.ActivePresentation
                return True
        except Exception as e:
            print(f"获取活动演示文稿失败: {e}")
        return False

    def is_slide_show_running(self):
        try:
            if self.powerpoint and self.powerpoint.SlideShowWindows.Count > 0:
                self.slide_show = self.powerpoint.SlideShowWindows(1)
                return True
        except Exception as e:
            print(f"检查幻灯片放映状态失败: {e}")
        return False

    def next_slide(self):
        try:
            if not self.initialized:
                if not self.initialize():
                    return False, "PowerPoint 未运行"
            
            if not self.is_slide_show_running():
                return False, "幻灯片放映未启动"
            
            self.slide_show.View.Next()
            return True, "已切换到下一页"
        except Exception as e:
            return False, f"下一页操作失败: {str(e)}"

    def prev_slide(self):
        try:
            if not self.initialized:
                if not self.initialize():
                    return False, "PowerPoint 未运行"
            
            if not self.is_slide_show_running():
                return False, "幻灯片放映未启动"
            
            self.slide_show.View.Previous()
            return True, "已切换到上一页"
        except Exception as e:
            return False, f"上一页操作失败: {str(e)}"

    def get_current_slide(self):
        try:
            if self.is_slide_show_running():
                return self.slide_show.View.Slide.SlideIndex
        except Exception as e:
            print(f"获取当前幻灯片失败: {e}")
        return None

ppt_controller = PowerPointController()

@app.get("/")
async def root():
    return {
        "message": "手势 PPT 控制系统后端",
        "version": "1.0.0",
        "endpoints": {
            "websocket": "/ws",
            "health": "/health",
            "next": "/ppt/next",
            "prev": "/ppt/prev"
        }
    }

@app.get("/health")
async def health_check():
    ppt_running = ppt_controller.initialize()
    slide_show_running = ppt_controller.is_slide_show_running() if ppt_running else False
    current_slide = ppt_controller.get_current_slide() if slide_show_running else None
    
    return {
        "status": "healthy",
        "powerpoint_running": ppt_running,
        "slide_show_running": slide_show_running,
        "current_slide": current_slide
    }

@app.post("/ppt/next")
async def next_slide():
    success, message = ppt_controller.next_slide()
    return {"success": success, "message": message}

@app.post("/ppt/prev")
async def prev_slide():
    success, message = ppt_controller.prev_slide()
    return {"success": success, "message": message}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("新的 WebSocket 连接已建立")
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            gesture = message.get("gesture")
            command = message.get("command")
            
            print(f"收到指令: {command} (手势: {gesture})")
            
            response_message = "命令已接收"
            success = True
            
            if command == "next":
                success, response_message = ppt_controller.next_slide()
            elif command == "prev":
                success, response_message = ppt_controller.prev_slide()
            
            current_slide = ppt_controller.get_current_slide()
            
            response = {
                "success": success,
                "message": response_message,
                "gesture": gesture,
                "command": command,
                "current_slide": current_slide
            }
            
            await websocket.send_text(json.dumps(response))
            
    except WebSocketDisconnect:
        print("WebSocket 连接已断开")
    except Exception as e:
        print(f"WebSocket 错误: {e}")
        try:
            await websocket.close()
        except:
            pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
