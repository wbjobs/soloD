<template>
  <el-card class="result-card">
    <template #header>
      <div class="card-header">
        <span>检测结果</span>
        <el-tag :type="loading ? 'warning' : 'info'" v-if="loading">处理中...</el-tag>
      </div>
    </template>
    
    <el-tabs v-model="activeTab">
      <el-tab-pane label="统计概览" name="stats">
        <el-row :gutter="20" class="stats-row">
          <el-col :span="12">
            <el-card class="stat-card">
              <el-statistic 
                title="总检测数" 
                :value="inspections.length"
                value-style="color: #409EFF"
              />
            </el-card>
          </el-col>
          <el-col :span="12">
            <el-card class="stat-card">
              <el-statistic 
                title="缺陷数" 
                :value="defectCount"
                value-style="color: #F56C6C"
              />
            </el-card>
          </el-col>
        </el-row>
        
        <el-row :gutter="20" class="stats-row" style="margin-top: 20px;">
          <el-col :span="12">
            <el-card class="stat-card">
              <el-statistic 
                title="正常数" 
                :value="normalCount"
                value-style="color: #67C23A"
              />
            </el-card>
          </el-col>
          <el-col :span="12">
            <el-card class="stat-card">
              <el-statistic 
                title="缺陷率" 
                :value="defectRate"
                suffix="%"
                :precision="2"
                value-style="color: #E6A23C"
              />
            </el-card>
          </el-col>
        </el-row>
        
        <div class="defect-types" v-if="defectTypes.size > 0">
          <h4>缺陷类型分布</h4>
          <div class="type-list">
            <el-tag 
              v-for="(count, type) in defectTypeMap" 
              :key="type"
              size="large"
              style="margin: 5px;"
            >
              {{ type || '未分类' }}: {{ count }}
            </el-tag>
          </div>
        </div>
      </el-tab-pane>
      
      <el-tab-pane label="历史记录" name="history">
        <el-table 
          :data="inspections" 
          style="width: 100%"
          max-height="500px"
          stripe
        >
          <el-table-column prop="id" label="ID" width="80" />
          <el-table-column label="图片" width="120">
            <template #default="{ row }">
              <el-image
                :src="`/uploads/${row.image_path}`"
                :preview-src-list="[`/uploads/${row.image_path}`]"
                fit="cover"
                style="width: 100px; height: 60px;"
              />
            </template>
          </el-table-column>
          <el-table-column prop="frontend_result" label="初检结果" width="100">
            <template #default="{ row }">
              <el-tag :type="getResultType(row.frontend_result)" size="small">
                {{ getResultText(row.frontend_result) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="backend_result" label="复核结果" width="100">
            <template #default="{ row }">
              <el-tag :type="getResultType(row.backend_result)" size="small">
                {{ getResultText(row.backend_result) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="defect_type" label="缺陷类型" width="120" />
          <el-table-column prop="confidence" label="置信度" width="100">
            <template #default="{ row }">
              {{ (row.confidence * 100).toFixed(1) }}%
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="时间" width="160">
            <template #default="{ row }">
              {{ formatTime(row.created_at) }}
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </el-card>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  inspections: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const activeTab = ref('stats')

const defectCount = computed(() => {
  return props.inspections.filter(item => item.backend_result === 'defective').length
})

const normalCount = computed(() => {
  return props.inspections.filter(item => item.backend_result === 'normal').length
})

const defectRate = computed(() => {
  if (props.inspections.length === 0) return 0
  return (defectCount.value / props.inspections.length) * 100
})

const defectTypes = computed(() => {
  const types = new Set()
  props.inspections.forEach(item => {
    if (item.defect_type) types.add(item.defect_type)
  })
  return types
})

const defectTypeMap = computed(() => {
  const map = {}
  props.inspections.forEach(item => {
    if (item.defect_type) {
      map[item.defect_type] = (map[item.defect_type] || 0) + 1
    }
  })
  return map
})

const getResultType = (result) => {
  switch (result) {
    case 'normal': return 'success'
    case 'defective': return 'danger'
    case 'suspicious': return 'warning'
    default: return 'info'
  }
}

const getResultText = (result) => {
  switch (result) {
    case 'normal': return '正常'
    case 'defective': return '缺陷'
    case 'suspicious': return '疑似'
    default: return result
  }
}

const formatTime = (timeStr) => {
  if (!timeStr) return '-'
  const date = new Date(timeStr)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}
</script>

<style scoped>
.result-card {
  height: 100%;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stats-row {
  margin-bottom: 0;
}

.stat-card {
  text-align: center;
}

.stat-card :deep(.el-card__body) {
  padding: 20px;
}

.defect-types {
  margin-top: 30px;
}

.defect-types h4 {
  margin: 0 0 15px 0;
  color: #606266;
  font-size: 16px;
  font-weight: 500;
}

.type-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
