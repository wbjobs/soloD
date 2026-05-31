<template>
  <div class="container">
    <div class="header">
      <h1>Modbus TCP 实时监控系统</h1>
      <p>温度 & 压力监控</p>
    </div>

    <div class="status-bar">
      <div class="status-item">
        <span class="status-dot" :class="{ disconnected: !wsConnected }"></span>
        <span>WebSocket: {{ wsConnected ? '已连接' : '未连接' }}</span>
      </div>
      <div class="status-item">
        <span>InfluxDB: {{ influxDBReady ? '已连接' : '未连接' }}</span>
      </div>
      <div class="status-item">
        <span>更新时间: {{ lastUpdate }}</span>
      </div>
    </div>

    <div class="dashboard-grid">
      <div class="gauge-card">
        <h2>🌡️ 温度</h2>
        <div class="gauge-container" ref="tempGaugeRef"></div>
        <div class="value-display">
          <span class="current-value">{{ currentData.temperature.toFixed(1) }}</span>
          <span class="unit">°C</span>
        </div>
      </div>

      <div class="gauge-card">
        <h2>💨 压力</h2>
        <div class="gauge-container" ref="pressureGaugeRef"></div>
        <div class="value-display">
          <span class="current-value">{{ currentData.pressure.toFixed(2) }}</span>
          <span class="unit">MPa</span>
        </div>
      </div>
    </div>

    <div class="chart-container">
      <h2>📈 实时趋势</h2>
      <div class="chart" ref="realtimeChartRef"></div>
    </div>

    <div class="history-section">
      <div class="history-header">
        <h2>🔄 历史趋势回放</h2>
        <div class="time-selector">
          <div class="time-range-buttons">
            <button 
              v-for="range in timeRanges" 
              :key="range.value"
              @click="selectTimeRange(range)"
              :class="{ active: selectedRange === range.value }"
            >
              {{ range.label }}
            </button>
          </div>
          <div class="custom-time">
            <input type="datetime-local" v-model="startTime" @change="onTimeChange" />
            <span class="time-separator">至</span>
            <input type="datetime-local" v-model="endTime" @change="onTimeChange" />
            <button @click="queryHistory" :disabled="isLoading">
              {{ isLoading ? '查询中...' : '查询' }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="historySummary" class="summary-cards">
        <div class="summary-card">
          <div class="summary-label">数据点数</div>
          <div class="summary-value">{{ historySummary.count }}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">平均温度</div>
          <div class="summary-value">{{ historySummary.avgTemperature }}°C</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">平均压力</div>
          <div class="summary-value">{{ historySummary.avgPressure }} MPa</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">最高温度</div>
          <div class="summary-value">{{ historySummary.maxTemperature }}°C</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">最高压力</div>
          <div class="summary-value">{{ historySummary.maxPressure }} MPa</div>
        </div>
      </div>

      <div class="chart-container">
        <div class="chart" ref="historyChartRef"></div>
      </div>
    </div>

    <div class="data-table">
      <h2>📋 最近数据记录</h2>
      <table>
        <thead>
          <tr>
            <th>时间</th>
            <th>温度 (°C)</th>
            <th>压力 (MPa)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(record, index) in historyData.slice(-5).reverse()" :key="index">
            <td>{{ formatTime(record.timestamp) }}</td>
            <td>{{ record.temperature.toFixed(1) }}</td>
            <td>{{ record.pressure.toFixed(2) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import * as echarts from 'echarts'

const tempGaugeRef = ref(null)
const pressureGaugeRef = ref(null)
const realtimeChartRef = ref(null)
const historyChartRef = ref(null)

const wsConnected = ref(false)
const influxDBReady = ref(false)
const lastUpdate = ref('--')
const currentData = ref({
  temperature: 0,
  pressure: 0,
  timestamp: ''
})
const historyData = ref([])
const historySummary = ref(null)
const isLoading = ref(false)

const selectedRange = ref('1h')
const timeRanges = [
  { label: '1小时', value: '1h' },
  { label: '6小时', value: '6h' },
  { label: '12小时', value: '12h' },
  { label: '24小时', value: '24h' },
  { label: '自定义', value: 'custom' }
]

const now = new Date()
const startTime = ref(formatDatetimeLocal(new Date(now.getTime() - 3600000)))
const endTime = ref(formatDatetimeLocal(now))

function formatDatetimeLocal(date) {
  const pad = (n) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

let ws = null
let tempGaugeChart = null
let pressureGaugeChart = null
let realtimeChart = null
let historyChart = null

function initGauges() {
  tempGaugeChart = echarts.init(tempGaugeRef.value)
  const tempOption = {
    series: [{
      type: 'gauge',
      startAngle: 180,
      endAngle: 0,
      min: 0,
      max: 50,
      splitNumber: 10,
      axisLine: {
        lineStyle: {
          width: 20,
          color: [
            [0.3, '#67e0e3'],
            [0.7, '#37a2da'],
            [1, '#fd666d']
          ]
        }
      },
      pointer: {
        icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
        length: '55%',
        width: 20,
        offsetCenter: [0, '-40%'],
        itemStyle: {
          color: 'auto'
        }
      },
      axisTick: {
        length: 12,
        lineStyle: {
          color: 'auto',
          width: 2
        }
      },
      splitLine: {
        length: 20,
        lineStyle: {
          color: 'auto',
          width: 3
        }
      },
      axisLabel: {
        color: '#fff',
        fontSize: 14,
        distance: 30
      },
      detail: {
        fontSize: 24,
        offsetCenter: [0, '0%'],
        valueAnimation: true,
        formatter: '{value} °C',
        color: '#fff'
      },
      data: [{ value: 0, name: '' }]
    }]
  }
  tempGaugeChart.setOption(tempOption)

  pressureGaugeChart = echarts.init(pressureGaugeRef.value)
  const pressureOption = {
    series: [{
      type: 'gauge',
      startAngle: 180,
      endAngle: 0,
      min: 50,
      max: 150,
      splitNumber: 10,
      axisLine: {
        lineStyle: {
          width: 20,
          color: [
            [0.3, '#67e0e3'],
            [0.7, '#37a2da'],
            [1, '#fd666d']
          ]
        }
      },
      pointer: {
        icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
        length: '55%',
        width: 20,
        offsetCenter: [0, '-40%'],
        itemStyle: {
          color: 'auto'
        }
      },
      axisTick: {
        length: 12,
        lineStyle: {
          color: 'auto',
          width: 2
        }
      },
      splitLine: {
        length: 20,
        lineStyle: {
          color: 'auto',
          width: 3
        }
      },
      axisLabel: {
        color: '#fff',
        fontSize: 14,
        distance: 30
      },
      detail: {
        fontSize: 24,
        offsetCenter: [0, '0%'],
        valueAnimation: true,
        formatter: '{value} MPa',
        color: '#fff'
      },
      data: [{ value: 100, name: '' }]
    }]
  }
  pressureGaugeChart.setOption(pressureOption)
}

function initRealtimeChart() {
  realtimeChart = echarts.init(realtimeChartRef.value)
  const option = {
    tooltip: {
      trigger: 'axis'
    },
    legend: {
      data: ['温度 (°C)', '压力 (MPa)'],
      textStyle: {
        color: '#fff'
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: [],
      axisLine: {
        lineStyle: {
          color: '#666'
        }
      },
      axisLabel: {
        color: '#fff'
      }
    },
    yAxis: [
      {
        type: 'value',
        name: '温度',
        min: 0,
        max: 50,
        axisLine: {
          lineStyle: {
            color: '#67e0e3'
          }
        },
        axisLabel: {
          color: '#fff',
          formatter: '{value} °C'
        }
      },
      {
        type: 'value',
        name: '压力',
        min: 50,
        max: 150,
        axisLine: {
          lineStyle: {
            color: '#fd666d'
          }
        },
        axisLabel: {
          color: '#fff',
          formatter: '{value} MPa'
        }
      }
    ],
    series: [
      {
        name: '温度 (°C)',
        type: 'line',
        smooth: true,
        data: [],
        itemStyle: {
          color: '#67e0e3'
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(103, 224, 227, 0.3)' },
            { offset: 1, color: 'rgba(103, 224, 227, 0)' }
          ])
        }
      },
      {
        name: '压力 (MPa)',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        data: [],
        itemStyle: {
          color: '#fd666d'
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(253, 102, 109, 0.3)' },
            { offset: 1, color: 'rgba(253, 102, 109, 0)' }
          ])
        }
      }
    ]
  }
  realtimeChart.setOption(option)
}

function initHistoryChart() {
  historyChart = echarts.init(historyChartRef.value)
  const option = {
    tooltip: {
      trigger: 'axis'
    },
    legend: {
      data: ['温度 (°C)', '压力 (MPa)'],
      textStyle: {
        color: '#fff'
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: [],
      axisLine: {
        lineStyle: {
          color: '#666'
        }
      },
      axisLabel: {
        color: '#fff',
        rotate: 45
      }
    },
    yAxis: [
      {
        type: 'value',
        name: '温度',
        axisLine: {
          lineStyle: {
            color: '#67e0e3'
          }
        },
        axisLabel: {
          color: '#fff',
          formatter: '{value} °C'
        }
      },
      {
        type: 'value',
        name: '压力',
        axisLine: {
          lineStyle: {
            color: '#fd666d'
          }
        },
        axisLabel: {
          color: '#fff',
          formatter: '{value} MPa'
        }
      }
    ],
    series: [
      {
        name: '温度 (°C)',
        type: 'line',
        smooth: true,
        data: [],
        itemStyle: {
          color: '#67e0e3'
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(103, 224, 227, 0.3)' },
            { offset: 1, color: 'rgba(103, 224, 227, 0)' }
          ])
        }
      },
      {
        name: '压力 (MPa)',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        data: [],
        itemStyle: {
          color: '#fd666d'
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(253, 102, 109, 0.3)' },
            { offset: 1, color: 'rgba(253, 102, 109, 0)' }
          ])
        }
      }
    ]
  }
  historyChart.setOption(option)
}

