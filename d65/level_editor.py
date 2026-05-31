import tkinter as tk
from tkinter import ttk, messagebox
import json
import socket
import threading

class LevelEditor:
    def __init__(self, root):
        self.root = root
        self.root.title("关卡编辑器 - 2D 平台跳跃游戏")
        self.root.geometry("1000x700")
        
        self.elements = []
        self.selected_type = "platform"
        self.selected_element = None
        self.dragging = False
        self.drag_start = (0, 0)
        
        self.socket = None
        self.connected = False
        self.running = True
        
        self.create_widgets()
        self.start_connection_thread()
        
    def create_widgets(self):
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)
        main_frame.columnconfigure(1, weight=1)
        main_frame.rowconfigure(0, weight=1)
        
        control_panel = ttk.Frame(main_frame, padding="5")
        control_panel.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        ttk.Label(control_panel, text="元素类型:", font=("Arial", 10, "bold")).grid(row=0, column=0, pady=5, sticky=tk.W)
        
        self.type_var = tk.StringVar(value="platform")
        
        ttk.Radiobutton(control_panel, text="平台 (绿色)", variable=self.type_var, 
                       value="platform", command=self.update_selected_type).grid(row=1, column=0, sticky=tk.W, pady=2)
        ttk.Radiobutton(control_panel, text="敌人 (红色)", variable=self.type_var, 
                       value="enemy", command=self.update_selected_type).grid(row=2, column=0, sticky=tk.W, pady=2)
        ttk.Radiobutton(control_panel, text="金币 (黄色)", variable=self.type_var, 
                       value="coin", command=self.update_selected_type).grid(row=3, column=0, sticky=tk.W, pady=2)
        
        ttk.Separator(control_panel, orient='horizontal').grid(row=4, column=0, sticky=(tk.W, tk.E), pady=15)
        
        ttk.Label(control_panel, text="操作:", font=("Arial", 10, "bold")).grid(row=5, column=0, pady=5, sticky=tk.W)
        
        ttk.Button(control_panel, text="删除选中", command=self.delete_selected).grid(row=6, column=0, sticky=(tk.W, tk.E), pady=2)
        ttk.Button(control_panel, text="清空画布", command=self.clear_canvas).grid(row=7, column=0, sticky=(tk.W, tk.E), pady=2)
        
        ttk.Separator(control_panel, orient='horizontal').grid(row=8, column=0, sticky=(tk.W, tk.E), pady=15)
        
        ttk.Button(control_panel, text="发送到游戏", command=self.send_to_game, 
                  style='Accent.TButton').grid(row=9, column=0, sticky=(tk.W, tk.E), pady=10)
        
        self.status_label = ttk.Label(control_panel, text="状态: 等待连接...", foreground="orange")
        self.status_label.grid(row=10, column=0, pady=5, sticky=tk.W)
        
        ttk.Separator(control_panel, orient='horizontal').grid(row=11, column=0, sticky=(tk.W, tk.E), pady=15)
        
        ttk.Label(control_panel, text="元素列表:", font=("Arial", 10, "bold")).grid(row=12, column=0, pady=5, sticky=tk.W)
        
        self.element_listbox = tk.Listbox(control_panel, height=10, width=25)
        self.element_listbox.grid(row=13, column=0, sticky=(tk.W, tk.E))
        self.element_listbox.bind('<<ListboxSelect>>', self.on_listbox_select)
        
        canvas_frame = ttk.Frame(main_frame)
        canvas_frame.grid(row=0, column=1, sticky=(tk.W, tk.E, tk.N, tk.S), padx=(10, 0))
        
        self.canvas = tk.Canvas(canvas_frame, bg="#1a1a2e", width=1280, height=720,
                               highlightthickness=2, highlightbackground="#4a4a6a")
        self.canvas.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        canvas_frame.columnconfigure(0, weight=1)
        canvas_frame.rowconfigure(0, weight=1)
        
        self.canvas.bind("<Button-1>", self.on_canvas_click)
        self.canvas.bind("<B1-Motion>", self.on_canvas_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_canvas_release)
        
        self.colors = {
            "platform": "#33cc66",
            "enemy": "#cc3333",
            "coin": "#ffcc00"
        }
        
    def update_selected_type(self):
        self.selected_type = self.type_var.get()
        
    def start_connection_thread(self):
        self.connection_thread = threading.Thread(target=self.try_connect, daemon=True)
        self.connection_thread.start()
        
    def try_connect(self):
        while self.running:
            if not self.connected:
                try:
                    self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    self.socket.settimeout(2.0)
                    self.socket.connect(('localhost', 8888))
                    self.connected = True
                    self.root.after(0, lambda: self.status_label.config(text="状态: 已连接", foreground="green"))
                    print("已连接到游戏")
                    self.start_listen_thread()
                    break
                except:
                    self.root.after(0, lambda: self.status_label.config(text="状态: 等待连接...", foreground="orange"))
                    threading.Event().wait(1.0)
            else:
                break
                
    def start_listen_thread(self):
        self.listen_thread = threading.Thread(target=self.listen_messages, daemon=True)
        self.listen_thread.start()
        
    def listen_messages(self):
        buffer = ""
        while self.running and self.connected:
            try:
                self.socket.settimeout(0.5)
                data = self.socket.recv(4096)
                if not data:
                    self.connected = False
                    break
                buffer += data.decode('utf-8')
                while len(buffer) > 0:
                    try:
                        msg = json.loads(buffer)
                        print("收到消息:", msg)
                        self.root.after(0, lambda m=msg: self.handle_message(m))
                        buffer = ""
                    except json.JSONDecodeError:
                        break
            except socket.timeout:
                continue
            except Exception as e:
                print("监听错误:", e)
                self.connected = False
                break
        if self.running:
            self.root.after(0, lambda: self.status_label.config(text="状态: 连接断开", foreground="red"))
            
    def handle_message(self, msg):
        if msg.get("event") == "coin_collected":
            coin_id = msg.get("id")
            print(f"金币被收集: {coin_id}")
            coin_index = int(coin_id.split("_")[1]) - 1
            coin_count = 0
            for i, elem in enumerate(self.elements):
                if elem['type'] == 'coin':
                    if coin_count == coin_index:
                        self.canvas.itemconfig(elem['id'], fill="#888888", outline="#666666")
                        print(f"已将第 {coin_count + 1} 个金币变灰")
                        break
                    coin_count += 1
                    
    def on_canvas_click(self, event):
        items = self.canvas.find_overlapping(event.x, event.y, event.x, event.y)
        if items:
            self.selected_element = items[-1]
            self.dragging = True
            self.drag_start = (event.x, event.y)
            for i, elem in enumerate(self.elements):
                if elem['id'] == self.selected_element:
                    self.element_listbox.selection_clear(0, tk.END)
                    self.element_listbox.selection_set(i)
                    break
        else:
            x, y = event.x, event.y
            width, height = 100, 50
            if self.selected_type == "coin":
                width, height = 40, 40
            
            color = self.colors[self.selected_type]
            rect_id = self.canvas.create_rectangle(x, y, x + width, y + height, 
                                                   fill=color, outline="white", width=2)
            
            self.elements.append({
                'id': rect_id,
                'type': self.selected_type,
                'x': x,
                'y': y,
                'width': width,
                'height': height
            })
            
            self.update_element_list()
            self.selected_element = rect_id
            
    def on_canvas_drag(self, event):
        if self.dragging and self.selected_element:
            dx = event.x - self.drag_start[0]
            dy = event.y - self.drag_start[1]
            
            self.canvas.move(self.selected_element, dx, dy)
            self.drag_start = (event.x, event.y)
            
            for elem in self.elements:
                if elem['id'] == self.selected_element:
                    elem['x'] += dx
                    elem['y'] += dy
                    break
            
    def on_canvas_release(self, event):
        self.dragging = False
        
    def delete_selected(self):
        if self.selected_element:
            self.canvas.delete(self.selected_element)
            self.elements = [e for e in self.elements if e['id'] != self.selected_element]
            self.selected_element = None
            self.update_element_list()
            
    def clear_canvas(self):
        for elem in self.elements:
            self.canvas.delete(elem['id'])
        self.elements.clear()
        self.selected_element = None
        self.update_element_list()
        
    def update_element_list(self):
        self.element_listbox.delete(0, tk.END)
        for i, elem in enumerate(self.elements):
            type_names = {"platform": "平台", "enemy": "敌人", "coin": "金币"}
            self.element_listbox.insert(tk.END, f"{type_names[elem['type']]} ({elem['x']}, {elem['y']})")
            
    def on_listbox_select(self, event):
        selection = self.element_listbox.curselection()
        if selection:
            index = selection[0]
            if index < len(self.elements):
                self.selected_element = self.elements[index]['id']
                
    def send_to_game(self):
        level_data = []
        for elem in self.elements:
            level_data.append({
                'type': elem['type'],
                'x': elem['x'],
                'y': elem['y'],
                'width': elem['width'],
                'height': elem['height']
            })
        
        json_data = json.dumps(level_data)
        print("发送的 JSON:", json_data)
        
        if not self.connected or not self.socket:
            messagebox.showwarning("警告", "游戏未连接，请先启动 Godot 游戏！")
            return
        
        try:
            self.socket.sendall(json_data.encode('utf-8'))
            messagebox.showinfo("成功", f"已发送 {len(level_data)} 个元素到游戏！")
        except Exception as e:
            self.connected = False
            self.status_label.config(text="状态: 连接断开", foreground="red")
            messagebox.showerror("错误", f"发送失败: {str(e)}")
            
    def on_closing(self):
        self.running = False
        if self.socket:
            self.socket.close()
        self.root.destroy()

if __name__ == "__main__":
    root = tk.Tk()
    app = LevelEditor(root)
    root.protocol("WM_DELETE_WINDOW", app.on_closing)
    root.mainloop()
