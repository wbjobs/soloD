<template>
  <el-card class="heatmap-card">
    <template #header>
      <div class="card-header">
        <span>缺陷分布热力图</span>
        <div class="controls">
          <el-select v-model="selectedDays" @change="loadData" size="small" style="width: 120px;">
            <el-option label="近1天" :value="1" />
            <el-option label="近3天" :value="3" />
            <el-option label="近7天" :value="7" />
            <el-option label="近30天" :value="30" />
          </el-select>
          <el-select v-model="selectedType" @change="loadData" size="small" style="width: 140px; margin-left: 10px;">
            <el-option label="全部类型" :value="null" />
            <el-option 
              v-for="type in defectTypes" 
              :key="type.type" 
              :label="`${type.type} (${type.count})`" 
              :value="type.type" 
            />
          </el-select>
          <el-button type="primary" size="small" @click="generateTestData" style="margin-left: 10px;">
            生成测试数据
          </el-button>
          <el-button type="success" size="small" @click="loadData" style="margin-left: 5px;">
            刷新
          </el-button>
        </div>
      </div>
    </template>

    <el-row :gutter="20">
      <el-col :span="18">
        <div ref="chartRef" class="chart-container"></div>
      </el-col>
      <el-col :span="6">
        <div class="stats-panel">
          <h4>统计概览</h4>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="总缺陷数">
              <span class="stat-value">{{ totalDefects }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="时间范围">
              近{{ selectedDays }}天
            </el-descriptions-item>
            <el-descriptions-item label="热点区域数">
              {{ heatmapData.length }}
            </el-descriptions-item>
          </el-descriptions>

          <h4 style="margin-top: 20px;">工位缺陷排行</h4>
          <el-table :data="workstations" size="small" style="width: 100%;">
            <el-table-column prop="workstation" label="工位" width="80" />
            <el-table-column prop="count" label="缺陷数" width="80" />
            <el-table-column label="占比">
              <template #default="{ row }">
                {{ ((row.count / totalDefects) * 100).toFixed(1) }}%
              </template>
            </el-table-column>
          </el-table>

          <h4 style="margin-top: 20px;">缺陷类型分布</h4>
          <div class="type-legend">
            <div 
              v-for="type in defectTypes" 
              :key="type.type" 
              class="type-item"
              :class="{ active: selectedType === type.type }"
              @click="selectedType = selectedType === type.type ? null : type.type; loadData()"
            >
              <span class="type-color" :style="{ background: getTypeColor(type.type) }"></span>
              <span class="type-name">{{ type.type }}</span>
              <span class="type-count">{{ type.count }}</span>
            </div>
          </div>
        </div>
      </el-col>
    </el-row>
  </el-card>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import { ElMessage } from 'element-plus'
import api from '../utils/api'

const chartRef = ref(null)
let chartInstance = null

const selectedDays = ref(7)
const selectedType = ref(null)
const heatmapData = ref([])
const defectTypes = ref([])
const workstations = ref([])

const totalDefects = computed(() => {
  return defectTypes.value.reduce((sum, item) => sum + item.count, 0)
})

const typeColors = {
  'scratch': '#ee6666',
  'crack': '#73c0de',
  'dent': '#fac858',
  'stain': '#91cc75',
  'deformation': '#fc8452',
  'missing_part': '#9a60b4'
}

const getTypeColor = (type) => {
  return typeColors[type] || '#5470c6'
}

const loadData = async () => {
  try {
    const params = { days: selectedDays.value }
    if (selectedType.value) {
      params.defect_type = selectedType.value
    }
    
    const response = await api.get('/heatmap', { params })
    const data = response.data
    
    heatmapData.value = data.heatmap
    defectTypes.value = data.defect_types
    workstations.value = data.workstations
    
    await nextTick()
    renderChart()
  } catch (error) {
    console.error('加载热力图数据失败:', error)
    ElMessage.error('加载热力图数据失败')
  }
}

const generateTestData = async () => {
  try {
    await api.post('/generate-test-data?count=100')
    ElMessage.success('测试数据生成成功')
    await loadData()
  } catch (error) {
    console.error('生成测试数据失败:', error)
    ElMessage.error('生成测试数据失败')
  }
}

const renderChart = () => {
  if (!chartRef.value) return
  
  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value)
  }
  
  const gridSize = 10
  const data = []
  
  for (let x = 0; x <= gridSize; x++) {
    for (let y = 0; y <= gridSize; y++) {
      data.push([x, y, 0])
    }
  }
  
  heatmapData.value.forEach(item => {
    const x = Math.round(item.x)
    const y = Math.round(item.y)
    const existing = data.find(d => d[0] === x && d[1] === y)
    if (existing) {
      existing[2] += item.count
    } else {
      data.push([x, y, item.count])
    }
  })
  
  const xAxisData = Array.from({ length: gridSize + 1 }, (_, i) => `X${i}`)
  const yAxisData = Array.from({ length: gridSize + 1 }, (_, i) => `Y${i}`)
  
  const visualMax = Math.max(...data.map(d => d[2]), 1)
  
  const option = {
    tooltip: {
      position: 'top',
      formatter: function(params) {
        if (params.data && params.data[2] > 0) {
          return `位置: (${params.data[0]}, ${params.data[1]})<br/>缺陷数: ${params.data[2]}`
        }
        return `位置: (${params.data[0]}, ${params.data[1]})<br/>缺陷数: 0`
      }
    },
    grid: {
      left: '8%',
      right: '10%',
      top: '10%',
      bottom: '15%'
    },
    xAxis: {
      type: 'category',
      data: xAxisData,
      splitArea: { show: true },
      axisLabel: { fontSize: 10 }
    },
    yAxis: {
      type: 'category',
      data: yAxisData,
      splitArea: { show: true },
      axisLabel: { fontSize: 10 }
    },
    visualMap: {
      min: 0,
      max: visualMax,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: '0%',
      inRange: {
        color: ['#e0ffff', '#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f']
      }
    },
    series: [{
      name: '缺陷热力图',
      type: 'heatmap',
      data: data,
      label: {
        show: true,
        fontSize: 10,
        formatter: function(params) {
          return params.data[2] > 0 ? params.data[2] : ''
        }
      },
      emphasis: {
        itemStyle: {
          borderColor: '#333',
          borderWidth: 2
        }
      }
    }],
    title: {
      text: '车间零件缺陷分布',
      subtext: '红点表示缺陷高发区域',
      left: 'center',
      textStyle: { fontSize: 16 }
    }
  }
  
  chartInstance.setOption(option, true)
}

const handleResize = () => {
  chartInstance?.resize()
}

onMounted(async () => {
  await loadData()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chartInstance?.dispose()
})
</script>

<style scoped>
.heatmap-card {
  height: 100%;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.controls {
  display: flex;
  align-items: center;
}

.chart-container {
  width: 100%;
  height: 500px;
}

.stats-panel {
  padding: 10px;
}

.stats-panel h4 {
  margin: 0 0 10px 0;
  color: #606266;
  font-size: 14px;
  font-weight: 600;
}

.stat-value {
  font-size: 20px;
  font-weight: bold;
  color: #f56c6c;
}

.type-legend {
  max-height: 250px;
  overflow-y: auto;
}

.type-item {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  margin-bottom: 5px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s;
  border: 1px solid transparent;
}

.type-item:hover {
  background: #f5f7fa;
}

.type-item.active {
  background: #ecf5ff;
  border-color: #409eff;
}

.type-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  margin-right: 8px;
}

.type-name {
  flex: 1;
  font-size: 13px;
  color: #606266;
}

.type-count {
  font-size: 13px;
  font-weight: bold;
  color: #303133;
}
</style>
