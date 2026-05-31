<template>
  <div class="app-container">
    <el-container>
      <el-header class="header">
        <h1>工业智能质检系统</h1>
        <div class="status-bar">
          <el-tag :type="backendConnected ? 'success' : 'danger'">
            后端: {{ backendConnected ? '已连接' : '未连接' }}
          </el-tag>
          <el-tag :type="cameraActive ? 'success' : 'info'">
            摄像头: {{ cameraActive ? '运行中' : '未启动' }}
          </el-tag>
        </div>
      </el-header>
      
      <el-main>
        <el-tabs v-model="activeTab" class="main-tabs">
          <el-tab-pane label="实时检测" name="detection">
            <el-row :gutter="20">
              <el-col :span="14">
                <CameraComponent 
                  ref="cameraRef"
                  @suspicious-detected="handleSuspicious"
                  @camera-status="handleCameraStatus"
                />
              </el-col>
              
              <el-col :span="10">
                <ResultPanel 
                  :inspections="inspections"
                  :loading="sendingImage"
                />
              </el-col>
            </el-row>
          </el-tab-pane>
          
          <el-tab-pane label="缺陷热力图" name="heatmap">
            <DefectHeatmap />
          </el-tab-pane>
        </el-tabs>
      </el-main>
    </el-container>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import CameraComponent from './components/CameraComponent.vue'
import ResultPanel from './components/ResultPanel.vue'
import DefectHeatmap from './components/DefectHeatmap.vue'
import { checkBackendHealth, sendInspection, getInspections } from './utils/api.js'

const activeTab = ref('detection')

const cameraRef = ref(null)
const backendConnected = ref(false)
const cameraActive = ref(false)
const sendingImage = ref(false)
const inspections = ref([])

const checkBackend = async () => {
  try {
    await checkBackendHealth()
    backendConnected.value = true
  } catch {
    backendConnected.value = false
  }
}

const handleCameraStatus = (status) => {
  cameraActive.value = status
}

const handleSuspicious = async (imageData, options = {}) => {
  if (!backendConnected.value) {
    ElMessage.warning('后端未连接，无法进行复核')
    return
  }
  
  sendingImage.value = true
  try {
    const result = await sendInspection(imageData, 'suspicious', options)
    ElMessage.success('复核完成')
    await loadInspections()
  } catch (error) {
    ElMessage.error('复核失败: ' + error.message)
  } finally {
    sendingImage.value = false
  }
}

const loadInspections = async () => {
  try {
    const data = await getInspections()
    inspections.value = data
  } catch (error) {
    console.error('加载记录失败:', error)
  }
}

onMounted(async () => {
  await checkBackend()
  await loadInspections()
  setInterval(checkBackend, 5000)
})
</script>

<style scoped>
.app-container {
  height: 100vh;
  background: #f5f7fa;
}

.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 30px;
  color: white;
}

.header h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 500;
}

.status-bar {
  display: flex;
  gap: 10px;
}

.el-main {
  padding: 20px;
}

.main-tabs {
  height: 100%;
}

.main-tabs :deep(.el-tabs__content) {
  height: calc(100% - 60px);
  overflow-y: auto;
}
</style>
