<template>
  <div class="container">
    <header class="header">
      <h1>🔍 系统调用监控</h1>
      <div class="status" :class="{ connected: isConnected }">
        <span class="status-dot"></span>
        <span>{{ isConnected ? '已连接' : '未连接' }}</span>
      </div>
    </header>

    <div class="control-panel">
      <div class="control-group">
        <label for="pid-input">监控 PID：</label>
        <input
          id="pid-input"
          v-model.number="inputPid"
          type="number"
          min="0"
          placeholder="0 表示监控所有进程"
          @keyup.enter="setPid"
        />
        <button @click="setPid" :disabled="isSettingPid" class="btn">
          {{ isSettingPid ? '设置中...' : '设置监控' }}
        </button>
        <span class="current-pid">当前: {{ currentPid !== null ? (currentPid === 0 ? '全部' : currentPid) : '未知' }}</span>
      </div>
    </div>

    <div class="stats">
      <div class="stat-card">
        <div class="stat-value">{{ events.length }}</div>
        <div class="stat-label">总事件数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ uniquePids.size }}</div>
        <div class="stat-label">唯一进程数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ currentRate }}</div>
        <div class="stat-label">打开/秒</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ last10SecondsTotal }}</div>
        <div class="stat-label">近10秒总数</div>
      </div>
    </div>

    <div class="chart-container">
      <h3>📊 近10秒文件打开频率</h3>
      <canvas ref="chartRef"></canvas>
    </div>

    <div class="content">
      <div class="events-list">
        <div v-if="events.length === 0" class="empty-state">
          <div class="empty-icon">📭</div>
          <p>等待系统调用事件...</p>
          <p class="hint">确保 Python 后端和 Go 服务正在运行</p>
        </div>
        <div v-for="(event, index) in events" :key="index" class="event-item" :class="{ 'new-event': index === 0 }">
          <div class="event-icon">📂</div>
          <div class="event-content">
            <div class="event-message">
              进程 <span class="highlight pid">[{{ event.pid }}]</span>
              <span class="comm">({{ event.comm }})</span>
              在 <span class="highlight time">[{{ formatTime(event.timestamp) }}]</span>
              打开了文件
            </div>
            <div class="event-filename">{{ event.filename }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

const isConnected = ref(false)
const events = ref([])
const uniquePids = ref(new Set())
const inputPid = ref(0)
const currentPid = ref(null)
const isSettingPid = ref(false)
const chartRef = ref(null)
let chart = null
let ws = null
let rateInterval = null
let secondBuckets = Array(10).fill(0)
let currentSecond = 0

const currentRate = computed(() => secondBuckets[currentSecond])
const last10SecondsTotal = computed(() => secondBuckets.reduce((a, b) => a + b, 0))

const connectWebSocket = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${protocol}//${window.location.host}/ws`

  ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    isConnected.value = true
    console.log('WebSocket connected')
    fetchCurrentPid()
  }

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      events.value.unshift(data)
      uniquePids.value.add(data.pid)

      secondBuckets[currentSecond]++
      updateChart()

      if (events.value.length > 500) {
        events.value.pop()
      }
    } catch (error) {
      console.error('Failed to parse message:', error)
    }
  }

  ws.onerror = (error) => {
    console.error('WebSocket error:', error)
    isConnected.value = false
  }

  ws.onclose = () => {
    isConnected.value = false
    console.log('WebSocket disconnected, retrying in 3s...')
    setTimeout(connectWebSocket, 3000)
  }
}

const fetchCurrentPid = async () => {
  try {
    const response = await fetch('/api/get-pid')
    const data = await response.json()
    if (data.status === 'ok') {
      currentPid.value = data.pid
      inputPid.value = data.pid
    }
  } catch (error) {
    console.error('Failed to fetch current PID:', error)
  }
}

const setPid = async () => {
  if (isSettingPid.value) return
  isSettingPid.value = true

  try {
    const response = await fetch('/api/set-pid', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pid: inputPid.value }),
    })
    const data = await response.json()
    if (data.status === 'ok') {
      currentPid.value = data.pid
      events.value = []
      secondBuckets = Array(10).fill(0)
      updateChart()
      console.log('PID set to:', data.pid)
    } else {
      console.error('Failed to set PID:', data.error)
    }
  } catch (error) {
    console.error('Failed to set PID:', error)
  } finally {
    isSettingPid.value = false
  }
}

const formatTime = (timestamp) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

const initChart = () => {
  if (!chartRef.value) return

  const labels = Array.from({ length: 10 }, (_, i) => `${i - 9}s`)

  chart = new Chart(chartRef.value, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: '文件打开次数',
          data: secondBuckets,
          backgroundColor: 'rgba(0, 212, 255, 0.6)',
          borderColor: 'rgba(0, 212, 255, 1)',
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 300,
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            color: '#aaa',
            stepSize: 1,
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)',
          },
        },
        x: {
          ticks: {
            color: '#aaa',
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)',
          },
        },
      },
      plugins: {
        legend: {
          labels: {
            color: '#aaa',
          },
        },
      },
    },
  })
}

