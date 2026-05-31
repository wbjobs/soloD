<template>
  <div class="editor">
    <div class="editor-header">
      <el-button @click="goBack" icon="ArrowLeft">返回</el-button>
      
      <el-select v-model="currentPageId" placeholder="选择页面" style="width: 200px; margin: 0 15px" @change="loadPage">
        <el-option v-for="page in pages" :key="page._id" :label="page.name" :value="page._id" />
      </el-select>
      
      <el-button @click="showPageDialog = true">新建页面</el-button>
      
      <el-dropdown @command="handleVersionAction">
        <el-button style="margin-left: 10px">
          <el-icon><Document /></el-icon>
          版本管理
          <el-icon><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="save">保存新版本</el-dropdown-item>
            <el-dropdown-item command="history">历史版本</el-dropdown-item>
            <el-dropdown-item command="compare">版本对比</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      
      <el-button @click="showPermissionDialog = true" style="margin-left: 10px">
        <el-icon><Lock /></el-icon>
        权限管理
      </el-button>
      
      <div style="flex: 1"></div>
      <el-button @click="savePage" type="primary" icon="Check">保存</el-button>
      <el-button @click="previewPage" icon="View">预览</el-button>
      <el-button @click="publishPage" type="success" icon="Upload">发布</el-button>
    </div>
    
    <div class="editor-content">
      <div class="component-panel">
        <h4 style="padding: 10px; margin: 0; border-bottom: 1px solid #eee">组件库</h4>
        <div 
          v-for="comp in allComponents" 
          :key="comp.type"
          class="component-item"
          draggable="true"
          @dragstart="onDragStart($event, comp)"
        >
          <span class="component-icon">{{ comp.icon }}</span>
          <span>{{ comp.name }}</span>
          <el-tag v-if="comp.category === 'custom'" size="small" type="warning">自定义</el-tag>
        </div>
      </div>
      
      <div 
        class="canvas-panel"
        ref="canvasRef"
        @dragover.prevent="onDragOver"
        @drop="onDrop"
        @dragleave="onDragLeave"
        :class="{ 'drag-over': isDragOver }"
      >
        <div 
          v-for="(item, index) in pageSchema.components" 
          :key="item.id"
          class="canvas-item"
          :class="{ active: selectedComponent?.id === item.id }"
          @click="selectComponent(item)"
          draggable="true"
          @dragstart="onComponentDragStart($event, index)"
          @dragover.prevent="onComponentDragOver($event, index)"
          @drop="onComponentDrop($event, index)"
          :style="getItemStyle(item)"
        >
          <render-component :item="item" :data-source="item.dataSource" />
          <div class="item-actions">
            <el-button size="small" icon="Delete" @click.stop="removeComponent(index)" circle />
            <el-button size="small" icon="Top" @click.stop="moveUp(index)" circle :disabled="index === 0" />
            <el-button size="small" icon="Bottom" @click.stop="moveDown(index)" circle :disabled="index === pageSchema.components.length - 1" />
          </div>
        </div>
        <div v-if="!pageSchema.components.length" class="empty-canvas">
          <p>从左侧拖拽组件到这里</p>
        </div>
      </div>
      
      <div class="property-panel">
        <h4 style="padding: 10px; margin: 0; border-bottom: 1px solid #eee">属性配置</h4>
        <div v-if="selectedComponent" class="property-content">
          <el-collapse v-model="activePanels">
            <el-collapse-item title="基础属性" name="props">
              <el-form label-width="80px" size="small">
                <template v-if="selectedComponent.type === 'Button'">
                  <el-form-item label="按钮文字">
                    <el-input v-model="selectedComponent.props.text" />
                  </el-form-item>
                  <el-form-item label="按钮类型">
                    <el-select v-model="selectedComponent.props.type">
                      <el-option label="主要" value="primary" />
                      <el-option label="成功" value="success" />
                      <el-option label="警告" value="warning" />
                      <el-option label="危险" value="danger" />
                    </el-select>
                  </el-form-item>
                </template>
                <template v-if="selectedComponent.type === 'Text'">
                  <el-form-item label="文本内容">
                    <el-input v-model="selectedComponent.props.content" type="textarea" :rows="3" />
                  </el-form-item>
                </template>
                <template v-if="selectedComponent.type === 'Input'">
                  <el-form-item label="占位符">
                    <el-input v-model="selectedComponent.props.placeholder" />
                  </el-form-item>
                </template>
                <template v-if="selectedComponent.type === 'Image'">
                  <el-form-item label="图片地址">
                    <el-input v-model="selectedComponent.props.src" />
                  </el-form-item>
                </template>
                <template v-if="selectedComponent.type === 'Card'">
                  <el-form-item label="卡片标题">
                    <el-input v-model="selectedComponent.props.title" />
                  </el-form-item>
                </template>
                <template v-if="selectedComponent.type === 'Table'">
                  <el-form-item label="列配置">
                    <el-input v-model="tableColumnsStr" type="textarea" :rows="3" placeholder="JSON格式，如: [{prop: 'name', label: '名称'}]" />
                  </el-form-item>
                </template>
              </el-form>
            </el-collapse-item>
            
            <el-collapse-item title="数据绑定" name="data">
              <el-form label-width="80px" size="small">
                <el-form-item label="数据源">
                  <el-radio-group v-model="selectedComponent.dataSourceType">
                    <el-radio label="static">静态数据</el-radio>
                    <el-radio label="api">接口数据</el-radio>
                  </el-radio-group>
                </el-form-item>
                
                <template v-if="selectedComponent.dataSourceType === 'api'">
                  <el-form-item label="接口地址">
                    <el-input v-model="selectedComponent.apiUrl" placeholder="http://api.example.com/data" />
                  </el-form-item>
                  <el-form-item label="请求方法">
                    <el-select v-model="selectedComponent.apiMethod" style="width: 100%">
                      <el-option label="GET" value="GET" />
                      <el-option label="POST" value="POST" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="数据路径">
                    <el-input v-model="selectedComponent.dataPath" placeholder="如: data.list" />
                  </el-form-item>
                  <el-form-item>
                    <el-button type="primary" size="small" @click="testDataSource">测试接口</el-button>
                    <el-button size="small" @click="clearDataSource">清空数据</el-button>
                  </el-form-item>
                  <el-alert v-if="testResult" :type="testResult.success ? 'success' : 'error'" style="margin-bottom: 10px">
                    {{ testResult.message }}
                  </el-alert>
                </template>
                
                <template v-else>
                  <el-form-item label="静态数据">
                    <el-input v-model="selectedComponent.staticData" type="textarea" :rows="5" placeholder="JSON格式数据" />
                  </el-form-item>
                </template>
              </el-form>
            </el-collapse-item>
            
            <el-collapse-item title="样式配置" name="style">
              <el-form label-width="80px" size="small">
                <el-form-item label="显示方式">
                  <el-select v-model="selectedComponent.style.display" style="width: 100%">
                    <el-option label="块级元素" value="block" />
                    <el-option label="行内块" value="inline-block" />
                    <el-option label="弹性布局" value="flex" />
                  </el-select>
                </el-form-item>
                <el-form-item label="宽度">
                  <el-input v-model="selectedComponent.style.width" placeholder="如: 200px, 100%" />
                </el-form-item>
                <el-form-item label="高度">
                  <el-input v-model="selectedComponent.style.height" placeholder="如: 100px, auto" />
                </el-form-item>
                <el-form-item label="字体大小">
                  <el-input v-model="selectedComponent.style.fontSize" placeholder="如: 14px" />
                </el-form-item>
                <el-form-item label="文字颜色">
                  <el-input v-model="selectedComponent.style.color" placeholder="如: #333" />
                </el-form-item>
                <el-form-item label="外边距">
                  <el-input v-model="selectedComponent.style.margin" placeholder="如: 10px 0" />
                </el-form-item>
                <el-form-item label="内边距">
                  <el-input v-model="selectedComponent.style.padding" placeholder="如: 10px" />
                </el-form-item>
                <el-form-item label="背景色">
                  <el-input v-model="selectedComponent.style.backgroundColor" placeholder="如: #fff" />
                </el-form-item>
                <el-form-item label="边框">
                  <el-input v-model="selectedComponent.style.border" placeholder="如: 1px solid #eee" />
                </el-form-item>
                <el-form-item label="圆角">
                  <el-input v-model="selectedComponent.style.borderRadius" placeholder="如: 4px" />
                </el-form-item>
              </el-form>
            </el-collapse-item>
          </el-collapse>
        </div>
        <div v-else class="empty-property">
          <p>请选择一个组件</p>
        </div>
      </div>
    </div>

    <el-dialog v-model="showPageDialog" title="新建页面" width="600px">
      <el-form :model="newPage" label-width="100px">
        <el-form-item label="页面名称">
          <el-input v-model="newPage.name" placeholder="请输入页面名称" />
        </el-form-item>
        <el-form-item label="页面路径">
          <el-input v-model="newPage.path" placeholder="如: /home" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showPageDialog = false">取消</el-button>
        <el-button type="primary" @click="createPage">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showVersionHistoryDialog" title="历史版本" width="900px">
      <el-table :data="versions" border style="width: 100%">
        <el-table-column prop="version" label="版本号" width="100" />
        <el-table-column prop="name" label="版本名称" />
        <el-table-column prop="description" label="描述" />
        <el-table-column prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="rollbackVersion(row)">回滚到此版本</el-button>
            <el-button size="small" type="danger" @click="deleteVersion(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <el-dialog v-model="showCompareDialog" title="版本对比" width="1000px">
      <div style="margin-bottom: 20px; display: flex; gap: 20px">
        <el-select v-model="compareVersion1" placeholder="选择版本1" style="width: 200px">
          <el-option v-for="v in versions" :key="v.version" :label="`v${v.version} ${v.name}`" :value="v.version" />
        </el-select>
        <span style="line-height: 32px">VS</span>
        <el-select v-model="compareVersion2" placeholder="选择版本2" style="width: 200px">
          <el-option v-for="v in versions" :key="v.version" :label="`v${v.version} ${v.name}`" :value="v.version" />
        </el-select>
        <el-button type="primary" @click="loadCompareData">开始对比</el-button>
      </div>
      
      <div v-if="compareResult">
        <el-row :gutter="20">
          <el-col :span="12">
            <div style="background: #fef0f0; padding: 15px; border-radius: 4px; border: 1px solid #fbc4c4">
              <h4 style="color: #f56c6c; margin: 0 0 10px 0">删除的组件 ({{ compareResult.diff.components.removed.length }})</h4>
              <div v-for="item in compareResult.diff.components.removed" :key="item.id" style="padding: 8px; background: white; margin-bottom: 5px; border-radius: 4px">
                {{ item.type }}
              </div>
            </div>
          </el-col>
          <el-col :span="12">
            <div style="background: #f0f9eb; padding: 15px; border-radius: 4px; border: 1px solid #c2e7b0">
              <h4 style="color: #67c23a; margin: 0 0 10px 0">新增的组件 ({{ compareResult.diff.components.added.length }})</h4>
              <div v-for="item in compareResult.diff.components.added" :key="item.id" style="padding: 8px; background: white; margin-bottom: 5px; border-radius: 4px">
                {{ item.type }}
              </div>
            </div>
          </el-col>
        </el-row>
        
        <div style="margin-top: 20px">
          <div style="background: #fdf6ec; padding: 15px; border-radius: 4px; border: 1px solid #f5dab1">
            <h4 style="color: #e6a23c; margin: 0 0 10px 0">修改的组件 ({{ compareResult.diff.components.modified.length }})</h4>
            <div v-for="item in compareResult.diff.components.modified" :key="item.before.id" style="padding: 8px; background: white; margin-bottom: 5px; border-radius: 4px">
              {{ item.before.type }}
            </div>
          </div>
        </div>
      </div>
    </el-dialog>

    <el-dialog v-model="showPermissionDialog" title="页面权限管理" width="800px">
      <div style="margin-bottom: 15px">
        <el-button type="primary" @click="showAddUserDialog = true">添加用户权限</el-button>
      </div>
      
      <el-table :data="permissions" border style="width: 100%">
        <el-table-column prop="userId.username" label="用户" width="150">
          <template #default="{ row }">
            <el-tag>{{ row.userId?.username }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="userId.role" label="角色" width="120">
          <template #default="{ row }">
            {{ getRoleText(row.userId?.role) }}
          </template>
        </el-table-column>
        <el-table-column label="查看权限" width="100">
          <template #default="{ row }">
            <el-switch v-model="row.permissions.view" @change="savePermission(row)" />
          </template>
        </el-table-column>
        <el-table-column label="编辑权限" width="100">
          <template #default="{ row }">
            <el-switch v-model="row.permissions.edit" @change="savePermission(row)" />
          </template>
        </el-table-column>
        <el-table-column label="发布权限" width="100">
          <template #default="{ row }">
            <el-switch v-model="row.permissions.publish" @change="savePermission(row)" />
          </template>
        </el-table-column>
        <el-table-column label="删除权限" width="100">
          <template #default="{ row }">
            <el-switch v-model="row.permissions.delete" @change="savePermission(row)" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button size="small" type="danger" @click="removePermission(row)">移除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <el-dialog v-model="showAddUserDialog" title="添加用户权限" width="500px">
      <el-form label-width="100px">
        <el-form-item label="选择用户">
          <el-select v-model="selectedUserId" placeholder="请选择用户" style="width: 100%">
            <el-option v-for="user in users" :key="user._id" :label="user.username" :value="user._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="权限设置">
          <el-checkbox-group v-model="newPermissions">
            <el-checkbox label="view">查看</el-checkbox>
            <el-checkbox label="edit">编辑</el-checkbox>
            <el-checkbox label="publish">发布</el-checkbox>
            <el-checkbox label="delete">删除</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddUserDialog = false">取消</el-button>
        <el-button type="primary" @click="addPermission">添加</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showSaveVersionDialog" title="保存新版本" width="500px">
      <el-form label-width="100px">
        <el-form-item label="版本名称">
          <el-input v-model="newVersionName" placeholder="如: v1.0.0 重大更新" />
        </el-form-item>
        <el-form-item label="版本描述">
          <el-input v-model="newVersionDesc" type="textarea" :rows="3" placeholder="描述本次更新内容" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showSaveVersionDialog = false">取消</el-button>
        <el-button type="primary" @click="saveNewVersion">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Document, Lock, ArrowLeft, ArrowDown } from '@element-plus/icons-vue'
