<template>
  <div class="chat-page">
    <div class="chat-container">
      <div class="chat-header">
        <div class="header-left">
          <h3>对话助手</h3>
          <el-tag size="small" type="info">会话: {{ sessionId }}</el-tag>
        </div>
        <div class="header-right">
          <el-select v-model="windowSize" size="small" placeholder="上下文窗口" style="width: 140px" @change="handleWindowSizeChange">
            <el-option v-for="n in 10" :key="n" :label="`${n*2} 轮对话`" :value="n*2" />
          </el-select>
          <el-button size="small" @click="handleClearChat">清空对话</el-button>
        </div>
      </div>

      <div class="chat-messages" ref="messagesRef">
        <div v-if="messages.length === 0" class="welcome-message">
          <el-empty description="欢迎使用知识库问答系统，请先上传文档后开始提问" />
        </div>
        <div v-else>
          <div v-for="(msg, index) in messages" :key="index" class="message-item" :class="msg.role">
            <div class="message-avatar">
              <el-icon v-if="msg.role === 'human'"><User /></el-icon>
              <el-icon v-else><Robot /></el-icon>
            </div>
            <div class="message-content">
              <div class="message-text" v-html="marked.parse(msg.content)"></div>
              
              <div v-if="msg.role === 'ai' && msg.sources && msg.sources.length > 0" class="message-sources">
                <el-divider content-position="left">引用来源</el-divider>
                <el-collapse>
                  <el-collapse-item v-for="(source, sIndex) in msg.sources" :key="sIndex" :title="source.filename">
                    <div class="source-info">
                      <p><strong>页码:</strong> {{ source.page + 1 }}</p>
                      <p><strong>内容:</strong></p>
                      <p class="source-content">{{ source.content }}</p>
                    </div>
                  </el-collapse-item>
                </el-collapse>

                <div class="feedback-section">
                  <span class="feedback-label">回答是否有帮助?</span>
                  <el-rate
                    v-model="msgFeedback[index]?.rating"
                    :max="5"
                    size="small"
                    show-score
                    @change="handleRatingChange(index, $event)"
                  />
                  <el-input
                    v-if="msgFeedback[index]?.rating"
                    v-model="msgFeedback[index]?.comment"
                    type="textarea"
                    :rows="2"
                    size="small"
                    placeholder="可选: 填写反馈意见..."
                    style="margin-top: 8px"
                  />
                  <el-button
                    v-if="msgFeedback[index]?.rating"
                    type="primary"
                    size="small"
                    @click="handleSubmitFeedback(index)"
                    style="margin-top: 8px"
                  >
                    提交反馈
                  </el-button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-if="loading" class="message-item ai">
          <div class="message-avatar">
            <el-icon><Robot /></el-icon>
          </div>
          <div class="message-content">
            <el-skeleton :rows="3" animated />
          </div>
        </div>
      </div>

      <div class="chat-input">
        <el-input
          v-model="question"
          type="textarea"
          :rows="3"
          placeholder="请输入您的问题..."
          @keydown.enter.prevent="handleSend"
          :disabled="loading"
        />
        <div class="input-actions">
          <span class="char-count">{{ question.length }} 字符</span>
          <el-button type="primary" @click="handleSend" :loading="loading" :disabled="!question.trim()">
            发送
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { User, Robot } from '@element-plus/icons-vue'
import { chat, clearConversation, setMemoryWindowSize, submitFeedback } from '../api'
import { marked } from 'marked'

marked.setOptions({
  breaks: true,
  gfm: true
})

const messagesRef = ref(null)
const question = ref('')
const loading = ref(false)
const messages = ref([])
const sessionId = ref('default')
const windowSize = ref(6)
const msgFeedback = reactive({})

const scrollToBottom = async () => {
  await nextTick()
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
}

