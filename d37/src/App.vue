<template>
  <div class="app-container">
    <header class="app-header">
      <h1>传感器数据采集系统</h1>
      <div class="header-controls">
        <button @click="refreshPorts" class="btn btn-secondary">刷新串口</button>
        <button @click="exportData" class="btn btn-success">导出CSV</button>
      </div>
    </header>

    <div class="main-content">
      <aside class="control-panel">
        <div class="panel-section">
          <h3>串口连接</h3>
          <div class="form-group">
            <label>选择串口:</label>
            <select v-model="selectedPort" class="form-control">
              <option v-for="port in serialPorts" :key="port.path" :value="port.path">
                {{ port.path }} ({{ port.manufacturer || '未知设备' }})
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>波特率:</label>
            <select v-model="baudRate" class="form-control">
              <option :value="9600">9600</option>
              <option :value="115200">115200</option>
            </select>
          </div>
          <button @click="connectSerial" class="btn btn-primary w-100" :disabled="isConnected">
            {{ isConnected ? '已连接' : '连接' }}
          </button>
          <button @click="disconnectSerial" class="btn btn-danger w-100 mt-2" :disabled="!isConnected">
            断开连接
          </button>
        </div>

        <div class="panel-section">
          <h3>数据采集</h3>
          <button @click="startCollection" class="btn btn-success w-100" :disabled="isCollecting">
            {{ isCollecting ? '采集中...' : '开始采集' }}
          </button>
          <button @click="stopCollection" class="btn btn-warning w-100 mt-2" :disabled="!isCollecting">
            停止采集
          </button>
          <div class="mt-2">
            <label>
              <input type="checkbox" v-model="useMockData" @change="toggleMockData">
              使用模拟数据
            </label>
          </div>
        </div>

        <div class="panel-section">
          <h3>实时数据</h3>
          <div class="data-item">
            <span class="data-label">温度:</span>
            <span class="data-value temperature">{{ currentData.temperature }} °C</span>
          </div>
          <div class="data-item">
            <span class="data-label">湿度:</span>
            <span class="data-value humidity">{{ currentData.humidity }} %</span>
          </div>
          <div class="data-item">
            <span class="data-label">电压:</span>
            <span class="data-value voltage">{{ currentData.voltage }} V</span>
          </div>
        </div>

        <div class="panel-section">
          <h3>阈值设置</h3>
          <div class="form-group">
            <label>温度上限 (°C):</label>
            <input type="number" v-model="thresholds.tempHigh" class="form-control" step="0.1">
          </div>
          <div class="form-group">
            <label>温度下限 (°C):</label>
            <input type="number" v-model="thresholds.tempLow" class="form-control" step="0.1">
          </div>
          <div class="form-group">
            <label>湿度上限 (%):</label>
            <input type="number" v-model="thresholds.humidityHigh" class="form-control" step="0.1">
          </div>
          <div class="form-group">
            <label>电压上限 (V):</label>
            <input type="number" v-model="thresholds.voltageHigh" class="form-control" step="0.1">
          </div>
          <div class="mt-2">
            <label>
              <input type="checkbox" v-model="autoTriggerEnabled">
              启用自动触发
            </label>
          </div>
        </div>

        <div class="panel-section">
          <h3>远程指令下发</h3>
          <div class="tab-buttons">
            <button @click="commandMode = 'hex'" :class="['tab-btn', { active: commandMode === 'hex' }]">十六进制</button>
            <button @click="commandMode = 'text'" :class="['tab-btn', { active: commandMode === 'text' }]">文本</button>
          </div>
          <div v-if="commandMode === 'hex'" class="form-group mt-2">
            <label>十六进制指令:</label>
            <input type="text" v-model="hexCommand" class="form-control" placeholder="例如: FF 01 0A">
          </div>
          <div v-if="commandMode === 'text'" class="form-group mt-2">
            <label>文本指令:</label>
            <input type="text" v-model="textCommand" class="form-control" placeholder="例如: SET_RELAY=1">
          </div>
          <button @click="sendCommand" class="btn btn-primary w-100 mt-2" :disabled="!isConnected">
            发送指令
          </button>
          <div v-if="commandResult" class="command-result" :class="commandResult.success ? 'success' : 'error'">
            {{ commandResult.message }}
          </div>
        </div>

        <div class="panel-section">
          <h3>快捷指令</h3>
          <div class="quick-commands">
            <button @click="sendQuickCommand('FF 01 01')" class="btn btn-sm btn-info" :disabled="!isConnected">开启风扇</button>
            <button @click="sendQuickCommand('FF 01 00')" class="btn btn-sm btn-secondary" :disabled="!isConnected">关闭风扇</button>
            <button @click="sendQuickCommand('FF 02 01')" class="btn btn-sm btn-info" :disabled="!isConnected">开启加热</button>
            <button @click="sendQuickCommand('FF 02 00')" class="btn btn-sm btn-secondary" :disabled="!isConnected">关闭加热</button>
            <button @click="sendQuickCommand('FF 03 01')" class="btn btn-sm btn-info" :disabled="!isConnected">开启报警</button>
            <button @click="sendQuickCommand('FF 03 00')" class="btn btn-sm btn-secondary" :disabled="!isConnected">关闭报警</button>
          </div>
        </div>
      </aside>

      <main class="chart-panel">
        <div class="chart-container">
          <h3>温度波形</h3>
          <Line ref="temperatureChartRef" :data="temperatureChartData" :options="chartOptions" />
        </div>
        <div class="chart-container">
          <h3>湿度波形</h3>
          <Line ref="humidityChartRef" :data="humidityChartData" :options="chartOptions" />
        </div>
        <div class="chart-container">
          <h3>电压波形</h3>
          <Line ref="voltageChartRef" :data="voltageChartData" :options="chartOptions" />
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, shallowRef } from 'vue'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'
import { Line } from 'vue-chartjs'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
)

