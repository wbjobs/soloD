const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const Document = require('./ot/document');
const Operation = require('./ot/operation');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const documents = new Map();

function getOrCreateDocument(docId) {
  if (!documents.has(docId)) {
    const initialContent = `# 欢迎使用协作 Markdown 编辑器

这是一个支持多人实时协作的 Markdown 编辑器。

## ✨ 功能特性

### 实时协作
- 🔴 **实时光标显示**: 看到其他协作者的光标位置和用户名
- 🟩 **选区高亮显示**: 看到其他用户选择的文本范围
- 🎨 **彩色标识**: 每位用户有独特的颜色，方便识别

### 编辑功能
- 📝 完整的 Markdown 编辑支持
- ⚡ OT 算法解决并发冲突
- 🔄 自动版本管理

## 💡 使用提示

1. 打开多个浏览器窗口/标签页
2. 加入同一文档
3. 以不同用户名登录
4. 开始编辑，体验实时协作！

---

*光标位置和选区会实时同步给所有协作者*`;
    documents.set(docId, new Document(docId, initialContent));
  }
  return documents.get(docId);
}

app.get('/api/documents', (req, res) => {
  const docList = Array.from(documents.values()).map(doc => ({
    id: doc.id,
    userCount: doc.users.size
  }));
  res.json(docList);
});

app.post('/api/documents', (req, res) => {
  const docId = uuidv4();
  const doc = getOrCreateDocument(docId);
  res.json(doc.getState());
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  let currentDoc = null;

  socket.on('join-document', async ({ docId, userName }) => {
    const userId = socket.id;

    if (currentDoc && currentDoc.id !== docId) {
      socket.leave(`doc:${currentDoc.id}`);
      currentDoc.removeUser(userId);
      io.to(`doc:${currentDoc.id}`).emit('user-left', {
        userId,
        users: currentDoc.getUsers()
      });
    }

    currentDoc = getOrCreateDocument(docId);
    
    socket.join(`doc:${docId}`);
    const users = currentDoc.addUser(userId, userName);

    const fullState = {
      ...currentDoc.getState(),
      userId
    };
    socket.emit('document-state', fullState);
    
    socket.to(`doc:${docId}`).emit('user-joined', {
      userId,
      userName,
      users
    });

    console.log(`User ${userName} (${userId}) joined document ${docId}`);
  });

  socket.on('operation', ({ operation, version }) => {
    if (!currentDoc) return;
    const userId = socket.id;

    const op = new Operation(
      operation.retain,
      operation.insert,
      operation.delete,
      userId
    );

    const result = currentDoc.applyOperation(op, version);

    io.to(`doc:${currentDoc.id}`).emit('operation', {
      operation: {
        retain: result.operation.retain,
        insert: result.operation.insert,
        delete: result.operation.delete
      },
      version: result.version,
      userId
    });

    socket.emit('ack', { version: result.version });
  });

  socket.on('selection-update', ({ selection }) => {
    if (!currentDoc) return;
    const userId = socket.id;
    
    currentDoc.updateSelection(userId, selection);
    socket.to(`doc:${currentDoc.id}`).emit('selection-update', {
      userId,
      selection,
      users: currentDoc.getUsers()
    });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (currentDoc) {
      const userId = socket.id;
      const users = currentDoc.removeUser(userId);
      io.to(`doc:${currentDoc.id}`).emit('user-left', {
        userId,
        users
      });
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server ready`);
});