function updateRealtimeCharts() {
  if (tempGaugeChart) {
    tempGaugeChart.setOption({
      series: [{ data: [{ value: currentData.value.temperature }] }]
    })
  }
  if (pressureGaugeChart) {
    pressureGaugeChart.setOption({
      series: [{ data: [{ value: currentData.value.pressure }] }]
    })
  }
  if (realtimeChart && historyData.value.length > 0) {
    const times = historyData.value.slice(-20).map(d => formatTime(d.timestamp))
    const temps = historyData.value.slice(-20).map(d => d.temperature)
    const pressures = historyData.value.slice(-20).map(d => d.pressure)
    
    realtimeChart.setOption({
      xAxis: { data: times },
      series: [
        { data: temps },
        { data: pressures }
      ]
    })
  }
}

function updateHistoryChart(data) {
  if (historyChart) {
    const times = data.map(d => formatTime(d.timestamp))
    const temps = data.map(d => d.temperature)
    const pressures = data.map(d => d.pressure)
    
    historyChart.setOption({
      xAxis: { data: times },
      series: [
        { data: temps },
        { data: pressures }
      ]
    })
  }
}

function formatTime(timestamp) {
  if (!timestamp) return '--'
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  })
}

function selectTimeRange(range) {
  selectedRange.value = range.value
  const now = new Date()
  
  if (range.value === '1h') {
    startTime.value = formatDatetimeLocal(new Date(now.getTime() - 3600000))
  } else if (range.value === '6h') {
    startTime.value = formatDatetimeLocal(new Date(now.getTime() - 6 * 3600000))
  } else if (range.value === '12h') {
    startTime.value = formatDatetimeLocal(new Date(now.getTime() - 12 * 3600000))
  } else if (range.value === '24h') {
    startTime.value = formatDatetimeLocal(new Date(now.getTime() - 24 * 3600000))
  }
  
  endTime.value = formatDatetimeLocal(now)
  
  if (range.value !== 'custom') {
    queryHistory()
  }
}