const serialPorts = ref([])
const selectedPort = ref('')
const baudRate = ref(9600)
const isConnected = ref(false)
const isCollecting = ref(false)
const useMockData = ref(false)
const mockInterval = ref(null)

const currentData = ref({
  temperature: 0,
  humidity: 0,
  voltage: 0
})

const thresholds = ref({
  tempHigh: 40,
  tempLow: 10,
  humidityHigh: 80,
  voltageHigh: 5.5
})
const autoTriggerEnabled = ref(false)
const lastTriggerTime = ref({})

const commandMode = ref('hex')
const hexCommand = ref('')
const textCommand = ref('')
const commandResult = ref(null)

const maxDataPoints = 50

const temperatureChartRef = shallowRef(null)
const humidityChartRef = shallowRef(null)
const voltageChartRef = shallowRef(null)

const temperatureLabels = []
const temperatureValues = []
const humidityLabels = []
const humidityValues = []
const voltageLabels = []
const voltageValues = []

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  scales: {
    x: {
      display: true,
      title: {
        display: true,
        text: '时间'
      }
    },
    y: {
      display: true,
      title: {
        display: true,
        text: '数值'
      }
    }
  }
}

const temperatureChartData = {
  labels: temperatureLabels,
  datasets: [{
    label: '温度 (°C)',
    data: temperatureValues,
    borderColor: 'rgb(255, 99, 132)',
    backgroundColor: 'rgba(255, 99, 132, 0.5)',
    tension: 0.4
  }]
}

const humidityChartData = {
  labels: humidityLabels,
  datasets: [{
    label: '湿度 (%)',
    data: humidityValues,
    borderColor: 'rgb(54, 162, 235)',
    backgroundColor: 'rgba(54, 162, 235, 0.5)',
    tension: 0.4
  }]
}

const voltageChartData = {
  labels: voltageLabels,
  datasets: [{
    label: '电压 (V)',
    data: voltageValues,
    borderColor: 'rgb(75, 192, 192)',
    backgroundColor: 'rgba(75, 192, 192, 0.5)',
    tension: 0.4
  }]
}

const refreshPorts = async () => {
  serialPorts.value = await window.electronAPI.getSerialPorts()
  if (serialPorts.value.length > 0 && !selectedPort.value) {
    selectedPort.value = serialPorts.value[0].path
  }
}

const connectSerial = async () => {
  if (!selectedPort.value) {
    alert('请选择串口')
    return
  }
  const result = await window.electronAPI.connectSerial(selectedPort.value, baudRate.value)
  if (result.success) {
    isConnected.value = true
  } else {
    alert('连接失败: ' + result.error)
  }
}

const disconnectSerial = async () => {
  await window.electronAPI.disconnectSerial()
  isConnected.value = false
}

