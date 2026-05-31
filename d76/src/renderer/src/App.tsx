import { useState, useEffect, useRef } from 'react'
import type { SerialData, PortInfo } from '../../main/preload'

function App() {
  const [ports, setPorts] = useState<PortInfo[]>([])
  const [selectedPort, setSelectedPort] = useState('')
  const [baudRate, setBaudRate] = useState(9600)
  const [isConnected, setIsConnected] = useState(false)
  const [terminalData, setTerminalData] = useState<SerialData[]>([])
  const [sendHex, setSendHex] = useState('')
  const [historyRecords, setHistoryRecords] = useState<SerialData[]>([])
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [error, setError] = useState('')
  
  const terminalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadPorts()
    checkConnection()
    loadHistory()

    window.electronAPI.onSerialData((data) => {
      setTerminalData(prev => [...prev, data])
    })

    window.electronAPI.onSerialError((err) => {
      setError(err)
    })

    window.electronAPI.onSerialDisconnected(() => {
      setIsConnected(false)
    })

    return () => {
      window.electronAPI.removeListeners()
    }
  }, [])

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [terminalData])

  const loadPorts = async () => {
    const portList = await window.electronAPI.listPorts()
    setPorts(portList)
    if (portList.length > 0 && !selectedPort) {
      setSelectedPort(portList[0].path)
    }
  }

  const checkConnection = async () => {
    const connected = await window.electronAPI.isConnected()
    setIsConnected(connected)
  }

  const handleConnect = async () => {
    if (!selectedPort) {
      setError('请选择串口')
      return
    }

    const result = await window.electronAPI.connect(selectedPort, baudRate)
    if (result.success) {
      setIsConnected(true)
      setError('')
    } else {
      setError(result.error || '连接失败')
    }
  }

  const handleDisconnect = async () => {
    await window.electronAPI.disconnect()
    setIsConnected(false)
  }

  const handleSend = async () => {
    if (!sendHex.trim()) {
      setError('请输入十六进制数据')
      return
    }

    const cleanHex = sendHex.replace(/\s/g, '')
    if (!/^[0-9A-Fa-f]+$/.test(cleanHex)) {
      setError('无效的十六进制数据')
      return
    }

    const result = await window.electronAPI.sendHex(cleanHex)
    if (result.success) {
      setSendHex('')
      setError('')
    } else {
      setError(result.error || '发送失败')
    }
  }

  const loadHistory = async () => {
    const start = startTime ? new Date(startTime).getTime() : undefined
    const end = endTime ? new Date(endTime).getTime() : undefined
    
    const records = await window.electronAPI.queryRecords(start, end, 100)
    setHistoryRecords(records)
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  }

  const formatDateTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  }

  return (
    <div className="app">
      <div className="header">
        <h1>串口终端</h1>
        <div className="connection-panel">
          <select
            value={selectedPort}
            onChange={(e) => setSelectedPort(e.target.value)}
            disabled={isConnected}
          >
            <option value="">选择串口</option>
            {ports.map(port => (
              <option key={port.path} value={port.path}>
                {port.path} {port.manufacturer ? `(${port.manufacturer})` : ''}
              </option>
            ))}
          </select>
          <input
            type="number"
            value={baudRate}
            onChange={(e) => setBaudRate(Number(e.target.value))}
            placeholder="波特率"
            disabled={isConnected}
          />
          {!isConnected ? (
            <button className="btn btn-primary" onClick={handleConnect}>
              连接
            </button>
          ) : (
            <button className="btn btn-danger" onClick={handleDisconnect}>
              断开
            </button>
          )}
          <span className={`status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '已连接' : '未连接'}
          </span>
          <button className="btn btn-primary" onClick={loadPorts} disabled={isConnected}>
            刷新
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="main-content">
        <div className="terminal-section">
          <div className="terminal" ref={terminalRef}>
            {terminalData.map((item, index) => (
              <div key={index} className="terminal-line">
                <span className="terminal-time">[{formatTime(item.timestamp)}]</span>
                <span className={item.type === 'send' ? 'terminal-send' : 'terminal-receive'}>
                  <span className="terminal-label">
                    {item.type === 'send' ? '发送:' : '接收:'}
                  </span>
                  {item.hexData.toUpperCase().match(/.{2}/g)?.join(' ') || item.hexData.toUpperCase()}
                </span>
              </div>
            ))}
            {terminalData.length === 0 && (
              <div style={{ color: '#666', textAlign: 'center', padding: '20px' }}>
                暂无数据
              </div>
            )}
          </div>
          <div className="send-panel">
            <input
              type="text"
              value={sendHex}
              onChange={(e) => setSendHex(e.target.value)}
              placeholder="输入十六进制数据 (如: 01 02 03)"
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              disabled={!isConnected}
            />
            <button 
              className="btn btn-primary" 
              onClick={handleSend}
              disabled={!isConnected}
            >
              发送
            </button>
          </div>
        </div>

        <div className="history-section">
          <h2>历史记录</h2>
          <div className="query-panel">
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              placeholder="开始时间"
            />
            <input
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              placeholder="结束时间"
            />
            <button className="btn btn-primary" onClick={loadHistory}>
              查询
            </button>
          </div>
          <div className="history-list">
            {historyRecords.map((record, index) => (
              <div key={index} className="history-item">
                <div className="history-item-header">
                  <span className={`history-item-type ${record.type}`}>
                    {record.type === 'send' ? '发送' : '接收'}
                  </span>
                  <span className="history-item-time">
                    {formatDateTime(record.timestamp)}
                  </span>
                </div>
                <div className="history-item-data">
                  {record.hexData.toUpperCase().match(/.{2}/g)?.join(' ') || record.hexData.toUpperCase()}
                </div>
              </div>
            ))}
            {historyRecords.length === 0 && (
              <div style={{ color: '#666', textAlign: 'center', padding: '20px' }}>
                暂无记录
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