const handleSend = async () => {
  if (!question.value.trim()) {
    ElMessage.warning('请输入问题')
    return
  }

  const userQuestion = question.value.trim()
  question.value = ''

  messages.value.push({
    role: 'human',
    content: userQuestion
  })

  await scrollToBottom()

  loading.value = true
  try {
    const response = await chat(userQuestion, sessionId.value, null)
    const { answer, sources } = response.data

    messages.value.push({
      role: 'ai',
      content: answer,
      sources: sources
    })

    const msgIndex = messages.value.length - 1
    msgFeedback[msgIndex] = {
      rating: null,
      comment: '',
      question: userQuestion,
      answer: answer,
      sources: sources
    }

  } catch (error) {
    ElMessage.error('获取回答失败，请稍后重试')
    messages.value.pop()
  } finally {
    loading.value = false
    await scrollToBottom()
  }
}

const handleClearChat = async () => {
  try {
    await clearConversation(sessionId.value)
    messages.value = []
    Object.keys(msgFeedback).forEach(key => delete msgFeedback[key])
    ElMessage.success('对话已清空')
  } catch (error) {
    ElMessage.error('清空对话失败')
  }
}

const handleWindowSizeChange = async (newSize) => {
  try {
    await setMemoryWindowSize(newSize)
    ElMessage.success(`上下文窗口大小已设置为 ${newSize} 轮对话`)
  } catch (error) {
    ElMessage.error('设置窗口大小失败')
    windowSize.value = 6
  }
}

const handleRatingChange = (index, rating) => {
  if (!msgFeedback[index]) {
    msgFeedback[index] = {}
  }
  msgFeedback[index].rating = rating
}

const handleSubmitFeedback = async (index) => {
  const feedback = msgFeedback[index]
  if (!feedback || !feedback.rating) {
    ElMessage.warning('请先进行评分')
    return
  }

  try {
    await submitFeedback({
      session_id: sessionId.value,
      question: feedback.question,
      answer: feedback.answer,
      rating: feedback.rating,
      comment: feedback.comment || '',
      sources: feedback.sources || []
    })
    ElMessage.success('反馈提交成功，感谢您的反馈！')
    feedback.submitted = true
  } catch (error) {
    ElMessage.error('提交反馈失败')
  }
}

onMounted(() => {
  scrollToBottom()
})
</script>

<style scoped>
.chat-page {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  overflow: hidden;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-left h3 {
  margin: 0;
  font-size: 16px;
}

.header-right {
  display: flex;
  gap: 10px;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background-color: #f9fafb;
}

.welcome-message {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}

.message-item {
  display: flex;
  margin-bottom: 24px;
  gap: 12px;
}

.message-item.human {
  flex-direction: row-reverse;
}

.message-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.message-item.human .message-avatar {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.message-item.ai .message-avatar {
  background-color: #e4e7ed;
  color: #606266;
}

.message-content {
  max-width: 70%;
}

.message-item.human .message-content {
  text-align: right;
}

.message-text {
  padding: 12px 16px;
  border-radius: 12px;
  line-height: 1.6;
  word-wrap: break-word;
}

.message-text :deep(p) {
  margin: 8px 0;
}

.message-text :deep(code) {
  background-color: #f5f7fa;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}

.message-text :deep(pre) {
  background-color: #1e1e1e;
  color: #d4d4d4;
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
}

.message-text :deep(pre code) {
  background: none;
  padding: 0;
}

.message-item.human .message-text {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-bottom-right-radius: 4px;
}

.message-item.ai .message-text {
  background-color: white;
  color: #303133;
  border: 1px solid #e4e7ed;
  border-bottom-left-radius: 4px;
}

.message-sources {
  margin-top: 12px;
  font-size: 13px;
}

.source-info {
  padding: 8px 0;
}

.source-content {
  background-color: #f5f7fa;
  padding: 8px 12px;
  border-radius: 4px;
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-all;
}

.feedback-section {
  margin-top: 16px;
  padding: 12px;
  background-color: #f0f9ff;
  border-radius: 8px;
  border: 1px solid #bae6fd;
}

.feedback-label {
  font-weight: 500;
  margin-right: 8px;
  color: #0369a1;
}

.chat-input {
  padding: 20px;
  background-color: white;
  border-top: 1px solid #e4e7ed;
}

.input-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
}

.char-count {
  color: #909399;
  font-size: 12px;
}
</style>
