<template>
  <div class="components-page">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px">
      <h2>组件库管理</h2>
      <div>
        <el-button @click="showUploadDialog = true">
          <el-icon><Upload /></el-icon>
          上传自定义组件
        </el-button>
        <el-button type="primary" @click="showCreateDialog = true" style="margin-left: 10px">
          新建组件
        </el-button>
      </div>
    </div>

    <el-tabs v-model="activeTab">
      <el-tab-pane label="系统组件" name="system">
        <el-tabs v-model="activeCategory" style="margin-top: 10px">
          <el-tab-pane label="基础组件" name="basic"></el-tab-pane>
          <el-tab-pane label="表单组件" name="form"></el-tab-pane>
          <el-tab-pane label="展示组件" name="display"></el-tab-pane>
        </el-tabs>
        
        <el-row :gutter="20" style="margin-top: 20px">
          <el-col :span="6" v-for="component in filteredSystemComponents" :key="component._id">
            <el-card shadow="hover" style="margin-bottom: 20px">
              <div style="height: 100px; background: #f5f7fa; display: flex; align-items: center; justify-content: center; font-size: 32px; border-radius: 4px">
                {{ component.icon || '📦' }}
              </div>
              <div style="padding: 15px 0">
                <h3>{{ component.name }}</h3>
                <p style="color: #999; font-size: 14px; margin: 5px 0">v{{ component.version }}</p>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px">
                  <el-tag :type="component.status === 'published' ? 'success' : 'info'" size="small">
                    {{ component.status === 'published' ? '已发布' : '草稿' }}
                  </el-tag>
                  <el-button size="small" @click="publishComponent(component)" v-if="component.status !== 'published'">
                    发布
                  </el-button>
                </div>
              </div>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>
      
      <el-tab-pane label="自定义组件" name="custom">
        <div style="display: flex; gap: 15px; margin: 15px 0">
          <el-select v-model="customComponentStatus" placeholder="状态筛选" style="width: 150px" clearable>
            <el-option label="全部" value="" />
            <el-option label="草稿" value="draft" />
            <el-option label="已发布" value="published" />
            <el-option label="已废弃" value="deprecated" />
          </el-select>
        </div>
        
        <el-row :gutter="20">
          <el-col :span="6" v-for="component in filteredCustomComponents" :key="component._id">
            <el-card shadow="hover" style="margin-bottom: 20px">
              <template #header>
                <div style="display: flex; justify-content: space-between; align-items: center">
                  <span>{{ component.name }}</span>
                  <el-dropdown @command="(cmd) => handleComponentAction(cmd, component)">
                    <el-button size="small" text>
                      <el-icon><MoreFilled /></el-icon>
                    </el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="edit">编辑</el-dropdown-item>
                        <el-dropdown-item command="export" v-if="component.status === 'published'">导出</el-dropdown-item>
                        <el-dropdown-item command="publish" v-if="component.status !== 'published'">发布</el-dropdown-item>
                        <el-dropdown-item command="delete" style="color: #f56c6c">删除</el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </template>
              
              <div style="height: 80px; background: #f5f7fa; display: flex; align-items: center; justify-content: center; font-size: 32px; border-radius: 4px">
                {{ component.icon || '🔧' }}
              </div>
              
              <div style="padding: 15px 0">
                <p style="color: #666; font-size: 13px; margin: 5px 0">{{ component.description || '暂无描述' }}</p>
                <p style="color: #999; font-size: 12px; margin: 5px 0">类型: {{ component.type }}</p>
                <p style="color: #999; font-size: 12px; margin: 5px 0">作者: {{ component.author || '未知' }}</p>
                <p style="color: #999; font-size: 12px; margin: 5px 0">v{{ component.version }}</p>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px">
                  <el-tag :type="getStatusType(component.status)" size="small">
                    {{ getStatusText(component.status) }}
                  </el-tag>
                </div>
              </div>
            </el-card>
          </el-col>
        </el-row>
        
        <el-empty v-if="filteredCustomComponents.length === 0" description="暂无自定义组件，点击上传按钮添加" />
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="showCreateDialog" title="新建组件" width="600px">
      <el-form :model="newComponent" label-width="100px">
        <el-form-item label="组件名称">
          <el-input v-model="newComponent.name" placeholder="请输入组件名称" />
        </el-form-item>
        <el-form-item label="组件类型">
          <el-input v-model="newComponent.type" placeholder="如: MyButton, CustomInput" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="newComponent.category" placeholder="请选择分类">
            <el-option label="基础组件" value="basic" />
            <el-option label="表单组件" value="form" />
            <el-option label="展示组件" value="display" />
          </el-select>
        </el-form-item>
        <el-form-item label="图标">
          <el-input v-model="newComponent.icon" placeholder="emoji或图标名称" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="newComponent.description" type="textarea" :rows="3" placeholder="组件描述" />
        </el-form-item>
        <el-form-item label="作者">
          <el-input v-model="newComponent.author" placeholder="作者名称" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="createComponent">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showUploadDialog" title="上传自定义组件" width="600px">
      <el-upload
        drag
        action="/api/custom-components/upload"
        :on-success="handleUploadSuccess"
        :on-error="handleUploadError"
        accept=".json"
        :show-file-list="false"
      >
        <el-icon class="el-icon--upload"><upload-filled /></el-icon>
        <div class="el-upload__text">
          拖拽文件到此处或 <em>点击上传</em>
        </div>
        <template #tip>
          <div class="el-upload__tip">
            仅支持 JSON 格式的组件文件
          </div>
        </template>
      </el-upload>
      
      <div style="margin-top: 20px; padding: 15px; background: #f5f7fa; border-radius: 4px">
        <h4 style="margin: 0 0 10px 0">组件文件格式示例：</h4>
        <pre style="margin: 0; font-size: 12px; white-space: pre-wrap">{{ componentTemplate }}</pre>
      </div>
      
      <template #footer>
        <el-button @click="showUploadDialog = false">关闭</el-button>
        <el-button type="primary" @click="downloadTemplate">下载模板</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showEditDialog" title="编辑组件" width="600px">
      <el-form :model="editComponent" label-width="100px">
        <el-form-item label="组件名称">
          <el-input v-model="editComponent.name" />
        </el-form-item>
        <el-form-item label="图标">
          <el-input v-model="editComponent.icon" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="editComponent.description" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="版本">
          <el-input v-model="editComponent.version" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="editComponent.status">
            <el-option label="草稿" value="draft" />
            <el-option label="已发布" value="published" />
            <el-option label="已废弃" value="deprecated" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" @click="saveComponent">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload, MoreFilled, UploadFilled } from '@element-plus/icons-vue'
