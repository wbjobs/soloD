<template>
  <div class="home">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px">
      <h2>项目列表</h2>
      <el-button type="primary" @click="showCreateDialog = true">新建项目</el-button>
    </div>

    <el-row :gutter="20">
      <el-col :span="6" v-for="project in projects" :key="project._id">
        <el-card shadow="hover" style="margin-bottom: 20px; cursor: pointer" @click="openProject(project)">
          <div style="height: 120px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: 24px; border-radius: 4px">
            {{ project.name.charAt(0).toUpperCase() }}
          </div>
          <div style="padding: 15px 0">
            <h3>{{ project.name }}</h3>
            <p style="color: #999; font-size: 14px; margin: 5px 0">{{ project.description || '暂无描述' }}</p>
            <div style="display: flex; justify-content: space-between; margin-top: 10px">
              <el-tag :type="project.status === 'published' ? 'success' : 'info'" size="small">
                {{ project.status === 'published' ? '已发布' : '草稿' }}
              </el-tag>
              <span style="font-size: 12px; color: #999">{{ formatDate(project.createdAt) }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="showCreateDialog" title="新建项目" width="500px">
      <el-form :model="newProject" label-width="80px">
        <el-form-item label="项目名称">
          <el-input v-model="newProject.name" placeholder="请输入项目名称" />
        </el-form-item>
        <el-form-item label="项目描述">
          <el-input v-model="newProject.description" type="textarea" :rows="3" placeholder="请输入项目描述" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="createProject">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import request from '../utils/request'

const router = useRouter()
const projects = ref([])
const showCreateDialog = ref(false)
const newProject = ref({ name: '', description: '' })

const loadProjects = async () => {
  const res = await request.get('/projects')
  if (res.success) {
    projects.value = res.data
  }
}

const createProject = async () => {
  if (!newProject.value.name) {
    ElMessage.warning('请输入项目名称')
    return
  }
  const res = await request.post('/projects', newProject.value)
  if (res.success) {
    ElMessage.success('创建成功')
    showCreateDialog.value = false
    newProject.value = { name: '', description: '' }
    loadProjects()
  }
}

const openProject = (project) => {
  window.location.href = `/editor?id=${project._id}`
}

const formatDate = (date) => {
  return new Date(date).toLocaleDateString('zh-CN')
}

onMounted(() => {
  loadProjects()
})
</script>

<style scoped>
.home {
  padding: 20px;
}
</style>