<template>
  <div class="documents-page">
    <el-card class="stats-card">
      <template #header>
        <div class="card-header">
          <span>知识库统计</span>
        </div>
      </template>
      <el-row :gutter="20">
        <el-col :span="8">
          <el-statistic title="文档总数" :value="stats.total_documents || 0" />
        </el-col>
        <el-col :span="8">
          <el-statistic title="文本块总数" :value="stats.total_chunks || 0" />
        </el-col>
        <el-col :span="8">
          <el-statistic title="平均评分" :value="feedbackStats.avg_rating || 0" :precision="1" suffix="/ 5" />
        </el-col>
      </el-row>
    </el-card>

    <el-card class="upload-card">
      <template #header>
        <div class="card-header">
          <span>上传文档</span>
        </div>
      </template>
      <el-upload
        ref="uploadRef"
        class="upload-demo"
        drag
        :http-request="customUpload"
        :before-upload="beforeUpload"
        :show-file-list="false"
        accept=".pdf,.docx,.txt"
      >
        <el-icon class="el-icon--upload"><upload-filled /></el-icon>
        <div class="el-upload__text">
          拖放文件到此处或 <em>点击上传</em>
        </div>
        <template #tip>
          <div class="el-upload__tip">
            支持 PDF、Word、TXT 格式，单个文件不超过 10MB
          </div>
        </template>
      </el-upload>
      <el-progress v-if="uploadProgress > 0 && uploadProgress < 100" :percentage="uploadProgress" />
    </el-card>

    <el-card class="list-card">
      <template #header>
        <div class="card-header">
          <span>文档列表</span>
          <el-button type="danger" size="small" @click="handleClearAll">
            清空所有
          </el-button>
        </div>
      </template>
      <el-table :data="documents" v-loading="loading" style="width: 100%">
        <el-table-column prop="filename" label="文件名" min-width="200" />
        <el-table-column prop="chunk_count" label="分块数量" width="120" />
        <el-table-column prop="total_pages" label="页数" width="100">
          <template #default="{ row }">
            {{ row.total_pages || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button size="small" @click="handleUpdate(row)">
              更新
            </el-button>
            <el-button type="danger" size="small" @click="handleDelete(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="documents.length === 0 && !loading" description="暂无文档" />
    </el-card>

    <el-dialog v-model="updateDialogVisible" title="更新文档" width="500px">
      <div class="update-dialog-content">
        <p>当前文档: <strong>{{ updatingDocument?.filename }}</strong></p>
        <el-upload
          class="update-upload"
          drag
          :http-request="customUpdate"
          :before-upload="beforeUpload"
          :show-file-list="false"
          accept=".pdf,.docx,.txt"
        >
          <el-icon class="el-icon--upload"><upload-filled /></el-icon>
          <div class="el-upload__text">
            拖放文件到此处或 <em>点击上传</em>
          </div>
        </el-upload>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { uploadDocument, updateDocument, getDocuments, getDocumentStats, deleteDocument, getFeedbackStats, clearAll } from '../api'

const uploadRef = ref(null)
const uploadProgress = ref(0)
const documents = ref([])
const stats = ref({})
const feedbackStats = ref({})
const loading = ref(false)
const updateDialogVisible = ref(false)
const updatingDocument = ref(null)

const loadDocuments = async () => {
  loading.value = true
  try {
    const [docsRes, statsRes, feedbackRes] = await Promise.all([
      getDocuments(),
      getDocumentStats(),
      getFeedbackStats()
    ])
    documents.value = docsRes.data
    stats.value = statsRes.data
    feedbackStats.value = feedbackRes.data
  } catch (error) {
    ElMessage.error('加载文档列表失败')
  } finally {
    loading.value = false
  }
}

const beforeUpload = (file) => {
  const isLt10M = file.size / 1024 / 1024 < 10
  if (!isLt10M) {
    ElMessage.error('文件大小不能超过 10MB!')
    return false
  }
  return true
}

const customUpload = async (options) => {
  try {
    uploadProgress.value = 0
    const response = await uploadDocument(options.file, (progressEvent) => {
      const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
      uploadProgress.value = percentCompleted
    })
    uploadProgress.value = 100
    ElMessage.success('文档上传成功并已向量化')
    options.onSuccess(response.data)
    loadDocuments()
  } catch (error) {
    uploadProgress.value = 0
    options.onError(error)
    ElMessage.error('上传失败')
  }
}

const handleUpdate = (row) => {
  updatingDocument.value = row
  updateDialogVisible.value = true
}

const customUpdate = async (options) => {
  try {
    const response = await updateDocument(updatingDocument.value.source_id, options.file)
    ElMessage.success('文档更新成功')
    options.onSuccess(response.data)
    updateDialogVisible.value = false
    loadDocuments()
  } catch (error) {
    options.onError(error)
    ElMessage.error('更新失败')
  }
}

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除文档 "${row.filename}" 吗？`,
      '提示',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    await deleteDocument(row.source_id)
    ElMessage.success('删除成功')
    loadDocuments()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

const handleClearAll = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要清空所有文档吗？此操作不可恢复！',
      '警告',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    await clearAll()
    ElMessage.success('已清空所有数据')
    loadDocuments()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('清空失败')
    }
  }
}

onMounted(() => {
  loadDocuments()
})
</script>

<style scoped>
.documents-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.upload-demo {
  width: 100%;
}

.update-dialog-content {
  padding: 20px 0;
}

.update-dialog-content p {
  margin-bottom: 20px;
}

.update-upload {
  width: 100%;
}
</style>