function onTimeChange() {
  selectedRange.value = 'custom'
}

async function queryHistory() {
  isLoading.value = true
  
  try {
    const start = new Date(startTime.value)
    const end = new Date(endTime.value)
    
    const response = await fetch(`/api/history?start=${start.toISOString()}&end=${end.toISOString()}`)
    const data = await response.json()
    
    updateHistoryChart(data)
    
    const summaryResponse = await fetch(`/api/history/summary?start=${start.toISOString()}&end=${end.toISOString()}`)
    historySummary.value = await summaryResponse.json()
  } catch (err) {
    console.error('查询历史数据失败:', err)
  } finally {
    isLoading.value = false
  }
}

function connectWebSocket() {
  ws = new WebSocket('ws://localhost:3000')
  
  ws.onopen = () => {
    console.log('WebSocket连接成功')
    wsConnected.value = true
  }
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data)
    currentData.value = data
    lastUpdate.value = formatTime(data.timestamp)
    historyData.value.push(data)
    if (historyData.value.length > 100) {
      historyData.value.shift()
    }
    updateRealtimeCharts()
  }
  
  ws.onclose = () => {
    console.log('WebSocket连接关闭')
    wsConnected.value = false
    setTimeout(connectWebSocket, 3000)
  }
  
  ws.onerror = (error) => {
    console.error('WebSocket错误:', error)
    wsConnected.value = false
  }
}