const startCollection = async () => {
  await window.electronAPI.startCollection()
  isCollecting.value = true
}

const stopCollection = async () => {
  await window.electronAPI.stopCollection()
  isCollecting.value = false
}

const exportData = async () => {
  const result = await window.electronAPI.exportCsv()
  if (result.success) {
    alert('导出成功: ' + result.filePath)
  } else if (!result.canceled) {
    alert('导出失败: ' + result.error)
  }
}

const checkThresholds = (data) => {
  if (!autoTriggerEnabled.value || !isConnected.value) return
  
  const now = Date.now()
  const throttleTime = 5000

  if (data.temperature > thresholds.value.tempHigh) {
    if (!lastTriggerTime.value.tempHigh || now - lastTriggerTime.value.tempHigh > throttleTime) {
      lastTriggerTime.value.tempHigh = now
      window.electronAPI.sendHexCommand('FF 02 01')
      console.log('温度过高，自动开启加热')
    }
  }
  
  if (data.temperature < thresholds.value.tempLow) {
    if (!lastTriggerTime.value.tempLow || now - lastTriggerTime.value.tempLow > throttleTime) {
      lastTriggerTime.value.tempLow = now
      window.electronAPI.sendHexCommand('FF 02 00')
      console.log('温度过低，自动关闭加热')
    }
  }

  if (data.humidity > thresholds.value.humidityHigh) {
    if (!lastTriggerTime.value.humidityHigh || now - lastTriggerTime.value.humidityHigh > throttleTime) {
      lastTriggerTime.value.humidityHigh = now
      window.electronAPI.sendHexCommand('FF 01 01')
      console.log('湿度过高，自动开启风扇')
    }
  }

  if (data.voltage > thresholds.value.voltageHigh) {
    if (!lastTriggerTime.value.voltageHigh || now - lastTriggerTime.value.voltageHigh > throttleTime) {
      lastTriggerTime.value.voltageHigh = now
      window.electronAPI.sendHexCommand('FF 03 01')
      console.log('电压过高，自动报警')
    }
  }
}

const updateChartData = (data) => {
  currentData.value = data
  const time = new Date().toLocaleTimeString()

  temperatureLabels.push(time)
  temperatureValues.push(data.temperature)
  if (temperatureLabels.length > maxDataPoints) {
    temperatureLabels.shift()
    temperatureValues.shift()
  }

  humidityLabels.push(time)
  humidityValues.push(data.humidity)
  if (humidityLabels.length > maxDataPoints) {
    humidityLabels.shift()
    humidityValues.shift()
  }

  voltageLabels.push(time)
  voltageValues.push(data.voltage)
  if (voltageLabels.length > maxDataPoints) {
    voltageLabels.shift()
    voltageValues.shift()
  }

  if (temperatureChartRef.value) {
    temperatureChartRef.value.chart.update('none')
  }
  if (humidityChartRef.value) {
    humidityChartRef.value.chart.update('none')
  }
  if (voltageChartRef.value) {
    voltageChartRef.value.chart.update('none')
  }

  checkThresholds(data)

  if (isCollecting.value) {
    window.electronAPI.saveSensorData(data)
  }
}

const generateMockData = async () => {
  const data = await window.electronAPI.generateMockData()
  updateChartData(data)
}

const sendCommand = async () => {
  let result
  if (commandMode.value === 'hex') {
    if (!hexCommand.value.trim()) {
      commandResult.value = { success: false, message: '请输入十六进制指令' }
      return
    }
    result = await window.electronAPI.sendHexCommand(hexCommand.value)
  } else {
    if (!textCommand.value.trim()) {
      commandResult.value = { success: false, message: '请输入文本指令' }
      return
    }
    result = await window.electronAPI.sendTextCommand(textCommand.value)
  }

  if (result.success) {
    commandResult.value = { success: true, message: `发送成功 (${result.sentBytes || 0} 字节)` }
  } else {
    commandResult.value = { success: false, message: `发送失败: ${result.error}` }
  }

  setTimeout(() => {
    commandResult.value = null
  }, 3000)
}

const sendQuickCommand = async (hex) => {
  const result = await window.electronAPI.sendHexCommand(hex)
  if (result.success) {
    commandResult.value = { success: true, message: '快捷指令发送成功' }
  } else {
    commandResult.value = { success: false, message: `发送失败: ${result.error}` }
  }

  setTimeout(() => {
    commandResult.value = null
  }, 2000)
}

