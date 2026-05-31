const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 1e7,
});

const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`用户连接: ${socket.id}`);

  socket.on('join-room', (roomId) => {
    socket.leaveAll();
    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    rooms.get(roomId).add(socket.id);

    console.log(`用户 ${socket.id} 加入房间 ${roomId}`);
    console.log(`房间 ${roomId} 当前人数: ${rooms.get(roomId).size}`);

    socket.to(roomId).emit('user-connected', { userId: socket.id });
  });

  socket.on('video-frame', ({ roomId, frameData }) => {
    if (!rooms.has(roomId)) return;

    socket.to(roomId).emit('video-frame', {
      userId: socket.id,
      frameData,
      timestamp: Date.now(),
    });
  });

  socket.on('disconnecting', () => {
    const socketRooms = Array.from(socket.rooms);
    socketRooms.forEach((roomId) => {
      if (roomId !== socket.id && rooms.has(roomId)) {
        const roomUsers = rooms.get(roomId);
        roomUsers.delete(socket.id);

        if (roomUsers.size === 0) {
          rooms.delete(roomId);
          console.log(`房间 ${roomId} 已空，已删除`);
        } else {
          socket.to(roomId).emit('user-disconnected', { userId: socket.id });
          console.log(`房间 ${roomId} 当前人数: ${roomUsers.size}`);
        }
      }
    });
  });

  socket.on('disconnect', () => {
    console.log(`用户断开连接: ${socket.id}`);
  });
});

app.get('/', (req, res) => {
  res.json({
    status: 'running',
    rooms: Array.from(rooms.keys()).map(roomId => ({
      id: roomId,
      users: rooms.get(roomId).size,
    })),
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 视频会议服务器运行在端口 ${PORT}`);
  console.log(`📍 服务器地址: http://localhost:${PORT}`);
});
