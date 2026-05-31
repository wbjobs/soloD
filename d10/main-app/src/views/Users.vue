<template>
  <div class="users-page">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px">
      <h2>用户管理</h2>
      <el-button type="primary" @click="showCreateDialog = true">新建用户</el-button>
    </div>

    <el-table :data="users" border style="width: 100%">
      <el-table-column prop="username" label="用户名" width="150" />
      <el-table-column prop="email" label="邮箱" width="250" />
      <el-table-column prop="role" label="角色" width="150">
        <template #default="{ row }">
          <el-tag :type="getRoleType(row.role)">{{ getRoleText(row.role) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="120">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'danger'">
            {{ row.status === 'active' ? '正常' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="180">
        <template #default="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="editUser(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="deleteUser(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="showCreateDialog" title="新建用户" width="500px">
      <el-form :model="newUser" label-width="100px">
        <el-form-item label="用户名">
          <el-input v-model="newUser.username" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="newUser.email" placeholder="请输入邮箱" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="newUser.password" type="password" placeholder="请输入密码" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="newUser.role" style="width: 100%">
            <el-option label="管理员" value="admin" />
            <el-option label="开发者" value="developer" />
            <el-option label="编辑者" value="editor" />
            <el-option label="查看者" value="viewer" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="createUser">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showEditDialog" title="编辑用户" width="500px">
      <el-form :model="editUserData" label-width="100px">
        <el-form-item label="用户名">
          <el-input v-model="editUserData.username" disabled />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="editUserData.email" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="editUserData.role" style="width: 100%">
            <el-option label="管理员" value="admin" />
            <el-option label="开发者" value="developer" />
            <el-option label="编辑者" value="editor" />
            <el-option label="查看者" value="viewer" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="editUserData.status" style="width: 100%">
            <el-option label="正常" value="active" />
            <el-option label="禁用" value="disabled" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" @click="saveUser">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../utils/request'

const users = ref([])
const showCreateDialog = ref(false)
const showEditDialog = ref(false)
const newUser = ref({ username: '', email: '', password: '', role: 'viewer', status: 'active' })
const editUserData = ref({})

const getRoleText = (role) => {
  const roles = {
    admin: '管理员',
    developer: '开发者',
    editor: '编辑者',
    viewer: '查看者'
  }
  return roles[role] || role
}

const getRoleType = (role) => {
  const types = {
    admin: 'danger',
    developer: 'warning',
    editor: 'primary',
    viewer: 'info'
  }
  return types[role] || 'info'
}

const formatDate = (date) => {
  return new Date(date).toLocaleString('zh-CN')
}

const loadUsers = async () => {
  const res = await request.get('/users')
  if (res.success) {
    users.value = res.data
  }
}

const createUser = async () => {
  if (!newUser.value.username || !newUser.value.email || !newUser.value.password) {
    ElMessage.warning('请填写完整信息')
    return
  }
  const res = await request.post('/users', newUser.value)
  if (res.success) {
    ElMessage.success('创建成功')
    showCreateDialog.value = false
    newUser.value = { username: '', email: '', password: '', role: 'viewer', status: 'active' }
    loadUsers()
  }
}

const editUser = (user) => {
  editUserData.value = { ...user }
  showEditDialog.value = true
}

const saveUser = async () => {
  const res = await request.put(`/users/${editUserData.value._id}`, editUserData.value)
  if (res.success) {
    ElMessage.success('保存成功')
    showEditDialog.value = false
    loadUsers()
  }
}

const deleteUser = async (user) => {
  try {
    await ElMessageBox.confirm('确定要删除该用户吗？', '确认删除')
    const res = await request.delete(`/users/${user._id}`)
    if (res.success) {
      ElMessage.success('删除成功')
      loadUsers()
    }
  } catch {}
}

onMounted(() => {
  loadUsers()
})
</script>

<style scoped>
.users-page {
  padding: 20px;
}
</style>