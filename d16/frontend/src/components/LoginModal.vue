<template>
  <div class="modal-overlay">
    <div class="modal">
      <h2>加入文档</h2>
      <form @submit.prevent="handleSubmit">
        <div class="form-group">
          <label>输入你的昵称</label>
          <input 
            v-model="userName" 
            type="text" 
            placeholder="例如：张三"
            autofocus
            required
          />
        </div>
        <button type="submit" class="btn btn-primary">加入</button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const emit = defineEmits(['login']);
const userName = ref('');

function handleSubmit() {
  if (userName.value.trim()) {
    emit('login', userName.value.trim());
  }
}
</script>

<style scoped>
.modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: #16213e;
  padding: 32px;
  border-radius: 12px;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.modal h2 {
  margin-bottom: 24px;
  text-align: center;
  color: #e5c07b;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  color: #abb2bf;
}

.form-group input {
  width: 100%;
  padding: 12px 16px;
  background: #1f3460;
  border: 1px solid #3a5a8a;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.form-group input:focus {
  border-color: #61afef;
}

.form-group input::placeholder {
  color: #5c6370;
}

.btn {
  width: 100%;
  padding: 12px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary {
  background: #61afef;
  color: #1a1a2e;
  font-weight: 600;
}

.btn-primary:hover {
  background: #528bcc;
}
</style>