async function fetchStatus() {
  try {
    const response = await fetch('/api/status')
    const status = await response.json()
    influxDBReady.value = status.influxDBReady || false
  } catch (err) {
    console.error('获取状态失败:', err)
  }
}

function handleResize() {
  if (tempGaugeChart) tempGaugeChart.resize()
  if (pressureGaugeChart) pressureGaugeChart.resize()
  if (realtimeChart) realtimeChart.resize()
  if (historyChart) historyChart.resize()
}

onMounted(() => {
  initGauges()
  initRealtimeChart()
  initHistoryChart()
  connectWebSocket()
  fetchStatus()
  window.addEventListener('resize', handleResize)
  
  setInterval(fetchStatus, 10000)
})

onUnmounted(() => {
  if (ws) ws.close()
  window.removeEventListener('resize', handleResize)
  if (tempGaugeChart) tempGaugeChart.dispose()
  if (pressureGaugeChart) pressureGaugeChart.dispose()
  if (realtimeChart) realtimeChart.dispose()
  if (historyChart) historyChart.dispose()
})
</script>

<style scoped>
.history-section {
  margin-top: 30px;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 15px;
}

.time-selector {
  display: flex;
  align-items: center;
  gap: 15px;
  flex-wrap: wrap;
}

.time-range-buttons {
  display: flex;
  gap: 8px;
}

.time-range-buttons button {
  padding: 8px 16px;
  border: none;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  cursor: pointer;
  transition: all 0.3s ease;
}

.time-range-buttons button:hover {
  background: rgba(0, 212, 255, 0.3);
}

.time-range-buttons button.active {
  background: #00d4ff;
  color: #1a1a2e;
}

.custom-time {
  display: flex;
  align-items: center;
  gap: 10px;
}

.custom-time input {
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 14px;
}

.custom-time input:focus {
  outline: none;
  border-color: #00d4ff;
}

.time-separator {
  color: #666;
}

.custom-time button {
  padding: 8px 20px;
  border: none;
  border-radius: 8px;
  background: #7b2cbf;
  color: #fff;
  cursor: pointer;
  transition: all 0.3s ease;
}

.custom-time button:hover:not(:disabled) {
  background: #9d4edd;
}

.custom-time button:disabled {
  background: #444;
  cursor: not-allowed;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 20px;
  margin-bottom: 20px;
}

.summary-card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 15px;
  text-align: center;
}

.summary-label {
  font-size: 14px;
  color: #aaa;
  margin-bottom: 8px;
}

.summary-value {
  font-size: 24px;
  font-weight: bold;
  color: #00d4ff;
}
</style>
