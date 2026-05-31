import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';
import { Room, Participant, NetworkStats, BitrateStrategy, BandwidthRecord } from './types';
import { GCCCongestionController, calculateBitrateStrategy } from './adaptiveBitrate';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const db = new Database('./sensor_data.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS sensor_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temperature REAL NOT NULL,
    humidity REAL NOT NULL,
    raw_data TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const rooms = new Map<string, Room>();
const gccControllers = new Map<string, GCCCongestionController>();

function getOrCreateRoom(roomId: string): Room {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      participants: new Map(),
      bandwidthHistory: [],
      createdAt: Date.now(),
    });
  }
  return rooms.get(roomId)!;
}

function createParticipant(socketId: string, roomId: string, name: string): Participant {
  const initialStrategy: BitrateStrategy = {
    targetBitrate: 1000000,
    maxBitrate: 1500000,
    minBitrate: 500000,
    resolution: { width: 640, height: 480 },
    frameRate: 24,
    qualityLevel: 'medium',
  };

  return {
    id: uuidv4(),
    socketId,
    roomId,
    name,
    networkStatsHistory: [],
    currentStrategy: initialStrategy,
  };
}

io.on('connection', (socket: Socket) => {
  console.log('Client connected:', socket.id);

  socket.on('serial-data', async (data: { rawData: string }) => {
    try {
      const { rawData } = data;
      console.log('Received serial data via WebSocket:', rawData);

      const tempMatch = rawData.match(/TEMP:([\d.]+)/);
      const humiMatch = rawData.match(/HUMI:([\d.]+)/);

      if (tempMatch && humiMatch) {
        const temperature = parseFloat(tempMatch[1]);
        const humidity = parseFloat(humiMatch[1]);

        const stmt = db.prepare('INSERT INTO sensor_data (temperature, humidity, raw_data) VALUES (?, ?, ?)');
        const result = stmt.run(temperature, humidity, rawData);

        socket.emit('serial-data-saved', {
          id: result.lastInsertRowid,
          temperature,
          humidity,
          rawData,
          timestamp: new Date().toISOString(),
        });

        io.emit('serial-data-broadcast', {
          id: result.lastInsertRowid,
          temperature,
          humidity,
          rawData,
          timestamp: new Date().toISOString(),
        });
      } else {
        socket.emit('serial-data-error', { error: 'Invalid data format' });
      }
    } catch (error) {
      console.error('Error saving serial data:', error);
      socket.emit('serial-data-error', { error: 'Internal server error' });
    }
  });

  socket.on('join-room', async ({ roomId, name }) => {
    const room = getOrCreateRoom(roomId);
    const participant = createParticipant(socket.id, roomId, name);
    
    gccControllers.set(participant.id, new GCCCongestionController(1000000));
    room.participants.set(participant.id, participant);
    
    socket.join(roomId);

    const existingParticipants = Array.from(room.participants.values())
      .filter(p => p.id !== participant.id)
      .map(p => ({ id: p.id, name: p.name }));

    socket.emit('room-joined', {
      participantId: participant.id,
      participants: existingParticipants,
    });

    socket.to(roomId).emit('participant-joined', {
      id: participant.id,
      name: participant.name,
    });

    console.log(`Participant ${name} joined room ${roomId}`);
  });

  socket.on('offer', ({ targetParticipantId, offer, fromParticipantId }) => {
    const targetSocket = Array.from(io.sockets.sockets.values()).find(
      s => Array.from(rooms.values()).some(r => 
        r.participants.has(targetParticipantId) && 
        r.participants.get(targetParticipantId)?.socketId === s.id
      )
    );
    
    if (targetSocket) {
      targetSocket.emit('offer', { offer, fromParticipantId });
    }
  });

  socket.on('answer', ({ targetParticipantId, answer, fromParticipantId }) => {
    const targetSocket = Array.from(io.sockets.sockets.values()).find(
      s => Array.from(rooms.values()).some(r => 
        r.participants.has(targetParticipantId) && 
        r.participants.get(targetParticipantId)?.socketId === s.id
      )
    );
    
    if (targetSocket) {
      targetSocket.emit('answer', { answer, fromParticipantId });
    }
  });

  socket.on('ice-candidate', ({ targetParticipantId, candidate, fromParticipantId }) => {
    const targetSocket = Array.from(io.sockets.sockets.values()).find(
      s => Array.from(rooms.values()).some(r => 
        r.participants.has(targetParticipantId) && 
        r.participants.get(targetParticipantId)?.socketId === s.id
      )
    );
    
    if (targetSocket) {
      targetSocket.emit('ice-candidate', { candidate, fromParticipantId });
    }
  });

  socket.on('network-stats', ({ participantId, roomId, stats }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const participant = room.participants.get(participantId);
    if (!participant) return;

    const networkStats: NetworkStats = {
      ...stats,
      timestamp: Date.now(),
    };

    participant.networkStatsHistory.push(networkStats);
    if (participant.networkStatsHistory.length > 100) {
      participant.networkStatsHistory.shift();
    }

    const gcc = gccControllers.get(participantId);
    if (gcc) {
      const gccEstimation = gcc.estimate(networkStats);
      const strategy = calculateBitrateStrategy(networkStats, gccEstimation);
      participant.currentStrategy = strategy;

      const record: BandwidthRecord = {
        timestamp: Date.now(),
        participantId,
        availableBandwidth: stats.availableBandwidth,
        packetLossRate: stats.packetLossRate,
        rtt: stats.rtt,
        recommendedBitrate: strategy.targetBitrate,
        qualityLevel: strategy.qualityLevel,
      };
      
      room.bandwidthHistory.push(record);
      if (room.bandwidthHistory.length > 1000) {
        room.bandwidthHistory.shift();
      }

      socket.emit('bitrate-strategy', { strategy, gccState: gccEstimation.state });
    }
  });

  socket.on('switch-quality-layer', ({ participantId, roomId, targetLayer }) => {
    socket.to(roomId).emit('quality-layer-switched', { participantId, targetLayer });
  });

  socket.on('leave-room', ({ participantId, roomId }) => {
    const room = rooms.get(roomId);
    if (room) {
      room.participants.delete(participantId);
      gccControllers.delete(participantId);
      
      socket.to(roomId).emit('participant-left', { participantId });
      
      if (room.participants.size === 0) {
        rooms.delete(roomId);
      }
    }
    
    socket.leave(roomId);
    console.log(`Participant ${participantId} left room ${roomId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    for (const [roomId, room] of rooms.entries()) {
      for (const [participantId, participant] of room.participants.entries()) {
        if (participant.socketId === socket.id) {
          room.participants.delete(participantId);
          gccControllers.delete(participantId);
          
          socket.to(roomId).emit('participant-left', { participantId });
          
          if (room.participants.size === 0) {
            rooms.delete(roomId);
          }
          break;
        }
      }
    }
  });
});

app.post('/api/data', (req, res) => {
  try {
    const { rawData } = req.body;
    if (!rawData) {
      return res.status(400).json({ error: 'rawData is required' });
    }

    const tempMatch = rawData.match(/TEMP:([\d.]+)/);
    const humiMatch = rawData.match(/HUMI:([\d.]+)/);

    if (!tempMatch || !humiMatch) {
      return res.status(400).json({ error: 'Invalid data format. Expected TEMP:<value>,HUMI:<value>' });
    }

    const temperature = parseFloat(tempMatch[1]);
    const humidity = parseFloat(humiMatch[1]);

    const stmt = db.prepare('INSERT INTO sensor_data (temperature, humidity, raw_data) VALUES (?, ?, ?)');
    const result = stmt.run(temperature, humidity, rawData);

    res.json({
      id: result.lastInsertRowid,
      temperature,
      humidity,
      rawData,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error saving data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/data', (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const rows = db.prepare('SELECT * FROM sensor_data ORDER BY timestamp DESC LIMIT ?').all(limit);
    
    res.json({
      data: rows.map((row: any) => ({
        id: row.id,
        temperature: row.temperature,
        humidity: row.humidity,
        rawData: row.raw_data,
        timestamp: row.timestamp,
      })),
    });
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/room/:roomId/history', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  res.json({
    bandwidthHistory: room.bandwidthHistory,
    participants: Array.from(room.participants.values()).map(p => ({
      id: p.id,
      name: p.name,
      statsCount: p.networkStatsHistory.length,
      currentStrategy: p.currentStrategy,
    })),
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
