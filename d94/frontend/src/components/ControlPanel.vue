<template>
  <div class="control-panel">
    <h3 class="panel-title">
      <span class="icon">🔍</span>
      数据抓取
    </h3>
    
    <div class="form-group">
      <label>平台选择</label>
      <select v-model="platform" class="select-input">
        <option value="twitter">🐦 Twitter</option>
        <option value="github">🐙 GitHub</option>
      </select>
    </div>

    <div class="form-group">
      <label>用户名</label>
      <input 
        v-model="username" 
        type="text" 
        class="text-input"
        :placeholder="platform === 'twitter' ? '例如: elonmusk' : '例如: torvalds'"
        @keyup.enter="handleFetch"
      />
    </div>

    <div class="form-group">
      <label>深度: {{ depth }}</label>
      <input 
        v-model="depth" 
        type="range" 
        min="1" 
        max="3" 
        class="range-input"
      />
      <div class="range-labels">
        <span>浅</span>
        <span>中</span>
        <span>深</span>
      </div>
    </div>

    <button 
      @click="handleFetch" 
      class="fetch-button"
      :disabled="loading || !username"
    >
      <span v-if="loading" class="spinner"></span>
      {{ loading ? '抓取中...' : '生成图谱' }}
    </button>

    <div v-if="error" class="error-message">
      ⚠️ {{ error }}
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const emit = defineEmits(['fetch'])

const platform = ref('twitter')
const username = ref('')
const depth = ref(2)
const loading = ref(false)
const error = ref('')

const handleFetch = async () => {
  if (!username.value) {
    error.value = '请输入用户名'
    return
  }
  
  loading.value = true
  error.value = ''
  
  try {
    await emit('fetch', platform.value, username.value, depth.value)
  } catch (err) {
    error.value = '抓取失败，请重试'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.control-panel {
  background: rgba(26, 26, 46, 0.9);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(0, 212, 255, 0.2);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3),
              0 0 60px rgba(0, 212, 255, 0.1);
}

.panel-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 18px;
  font-weight: 600;
  color: #00d4ff;
  margin: 0 0 24px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #a0a0c0;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.select-input,
.text-input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid rgba(0, 212, 255, 0.3);
  border-radius: 8px;
  background: rgba(22, 33, 62, 0.8);
  color: #ffffff;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  transition: all 0.3s ease;
  box-sizing: border-box;
}

.select-input:focus,
.text-input:focus {
  outline: none;
  border-color: #00d4ff;
  box-shadow: 0 0 20px rgba(0, 212, 255, 0.3);
}

.select-input option {
  background: #16213e;
  color: #fff;
}

.range-input {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: rgba(0, 212, 255, 0.2);
  outline: none;
  -webkit-appearance: none;
  cursor: pointer;
}

.range-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: linear-gradient(135deg, #00d4ff, #9d4edd);
  cursor: pointer;
  box-shadow: 0 0 15px rgba(0, 212, 255, 0.5);
  transition: transform 0.2s ease;
}

.range-input::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.range-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 11px;
  color: #606080;
}

.fetch-button {
  width: 100%;
  padding: 14px 24px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #00d4ff, #9d4edd);
  color: #ffffff;
  font-family: 'Orbitron', sans-serif;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.fetch-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 30px rgba(0, 212, 255, 0.4);
}

.fetch-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid #ffffff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-message {
  margin-top: 16px;
  padding: 12px;
  background: rgba(255, 107, 53, 0.1);
  border: 1px solid rgba(255, 107, 53, 0.3);
  border-radius: 8px;
  color: #ff6b35;
  font-size: 13px;
}
</style>
