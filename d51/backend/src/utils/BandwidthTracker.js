const fs = require('fs');
const path = require('path');

class BandwidthTracker {
  constructor() {
    this.sessionData = new Map();
    this.logDir = path.join(__dirname, '../../logs');
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  addStats(roomId, userId, stats) {
    if (!this.sessionData.has(roomId)) {
      this.sessionData.set(roomId, {
        startTime: Date.now(),
        users: new Map()
      });
    }

    const session = this.sessionData.get(roomId);
    if (!session.users.has(userId)) {
      session.users.set(userId, {
        history: []
      });
    }

    const userData = session.users.get(userId);
    const dataPoint = {
      timestamp: Date.now(),
      ...stats
    };

    userData.history.push(dataPoint);

    if (userData.history.length > 1000) {
      userData.history.shift();
    }

    this.saveToFile(roomId, userId, dataPoint);
  }

  saveToFile(roomId, userId, dataPoint) {
    const roomDir = path.join(this.logDir, roomId);
    if (!fs.existsSync(roomDir)) {
      fs.mkdirSync(roomDir, { recursive: true });
    }

    const filename = path.join(roomDir, `${userId}.log`);
    const line = JSON.stringify(dataPoint) + '\n';
    
    fs.appendFile(filename, line, (err) => {
      if (err) {
        console.error('保存带宽日志失败:', err);
      }
    });
  }

  getSessionHistory(roomId) {
    const session = this.sessionData.get(roomId);
    if (!session) {
      return [];
    }

    const result = [];
    session.users.forEach((userData, userId) => {
      result.push({
        userId,
        history: userData.history
      });
    });

    return result;
  }

  getUserHistory(roomId, userId) {
    const session = this.sessionData.get(roomId);
    if (!session) {
      return [];
    }

    const userData = session.users.get(userId);
    return userData ? userData.history : [];
  }

  getAggregatedStats(roomId) {
    const session = this.sessionData.get(roomId);
    if (!session) {
      return null;
    }

    const allStats = [];
    session.users.forEach((userData) => {
      allStats.push(...userData.history);
    });

    if (allStats.length === 0) {
      return null;
    }

    const avgBitrate = allStats.reduce((sum, s) => sum + (s.currentBitrate || 0), 0) / allStats.length;
    const avgPacketLoss = allStats.reduce((sum, s) => sum + (s.packetLoss || 0), 0) / allStats.length;
    const avgRTT = allStats.reduce((sum, s) => sum + (s.rtt || 0), 0) / allStats.length;

    return {
      averageBitrate: Math.round(avgBitrate),
      averagePacketLoss: avgPacketLoss,
      averageRTT: Math.round(avgRTT),
      totalDataPoints: allStats.length,
      duration: Date.now() - session.startTime
    };
  }

  exportSessionData(roomId) {
    const session = this.sessionData.get(roomId);
    if (!session) {
      return null;
    }

    const exportData = {
      roomId,
      startTime: session.startTime,
      endTime: Date.now(),
      users: {}
    };

    session.users.forEach((userData, userId) => {
      exportData.users[userId] = {
        history: userData.history
      };
    });

    const filename = path.join(this.logDir, `${roomId}_export_${Date.now()}.json`);
    fs.writeFileSync(filename, JSON.stringify(exportData, null, 2));

    return filename;
  }
}

module.exports = BandwidthTracker;
