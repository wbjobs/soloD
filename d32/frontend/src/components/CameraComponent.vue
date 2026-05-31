<template>
  <el-card class="camera-card">
    <template #header>
      <div class="card-header">
        <span>实时检测</span>
        <div class="controls">
          <el-select v-model="workstation" size="small" style="width: 100px; margin-right: 10px;">
            <el-option label="A1" value="A1" />
            <el-option label="A2" value="A2" />
            <el-option label="A3" value="A3" />
            <el-option label="B1" value="B1" />
            <el-option label="B2" value="B2" />
            <el-option label="C1" value="C1" />
            <el-option label="C2" value="C2" />
            <el-option label="C3" value="C3" />
          </el-select>
          <el-button 
            :type="isRunning ? 'danger' : 'success'" 
            @click="toggleCamera"
            :loading="loading"
          >
            {{ isRunning ? '停止' : '启动' }}
          </el-button>
          <el-button @click="captureAndSend" :disabled="!isRunning">
            手动抓拍
          </el-button>
        </div>
      </div>
    </template>
    
    <div class="video-container">
      <video ref="videoRef" class="video-feed" autoplay playsinline></video>
      <canvas ref="canvasRef" class="detection-canvas"></canvas>
      
      <div v-if="!isRunning && !loading" class="placeholder">
        <el-icon size="80" color="#999"><Picture /></el-icon>
        <p>点击启动按钮开始检测</p>
      </div>
      
      <div v-if="isSuspicious" class="alert-overlay">
        <el-alert
          title="疑似缺陷检测"
          type="warning"
          :closable="false"
          show-icon
        >
          正在发送至后端复核...
        </el-alert>
      </div>
    </div>
    
    <div class="detection-stats">
      <el-statistic title="检测帧率" :value="fps" suffix="FPS" />
      <el-statistic title="疑似缺陷数" :value="suspiciousCount" />
      <el-divider direction="vertical" />
      <el-tag :type="detectionStatus === 'normal' ? 'success' : 'warning'" size="large">
        当前状态: {{ detectionStatus === 'normal' ? '正常' : '疑似缺陷' }}
      </el-tag>
    </div>
  </el-card>
</template>

<script setup>
import { ref, onUnmounted, computed, onMounted } from 'vue'
import { Picture } from '@element-plus/icons-vue'

const emit = defineEmits(['suspicious-detected', 'camera-status'])

const videoRef = ref(null)
const canvasRef = ref(null)
const isRunning = ref(false)
const loading = ref(false)
const modelLoading = ref(false)
const isSuspicious = ref(false)
const suspiciousCount = ref(0)
const fps = ref(0)
const tfReady = ref(false)
const workstation = ref('A1')
const positionX = ref(5)
const positionY = ref(5)

let stream = null
let animationFrame = null
let lastFrameTime = performance.now()
let frameCount = 0
let lastSendTime = 0
let detectionWorker = null
let tf = null
const SEND_INTERVAL = 2000
const DETECTION_INTERVAL = 100

const detectionStatus = computed(() => 
  isSuspicious.value ? 'suspicious' : 'normal'
)

const loadTensorFlow = async () => {
  if (tfReady.value || modelLoading.value) return
  
  modelLoading.value = true
  try {
    await new Promise(resolve => setTimeout(resolve, 100))
    
    if ('requestIdleCallback' in window) {
      await new Promise(resolve => requestIdleCallback(resolve))
    }
    
    tf = await import('@tensorflow/tfjs')
    await tf.setBackend('webgl')
    await tf.ready()
    
    tfReady.value = true
    console.log('TensorFlow.js 已就绪, 后端:', tf.getBackend())
  } catch (error) {
    console.error('加载TensorFlow.js失败:', error)
  } finally {
    modelLoading.value = false
  }
}

const preprocessImage = (video) => {
  if (!tf) return null
  
  return tf.tidy(() => {
    const img = tf.browser.fromPixels(video)
    const resized = tf.image.resizeBilinear(img, [224, 224])
    const normalized = resized.toFloat().div(tf.scalar(255))
    const batched = normalized.expandDims(0)
    return batched
  })
}

