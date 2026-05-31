<template>
  <div class="renderer" :style="pageSchema.style">
    <div class="render-header" v-if="showHeader">
      <el-button @click="goBack" icon="ArrowLeft">返回编辑器</el-button>
      <h2 style="margin: 0; flex: 1; text-align: center">页面预览</h2>
      <div style="width: 100px"></div>
    </div>
    <div class="render-content">
      <div 
        v-for="item in pageSchema.components" 
        :key="item.id" 
        class="render-item"
        :style="getItemStyle(item)"
      >
        <render-component :item="item" :data-source="componentDataSources[item.id]" />
      </div>
      <div v-if="!pageSchema.components.length" class="empty-page">
        <el-empty description="页面暂无内容，请在编辑器中添加组件" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import request from './utils/request'
import RenderComponent from './components/RenderComponent.vue'

const pageSchema = ref({ components: [], style: {} })
const showHeader = ref(true)
const componentDataSources = ref({})

const getPageId = () => {
  const urlParams = new URLSearchParams(window.location.search)
  return urlParams.get('pageId') || ''
}

const loadPage = async () => {
  const pageId = getPageId()
  if (!pageId) return
  
  try {
    const res = await request.get(`/render/page/${pageId}`)
    if (res.success) {
      pageSchema.value = res.data
    }
  } catch (error) {
    console.error('加载页面失败:', error)
  }
}

const loadComponentData = async (component) => {
  if (!component) return
  
  if (component.dataSourceType === 'api' && component.apiUrl) {
    try {
      let res
      if (component.apiMethod === 'GET') {
        res = await fetch(component.apiUrl)
      } else {
        res = await fetch(component.apiUrl, { method: 'POST' })
      }
      
      const data = await res.json()
      let resultData = data
      
      if (component.dataPath) {
        const paths = component.dataPath.split('.')
        for (const path of paths) {
          resultData = resultData?.[path]
        }
      }
      
      componentDataSources.value[component.id] = resultData
    } catch (error) {
      console.error('加载组件数据失败:', error)
      componentDataSources.value[component.id] = null
    }
  } else if (component.dataSourceType === 'static' && component.staticData) {
    try {
      componentDataSources.value[component.id] = JSON.parse(component.staticData)
    } catch (e) {
      componentDataSources.value[component.id] = component.staticData
    }
  } else {
    componentDataSources.value[component.id] = component.dataSource || null
  }
}

watch(() => pageSchema.value.components, (newComponents) => {
  newComponents.forEach(comp => {
    loadComponentData(comp)
  })
}, { deep: true, immediate: true })

const getItemStyle = (item) => {
  const baseStyle = {
    marginBottom: '15px'
  }
  return { ...baseStyle, ...item.style }
}

const goBack = () => {
  window.history.back()
}

onMounted(() => {
  const urlParams = new URLSearchParams(window.location.search)
  showHeader.value = urlParams.get('preview') !== 'false'
  loadPage()
})
</script>

<style scoped>
.renderer {
  min-height: 100vh;
  background: white;
}

.render-header {
  height: 60px;
  background: #409eff;
  color: white;
  display: flex;
  align-items: center;
  padding: 0 20px;
}

.render-content {
  padding: 30px;
  max-width: 1200px;
  margin: 0 auto;
}

.render-item {
  box-sizing: border-box;
}

.empty-page {
  padding: 100px 20px;
  text-align: center;
}
</style>