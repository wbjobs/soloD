import React, { useState, useRef, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';

const App = () => {
  const [isWasmLoaded, setIsWasmLoaded] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isBlurring, setIsBlurring] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [roomId, setRoomId] = useState('room-1');
  const [status, setStatus] = useState('准备就绪');
  const [fps, setFps] = useState(0);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const remoteCanvasRef = useRef(null);
  const processorRef = useRef(null);
  const socketRef = useRef(null);
  const animationRef = useRef(null);
  const frameCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(performance.now());

  const loadWasm = useCallback(async () => {
    try {
      setStatus('加载 Wasm 模块...');
      const wasm = await import('video_processor');
      processorRef.current = new wasm.VideoProcessor(640, 480);
      setIsWasmLoaded(true);
      setStatus('Wasm 模块加载成功');
    } catch (error) {
      setStatus(`Wasm 加载失败: ${error.message}`);
      console.error('Wasm load error:', error);
    }
  }, []);

  const startCamera = useCallback(async () => {
    try {
      setStatus('请求摄像头权限...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, frameRate: 30 },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraActive(true);
        setStatus('摄像头已启动');
      }
    } catch (error) {
      setStatus(`摄像头启动失败: ${error.message}`);
      console.error('Camera error:', error);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsCameraActive(false);
      setIsBlurring(false);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      setStatus('摄像头已停止');
    }
  }, []);

  const processFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !processorRef.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx) {
      return;
    }

    try {
      canvas.width = 640;
      canvas.height = 480;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      if (isBlurring) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        if (imageData && imageData.data && imageData.data.length === 640 * 480 * 4) {
          try {
            const processed = processorRef.current.process_frame(imageData);
            
            if (processed && processed.length === 640 * 480 * 4) {
              const newImageData = new ImageData(
                new Uint8ClampedArray(processed),
                canvas.width,
                canvas.height
              );
              ctx.putImageData(newImageData, 0, 0);
            }
          } catch (wasmError) {
            console.warn('Wasm 处理出错，跳过虚化:', wasmError);
          }
        }
      }

      if (isConnected && socketRef.current) {
        try {
          const frameData = canvas.toDataURL('image/jpeg', 0.6);
          socketRef.current.emit('video-frame', { roomId, frameData });
        } catch (socketError) {
          console.warn('发送视频帧失败:', socketError);
        }
      }

      frameCountRef.current++;
      const now = performance.now();
      if (now - lastFpsUpdateRef.current >= 1000) {
        setFps(frameCountRef.current);
        frameCountRef.current = 0;
        lastFpsUpdateRef.current = now;
      }
    } catch (error) {
      console.error('视频处理错误:', error);
    }

    animationRef.current = requestAnimationFrame(processFrame);
  }, [isBlurring, isConnected, roomId]);

  useEffect(() => {
    if (isCameraActive && canvasRef.current) {
      animationRef.current = requestAnimationFrame(processFrame);
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isCameraActive, processFrame]);

  const connectToServer = useCallback(() => {
    try {
      setStatus('连接服务器...');
      const socket = io('http://localhost:3001');

      socket.on('connect', () => {
        setIsConnected(true);
        setStatus('已连接到服务器');
        socket.emit('join-room', roomId);
      });

      socket.on('disconnect', () => {
        setIsConnected(false);
        setStatus('与服务器断开连接');
      });

      socket.on('video-frame', ({ frameData }) => {
        if (remoteCanvasRef.current) {
          const ctx = remoteCanvasRef.current.getContext('2d');
          const img = new Image();
          img.onload = () => {
            remoteCanvasRef.current.width = 640;
            remoteCanvasRef.current.height = 480;
            ctx.drawImage(img, 0, 0, 640, 480);
          };
          img.src = frameData;
        }
      });

      socket.on('user-connected', () => {
        setStatus('有用户加入房间');
      });

      socket.on('user-disconnected', () => {
        setStatus('有用户离开房间');
      });

      socketRef.current = socket;
    } catch (error) {
      setStatus(`连接失败: ${error.message}`);
      console.error('Socket error:', error);
    }
  }, [roomId]);

  const disconnectFromServer = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
      setStatus('已断开连接');
    }
  }, []);

  useEffect(() => {
    loadWasm();
    return () => {
      stopCamera();
      disconnectFromServer();
    };
  }, [loadWasm, stopCamera, disconnectFromServer]);

  useEffect(() => {
    const handleKeyPress = (event) => {
      if (event.key.toLowerCase() === 'b' && isCameraActive && isWasmLoaded) {
        setIsBlurring(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [isCameraActive, isWasmLoaded]);

  return (
    <div className="app">
      <div className="header">
        <h1>📹 实时视频会议</h1>
        <p>WebRTC + Rust Wasm 背景虚化 + Socket.IO 转发</p>
      </div>

      <div className="video-container">
        <div className="video-panel">
          <h3>本地视频 (处理后)</h3>
          <div className="video-wrapper">
            {isCameraActive ? (
              <>
                <canvas ref={canvasRef} />
                <div className="fps-counter">FPS: {fps}</div>
              </>
            ) : (
              <div className="no-video">摄像头未启动</div>
            )}
          </div>

          <div className="controls">
            <button
              className="btn btn-primary"
              onClick={isCameraActive ? stopCamera : startCamera}
              disabled={!isWasmLoaded}
            >
              {isCameraActive ? '停止摄像头' : '启动摄像头'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setIsBlurring(!isBlurring)}
              disabled={!isCameraActive}
              title="按 B 键快速切换"
            >
              {isBlurring ? '关闭虚化 (B)' : '背景虚化 (B)'}
            </button>
          </div>
        </div>

        <div className="video-panel">
          <h3>远程视频</h3>
          <div className="video-wrapper">
            {isConnected ? (
              <canvas ref={remoteCanvasRef} />
            ) : (
              <div className="no-video">等待连接...</div>
            )}
          </div>

          <div className="room-input">
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="房间 ID"
              disabled={isConnected}
            />
            <button
              className="btn btn-primary"
              onClick={isConnected ? disconnectFromServer : connectToServer}
              disabled={!isWasmLoaded}
            >
              {isConnected ? '断开连接' : '连接'}
            </button>
          </div>
        </div>
      </div>

      <div className="status" style={{ maxWidth: 1360, margin: '20px auto' }}>
        <strong>状态:</strong> {status}
        <br />
        <strong>Wasm:</strong> {isWasmLoaded ? '✅ 已加载' : '⏳ 加载中'} |
        <strong> 摄像头:</strong> {isCameraActive ? '✅ 运行中' : '❌ 未启动'} |
        <strong> 虚化:</strong> {isBlurring ? '✅ 开启' : '❌ 关闭'} |
        <strong> 连接:</strong> {isConnected ? '✅ 已连接' : '❌ 未连接'}
        <br />
        <span style={{ color: '#ffd700', fontSize: '0.9em' }}>
          💡 提示: 按 <kbd style={{ background: '#333', padding: '2px 8px', borderRadius: '4px', fontFamily: 'monospace' }}>B</kbd> 键可快速切换背景虚化
        </span>
      </div>

      <video
        ref={videoRef}
        style={{ display: 'none' }}
        playsInline
        muted
      />
    </div>
  );
};

export default App;