const detectAnomaly = (video) => {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  ctx.drawImage(video, 0, 0)
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  
  let variance = 0
  let mean = 0
  const pixelCount = data.length / 4
  
  for (let i = 0; i < data.length; i += 4) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3
    mean += brightness
  }
  mean /= pixelCount
  
  for (let i = 0; i < data.length; i += 4) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3
    variance += Math.pow(brightness - mean, 2)
  }
  variance /= pixelCount
  
  const stdDev = Math.sqrt(variance)
  return stdDev > 60
}

const drawDetection = (video, hasAnomaly) => {
  const canvas = canvasRef.value
  if (!canvas) return
  
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  
  if (hasAnomaly) {
    ctx.strokeStyle = '#f56c6c'
    ctx.lineWidth = 4
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20)
    
    ctx.fillStyle = 'rgba(245, 108, 108, 0.2)'
    ctx.fillRect(10, 10, canvas.width - 20, canvas.height - 20)
    
    ctx.font = 'bold 24px Arial'
    ctx.fillStyle = '#f56c6c'
    ctx.fillText('⚠ 疑似缺陷', 20, 50)
  }
}

const detectionLoop = () => {
  if (!isRunning.value || !videoRef.value) return
  
  const video = videoRef.value
  if (video.readyState === 4) {
    const now = performance.now()
    
    if (now - lastFrameTime >= DETECTION_INTERVAL) {
      const hasAnomaly = detectAnomaly(video)
      drawDetection(video, hasAnomaly)
      
      if (hasAnomaly) {
        isSuspicious.value = true
        if (now - lastSendTime > SEND_INTERVAL) {
          lastSendTime = now
          suspiciousCount.value++
          captureAndSend()
        }
      } else {
        isSuspicious.value = false
      }
    }
  }
  
  frameCount++
  const now = performance.now()
  if (now - lastFrameTime >= 1000) {
    fps.value = frameCount
    frameCount = 0
    lastFrameTime = now
  }
  
  animationFrame = requestAnimationFrame(detectionLoop)
}

const toggleCamera = async () => {
  if (isRunning.value) {
    stopCamera()
  } else {
    await startCamera()
  }
}

const startCamera = async () => {
  loading.value = true
  try {
    if (!tfReady.value) {
      await loadTensorFlow()
    }
    
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'environment' }
    })
    
    if (videoRef.value) {
      videoRef.value.srcObject = stream
      await videoRef.value.play()
    }
    
    isRunning.value = true
    emit('camera-status', true)
    detectionLoop()
  } catch (error) {
    console.error('启动摄像头失败:', error)
  } finally {
    loading.value = false
  }
}

const stopCamera = () => {
  if (stream) {
    stream.getTracks().forEach(track => track.stop())
    stream = null
  }
  
  if (animationFrame) {
    cancelAnimationFrame(animationFrame)
    animationFrame = null
  }
  
  if (videoRef.value) {
    videoRef.value.srcObject = null
  }
  
  isRunning.value = false
  isSuspicious.value = false
  fps.value = 0
  emit('camera-status', false)
}

const captureAndSend = async () => {
  if (!videoRef.value) return
  
  try {
    const canvas = document.createElement('canvas')
    canvas.width = videoRef.value.videoWidth
    canvas.height = videoRef.value.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(videoRef.value, 0, 0)
    
    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.8)
    })
    
    emit('suspicious-detected', blob, {
      workstation: workstation.value,
      position_x: positionX.value,
      position_y: positionY.value
    })
  } catch (error) {
    console.error('捕获图片失败:', error)
  }
}

onMounted(() => {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => loadTensorFlow())
  } else {
    setTimeout(loadTensorFlow, 500)
  }
})

onUnmounted(() => {
  stopCamera()
  if (tf) {
    tf.disposeVariables()
  }
})
</script>

<style scoped>
.camera-card {
  height: 100%;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.controls {
  display: flex;
  gap: 10px;
}

.video-container {
  position: relative;
  width: 100%;
  min-height: 400px;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
}

.video-feed {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.detection-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.placeholder {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: #999;
}

.placeholder p {
  margin-top: 15px;
  font-size: 16px;
}

.alert-overlay {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  width: 80%;
  z-index: 10;
}

.detection-stats {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 20px 0;
  margin-top: 15px;
  border-top: 1px solid #ebeef5;
}
</style>
