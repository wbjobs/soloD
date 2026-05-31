const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const GCCController = require('./controllers/GCCController');
const BandwidthTracker = require('./utils/BandwidthTracker');
const ModelVersionController = require('./controllers/ModelVersionController');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/models', express.static(path.join(__dirname, '../models')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const sessions = new Map();
const bandwidthTracker = new BandwidthTracker();
const gccController = new GCCController();

io.on('connection', (socket) => {
  console.log('客户端连接:', socket.id);

  socket.on('join-room', (data) => {
    const { roomId, userId } = data;
    socket.join(roomId);
    
    if (!sessions.has(roomId)) {
      sessions.set(roomId, {
        users: new Map(),
        bandwidthHistory: []
      });
    }
    
    const session = sessions.get(roomId);
    session.users.set(userId, {
      id: userId,
      socketId: socket.id,
      joinedAt: Date.now(),
      stats: []
    });

    socket.to(roomId).emit('user-joined', { userId });
    const users = Array.from(session.users.keys()).filter(id => id !== userId);
    socket.emit('room-users', { users });
    
    console.log(`用户 ${userId} 加入房间 ${roomId}`);
  });

  socket.on('offer', (data) => {
    const { targetId, offer, roomId } = data;
    const session = sessions.get(roomId);
    if (session && session.users.has(targetId)) {
      const target = session.users.get(targetId);
      io.to(target.socketId).emit('offer', {
        from: data.userId,
        offer
      });
    }
  });

  socket.on('answer', (data) => {
    const { targetId, answer, roomId } = data;
    const session = sessions.get(roomId);
    if (session && session.users.has(targetId)) {
      const target = session.users.get(targetId);
      io.to(target.socketId).emit('answer', {
        from: data.userId,
        answer
      });
    }
  });

  socket.on('ice-candidate', (data) => {
    const { targetId, candidate, roomId } = data;
    const session = sessions.get(roomId);
    if (session && session.users.has(targetId)) {
      const target = session.users.get(targetId);
      io.to(target.socketId).emit('ice-candidate', {
        from: data.userId,
        candidate
      });
    }
  });

  socket.on('stats-report', (data) => {
    const { roomId, userId, stats } = data;
    
    if (!stats || typeof stats !== 'object') {
      console.warn(`[Stats Report] 收到无效的统计数据格式, 用户: ${userId}, 房间: ${roomId}`);
      return;
    }

    const sanitizedStats = {
      ...stats,
      userId,
      packetLoss: isNaN(stats.packetLoss) ? 0 : stats.packetLoss,
      rtt: isNaN(stats.rtt) ? 0 : stats.rtt,
      currentBitrate: isNaN(stats.currentBitrate) ? 1000000 : stats.currentBitrate,
      availableBandwidth: isNaN(stats.availableBandwidth) ? undefined : stats.availableBandwidth
    };

    const session = sessions.get(roomId);
    if (session) {
      const user = session.users.get(userId);
      if (user) {
        user.stats.push({
          timestamp: Date.now(),
          ...sanitizedStats
        });
        if (user.stats.length > 100) {
          user.stats.shift();
        }
      }
      bandwidthTracker.addStats(roomId, userId, sanitizedStats);
      const recommendation = gccController.calculateBitrateRecommendation(sanitizedStats);
      socket.emit('bitrate-recommendation', recommendation);
    }
  });

  socket.on('leave-room', (data) => {
    const { roomId, userId } = data;
    const session = sessions.get(roomId);
    if (session) {
      session.users.delete(userId);
      socket.to(roomId).emit('user-left', { userId });
      
      if (session.users.size === 0) {
        sessions.delete(roomId);
      }
    }
    socket.leave(roomId);
    console.log(`用户 ${userId} 离开房间 ${roomId}`);
  });

  socket.on('disconnect', () => {
    console.log('客户端断开连接:', socket.id);
    sessions.forEach((session, roomId) => {
      session.users.forEach((user, userId) => {
        if (user.socketId === socket.id) {
          session.users.delete(userId);
          socket.to(roomId).emit('user-left', { userId });
        }
      });
      if (session.users.size === 0) {
        sessions.delete(roomId);
      }
    });
  });
});

app.get('/api/bandwidth-history/:roomId', (req, res) => {
  const { roomId } = req.params;
  const history = bandwidthTracker.getSessionHistory(roomId);
  res.json({ history });
});

app.get('/api/model/config', (req, res) => {
  const { userId } = req.query;
  if (userId) {
    const modelConfig = ModelVersionController.getModelConfigForUser(userId);
    res.json(modelConfig);
  } else {
    const defaultModel = ModelVersionController.getDefaultModel();
    res.json(defaultModel);
  }
});

app.get('/api/model/all', (req, res) => {
  const models = ModelVersionController.getAllModels();
  res.json({ models });
});

app.get('/api/model/active', (req, res) => {
  const models = ModelVersionController.getActiveModels();
  res.json({ models });
});

app.post('/api/model/default', (req, res) => {
  const { modelId } = req.body;
  const success = ModelVersionController.setDefaultModel(modelId);
  res.json({ success, modelId });
});

app.post('/api/model/register', (req, res) => {
  const modelConfig = req.body;
  ModelVersionController.registerModel(modelConfig);
  res.json({ success: true, modelId: modelConfig.id });
});

app.put('/api/model/:modelId/status', (req, res) => {
  const { modelId } = req.params;
  const { status } = req.body;
  const success = ModelVersionController.updateModelStatus(modelId, status);
  res.json({ success, modelId, status });
});

app.post('/api/experiment/create', (req, res) => {
  const experimentConfig = req.body;
  const experiment = ModelVersionController.createExperiment(experimentConfig);
  res.json({ success: true, experiment });
});

app.post('/api/experiment/:experimentId/start', (req, res) => {
  const { experimentId } = req.params;
  const success = ModelVersionController.startExperiment(experimentId);
  res.json({ success, experimentId });
});

app.post('/api/experiment/:experimentId/stop', (req, res) => {
  const { experimentId } = req.params;
  const success = ModelVersionController.stopExperiment(experimentId);
  res.json({ success, experimentId });
});

app.get('/api/experiment/all', (req, res) => {
  const experiments = ModelVersionController.getAllExperiments();
  res.json({ experiments });
});

app.get('/api/experiment/:experimentId/results', (req, res) => {
  const { experimentId } = req.params;
  const results = ModelVersionController.getExperimentResults(experimentId);
  res.json(results || { error: 'Experiment not found' });
});

app.get('/api/experiment/stats', (req, res) => {
  const stats = ModelVersionController.getActiveExperimentStats();
  res.json({ stats });
});

app.get('/api/user/:userId/model-assignment', (req, res) => {
  const { userId } = req.params;
  const assignment = ModelVersionController.getUserAssignment(userId);
  res.json({ assignment });
});

app.get('/api/gcc/ml-weight', (req, res) => {
  const weight = gccController.getMLWeight();
  res.json({ mlWeight: weight, realtimeWeight: 1 - weight });
});

app.post('/api/gcc/ml-weight', (req, res) => {
  const { weight } = req.body;
  gccController.setMLWeight(weight);
  res.json({ success: true, mlWeight: gccController.getMLWeight() });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
});