import request from './utils/request'
import RenderComponent from './components/RenderComponent.vue'

const canvasRef = ref(null)
const projectId = ref('')
const pages = ref([])
const currentPageId = ref('')
const selectedComponent = ref(null)
const activePanels = ref(['props', 'style'])
const showPageDialog = ref(false)
const showVersionHistoryDialog = ref(false)
const showCompareDialog = ref(false)
const showPermissionDialog = ref(false)
const showAddUserDialog = ref(false)
const showSaveVersionDialog = ref(false)
const newPage = ref({ name: '', path: '' })
const isDragOver = ref(false)
const testResult = ref(null)
const dragIndex = ref(-1)
const versions = ref([])
const permissions = ref([])
const users = ref([])
const selectedUserId = ref('')
const newPermissions = ref(['view'])
const compareVersion1 = ref('')
const compareVersion2 = ref('')
const compareResult = ref(null)
const newVersionName = ref('')
const newVersionDesc = ref('')
const customComponents = ref([])

const pageSchema = ref({
  components: [],
  style: { backgroundColor: '#fff' }
})

const systemComponents = [
  { type: 'Button', name: '按钮', icon: '🔘', category: 'basic', defaultProps: { text: '按钮', type: 'primary' }, defaultStyle: { padding: '8px 16px' } },
  { type: 'Input', name: '输入框', icon: '📝', category: 'form', defaultProps: { placeholder: '请输入' }, defaultStyle: { width: '200px' } },
  { type: 'Text', name: '文本', icon: '📄', category: 'display', defaultProps: { content: '这是一段文本' }, defaultStyle: { fontSize: '14px', color: '#333' } },
  { type: 'Image', name: '图片', icon: '🖼️', category: 'display', defaultProps: { src: 'https://picsum.photos/200/200', alt: '图片' }, defaultStyle: { width: '200px', height: '200px' } },
  { type: 'Container', name: '容器', icon: '📦', category: 'basic', defaultProps: {}, defaultStyle: { padding: '20px', border: '1px solid #eee', minHeight: '100px' } },
  { type: 'Card', name: '卡片', icon: '💳', category: 'display', defaultProps: { title: '卡片标题' }, defaultStyle: { padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.1)' } },
  { type: 'Select', name: '下拉选择', icon: '📋', category: 'form', defaultProps: { options: [{label: '选项1', value: '1'}, {label: '选项2', value: '2'}] }, defaultStyle: { width: '200px' } },
  { type: 'Table', name: '表格', icon: '📊', category: 'display', defaultProps: { columns: [{prop: 'name', label: '名称'}, {prop: 'value', label: '值'}], data: [{name: '示例1', value: '123'}] }, defaultStyle: { width: '100%' } }
]

const allComponents = computed(() => {
  const customComps = customComponents.value.map(c => ({
    type: c.type,
    name: c.name,
    icon: c.icon || '🔧',
    category: 'custom',
    defaultProps: c.schema?.props || {},
    defaultStyle: c.schema?.style || {}
  }))
  return [...systemComponents, ...customComps]
})

const tableColumnsStr = computed({
  get: () => {
    if (selectedComponent.value?.type === 'Table' && selectedComponent.value.props.columns) {
      return JSON.stringify(selectedComponent.value.props.columns, null, 2)
    }
    return ''
  },
  set: (val) => {
    if (selectedComponent.value?.type === 'Table') {
      try {
        selectedComponent.value.props.columns = JSON.parse(val)
      } catch (e) {
        console.error('JSON解析失败')
      }
    }
  }
})

watch(selectedComponent, (newVal) => {
  if (newVal && !newVal.dataSourceType) {
    newVal.dataSourceType = 'static'
    newVal.apiUrl = ''
    newVal.apiMethod = 'GET'
    newVal.dataPath = ''
    newVal.staticData = ''
    newVal.dataSource = null
  }
})

const getProjectId = () => {
  const urlParams = new URLSearchParams(window.location.search)
  return urlParams.get('id') || ''
}

const loadPages = async () => {
  const res = await request.get(`/pages?projectId=${projectId.value}`)
  if (res.success && res.data.length > 0) {
    pages.value = res.data
    if (!currentPageId.value) {
      currentPageId.value = pages.value[0]._id
      loadPage()
    }
  }
}

const loadPage = async () => {
  if (!currentPageId.value) return
  const res = await request.get(`/pages/${currentPageId.value}`)
  if (res.success) {
    pageSchema.value = res.data.schema || { components: [], style: {} }
  }
}

const createPage = async () => {
  if (!newPage.value.name || !newPage.value.path) {
    ElMessage.warning('请填写完整信息')
    return
  }
  const pageData = {
    projectId: projectId.value,
    name: newPage.value.name,
    path: newPage.value.path.startsWith('/') ? newPage.value.path : '/' + newPage.value.path,
    schema: { components: [], style: {} }
  }
  const res = await request.post('/pages', pageData)
  if (res.success) {
    ElMessage.success('页面创建成功')
    showPageDialog.value = false
    newPage.value = { name: '', path: '' }
    await loadPages()
    currentPageId.value = res.data._id
    loadPage()
  }
}

const savePage = async () => {
  if (!currentPageId.value) {
    ElMessage.warning('请先创建页面')
    return
  }
  const res = await request.put(`/pages/${currentPageId.value}`, { schema: pageSchema.value })
  if (res.success) {
    ElMessage.success('保存成功')
  }
}

const previewPage = () => {
  savePage()
  window.open(`/renderer?pageId=${currentPageId.value}`, '_blank')
}

const publishPage = async () => {
  if (!currentPageId.value) {
    ElMessage.warning('请先创建页面')
    return
  }
  const res = await request.put(`/pages/${currentPageId.value}`, { 
    schema: pageSchema.value,
    status: 'published' 
  })
  if (res.success) {
    ElMessage.success('发布成功')
  }
}

const handleVersionAction = async (command) => {
  switch (command) {
    case 'save':
      newVersionName.value = ''
      newVersionDesc.value = ''
      showSaveVersionDialog.value = true
      break
    case 'history':
      await loadVersions()
      showVersionHistoryDialog.value = true
      break
    case 'compare':
      await loadVersions()
      if (versions.value.length >= 2) {
        compareVersion1.value = versions.value[0].version
        compareVersion2.value = versions.value[1].version
      }
      showCompareDialog.value = true
      break
  }
}

const saveNewVersion = async () => {
  const res = await request.post('/page-versions/create', {
    pageId: currentPageId.value,
    name: newVersionName.value || `v${versions.value.length + 1}`,
    description: newVersionDesc.value
  })
  if (res.success) {
    ElMessage.success('版本保存成功')
    showSaveVersionDialog.value = false
    loadVersions()
  }
}

const loadVersions = async () => {
  const res = await request.get(`/page-versions/${currentPageId.value}`)
  if (res.success) {
    versions.value = res.data
  }
}

const rollbackVersion = async (version) => {
  try {
    await ElMessageBox.confirm('确定要回滚到此版本吗？当前内容将被替换。', '确认回滚')
    const res = await request.post('/page-versions/rollback', {
      pageId: currentPageId.value,
      version: version.version
    })
    if (res.success) {
      ElMessage.success('回滚成功')
      loadPage()
      showVersionHistoryDialog.value = false
    }
  } catch {}
}

const deleteVersion = async (version) => {
  try {
    await ElMessageBox.confirm('确定要删除此版本吗？此操作不可恢复。', '确认删除')
    await request.delete(`/page-versions/${version._id}`)
    ElMessage.success('删除成功')
    loadVersions()
  } catch {}
}

const loadCompareData = async () => {
  if (!compareVersion1.value || !compareVersion2.value) {
    ElMessage.warning('请选择两个版本进行对比')
    return
  }
  const res = await request.get(`/page-versions/compare/${currentPageId.value}?version1=${compareVersion1.value}&version2=${compareVersion2.value}`)
  if (res.success) {
    compareResult.value = res.data
  }
}

const loadPermissions = async () => {
  const res = await request.get(`/permissions/${currentPageId.value}`)
  if (res.success) {
    permissions.value = res.data
  }
}

const loadUsers = async () => {
  const res = await request.get('/users')
  if (res.success) {
    users.value = res.data
  }
}

const savePermission = async (permission) => {
  const res = await request.post('/permissions', {
    pageId: currentPageId.value,
    userId: permission.userId._id,
    permissions: permission.permissions
  })
  if (res.success) {
    ElMessage.success('权限更新成功')
  }
}

const addPermission = async () => {
  if (!selectedUserId.value) {
    ElMessage.warning('请选择用户')
    return
  }
  
  const permObj = {
    view: newPermissions.value.includes('view'),
    edit: newPermissions.value.includes('edit'),
    publish: newPermissions.value.includes('publish'),
    delete: newPermissions.value.includes('delete')
  }
  
  const res = await request.post('/permissions', {
    pageId: currentPageId.value,
    userId: selectedUserId.value,
    permissions: permObj
  })
  if (res.success) {
    ElMessage.success('权限添加成功')
    showAddUserDialog.value = false
    selectedUserId.value = ''
    newPermissions.value = ['view']
    loadPermissions()
  }
}

const removePermission = async (permission) => {
  try {
    await ElMessageBox.confirm('确定要移除该用户的权限吗？', '确认移除')
    await request.delete(`/permissions/${permission._id}`)
    ElMessage.success('移除成功')
    loadPermissions()
  } catch {}
}

const getRoleText = (role) => {
  const roles = {
    admin: '管理员',
    developer: '开发者',
    editor: '编辑者',
    viewer: '查看者'
  }
  return roles[role] || role
}

const loadCustomComponents = async () => {
  const res = await request.get('/custom-components?status=published')
  if (res.success) {
    customComponents.value = res.data
  }
}

const onDragStart = (event, component) => {
  event.dataTransfer.setData('component', JSON.stringify(component))
  event.dataTransfer.effectAllowed = 'copy'
}

const onDragOver = (event) => {
  event.preventDefault()
  isDragOver.value = true
  event.dataTransfer.dropEffect = 'copy'
}

const onDragLeave = () => {
  isDragOver.value = false
}

const onDrop = (event) => {
  event.preventDefault()
  isDragOver.value = false
  
  const componentData = JSON.parse(event.dataTransfer.getData('component'))
  if (!componentData) return
  
  const newComponent = {
    id: Date.now().toString(),
    type: componentData.type,
    props: { ...componentData.defaultProps },
    style: { ...componentData.defaultStyle },
    dataSourceType: 'static',
    apiUrl: '',
    apiMethod: 'GET',
    dataPath: '',
    staticData: '',
    dataSource: null
  }
  pageSchema.value.components.push(newComponent)
  selectedComponent.value = newComponent
}

const onComponentDragStart = (event, index) => {
  dragIndex.value = index
  event.dataTransfer.setData('componentIndex', index.toString())
  event.dataTransfer.effectAllowed = 'move'
}

const onComponentDragOver = (event, index) => {
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
}

const onComponentDrop = (event, targetIndex) => {
  event.preventDefault()
  event.stopPropagation()
  
  const sourceIndex = parseInt(event.dataTransfer.getData('componentIndex'))
  if (isNaN(sourceIndex) || sourceIndex === targetIndex) return
  
  const item = pageSchema.value.components.splice(sourceIndex, 1)[0]
  pageSchema.value.components.splice(targetIndex, 0, item)
  dragIndex.value = -1
}

const getItemStyle = (item) => {
  const baseStyle = {
    display: 'block',
    marginBottom: '10px'
  }
  return { ...baseStyle, ...item.style }
}

const selectComponent = (item) => {
  selectedComponent.value = item
  testResult.value = null
}

const removeComponent = (index) => {
  pageSchema.value.components.splice(index, 1)
  if (selectedComponent.value?.id === pageSchema.value.components[index]?.id) {
    selectedComponent.value = null
  }
}

const moveUp = (index) => {
  if (index > 0) {
    const temp = pageSchema.value.components[index]
    pageSchema.value.components[index] = pageSchema.value.components[index - 1]
    pageSchema.value.components[index - 1] = temp
  }
}

const moveDown = (index) => {
  if (index < pageSchema.value.components.length - 1) {
    const temp = pageSchema.value.components[index]
    pageSchema.value.components[index] = pageSchema.value.components[index + 1]
    pageSchema.value.components[index + 1] = temp
  }
}

const testDataSource = async () => {
  if (!selectedComponent.value || !selectedComponent.value.apiUrl) {
    ElMessage.warning('请先填写接口地址')
    return
  }
  
  try {
    let res
    if (selectedComponent.value.apiMethod === 'GET') {
      res = await fetch(selectedComponent.value.apiUrl)
    } else {
      res = await fetch(selectedComponent.value.apiUrl, { method: 'POST' })
    }
    
    const data = await res.json()
    
    let resultData = data
    if (selectedComponent.value.dataPath) {
      const paths = selectedComponent.value.dataPath.split('.')
      for (const path of paths) {
        resultData = resultData?.[path]
      }
    }
    
    selectedComponent.value.dataSource = resultData
    testResult.value = { success: true, message: '数据获取成功！' }
    ElMessage.success('数据获取成功')
  } catch (error) {
    testResult.value = { success: false, message: '接口请求失败: ' + error.message }
    ElMessage.error('接口请求失败')
  }
}

const clearDataSource = () => {
  if (selectedComponent.value) {
    selectedComponent.value.dataSource = null
    selectedComponent.value.staticData = ''
    testResult.value = null
  }
}

const formatDate = (date) => {
  return new Date(date).toLocaleString('zh-CN')
}

const goBack = () => {
  window.location.href = '/'
}

onMounted(() => {
  projectId.value = getProjectId()
  loadPages()
  loadCustomComponents()
  loadUsers()
  if (currentPageId.value) {
    loadPermissions()
  }
})
</script>

<style scoped>
.editor {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
}

.editor-header {
  height: 60px;
  background: white;
  display: flex;
  align-items: center;
  padding: 0 20px;
  border-bottom: 1px solid #eee;
  flex-shrink: 0;
}

.editor-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.component-panel {
  width: 220px;
  background: white;
  border-right: 1px solid #eee;
  overflow-y: auto;
  flex-shrink: 0;
}

.component-item {
  padding: 12px 15px;
  cursor: grab;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid #f5f5f5;
  transition: all 0.2s;
  user-select: none;
}

.component-item:hover {
  background: #f5f7fa;
  transform: translateX(2px);
}

.component-icon {
  font-size: 18px;
}

.canvas-panel {
  flex: 1;
  background: #f0f2f5;
  padding: 30px;
  overflow-y: auto;
  transition: all 0.2s;
  min-height: 0;
}

.canvas-panel.drag-over {
  background: #e8f4ff;
  box-shadow: inset 0 0 0 2px #409eff;
}

.canvas-item {
  position: relative;
  background: white;
  padding: 15px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
  box-sizing: border-box;
  min-height: 50px;
}

.canvas-item:hover {
  border-color: #409eff;
}

.canvas-item.active {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}

.item-actions {
  position: absolute;
  top: 5px;
  right: 5px;
  display: none;
  background: white;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  padding: 2px;
}

.canvas-item:hover .item-actions {
  display: flex;
  gap: 2px;
}

.empty-canvas {
  height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed #ddd;
  border-radius: 8px;
  color: #999;
  font-size: 16px;
  background: white;
}

.property-panel {
  width: 320px;
  background: white;
  border-left: 1px solid #eee;
  overflow-y: auto;
  flex-shrink: 0;
}

.property-content {
  padding: 15px;
}

.empty-property {
  padding: 80px 20px;
  text-align: center;
  color: #999;
  font-size: 14px;
}

:deep(.el-collapse-item__header) {
  font-weight: 500;
}

:deep(.el-form-item) {
  margin-bottom: 12px;
}
</style>