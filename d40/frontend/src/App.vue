<template>
  <div class="app-container">
    <header class="app-header">
      <h1>💰 财务票据识别系统</h1>
      <p class="subtitle">智能发票OCR识别 - 本地优先，云端增强</p>
    </header>

    <div class="upload-section">
      <div 
        class="upload-area"
        :class="{ 'drag-over': isDragOver }"
        @dragover.prevent="isDragOver = true"
        @dragleave="isDragOver = false"
        @drop.prevent="handleDrop"
        @click="triggerFileInput"
      >
        <input 
          ref="fileInput"
          type="file"
          accept="image/*"
          @change="handleFileSelect"
          hidden
        />
        <div class="upload-icon">📄</div>
        <p class="upload-text">点击或拖拽图片到此处</p>
        <p class="upload-hint">支持 JPG、PNG、BMP 格式</p>
      </div>
    </div>

    <div v-if="imagePreview" class="preview-section">
      <div class="preview-card">
        <h3>图片预览</h3>
        <img :src="imagePreview" alt="预览" class="preview-image" />
      </div>
    </div>

    <div v-if="isProcessing" class="processing-section">
      <div class="loading-spinner"></div>
      <p>{{ processingMessage }}</p>
    </div>

    <div v-if="ocrResults.length > 0" class="results-section">
      <div class="results-header">
        <h2>识别结果</h2>
        <div class="engine-badge" :class="resultEngine">
          {{ resultEngine === 'tesseract' ? '🔤 Tesseract.js (本地)' : '🚀 PaddleOCR (云端)' }}
        </div>
      </div>

      <div v-if="averageConfidence > 0" class="confidence-bar">
        <span class="confidence-label">平均置信度:</span>
        <div class="confidence-track">
          <div 
            class="confidence-fill"
            :style="{ width: averageConfidence + '%' }"
            :class="confidenceClass"
          ></div>
        </div>
        <span class="confidence-value">{{ averageConfidence.toFixed(1) }}%</span>
      </div>

      <div class="results-table">
        <table>
          <thead>
            <tr>
              <th>序号</th>
              <th>识别文本</th>
              <th>置信度</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(result, index) in ocrResults" :key="index">
              <td>{{ index + 1 }}</td>
              <td>{{ result.text }}</td>
              <td :class="getConfidenceClass(result.confidence)">
                {{ (result.confidence * 100).toFixed(1) }}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="action-buttons">
        <button @click="copyResults" class="btn btn-primary">📋 复制结果</button>
        <button @click="exportExcel" class="btn btn-success">📊 导出Excel</button>
        <button @click="exportResults" class="btn btn-secondary">💾 导出JSON</button>
        <button @click="resetAll" class="btn btn-danger">🔄 重新上传</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { createWorker } from 'tesseract.js'
import axios from 'axios'
import * as XLSX from 'xlsx'

const fileInput = ref(null)
const isDragOver = ref(false)
const imagePreview = ref('')
const isProcessing = ref(false)
const processingMessage = ref('')
const ocrResults = ref([])
const resultEngine = ref('')
const currentFile = ref(null)
const tesseractWorker = ref(null)

const CONFIDENCE_THRESHOLD = 0.8

const averageConfidence = computed(() => {
  if (ocrResults.value.length === 0) return 0
  const total = ocrResults.value.reduce((sum, r) => sum + (r.confidence || 0), 0)
  return (total / ocrResults.value.length) * 100
})

const confidenceClass = computed(() => {
  const avg = averageConfidence.value
  if (avg >= 80) return 'high'
  if (avg >= 60) return 'medium'
  return 'low'
})

const getConfidenceClass = (confidence) => {
  const conf = confidence || 0
  if (conf >= 0.8) return 'high'
  if (conf >= 0.6) return 'medium'
  return 'low'
}

const normalizeOCRResult = (result, source) => {
  if (!result || !Array.isArray(result)) {
    return []
  }
  
  return result.map(item => ({
    text: item.text || '',
    confidence: parseFloat(item.confidence) || 0,
    bbox: item.bbox || [[0, 0], [0, 0], [0, 0], [0, 0]],
    source: source
  }))
}

const initTesseractWorker = async () => {
  try {
    processingMessage.value = '正在初始化Tesseract.js引擎...'
    
    const worker = await createWorker({
      logger: (m) => {
        if (m.status === 'loading tesseract core') {
          processingMessage.value = '正在加载OCR核心...'
        } else if (m.status === 'initializing tesseract') {
          processingMessage.value = '正在初始化OCR引擎...'
        } else if (m.status === 'loading language traineddata') {
          processingMessage.value = `正在加载语言包: ${m.progress * 100 | 0}%`
        } else if (m.status === 'initializing api') {
          processingMessage.value = '正在初始化API...'
        }
      }
    })
    
    await worker.loadLanguage('chi_sim+eng')
    await worker.initialize('chi_sim+eng')
    
    tesseractWorker.value = worker
    processingMessage.value = ''
    return true
  } catch (error) {
    console.error('Tesseract初始化失败:', error)
    processingMessage.value = '本地OCR引擎初始化失败，将使用云端识别'
    return false
  }
}

