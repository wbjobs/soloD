import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { SerialPort } from './types';
import './index.css';

interface SensorData {
  id?: number;
  temperature: number;
  humidity: number;
  rawData: string;
  timestamp: string;
}

const App: React.FC = () => {
  const [port, setPort] = useState<SerialPort | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [realTimeData, setRealTimeData] = useState<string[]>([]);
  const [historyData, setHistoryData] = useState<SensorData[]>([]);
  const [status, setStatus] = useState('未连接');
  const [error, setError] = useState('');
  const [wsConnected, setWsConnected] = useState(false);
  const [wsStatus, setWsStatus] = useState('WebSocket 未连接');
  const [isSecureContext, setIsSecureContext] = useState(false);

  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);
  const bufferRef = useRef('');
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const API_BASE_URL = 'http://localhost:3001/api';
  const WS_BASE_URL = 'http://localhost:3001';

  useEffect(() => {
    const secure = window.isSecureContext || 
                   window.location.protocol === 'https:' || 
                   window.location.hostname === 'localhost' ||
                   window.location.hostname === '127.0.0.1';
    setIsSecureContext(secure);
  }, []);

  useEffect(() => {
    const socket = io(WS_BASE_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('WebSocket connected:', socket.id);
      setWsConnected(true);
      setWsStatus('WebSocket 已连接');
    });

    socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      setWsConnected(false);
      setWsStatus(`WebSocket 已断开: ${reason}`);
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      setWsConnected(false);
      setWsStatus(`WebSocket 连接错误: ${error.message}`);
    });

    socket.on('serial-data-saved', (data) => {
      console.log('Data saved via WebSocket:', data);
    });

    socket.on('serial-data-broadcast', (data) => {
      console.log('Broadcast received:', data);
    });

    socket.on('serial-data-error', (error) => {
      console.error('WebSocket serial data error:', error);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const fetchHistoryData = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/data?limit=50`);
      const result = await response.json();
      if (result.data) {
        setHistoryData(result.data);
      }
    } catch (err) {
      console.error('Failed to fetch history data:', err);
    }
  }, []);

  useEffect(() => {
    fetchHistoryData();
    pollingRef.current = setInterval(fetchHistoryData, 2000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [fetchHistoryData]);

  const sendDataViaWebSocket = useCallback((rawData: string) => {
    if (socketRef.current && wsConnected) {
      socketRef.current.emit('serial-data', { rawData });
      console.log('Data sent via WebSocket:', rawData);
      return true;
    }
    return false;
  }, [wsConnected]);

  const sendDataToBackend = useCallback(async (rawData: string) => {
    try {
      if (sendDataViaWebSocket(rawData)) {
        return;
      }
      
      await fetch(`${API_BASE_URL}/data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rawData }),
      });
    } catch (err) {
      console.error('Failed to send data to backend:', err);
    }
  }, [sendDataViaWebSocket]);

  const checkWebSerialSupport = useCallback((): boolean => {
    if ('serial' in navigator) {
      const isLocal = window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1' ||
                     window.location.protocol === 'https:';
      
      if (!isLocal && window.location.protocol !== 'https:') {
        setError('Web Serial API 需要 HTTPS 或 localhost 环境。当前协议: ' + window.location.protocol);
        return false;
      }
      return true;
    }
    setError('您的浏览器不支持 Web Serial API，请使用 Chrome 89+ 或 Edge 89+ 浏览器');
    return false;
  }, []);

  const connectSerial = async () => {
    try {
      if (!checkWebSerialSupport()) {
        return;
      }

      const selectedPort = await navigator.serial.requestPort();
      await selectedPort.open({ baudRate: 9600 });

      setPort(selectedPort);
      setIsConnected(true);
      setStatus('已连接');
      setError('');
    } catch (err: any) {
      if (err.name === 'SecurityError') {
        setError('安全错误: Web Serial API 需要 HTTPS 或 localhost 环境');
      } else if (err.name === 'NotFoundError') {
        setError('未找到设备: 请确保串口设备已连接');
      } else {
        setError(`连接失败: ${err.message}`);
      }
      console.error(err);
    }
  };

  const disconnectSerial = async () => {
    if (readerRef.current) {
      try {
        await readerRef.current.cancel();
      } catch (err) {
        console.error(err);
      }
      readerRef.current = null;
    }

    if (port) {
      try {
        await port.close();
      } catch (err) {
        console.error(err);
      }
      setPort(null);
    }

    setIsConnected(false);
    setIsListening(false);
    setStatus('未连接');
    bufferRef.current = '';
  };

  const startListening = async () => {
    if (!port || !port.readable) {
      setError('串口不可读');
      return;
    }

    setIsListening(true);
    setStatus('监听中...');

    const textDecoder = new TextDecoder();
    readerRef.current = port.readable.getReader();

    try {
      while (true) {
        const { value, done } = await readerRef.current.read();
        if (done) break;

        const chunk = textDecoder.decode(value);
        bufferRef.current += chunk;

        let lineEndIndex;
        while ((lineEndIndex = bufferRef.current.indexOf('\r\n')) !== -1) {
          const line = bufferRef.current.slice(0, lineEndIndex).trim();
          bufferRef.current = bufferRef.current.slice(lineEndIndex + 2);

          if (line) {
            setRealTimeData(prev => [line, ...prev.slice(0, 99)]);
            if (line.includes('TEMP:') && line.includes('HUMI:')) {
              await sendDataToBackend(line);
            }
          }
        }
      }
    } catch (err: any) {
      console.error('读取数据时出错:', err);
      setError(`读取错误: ${err.message}`);
    } finally {
      setIsListening(false);
      if (isConnected) {
        setStatus('已连接');
      }
    }
  };

  const stopListening = async () => {
    if (readerRef.current) {
      try {
        await readerRef.current.cancel();
      } catch (err) {
        console.error(err);
      }
      readerRef.current = null;
    }
    setIsListening(false);
    setStatus('已连接');
  };

  useEffect(() => {
    return () => {
      if (port) {
        disconnectSerial();
      }
    };
  }, [port]);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">串口温湿度传感器监控</h1>
          <p className="text-gray-600">Web Serial API + Express + SQLite 全栈应用</p>
        </header>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-gray-700 font-medium">串口状态:</span>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                isListening ? 'bg-green-100 text-green-800' :
                isConnected ? 'bg-blue-100 text-blue-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {status}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-700 font-medium">WebSocket:</span>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                wsConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {wsStatus}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-700 font-medium">环境:</span>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                isSecureContext ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
              }`}>
                {isSecureContext ? '安全环境 ✓' : '非安全环境 ⚠'}
              </span>
            </div>
          </div>
          <div className="flex gap-3">
            {!isConnected ? (
              <button
                onClick={connectSerial}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                连接串口
              </button>
            ) : (
              <button
                onClick={disconnectSerial}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                断开连接
              </button>
            )}
            {isConnected && !isListening && (
              <button
                onClick={startListening}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                开始监听
              </button>
            )}
            {isListening && (
              <button
                onClick={stopListening}
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-medium"
              >
                停止监听
              </button>
            )}
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mt-4">
              {error}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">实时数据</h2>
            <div className="h-96 overflow-y-auto border border-gray-200 rounded-lg">
              {realTimeData.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-400">
                  暂无数据，开始监听后数据将显示在这里
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {realTimeData.map((data, index) => (
                    <li key={index} className="px-4 py-2 font-mono text-sm">
                      <span className="text-gray-400 mr-2">[{realTimeData.length - index}]</span>
                      <span className={data.includes('TEMP:') && data.includes('HUMI:') ? 'text-green-600' : 'text-gray-700'}>
                        {data}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">历史数据</h2>
            <div className="h-96 overflow-y-auto border border-gray-200 rounded-lg">
              {historyData.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-400">
                  暂无历史数据
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {historyData.map((item) => (
                    <li key={item.id} className="px-4 py-3">
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex gap-4">
                          <span className="text-blue-600 font-medium">
                            温度: {item.temperature}°C
                          </span>
                          <span className="text-green-600 font-medium">
                            湿度: {item.humidity}%
                          </span>
                        </div>
                        <span className="text-xs text-gray-400">
                          {new Date(item.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 font-mono">
                        {item.rawData}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-blue-800 font-medium mb-2">使用说明</h3>
          <ul className="text-blue-700 text-sm space-y-1">
            <li><strong>环境要求:</strong> Web Serial API 需要 localhost 或 HTTPS 安全环境</li>
            <li><strong>浏览器要求:</strong> Chrome 89+ / Edge 89+ (当前环境: {isSecureContext ? '✓ 符合要求' : '⚠ 不符合要求'})</li>
            <li>1. 点击"连接串口"按钮，选择您的串口设备</li>
            <li>2. 连接成功后，点击"开始监听"按钮</li>
            <li>3. 设备发送的数据格式: TEMP:25.5,HUMI:60.2\r\n</li>
            <li>4. 符合格式的数据会通过 WebSocket 自动发送到后端并存入数据库</li>
            <li>5. 历史数据每 2 秒自动刷新</li>
          </ul>
        </div>

        {!isSecureContext && (
          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h3 className="text-yellow-800 font-medium mb-2">⚠ Web Serial API 环境问题</h3>
            <p className="text-yellow-700 text-sm mb-2">
              当前环境不支持 Web Serial API。请使用以下方式之一解决：
            </p>
            <ul className="text-yellow-700 text-sm space-y-1 list-disc list-inside">
              <li>使用 <strong>http://localhost:3000</strong> 访问（推荐）</li>
              <li>使用 <strong>http://127.0.0.1:3000</strong> 访问</li>
              <li>配置 HTTPS 证书，使用 HTTPS 协议访问</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;