const updateChart = () => {
  if (chart) {
    chart.data.datasets[0].data = [...secondBuckets]
    chart.data.labels = Array.from({ length: 10 }, (_, i) => {
      const offset = (i - 9 + currentSecond + 10) % 10
      return offset === 9 ? '现在' : `${offset - 9}s`
    })
    chart.update('none')
  }
}

const startRateCounter = () => {
  rateInterval = setInterval(() => {
    currentSecond = (currentSecond + 1) % 10
    secondBuckets[currentSecond] = 0
    updateChart()
  }, 1000)
}

onMounted(() => {
  connectWebSocket()
  setTimeout(initChart, 100)
  startRateCounter()
})

onUnmounted(() => {
  if (ws) {
    ws.close()
  }
  if (rateInterval) {
    clearInterval(rateInterval)
  }
  if (chart) {
    chart.destroy()
  }
})
</script>

<style scoped>
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 2px solid #16213e;
}

.header h1 {
  font-size: 24px;
  color: #00d4ff;
}

.status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 20px;
  background: #16213e;
  font-size: 14px;
}

.status.connected {
  background: rgba(46, 213, 115, 0.2);
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ff4757;
}

.status.connected .status-dot {
  background: #2ed573;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.control-panel {
  background: #16213e;
  padding: 20px;
  border-radius: 12px;
  margin-bottom: 20px;
  border: 1px solid #0f3460;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.control-group label {
  font-weight: 500;
  color: #eee;
}

.control-group input {
  padding: 10px 14px;
  border: 2px solid #0f3460;
  border-radius: 8px;
  background: #1a1a2e;
  color: #eee;
  font-size: 14px;
  width: 200px;
  transition: border-color 0.3s;
}

.control-group input:focus {
  outline: none;
  border-color: #00d4ff;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #00d4ff 0%, #0099cc 100%);
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 212, 255, 0.4);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.current-pid {
  color: #aaa;
  font-size: 14px;
  margin-left: auto;
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 15px;
  margin-bottom: 20px;
}

.stat-card {
  background: #16213e;
  padding: 18px;
  border-radius: 12px;
  text-align: center;
  border: 1px solid #0f3460;
}

.stat-value {
  font-size: 32px;
  font-weight: bold;
  color: #00d4ff;
  margin-bottom: 6px;
}

.stat-label {
  font-size: 13px;
  color: #888;
}

.chart-container {
  background: #16213e;
  padding: 20px;
  border-radius: 12px;
  margin-bottom: 20px;
  border: 1px solid #0f3460;
}

.chart-container h3 {
  color: #00d4ff;
  margin-bottom: 15px;
  font-size: 18px;
}

.chart-container canvas {
  height: 200px !important;
}

.content {
  background: #16213e;
  border-radius: 12px;
  border: 1px solid #0f3460;
  overflow: hidden;
}

.events-list {
  max-height: 500px;
  overflow-y: auto;
}

.events-list::-webkit-scrollbar {
  width: 8px;
}

.events-list::-webkit-scrollbar-track {
  background: #1a1a2e;
}

.events-list::-webkit-scrollbar-thumb {
  background: #0f3460;
  border-radius: 4px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #888;
}

.empty-icon {
  font-size: 56px;
  margin-bottom: 15px;
}

.empty-state p {
  margin-bottom: 8px;
  font-size: 15px;
}

.empty-state .hint {
  font-size: 13px;
  color: #666;
}

.event-item {
  display: flex;
  gap: 14px;
  padding: 14px 18px;
  border-bottom: 1px solid #0f3460;
  transition: background 0.3s;
}

.event-item:last-child {
  border-bottom: none;
}

.event-item:hover {
  background: rgba(0, 212, 255, 0.05);
}

.event-item.new-event {
  animation: highlight 1s ease-out;
}

@keyframes highlight {
  0% { background: rgba(0, 212, 255, 0.2); }
  100% { background: transparent; }
}

.event-icon {
  font-size: 22px;
  flex-shrink: 0;
}

.event-content {
  flex: 1;
  min-width: 0;
}

.event-message {
  font-size: 14px;
  line-height: 1.5;
  margin-bottom: 8px;
  word-wrap: break-word;
}

.highlight {
  font-weight: 600;
}

.highlight.pid {
  color: #ff6b6b;
}

.highlight.time {
  color: #feca57;
}

.comm {
  color: #48dbfb;
  font-size: 13px;
}

.event-filename {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  color: #2ed573;
  background: rgba(46, 213, 115, 0.1);
  padding: 6px 10px;
  border-radius: 6px;
  word-break: break-all;
  line-height: 1.4;
}
</style>