import request from '../utils/request'

const systemComponents = ref([])
const customComponents = ref([])
const activeTab = ref('system')
const activeCategory = ref('basic')
const customComponentStatus = ref('')
const showCreateDialog = ref(false)
const showUploadDialog = ref(false)
const showEditDialog = ref(false)
const newComponent = ref({ 
  name: '', 
  type: '', 
  category: 'custom', 
  icon: '', 
  description: '',
  author: '',
  schema: { props: {}, style: {}, events: [] },
  sourceCode: {}
})
const editComponent = ref({})

const componentTemplate = JSON.stringify({
  name: "我的自定义组件",
  type: "MyCustomComponent",
  category: "custom",
  icon: "🔧",
  description: "这是一个自定义组件",
  version: "1.0.0",
  author: "开发者",
  schema: {
    props: { text: "默认文本" },
    style: { color: "#333" },
    events: ["click"]
  },
  sourceCode: {
    template: "<div>{{ text }}</div>",
    script: "export default { props: ['text'] }"
  }
}, null, 2)

const filteredSystemComponents = computed(() => {
  return systemComponents.value.filter(c => c.category === activeCategory.value)
})

const filteredCustomComponents = computed(() => {
  if (!customComponentStatus.value) {
    return customComponents.value
  }
  return customComponents.value.filter(c => c.status === customComponentStatus.value)
})

const getStatusType = (status) => {
  const types = { draft: 'info', published: 'success', deprecated: 'danger' }
  return types[status] || 'info'
}

const getStatusText = (status) => {
  const texts = { draft: '草稿', published: '已发布', deprecated: '已废弃' }
  return texts[status] || status
}

const loadSystemComponents = async () => {
  const res = await request.get('/components')
  if (res.success) {
    systemComponents.value = res.data
  }
}

const loadCustomComponents = async () => {
  const res = await request.get('/custom-components?isSystem=false')
  if (res.success) {
    customComponents.value = res.data
  }
}

const createComponent = async () => {
  if (!newComponent.value.name || !newComponent.value.type) {
    ElMessage.warning('请填写完整信息')
    return
  }
  
  const res = await request.post('/custom-components', newComponent.value)
  if (res.success) {
    ElMessage.success('创建成功')
    showCreateDialog.value = false
    newComponent.value = { 
      name: '', 
      type: '', 
      category: 'custom', 
      icon: '', 
      description: '',
      author: '',
      schema: { props: {}, style: {}, events: [] },
      sourceCode: {}
    }
    loadCustomComponents()
  }
}

const publishComponent = async (component) => {
  const res = await request.post(`/components/${component._id}/publish`)
  if (res.success) {
    ElMessage.success('发布成功')
    loadSystemComponents()
  }
}

const handleComponentAction = async (command, component) => {
  switch (command) {
    case 'edit':
      editComponent.value = { ...component }
      showEditDialog.value = true
      break
    case 'export':
      window.open(`/api/custom-components/export/${component._id}`, '_blank')
      break
    case 'publish':
      const res = await request.post(`/custom-components/${component._id}/publish`)
      if (res.success) {
        ElMessage.success('发布成功')
        loadCustomComponents()
      }
      break
    case 'delete':
      try {
        await ElMessageBox.confirm('确定要删除这个组件吗？', '确认删除')
        await request.delete(`/custom-components/${component._id}`)
        ElMessage.success('删除成功')
        loadCustomComponents()
      } catch {}
      break
  }
}

const saveComponent = async () => {
  const res = await request.put(`/custom-components/${editComponent.value._id}`, editComponent.value)
  if (res.success) {
    ElMessage.success('保存成功')
    showEditDialog.value = false
    loadCustomComponents()
  }
}

const handleUploadSuccess = (response) => {
  if (response.success) {
    ElMessage.success('组件上传成功')
    showUploadDialog.value = false
    loadCustomComponents()
  } else {
    ElMessage.error(response.message || '上传失败')
  }
}

const handleUploadError = () => {
  ElMessage.error('上传失败，请检查文件格式')
}

const downloadTemplate = () => {
  const blob = new Blob([componentTemplate], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'custom-component-template.json'
  a.click()
  URL.revokeObjectURL(url)
}

onMounted(() => {
  loadSystemComponents()
  loadCustomComponents()
})
</script>

<style scoped>
.components-page {
  padding: 20px;
}

pre {
  background: #fff;
  padding: 10px;
  border-radius: 4px;
  border: 1px solid #e4e7ed;
  overflow-x: auto;
}
</style>