import React, { useState, useEffect, useRef, useCallback } from 'react';
import './index.css';
import HEVCEncoder from './services/HEVCEncoder';
import VideoProcessor from './services/VideoProcessor';
import WebSocketService from './services/WebSocketService';

function App() {
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState({
    framesEncoded: 0,
    totalBitrate: 0,
    avgBitrate: 0,
    encodeTime: 0,
    fps: 0
  });
  const [config, setConfig] = useState({
    qp: 26,
    wsUrl: 'ws://localhost:8080',
    useWebSocket: false
  });
  const [logs, setLogs] = useState([]);
  const [isEncoding, setIsEncoding] = useState(false);
  
  const encoderRef = useRef(null);
  const videoProcessorRef = useRef(null);
  const wsServiceRef = useRef(null);
  const fileInputRef = useRef(null);
  const encodingRef = useRef(false);
  const startTimeRef = useRef(0);
  const totalBytesRef = useRef(0);

  const addLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-99), { message, type, timestamp }]);
  }, []);

  useEffect(() => {
    encoderRef.current = new HEVCEncoder();
    videoProcessorRef.current = new VideoProcessor();
    wsServiceRef.current = new WebSocketService();

    return () => {
      if (encoderRef.current) {
        encoderRef.current.destroy();
      }
      if (videoProcessorRef.current) {
        videoProcessorRef.current.destroy();
      }
      if (wsServiceRef.current) {
        wsServiceRef.current.disconnect();
      }
    };
  }, []);

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setStatus('loading');
    addLog(`Loading video: ${file.name}`, 'info');

    try {
      const info = await videoProcessorRef.current.loadVideo(file);
      addLog(`Video loaded: ${info.width}x${info.height}, ${info.fps.toFixed(2)}fps, ${info.totalFrames} frames`, 'success');
      setStatus('ready');
    } catch (error) {
      addLog(`Failed to load video: ${error.message}`, 'error');
      setStatus('error');
    }
  };

  const initEncoder = async () => {
    const videoInfo = videoProcessorRef.current.getVideoInfo();
    if (videoInfo.width === 0) {
      addLog('Please load a video first', 'warning');
      return false;
    }

    addLog(`Initializing HEVC encoder: ${videoInfo.width}x${videoInfo.height}, QP=${config.qp}`, 'info');
    
    try {
      await encoderRef.current.init(videoInfo.width, videoInfo.height, config.qp);
      addLog('HEVC encoder initialized successfully', 'success');
      return true;
    } catch (error) {
      addLog(`Failed to initialize encoder: ${error.message}`, 'error');
      return false;
    }
  };

  const connectWebSocket = async () => {
    if (!config.useWebSocket) return true;

    addLog(`Connecting to WebSocket: ${config.wsUrl}`, 'info');
    
    try {
      await wsServiceRef.current.connect(config.wsUrl);
      addLog('WebSocket connected', 'success');
      return true;
    } catch (error) {
      addLog(`WebSocket connection failed: ${error.message}`, 'warning');
      return false;
    }
  };

  const startEncoding = async () => {
    if (isEncoding) return;

    const encoderReady = await initEncoder();
    if (!encoderReady) return;

    await connectWebSocket();

    setIsEncoding(true);
    encodingRef.current = true;
    startTimeRef.current = Date.now();
    totalBytesRef.current = 0;
    videoProcessorRef.current.reset();
    
    setStats({
      framesEncoded: 0,
      totalBitrate: 0,
      avgBitrate: 0,
      encodeTime: 0,
      fps: 0
    });
    
    setStatus('encoding');
    addLog('Starting encoding process...', 'info');

    encodeNextFrame();
  };

  const encodeNextFrame = useCallback(async () => {
    if (!encodingRef.current) return;

    const frame = videoProcessorRef.current.getNextFrame();
    if (!frame) {
      finishEncoding();
      return;
    }

    const frameStartTime = performance.now();

    try {
      const bitstream = encoderRef.current.encodeFrame(frame);
      const frameEndTime = performance.now();
      
      if (bitstream) {
        totalBytesRef.current += bitstream.length;
        
        if (config.useWebSocket && wsServiceRef.current.isConnected()) {
          wsServiceRef.current.sendBitstream(bitstream);
        }
      }

      const framesEncoded = videoProcessorRef.current.getVideoInfo().currentFrame;
      const totalTime = (Date.now() - startTimeRef.current) / 1000;
      const fps = framesEncoded / totalTime;
      const bitrate = (totalBytesRef.current * 8 / 1000 / totalTime);

      setStats({
        framesEncoded,
        totalBitrate: Math.round(bitrate),
        avgBitrate: Math.round((totalBytesRef.current * 8 / 1000) / Math.max(framesEncoded / 30, 0.001)),
        encodeTime: totalTime.toFixed(1),
        fps: fps.toFixed(1)
      });

      setProgress(videoProcessorRef.current.getProgress());

      setTimeout(encodeNextFrame, 0);
    } catch (error) {
      addLog(`Encoding error: ${error.message}`, 'error');
      finishEncoding();
    }
  }, [config.useWebSocket]);

  const finishEncoding = () => {
    encodingRef.current = false;
    setIsEncoding(false);
    setStatus('complete');
    addLog('Encoding completed!', 'success');
  };

  const stopEncoding = () => {
    encodingRef.current = false;
    setIsEncoding(false);
    setStatus('ready');
    addLog('Encoding stopped by user', 'info');
  };

  return (
    <div className="app">
      <header className="header">
        <h1>HEVC/H.265 Intra Encoder (WebAssembly)</h1>
        <p>Real-time video encoding with 35 intra prediction modes and SATD cost</p>
      </header>

      <div className="main-content">
        <div className="card">
          <h2>Video Input</h2>
          
          <div className="video-container">
            {status === 'idle' ? (
              <label className="file-label">
                <input 
                  ref={fileInputRef}
                  type="file" 
                  accept="video/*" 
                  onChange={handleFileSelect}
                  className="file-input"
                />
                <span>Click to select video file</span>
              </label>
            ) : (
              <div style={{ color: '#fff', textAlign: 'center' }}>
                <div>Video loaded</div>
                <div style={{ fontSize: '14px', opacity: 0.7, marginTop: 8 }}>
                  {videoProcessorRef.current?.getVideoInfo()?.width}x
                  {videoProcessorRef.current?.getVideoInfo()?.height}
                </div>
              </div>
            )}
          </div>

          <div className="controls">
            <button 
              className="btn btn-primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={isEncoding}
            >
              Select Video
            </button>
            <button 
              className="btn btn-primary"
              onClick={startEncoding}
              disabled={isEncoding || status === 'idle'}
            >
              Start Encoding
            </button>
            <button 
              className="btn btn-secondary"
              onClick={stopEncoding}
              disabled={!isEncoding}
            >
              Stop
            </button>
          </div>

          {status !== 'idle' && (
            <div className="progress-container">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="progress-text">
                Progress: {progress.toFixed(1)}%
              </div>
            </div>
          )}

          {status !== 'idle' && (
            <div className={`status status-${status}`}>
              Status: {status.charAt(0).toUpperCase() + status.slice(1)}
            </div>
          )}
        </div>

        <div className="card">
          <h2>Encoding Statistics</h2>
          
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-label">Frames</div>
              <div className="stat-value">{stats.framesEncoded}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">FPS</div>
              <div className="stat-value">{stats.fps}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Bitrate (kbps)</div>
              <div className="stat-value">{stats.totalBitrate}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Time (s)</div>
              <div className="stat-value">{stats.encodeTime}</div>
            </div>
          </div>

          <div className="config-section">
            <h3 style={{ marginBottom: 16, color: '#667eea' }}>Encoder Settings</h3>
            
            <div className="config-row">
              <span className="config-label">QP (Quantization Parameter)</span>
              <div className="config-value">
                <input 
                  type="number" 
                  min="0" 
                  max="51" 
                  value={config.qp}
                  onChange={(e) => setConfig({...config, qp: parseInt(e.target.value)})}
                  disabled={isEncoding}
                />
              </div>
            </div>

            <div className="config-row">
              <span className="config-label">Enable WebSocket</span>
              <div className="config-value">
                <input 
                  type="checkbox" 
                  checked={config.useWebSocket}
                  onChange={(e) => setConfig({...config, useWebSocket: e.target.checked})}
                  disabled={isEncoding}
                />
              </div>
            </div>

            {config.useWebSocket && (
              <div className="config-row">
                <span className="config-label">WebSocket URL</span>
                <div className="config-value">
                  <input 
                    type="text" 
                    value={config.wsUrl}
                    onChange={(e) => setConfig({...config, wsUrl: e.target.value})}
                    disabled={isEncoding}
                    style={{ width: '200px' }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Encoder Log</h2>
        <div className="log-container">
          {logs.map((log, index) => (
            <div key={index} className={`log-line log-${log.type}`}>
              [{log.timestamp}] {log.message}
            </div>
          ))}
          {logs.length === 0 && (
            <div className="log-line log-info">
              No logs yet. Select a video file to start.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