onMounted(async () => {
  await initTesseractWorker()
})

const triggerFileInput = () => {
  fileInput.value.click()
}

const handleFileSelect = (event) => {
  const file = event.target.files[0]
  if (file) {
    processFile(file)
  }
}

const handleDrop = (event) => {
  isDragOver.value = false
  const file = event.dataTransfer.files[0]
  if (file && file.type.startsWith('image/')) {
    processFile(file)
  }
}

const processFile = (file) => {
  currentFile.value = file
  const reader = new FileReader()
  reader.onload = (e) => {
    imagePreview.value = e.target.result
    startOCR(file)
  }
  reader.readAsDataURL(file)
}

const startOCR = async (file) => {
  isProcessing.value = true
  ocrResults.value = []
  
  try {
    let localSuccess = false
    let localResult = []
    
    if (tesseractWorker.value) {
      try {
        processingMessage.value = '正在本地识别...'
        localResult = await runTesseractOCR(file)
        localSuccess = true
      } catch (tesseractError) {
        console.warn('Tesseract识别失败，尝试重新初始化:', tesseractError)
        try {
          await initTesseractWorker()
          if (tesseractWorker.value) {
            localResult = await runTesseractOCR(file)
            localSuccess = true
          }
        } catch (retryError) {
          console.error('重试Tesseract也失败:', retryError)
        }
      }
    }
    
    if (localSuccess && localResult.length > 0) {
      const avgConfidence = localResult.reduce((sum, r) => sum + (r.confidence || 0), 0) / localResult.length
      
      if (avgConfidence >= CONFIDENCE_THRESHOLD) {
        ocrResults.value = normalizeOCRResult(localResult, 'tesseract')
        resultEngine.value = 'tesseract'
        processingMessage.value = ''
        isProcessing.value = false
        return
      } else {
        processingMessage.value = `本地识别置信度较低(${ (avgConfidence * 100).toFixed(1) }%), 正在上传至云端识别...`
      }
    } else {
      processingMessage.value = '本地识别不可用，正在使用云端识别...'
    }
    
    const cloudResult = await runPaddleOCREndpoint(file)
    ocrResults.value = normalizeOCRResult(cloudResult, 'paddleocr')
    resultEngine.value = 'paddleocr'
    
  } catch (error) {
    console.error('OCR识别失败:', error)
    alert('识别失败，请检查网络连接或图片格式')
  } finally {
    isProcessing.value = false
    processingMessage.value = ''
  }
}

const runTesseractOCR = async (file) => {
  if (!tesseractWorker.value) {
    throw new Error('Tesseract worker not initialized')
  }
  
  const result = await tesseractWorker.value.recognize(file)
  
  const words = result.data.words.map(word => ({
    text: word.text || '',
    confidence: word.confidence / 100,
    bbox: word.bbox ? [
      [word.bbox.x0, word.bbox.y0],
      [word.bbox.x1, word.bbox.y0],
      [word.bbox.x1, word.bbox.y1],
      [word.bbox.x0, word.bbox.y1]
    ] : [[0, 0], [0, 0], [0, 0], [0, 0]]
  }))
  
  return words
}

const runPaddleOCREndpoint = async (file) => {
  const formData = new FormData()
  formData.append('file', file)
  
  const response = await axios.post('/api/ocr', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000
  })
  
  if (response.data && response.data.success) {
    return response.data.results || []
  }
  throw new Error('云端识别失败')
}

const copyResults = () => {
  const text = ocrResults.value.map(r => r.text).join('\n')
  navigator.clipboard.writeText(text).then(() => {
    alert('已复制到剪贴板！')
  })
}

