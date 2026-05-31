# 协作 Markdown 编辑器

基于 OT (Operational Transformation) 算法的实时多人协作 Markdown 编辑器。

## ✨ 功能特性

### 核心功能
- ✅ **实时协作编辑**: 多人同时编辑同一文档
- ✅ **OT 冲突解决**: 使用 Operational Transformation 算法处理并发操作
- ✅ **光标实时显示**: 查看其他协作者的光标位置
- ✅ **选区高亮显示**: 显示其他用户的文本选择范围
- ✅ **用户颜色区分**: 每位用户有独特的颜色标识
- ✅ **用户名标签**: 光标上方显示用户名，方便识别

### 技术特性
- 实时操作同步，延迟极低
- 8种预设用户颜色，基于用户ID哈希分配
- 选区使用半透明背景高亮（带颜色标识）
- 光标带有用户名标签
- 支持断线重连

## 架构

### 后端 (Node.js + Express + Socket.io)
- **OT 算法**: 实现操作转换，解决并发编辑冲突
- **文档管理**: 每个文档有独立的状态和历史记录
- **选区同步**: 实时广播用户的光标位置和选区范围
- **实时通信**: 使用 Socket.io 处理 WebSocket 连接

### 前端 (Vue 3 + Pinia + CodeMirror 6)
- **状态管理**: Pinia 管理文档状态和连接状态
- **编辑器**: CodeMirror 6 提供 Markdown 编辑支持
- **装饰器系统**: 使用 CodeMirror WidgetType 和 Decoration 实现远程光标和选区
- **实时同步**: WebSocket 发送和接收操作

## 修复内容

### 1. Join-Document 逻辑修复
- 修复了新用户加入时获取正确的 userId 问题
- 后端现在在 `document-state` 事件中包含 userId
- 添加了断开重连时自动重新加入文档的逻辑
- 修复了用户离开和加入时的状态同步

### 2. OT 算法核心修复
- 添加了 `isInsert()`, `isDelete()`, `isNoop()` 辅助方法
- 修复了 `transformInsertInsert`: 当两个操作在相同位置插入时，通过 userId 决定优先级
- 修复了 `transformInsertDelete`: 正确处理插入在删除范围内的情况
- 修复了 `transformDeleteInsert`: 正确处理删除与插入的重叠
- 修复了 `transformDeleteDelete`: 正确计算删除重叠
- 添加了 `clone()` 方法用于复制操作
- 添加了 `toString()` 方法用于调试

### 3. 前端状态同步修复
- 添加了 `ignoreNextChange` 标志，防止远程更新触发本地操作发送
- 修复了操作接收逻辑，正确识别和跳过自己的操作
- 添加了 `nextTick` 确保状态同步正确
- 添加了重连机制，连接断开后自动重连
- 完善了日志输出，便于调试

## 启动项目

### 后端
```bash
cd backend
npm install
npm start
```

### 前端
```bash
cd frontend
npm install
npm run dev
```

## OT 算法原理

OT (Operational Transformation) 算法通过以下步骤解决并发编辑冲突：

1. **操作表示**: 每个编辑操作表示为 `(retain, insert, delete)`
   - `retain`: 跳过的字符数
   - `insert`: 插入的文本
   - `delete`: 删除的字符数

2. **转换函数 `transform(op1, op2)`**:
   - 给定两个基于相同文档版本的操作
   - 返回 `(op1', op2')`，使得 `op2'` 在 `op1` 应用后应用，或 `op1'` 在 `op2` 应用后应用
   - 最终文档状态一致

3. **场景处理**:
   - 插入 vs 插入: 根据位置和 userId 确定顺序
   - 插入 vs 删除: 插入在删除前/后/中，分别处理
   - 删除 vs 删除: 计算重叠部分并正确处理

## 项目结构

```
├── backend/
│   ├── src/
│   │   ├── server.js          # Socket.io 服务器
│   │   └── ot/
│   │       ├── operation.js   # Operation 类和 OT 算法
│   │       └── document.js    # 文档状态管理
│   └── package.json
└── frontend/
    ├── src/
    │   ├── main.js            # 入口文件
    │   ├── App.vue            # 主组件
    │   ├── components/
    │   │   ├── Editor.vue     # 编辑器组件
    │   │   └── LoginModal.vue # 登录弹窗
    │   └── stores/
    │       └── document.js    # Pinia store + 前端 OT 逻辑
    ├── index.html
    └── package.json
```
