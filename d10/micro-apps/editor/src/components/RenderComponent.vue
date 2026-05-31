<template>
  <div class="render-component">
    <template v-if="item.type === 'Button'">
      <el-button :type="item.props.type">{{ item.props.text }}</el-button>
    </template>
    
    <template v-else-if="item.type === 'Input'">
      <el-input :placeholder="item.props.placeholder" style="width: 100%" />
    </template>
    
    <template v-else-if="item.type === 'Text'">
      <span v-if="typeof item.props.content === 'string'">{{ item.props.content }}</span>
      <span v-else>文本组件</span>
    </template>
    
    <template v-else-if="item.type === 'Image'">
      <img :src="item.props.src" :alt="item.props.alt" style="max-width: 100%; height: auto" />
    </template>
    
    <template v-else-if="item.type === 'Card'">
      <el-card :header="item.props.title">
        <p>卡片内容区域</p>
      </el-card>
    </template>
    
    <template v-else-if="item.type === 'Container'">
      <div style="min-height: 60px; display: flex; align-items: center; justify-content: center; color: #999; background: #fafafa; border: 1px dashed #ddd">
        容器
      </div>
    </template>
    
    <template v-else-if="item.type === 'Select'">
      <el-select style="width: 200px">
        <el-option v-for="opt in getSelectOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
      </el-select>
    </template>
    
    <template v-else-if="item.type === 'Table'">
      <el-table :data="getTableData" style="width: 100%" border>
        <el-table-column v-for="col in item.props.columns" :key="col.prop" :prop="col.prop" :label="col.label" />
      </el-table>
    </template>
    
    <template v-else>
      <span style="color: #999">未知组件: {{ item.type }}</span>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps(['item', 'dataSource'])

const getSelectOptions = computed(() => {
  if (props.dataSource && Array.isArray(props.dataSource)) {
    return props.dataSource
  }
  return props.item.props.options || []
})

const getTableData = computed(() => {
  if (props.dataSource && Array.isArray(props.dataSource)) {
    return props.dataSource
  }
  try {
    if (props.item.staticData) {
      const parsed = JSON.parse(props.item.staticData)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (e) {}
  return props.item.props.data || []
})
</script>

<style scoped>
.render-component {
  width: 100%;
}
</style>