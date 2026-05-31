# WebRTC 屏幕共享与标注系统

这是一个基于WebRTC技术的浏览器间P2P屏幕共享应用，支持实时画笔标注功能。

## 功能特性

- 🔄 **屏幕共享**: 使用WebRTC技术实现浏览器间P2P屏幕共享
- ✏️ **画笔标注**: 在视频流上层的HTML5 Canvas上进行自由绘制
- 🔄 **实时同步**: 标注坐标通过WebRTC数据通道双向同步
- 🎨 **自定义画笔**: 支持颜色选择和线宽调节
- 📱 **响应式设计**: 支持移动端触摸操作

## 技术架构

- **前端**: 原生HTML5 + CSS3 + JavaScript (ES6+)
- **WebRTC**: RTCPeerConnection + RTCDataChannel
- **信令**: 手动SDP交换方式（可扩展为WebSocket信令服务器）
- **绘制**: HTML5 Canvas 2D API

## 文件结构

```
d46/
├── index.html      # 主页面
├── style.css       # 样式文件
├── app.js          # 核心逻辑
└── README.md       # 说明文档
```

## 使用说明

### 前置要求

1. 由于WebRTC安全限制，建议使用HTTPS协议访问
2. 现代浏览器支持（Chrome 72+, Firefox 66+, Edge 79+, Safari 13+）
3. 两个浏览器标签页或两台设备进行测试

### 快速启动

#### 方法1: 使用本地HTTP服务器（推荐）

```bash
# 使用Python 3
python -m http.server 8080

# 或使用Node.js http-server
npx http-server -p 8080

# 或使用PHP
php -S localhost:8080
```

然后访问: `http://localhost:8080`

#### 方法2: 直接打开文件

直接双击 `index.html` 文件，在浏览器中打开（部分功能可能受限）

### 连接步骤

**发送端（共享屏幕方）:**
1. 点击"开始屏幕共享"按钮，选择要共享的屏幕/窗口
2. 点击"创建 Offer"按钮，等待生成SDP
3. 复制生成的Offer SDP，发送给接收端

**接收端（观看方）:**
1. 将发送端的Offer SDP粘贴到"粘贴远程 Offer SDP"输入框
2. 点击"创建 Answer"按钮，等待生成Answer SDP
3. 复制生成的Answer SDP，发送回发送端

**发送端（完成连接）:**
1. 将接收端的Answer SDP粘贴到"粘贴 Answer SDP"输入框
2. 点击"设置 Answer"按钮
3. 连接建立成功后，可以在两个画布上绘制标注

### 标注功能

- 在任意画布上按住鼠标拖动即可绘制
- 使用颜色选择器更改画笔颜色
- 使用滑块调节线宽（1-20像素）
- 点击"清除画布"按钮清除所有绘制内容
- 标注会实时同步到对端

## 核心模块说明

### 1. 屏幕共享模块 (app.js:144-186)

```javascript
// 使用getDisplayMedia API获取屏幕流
localStream = await navigator.mediaDevices.getDisplayMedia({
    video: { cursor: 'always' },
    audio: false
});
```

### 2. WebRTC连接模块 (app.js:188-324)

- `createPeerConnection()`: 创建RTCPeerConnection实例
- `createOffer()`: 创建并生成SDP Offer
- `createAnswer()`: 接收Offer并生成Answer
- `setAnswer()`: 设置远程Answer完成连接

### 3. 数据通道模块 (app.js:216-234)

- 通过RTCDataChannel传输绘制数据
- 支持两种消息类型：`draw` 和 `clear`

### 4. Canvas绘制模块 (app.js:43-142)

- 支持鼠标和触摸事件
- 坐标缩放适配不同视频尺寸
- 双向同步绘制操作

## 注意事项

1. **HTTPS要求**: 生产环境必须使用HTTPS，否则屏幕共享可能不可用
2. **防火墙/网络**: P2P连接可能受防火墙或NAT限制，建议部署TURN服务器
3. **性能**: 高分辨率屏幕共享可能占用较多带宽，建议根据网络状况调整
4. **信令方式**: 当前使用手动SDP复制，生产环境应使用WebSocket信令服务器

## 扩展建议

1. 添加信令服务器（Node.js + WebSocket）自动化SDP交换
2. 部署TURN服务器提高连接成功率
3. 添加用户房间管理
4. 支持音频通话
5. 添加标注历史记录和撤销功能
6. 支持更多绘制工具（矩形、圆形、箭头等）
7. 添加屏幕录制功能
8. 实现文件传输功能

## 浏览器兼容性

| 浏览器 | 最低版本 |
|--------|----------|
| Chrome | 72+      |
| Firefox | 66+     |
| Edge | 79+       |
| Safari | 13+      |

## 许可证

MIT License