const toggleMockData = () => {
  if (useMockData.value) {
    mockInterval.value = setInterval(generateMockData, 1000)
  } else {
    if (mockInterval.value) {
      clearInterval(mockInterval.value)
      mockInterval.value = null
    }
  }
}

onMounted(() => {
  refreshPorts()
  window.electronAPI.onSensorData((data) => {
    updateChartData(data)
  })
  window.electronAPI.onSerialError((error) => {
    alert('串口错误: ' + error)
    isConnected.value = false
  })
})

onUnmounted(() => {
  if (mockInterval.value) {
    clearInterval(mockInterval.value)
    mockInterval.value = null
  }
  
  if (temperatureChartRef.value?.chart) {
    temperatureChartRef.value.chart.destroy()
    temperatureChartRef.value = null
  }
  if (humidityChartRef.value?.chart) {
    humidityChartRef.value.chart.destroy()
    humidityChartRef.value = null
  }
  if (voltageChartRef.value?.chart) {
    voltageChartRef.value.chart.destroy()
    voltageChartRef.value = null
  }
  
  temperatureLabels.length = 0
  temperatureValues.length = 0
  humidityLabels.length = 0
  humidityValues.length = 0
  voltageLabels.length = 0
  voltageValues.length = 0
})
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.app-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.app-header h1 {
  font-size: 1.5rem;
  font-weight: 600;
}

.header-controls {
  display: flex;
  gap: 0.5rem;
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.control-panel {
  width: 300px;
  background: white;
  padding: 1rem;
  overflow-y: auto;
  box-shadow: 2px 0 10px rgba(0,0,0,0.05);
}

.panel-section {
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #eee;
}

.panel-section:last-child {
  border-bottom: none;
}

.panel-section h3 {
  font-size: 1rem;
  color: #333;
  margin-bottom: 1rem;
  font-weight: 600;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  color: #666;
  font-size: 0.9rem;
}

.form-control {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.9rem;
}

.btn {
  padding: 0.6rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: #667eea;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #5a6fd6;
}

.btn-danger {
  background: #e74c3c;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #c0392b;
}

.btn-success {
  background: #27ae60;
  color: white;
}

.btn-success:hover:not(:disabled) {
  background: #229954;
}

.btn-warning {
  background: #f39c12;
  color: white;
}

.btn-warning:hover:not(:disabled) {
  background: #e67e22;
}

.btn-secondary {
  background: #95a5a6;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #7f8c8d;
}

.w-100 {
  width: 100%;
}

.mt-2 {
  margin-top: 0.5rem;
}

.data-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: #f8f9fa;
  border-radius: 4px;
  margin-bottom: 0.5rem;
}

.data-label {
  color: #666;
  font-weight: 500;
}

.data-value {
  font-weight: 600;
  font-size: 1.1rem;
}

.data-value.temperature {
  color: #e74c3c;
}

.data-value.humidity {
  color: #3498db;
}

.data-value.voltage {
  color: #27ae60;
}

.chart-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  overflow-y: auto;
}

.chart-container {
  background: white;
  border-radius: 8px;
  padding: 1rem;
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);
  flex: 1;
  min-height: 200px;
}

.chart-container h3 {
  font-size: 1rem;
  color: #333;
  margin-bottom: 1rem;
  font-weight: 600;
}

.tab-buttons {
  display: flex;
  gap: 0.25rem;
}

.tab-btn {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #ddd;
  background: #f8f9fa;
  color: #666;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.2s;
  border-radius: 4px;
}

.tab-btn.active {
  background: #667eea;
  color: white;
  border-color: #667eea;
}

.tab-btn:hover:not(.active) {
  background: #e9ecef;
}

.command-result {
  margin-top: 0.5rem;
  padding: 0.5rem;
  border-radius: 4px;
  font-size: 0.85rem;
  text-align: center;
}

.command-result.success {
  background: #d4edda;
  color: #155724;
}

.command-result.error {
  background: #f8d7da;
  color: #721c24;
}

.quick-commands {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.btn-sm {
  padding: 0.4rem 0.6rem;
  font-size: 0.8rem;
}

.btn-info {
  background: #17a2b8;
  color: white;
}

.btn-info:hover:not(:disabled) {
  background: #138496;
}
</style>
