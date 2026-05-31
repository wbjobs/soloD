import React, { useState, useRef, useEffect, useCallback } from 'react';
import { WasmHEVCEncoder } from '../utils/wasmEncoder';
import { VideoDecoder, VideoFrame } from '../utils/videoDecoder';
import { WebSocketStream, ConnectionStatus } from '../utils/websocketStream';

interface EncoderStats {
    frameCount: number;
    bitsEncoded: number;
    bitrate: number;
    fps: number;
    lastFrameSize: number;
    mlTotalBlocks: number;
    mlPredictedBlocks: number;
    mlReusedBlocks: number;
    mlAvgConfidence: number;
}

const VideoEncoder: React.FC = () => {
    const [encoderReady, setEncoderReady] = useState(false);
    const [decoderReady, setDecoderReady] = useState(false);
    const [wsStatus, setWsStatus] = useState<ConnectionStatus>('disconnected');
    const [isEncoding, setIsEncoding] = useState(false);
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [wsUrl, setWsUrl] = useState('ws://localhost:8080');
    const [qp, setQp] = useState(32);
    const [useMLAcceleration, setUseMLAcceleration] = useState(true);
    const [stats, setStats] = useState<EncoderStats>({
        frameCount: 0,
        bitsEncoded: 0,
        bitrate: 0,
        fps: 0,
        lastFrameSize: 0,
        mlTotalBlocks: 0,
        mlPredictedBlocks: 0,
        mlReusedBlocks: 0,
        mlAvgConfidence: 0
    });

    const encoderRef = useRef<WasmHEVCEncoder | null>(null);
    const decoderRef = useRef<VideoDecoder | null>(null);
    const wsRef = useRef<WebSocketStream | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const startTimeRef = useRef<number>(0);
    const lastFrameTimeRef = useRef<number>(0);

    useEffect(() => {
        decoderRef.current = new VideoDecoder();
        decoderRef.current.load().then(() => {
            setDecoderReady(true);
        }).catch(err => {
            console.error('Failed to load FFmpeg:', err);
        });

        return () => {
            encoderRef.current?.destroy();
            wsRef.current?.disconnect();
        };
    }, []);

    const initEncoder = useCallback(async (width: number, height: number) => {
        if (encoderRef.current) {
            encoderRef.current.destroy();
        }

        const encoder = new WasmHEVCEncoder(width, height, qp);
        try {
            await encoder.init();
            
            if (useMLAcceleration) {
                encoder.enableMLPrediction();
            }
            
            encoderRef.current = encoder;
            setEncoderReady(true);
            return true;
        } catch (err) {
            console.error('Failed to init encoder:', err);
            return false;
        }
    }, [qp, useMLAcceleration]);

    const connectWebSocket = useCallback(async () => {
        if (wsRef.current) {
            wsRef.current.disconnect();
        }

        const ws = new WebSocketStream({
            url: wsUrl,
            onConnect: () => setWsStatus('connected'),
            onDisconnect: () => setWsStatus('disconnected'),
            onError: () => setWsStatus('error'),
            onBitstreamSent: (bytes) => {
                setStats(prev => ({
                    ...prev,
                    lastFrameSize: bytes
                }));
            }
        });

        wsRef.current = ws;
        setWsStatus('connecting');

        try {
            await ws.connect();
            return true;
        } catch (err) {
            console.error('WebSocket connection failed:', err);
            return false;
        }
    }, [wsUrl]);

    const encodeAndSendFrame = useCallback((frame: VideoFrame) => {
        if (!encoderRef.current) return;

        const bitstream = encoderRef.current.encodeFrame(frame.yData, frame.stride);
        
        if (bitstream && wsRef.current?.isConnected()) {
            wsRef.current.sendBitstream(bitstream);
        }

        const now = Date.now();
        const frameCount = encoderRef.current.getFrameCount();
        const bitsEncoded = encoderRef.current.getBitsEncoded();
        const elapsed = (now - startTimeRef.current) / 1000;
        
        const mlStats = encoderRef.current.getMLStats();

        setStats({
            frameCount,
            bitsEncoded,
            bitrate: elapsed > 0 ? bitsEncoded / elapsed / 1000 : 0,
            fps: frameCount / (elapsed || 1),
            lastFrameSize: bitstream ? bitstream.length : 0,
            mlTotalBlocks: mlStats.totalBlocks,
            mlPredictedBlocks: mlStats.mlPredicted,
            mlReusedBlocks: mlStats.reused,
            mlAvgConfidence: mlStats.avgConfidence
        });
    }, []);

    const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setVideoFile(file);

        const video = document.createElement('video');
        video.src = URL.createObjectURL(file);
        video.muted = true;
        
        await new Promise((resolve) => {
            video.onloadedmetadata = () => {
                video.width = video.videoWidth;
                video.height = video.videoHeight;
                resolve(true);
            };
        });

        await initEncoder(video.videoWidth, video.videoHeight);
    }, [initEncoder]);

    const startEncoding = useCallback(async () => {
        if (!videoFile || !decoderRef.current || !encoderReady) return;

        await connectWebSocket();

        setIsEncoding(true);
        startTimeRef.current = Date.now();

        const canvas = canvasRef.current;
        if (!canvas) return;

        const video = videoRef.current;
        if (!video) {
            console.error('Video element not found');
            return;
        }

        video.src = URL.createObjectURL(videoFile);
        video.play();

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const processFrame = async () => {
            if (!isEncoding || video.ended) {
                setIsEncoding(false);
                return;
            }

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const videoFrame = decoderRef.current!.extractYUVFromCanvas(imageData);

            encodeAndSendFrame(videoFrame);

            lastFrameTimeRef.current = Date.now();
            requestAnimationFrame(processFrame);
        };

        processFrame();
    }, [videoFile, encoderReady, isEncoding, connectWebSocket, encodeAndSendFrame]);

    const stopEncoding = useCallback(() => {
        setIsEncoding(false);
        if (videoRef.current) {
            videoRef.current.pause();
        }
    }, []);

    return (
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
            <h1 style={{ textAlign: 'center', marginBottom: '30px' }}>
                HEVC Intra Encoder (WebAssembly)
            </h1>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ 
                    border: '1px solid #ddd', 
                    borderRadius: '8px', 
                    padding: '20px',
                    backgroundColor: '#f9f9f9'
                }}>
                    <h2>Video Input</h2>
                    
                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '8px' }}>
                            Select Video File:
                        </label>
                        <input
                            type="file"
                            accept="video/*"
                            onChange={handleFileSelect}
                            disabled={isEncoding}
                            style={{ width: '100%' }}
                        />
                    </div>

                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '8px' }}>
                            QP (Quality Parameter, 0-51):
                        </label>
                        <input
                            type="range"
                            min="0"
                            max="51"
                            value={qp}
                            onChange={(e) => setQp(parseInt(e.target.value))}
                            disabled={isEncoding}
                            style={{ width: '100%' }}
                        />
                        <span style={{ display: 'block', textAlign: 'center' }}>{qp}</span>
                    </div>

                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '8px' }}>
                            WebSocket URL:
                        </label>
                        <input
                            type="text"
                            value={wsUrl}
                            onChange={(e) => setWsUrl(e.target.value)}
                            disabled={isEncoding}
                            style={{ width: '100%', padding: '8px' }}
                        />
                    </div>

                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={useMLAcceleration}
                                onChange={(e) => setUseMLAcceleration(e.target.checked)}
                                disabled={isEncoding}
                            />
                            <span>ML加速模式预测 (速度提升约2-3x)</span>
                        </label>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            onClick={startEncoding}
                            disabled={!encoderReady || !decoderReady || isEncoding || !videoFile}
                            style={{
                                flex: 1,
                                padding: '12px',
                                backgroundColor: '#4CAF50',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '16px'
                            }}
                        >
                            Start Encoding
                        </button>
                        <button
                            onClick={stopEncoding}
                            disabled={!isEncoding}
                            style={{
                                flex: 1,
                                padding: '12px',
                                backgroundColor: '#f44336',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '16px'
                            }}
                        >
                            Stop
                        </button>
                    </div>

                    <div style={{ marginTop: '20px' }}>
                        <h3>Status:</h3>
                        <ul style={{ listStyle: 'none', padding: 0 }}>
                            <li style={{ marginBottom: '8px' }}>
                                FFmpeg Decoder: {decoderReady ? '✅ Ready' : '⏳ Loading...'}
                            </li>
                            <li style={{ marginBottom: '8px' }}>
                                WASM Encoder: {encoderReady ? '✅ Ready' : '⏳ Not initialized'}
                            </li>
                            <li style={{ marginBottom: '8px' }}>
                                WebSocket: {
                                    wsStatus === 'connected' ? '✅ Connected' :
                                    wsStatus === 'connecting' ? '⏳ Connecting...' :
                                    wsStatus === 'error' ? '❌ Error' :
                                    '⭕ Disconnected'
                                }
                            </li>
                            <li>
                                Encoding: {isEncoding ? '🔴 Active' : '⏸️ Idle'}
                            </li>
                        </ul>
                    </div>
                </div>

                <div style={{ 
                    border: '1px solid #ddd', 
                    borderRadius: '8px', 
                    padding: '20px',
                    backgroundColor: '#f9f9f9'
                }}>
                    <h2>Statistics</h2>
                    
                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: '1fr 1fr', 
                        gap: '15px',
                        marginTop: '15px'
                    }}>
                        <div style={{ 
                            padding: '15px', 
                            backgroundColor: 'white', 
                            borderRadius: '6px',
                            textAlign: 'center'
                        }}>
                            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2196F3' }}>
                                {stats.frameCount}
                            </div>
                            <div style={{ fontSize: '12px', color: '#666' }}>Frames Encoded</div>
                        </div>
                        
                        <div style={{ 
                            padding: '15px', 
                            backgroundColor: 'white', 
                            borderRadius: '6px',
                            textAlign: 'center'
                        }}>
                            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#FF9800' }}>
                                {stats.fps.toFixed(1)}
                            </div>
                            <div style={{ fontSize: '12px', color: '#666' }}>FPS</div>
                        </div>
                        
                        <div style={{ 
                            padding: '15px', 
                            backgroundColor: 'white', 
                            borderRadius: '6px',
                            textAlign: 'center'
                        }}>
                            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#9C27B0' }}>
                                {stats.bitrate.toFixed(1)}
                            </div>
                            <div style={{ fontSize: '12px', color: '#666' }}>Bitrate (kbps)</div>
                        </div>
                        
                        <div style={{ 
                            padding: '15px', 
                            backgroundColor: 'white', 
                            borderRadius: '6px',
                            textAlign: 'center'
                        }}>
                            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#009688' }}>
                                {(stats.lastFrameSize / 1024).toFixed(2)}
                            </div>
                            <div style={{ fontSize: '12px', color: '#666' }}>Last Frame (KB)</div>
                        </div>
                    </div>

                    <div style={{ marginTop: '20px' }}>
                        <h3>Total:</h3>
                        <div style={{ 
                            padding: '15px', 
                            backgroundColor: 'white', 
                            borderRadius: '6px',
                            textAlign: 'center'
                        }}>
                            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#E91E63' }}>
                                {(stats.bitsEncoded / 1024 / 1024).toFixed(2)} MB
                            </div>
                            <div style={{ fontSize: '12px', color: '#666' }}>Total Data Encoded</div>
                        </div>
                    </div>

                    {useMLAcceleration && (
                        <div style={{ marginTop: '20px' }}>
                            <h3>ML加速统计:</h3>
                            <div style={{ 
                                display: 'grid', 
                                gridTemplateColumns: '1fr 1fr', 
                                gap: '10px',
                                marginTop: '10px'
                            }}>
                                <div style={{ 
                                    padding: '10px', 
                                    backgroundColor: 'white', 
                                    borderRadius: '6px',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#673AB7' }}>
                                        {stats.mlTotalBlocks}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#666' }}>总块数</div>
                                </div>
                                
                                <div style={{ 
                                    padding: '10px', 
                                    backgroundColor: 'white', 
                                    borderRadius: '6px',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#3F51B5' }}>
                                        {stats.mlPredictedBlocks}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#666' }}>ML预测</div>
                                </div>
                                
                                <div style={{ 
                                    padding: '10px', 
                                    backgroundColor: 'white', 
                                    borderRadius: '6px',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#00BCD4' }}>
                                        {stats.mlReusedBlocks}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#666' }}>模式复用</div>
                                </div>
                                
                                <div style={{ 
                                    padding: '10px', 
                                    backgroundColor: 'white', 
                                    borderRadius: '6px',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#8BC34A' }}>
                                        {stats.mlTotalBlocks > 0 
                                            ? (((stats.mlPredictedBlocks + stats.mlReusedBlocks) / stats.mlTotalBlocks * 100).toFixed(0) + '%')
                                            : '0%'}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#666' }}>加速率</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div style={{ 
                marginTop: '20px', 
                border: '1px solid #ddd', 
                borderRadius: '8px', 
                padding: '20px',
                backgroundColor: '#f9f9f9'
            }}>
                <h2>Preview</h2>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <canvas
                        ref={canvasRef}
                        style={{
                            border: '1px solid #ccc',
                            maxWidth: '100%',
                            maxHeight: '400px'
                        }}
                    />
                </div>
            </div>

            <video
                ref={videoRef}
                style={{ display: 'none' }}
                muted
                playsInline
            />
        </div>
    );
};

export default VideoEncoder;