const exportResults = () => {
  const data = {
    engine: resultEngine.value,
    averageConfidence: averageConfidence.value,
    results: ocrResults.value
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'ocr-results.json'
  a.click()
  URL.revokeObjectURL(url)
}

const exportExcel = () => {
  if (ocrResults.value.length === 0) {
    alert('没有可导出的数据')
    return
  }

  try {
    const excelData = ocrResults.value.map((result, index) => ({
      '序号': index + 1,
      '识别文本': result.text,
      '置信度': `${(result.confidence * 100).toFixed(1)}%`,
      '置信度数值': result.confidence,
      '识别引擎': resultEngine.value === 'tesseract' ? 'Tesseract.js (本地)' : 'PaddleOCR (云端)',
      '识别时间': new Date().toLocaleString('zh-CN'),
      '文件名': currentFile.value ? currentFile.value.name : ''
    }))

    const ws = XLSX.utils.json_to_sheet(excelData)

    const colWidths = [
      { wch: 8 },
      { wch: 50 },
      { wch: 12 },
      { wch: 12 },
      { wch: 25 },
      { wch: 22 },
      { wch: 30 }
    ]
    ws['!cols'] = colWidths

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '票据识别结果')

    const summaryData = [
      { '统计项': '识别总条数', '数值': ocrResults.value.length },
      { '统计项': '平均置信度', '数值': `${averageConfidence.value.toFixed(1)}%` },
      { '统计项': '识别引擎', '数值': resultEngine.value === 'tesseract' ? 'Tesseract.js (本地)' : 'PaddleOCR (云端)' },
      { '统计项': '导出时间', '数值': new Date().toLocaleString('zh-CN') }
    ]
    const wsSummary = XLSX.utils.json_to_sheet(summaryData)
    wsSummary['!cols'] = [{ wch: 15 }, { wch: 50 }]
    XLSX.utils.book_append_sheet(wb, wsSummary, '识别统计')

    const fileName = `票据识别结果_${new Date().toISOString().slice(0, 10)}_${Date.now()}.xlsx`
    XLSX.writeFile(wb, fileName)

  } catch (error) {
    console.error('Excel导出失败:', error)
    alert('Excel导出失败，请重试')
  }
}

const resetAll = () => {
  imagePreview.value = ''
  ocrResults.value = []
  resultEngine.value = ''
  currentFile.value = null
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}
</script>

<style scoped>
.app-container {
  background: white;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.app-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 30px;
  text-align: center;
}

.app-header h1 {
  font-size: 28px;
  margin-bottom: 8px;
}

.subtitle {
  opacity: 0.9;
  font-size: 14px;
}

.upload-section {
  padding: 30px;
}

.upload-area {
  border: 3px dashed #ddd;
  border-radius: 12px;
  padding: 40px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  background: #fafafa;
}

.upload-area:hover,
.upload-area.drag-over {
  border-color: #667eea;
  background: #f0f4ff;
}

.upload-area.drag-over {
  transform: scale(1.02);
}

.upload-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.upload-text {
  font-size: 18px;
  color: #333;
  margin-bottom: 8px;
  font-weight: 500;
}

.upload-hint {
  color: #999;
  font-size: 14px;
}

.preview-section {
  padding: 0 30px 20px;
}

.preview-card {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 20px;
}

.preview-card h3 {
  color: #333;
  margin-bottom: 15px;
  font-size: 16px;
}

.preview-image {
  max-width: 100%;
  max-height: 400px;
  border-radius: 8px;
  display: block;
  margin: 0 auto;
}

.processing-section {
  padding: 40px 30px;
  text-align: center;
}

.loading-spinner {
  width: 50px;
  height: 50px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 20px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.processing-section p {
  color: #666;
  font-size: 16px;
}

.results-section {
  padding: 30px;
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 10px;
}

.results-header h2 {
  color: #333;
  font-size: 22px;
}

.engine-badge {
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
}

.engine-badge.tesseract {
  background: #e3f2fd;
  color: #1976d2;
}

.engine-badge.paddleocr {
  background: #e8f5e9;
  color: #388e3c;
}

.confidence-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
}

.confidence-label {
  font-weight: 500;
  color: #555;
  white-space: nowrap;
}

.confidence-track {
  flex: 1;
  height: 12px;
  background: #e0e0e0;
  border-radius: 6px;
  overflow: hidden;
}

.confidence-fill {
  height: 100%;
  transition: width 0.5s ease;
}

.confidence-fill.high { background: #4caf50; }
.confidence-fill.medium { background: #ff9800; }
.confidence-fill.low { background: #f44336; }

.confidence-value {
  font-weight: 600;
  min-width: 50px;
  text-align: right;
}

.results-table {
  overflow-x: auto;
  margin-bottom: 20px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
}

table {
  width: 100%;
  border-collapse: collapse;
}

thead {
  background: #667eea;
  color: white;
}

th, td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid #f0f0f0;
}

th {
  font-weight: 600;
}

tbody tr:hover {
  background: #f8f9fa;
}

tbody tr:last-child td {
  border-bottom: none;
}

td.high { color: #4caf50; font-weight: 600; }
td.medium { color: #ff9800; }
td.low { color: #f44336; }

.action-buttons {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-primary {
  background: #667eea;
  color: white;
}

.btn-primary:hover {
  background: #5568d3;
  transform: translateY(-2px);
}

.btn-secondary {
  background: #764ba2;
  color: white;
}

.btn-secondary:hover {
  background: #6a4190;
  transform: translateY(-2px);
}

.btn-danger {
  background: #f44336;
  color: white;
}

.btn-danger:hover {
  background: #d32f2f;
  transform: translateY(-2px);
}

.btn-success {
  background: #4caf50;
  color: white;
}

.btn-success:hover {
  background: #388e3c;
  transform: translateY(-2px);
}
</style>
