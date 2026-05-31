import React, { useState, useEffect, useRef } from 'react';
import SignalingService from './services/SignalingService';
import WebRTCManager from './services/WebRTCManager';
import { NetworkStats, BitrateRecommendation, MLPrediction } from './types/webrtc';

const App: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [inRoom, setInRoom] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [userId, setUserId] = useState('');
  const [participants, setParticipants] = useState<string[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [, setLocalStream] = useState<MediaStream | null>(null);
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);
  const [bitrateRecommendation, setBitrateRecommendation] = useState<BitrateRecommendation | null>(null);
  const [mlPrediction, setMlPrediction] = useState<MLPrediction | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const initializeConnection = async () => {
      try {
        await SignalingService.connect('http://localhost:3001');
        setIsConnected(true);
        console.log('已连接到信令服务器');
      } catch (error) {
        console.error('连接服务器失败:', error);
      }
    };

    initializeConnection();

    return () => {
      WebRTCManager.close();
      SignalingService.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isConnected) return;

    SignalingService.on('user-joined', async ({ userId: newUserId }: { userId: string }) => {
      console.log('用户加入:', newUserId);
      setParticipants(prev => [...prev, newUserId]);
      await WebRTCManager.createOffer(newUserId);
    });

    SignalingService.on('user-left', ({ userId: leftUserId }: { userId: string }) => {
      console.log('用户离开:', leftUserId);
      setParticipants(prev => prev.filter(id => id !== leftUserId));
      setRemoteStreams(prev => {
        const newMap = new Map(prev);
        newMap.delete(leftUserId);
        return newMap;
      });
    });

    SignalingService.on('room-users', ({ users }: { users: string[] }) => {
      console.log('房间用户:', users);
      setParticipants(users);
      users.forEach(async (user) => {
        await WebRTCManager.createOffer(user);
      });
    });

    SignalingService.on('offer', async ({ from, offer }: { from: string; offer: RTCSessionDescriptionInit }) => {
      await WebRTCManager.handleOffer(from, offer);
    });

    SignalingService.on('answer', async ({ from, answer }: { from: string; answer: RTCSessionDescriptionInit }) => {
      await WebRTCManager.handleAnswer(from, answer);
    });

    SignalingService.on('ice-candidate', async ({ from, candidate }: { from: string; candidate: RTCIceCandidate }) => {
      await WebRTCManager.handleIceCandidate(from, candidate);
    });

    SignalingService.on('bitrate-recommendation', async (recommendation: BitrateRecommendation) => {
      setBitrateRecommendation(recommendation);
      await WebRTCManager.adjustBitrate(recommendation);
    });

    WebRTCManager.setOnRemoteStreamCallback((userId, stream) => {
      setRemoteStreams(prev => {
        const newMap = new Map(prev);
        newMap.set(userId, stream);
        return newMap;
      });
    });

    WebRTCManager.setOnStatsUpdateCallback((stats) => {
      setNetworkStats(stats);
      if (stats.mlPrediction) {
        setMlPrediction(stats.mlPrediction);
      }
    });

    return () => {
      SignalingService.off('user-joined');
      SignalingService.off('user-left');
      SignalingService.off('room-users');
      SignalingService.off('offer');
      SignalingService.off('answer');
      SignalingService.off('ice-candidate');
      SignalingService.off('bitrate-recommendation');
    };
  }, [isConnected]);

  const joinRoom = async () => {
    if (!roomId || !userId) return;

    try {
      const mlLoaded = await WebRTCManager.initMLModel();
      setModelLoaded(mlLoaded);

      const stream = await WebRTCManager.initializeLocalStream({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: true
      });

      setLocalStream(stream);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      SignalingService.joinRoom(roomId, userId);
      setInRoom(true);
      WebRTCManager.startStatsReporting(500);
    } catch (error) {
      console.error('加入房间失败:', error);
    }
  };

  const leaveRoom = () => {
    SignalingService.leaveRoom();
    WebRTCManager.close();
    setInRoom(false);
    setParticipants([]);
    setRemoteStreams(new Map());
    setLocalStream(null);
    setNetworkStats(null);
    setBitrateRecommendation(null);
  };

  const formatBitrate = (bitrate: number): string => {
    if (bitrate >= 1000000) {
      return `${(bitrate / 1000000).toFixed(2)} Mbps`;
    }
    return `${(bitrate / 1000).toFixed(2)} Kbps`;
  };

  const getPacketLossStatus = (loss: number): string => {
    if (loss < 0.02) return 'good';
    if (loss < 0.05) return 'warning';
    return 'danger';
  };

  const getRttStatus = (rtt: number): string => {
    if (rtt < 100) return 'good';
    if (rtt < 200) return 'warning';
    return 'danger';
  };

  if (!inRoom) {
    return (
      <div className="app">
        <div className="header">
          <h1>WebRTC 多方会议系统</h1>
          <p>基于 GCC 拥塞控制的码率自适应调节</p>
        </div>

        <div className="room-setup">
          <h2>加入会议室</h2>
          <div className="input-group">
            <label>房间 ID</label>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="例如: room123"
            />
          </div>
          <div className="input-group">
            <label>用户 ID</label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="例如: user1"
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={joinRoom}
            disabled={!isConnected || !roomId || !userId}
          >
            {isConnected ? '加入房间' : '正在连接服务器...'}
          </button>
        </div>
      </div>
    );
  }

  const currentQuality = WebRTCManager.getCurrentQualityLevel();

  return (
    <div className="app">
      <div className="header">
        <h1>会议室: {roomId}</h1>
        <p>用户: {userId} | 在线人数: {participants.length + 1}</p>
      </div>

      <div className="conference-container">
        <div className="video-container">
          <div className="video-wrapper">
            <video ref={localVideoRef} autoPlay muted playsInline />
            <div className="video-label">{userId} (你)</div>
            <div className={`quality-badge quality-${currentQuality}`}>{currentQuality}</div>
          </div>

          {Array.from(remoteStreams.entries()).map(([id, stream]) => (
            <div key={id} className="video-wrapper">
              <video
                autoPlay
                playsInline
                ref={(el) => {
                  if (el) el.srcObject = stream;
                }}
              />
              <div className="video-label">{id}</div>
            </div>
          ))}
        </div>

        <div className="sidebar">
          <div className="stats-panel">
            <h3>网络状态</h3>
            {networkStats ? (
              <>
                <div className="stat-item">
                  <span className="stat-label">当前码率</span>
                  <span className="stat-value">
                    {formatBitrate(networkStats.currentBitrate)}
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">丢包率</span>
                  <span className={`stat-value ${getPacketLossStatus(networkStats.packetLoss)}`}>
                    {(networkStats.packetLoss * 100).toFixed(2)}%
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">RTT</span>
                  <span className={`stat-value ${getRttStatus(networkStats.rtt)}`}>
                    {networkStats.rtt.toFixed(0)} ms
                  </span>
                </div>
              </>
            ) : (
              <p style={{ color: '#666' }}>正在收集数据...</p>
            )}
          </div>

          <div className="stats-panel">
            <h3>ML 带宽预测</h3>
            <div className="stat-item">
              <span className="stat-label">模型状态</span>
              <span className={`stat-value ${modelLoaded ? 'good' : ''}`}>
                {modelLoaded ? '已加载' : '启发式模式'}
              </span>
            </div>
            {mlPrediction ? (
              <>
                <div className="stat-item">
                  <span className="stat-label">预测趋势</span>
                  <span className={`stat-value ${
                    mlPrediction.trend === 'rising' ? 'good' : 
                    mlPrediction.trend === 'falling' ? 'danger' : 'warning'
                  }`}>
                    {mlPrediction.trend === 'rising' ? '↑ 上升' : 
                     mlPrediction.trend === 'falling' ? '↓ 下降' : '→ 稳定'}
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">置信度</span>
                  <span className="stat-value">
                    {(mlPrediction.confidence * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">预测带宽</span>
                  <span className="stat-value">
                    {formatBitrate(mlPrediction.predictedBandwidth)}
                  </span>
                </div>
              </>
            ) : (
              <p style={{ color: '#666' }}>等待足够数据...</p>
            )}
          </div>

          {bitrateRecommendation && (
            <div className="recommendation-panel">
              <h3>码率推荐</h3>
              <div className="recommendation-item">
                <p><strong>推荐码率:</strong> {formatBitrate(bitrateRecommendation.recommendedBitrate)}</p>
                <p><strong>质量等级:</strong> {bitrateRecommendation.qualityLevel}</p>
                <p><strong>原因:</strong> {bitrateRecommendation.reason}</p>
                <p><strong>分辨率:</strong> {bitrateRecommendation.encoderParams.width}x{bitrateRecommendation.encoderParams.height}</p>
                <p><strong>帧率:</strong> {bitrateRecommendation.encoderParams.frameRate} fps</p>
              </div>
            </div>
          )}

          <div className="participants-list">
            <h3>参与者</h3>
            <div className="participant-item">
              <div className="participant-avatar">{userId.charAt(0).toUpperCase()}</div>
              <span className="participant-name">{userId} (你)</span>
            </div>
            {participants.map(p => (
              <div key={p} className="participant-item">
                <div className="participant-avatar">{p.charAt(0).toUpperCase()}</div>
                <span className="participant-name">{p}</span>
              </div>
            ))}
          </div>

          <div className="controls">
            <button className="btn btn-danger" onClick={leaveRoom}>
              离开房间
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
