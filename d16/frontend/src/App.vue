<template>
  <div class="app">
    <div class="header">
      <div class="header-left">
        <h1>📝 协作 Markdown 编辑器</h1>
        <div class="status" :class="{ connected: docStore.connected }">
          {{ docStore.connected ? '● 已连接' : '○ 未连接' }}
        </div>
      </div>
      <div class="header-right">
        <div class="version">版本: {{ docStore.version }}</div>
      </div>
    </div>

    <div class="main">
      <div class="sidebar">
        <div class="sidebar-section">
          <h3>文档</h3>
          <button class="btn btn-primary" @click="createNewDoc">新建文档</button>
          <div class="doc-list">
            <div 
              v-for="doc in documents" 
              :key="doc.id" 
              class="doc-item"
              :class="{ active: doc.id === docStore.docId }"
              @click="joinDocument(doc.id)"
            >
              <span class="doc-name">{{ doc.id.slice(0, 8) }}...</span>
              <span class="doc-users">{{ doc.userCount }} 人在线</span>
            </div>
          </div>
        </div>

        <div class="sidebar-section" v-if="docStore.docId">
          <h3>在线用户 ({{ docStore.users.length }})</h3>
          <div class="user-list">
            <div 
              v-for="user in docStore.users" 
              :key="user.id" 
              class="user-item"
            >
              <span class="user-dot" :style="{ background: getUserColor(user.id) }"></span>
              <span class="user-name">{{ user.name }}</span>
              <span v-if="user.id === docStore.userId" class="you-badge">你</span>
            </div>
          </div>
        </div>
      </div>

      <div class="content">
        <LoginModal 
          v-if="!docStore.docId && showLogin" 
          @login="handleLogin"
        />
        <Editor v-else />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useDocumentStore } from './stores/document';
import Editor from './components/Editor.vue';
import LoginModal from './components/LoginModal.vue';

const docStore = useDocumentStore();
const documents = ref([]);
const showLogin = ref(false);
const pendingDocId = ref(null);

const userColors = [
  '#61afef',
  '#98c379',
  '#e5c07b',
  '#c678dd',
  '#e06c75',
  '#56b6c2',
  '#d19a66',
  '#8b5cf6'
];

function getUserColor(userId) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return userColors[Math.abs(hash) % userColors.length];
}

async function fetchDocuments() {
  try {
    const res = await fetch('http://localhost:4000/api/documents');
    documents.value = await res.json();
  } catch (e) {
    console.error('Failed to fetch documents:', e);
  }
}

async function createNewDoc() {
  try {
    const res = await fetch('http://localhost:4000/api/documents', {
      method: 'POST'
    });
    const data = await res.json();
    pendingDocId.value = data.id;
    showLogin.value = true;
    await fetchDocuments();
  } catch (e) {
    console.error('Failed to create document:', e);
  }
}

function joinDocument(docId) {
  pendingDocId.value = docId;
  showLogin.value = true;
}

function handleLogin(userName) {
  docStore.joinDocument(pendingDocId.value, userName);
  showLogin.value = false;
}

onMounted(() => {
  docStore.connect();
  fetchDocuments();
  setInterval(fetchDocuments, 5000);
});
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: #16213e;
  border-bottom: 1px solid #0f3460;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 20px;
}

.header-left h1 {
  font-size: 18px;
  font-weight: 600;
}

.status {
  font-size: 13px;
  color: #e06c75;
}

.status.connected {
  color: #98c379;
}

.version {
  font-size: 13px;
  color: #61afef;
}

.main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar {
  width: 280px;
  background: #16213e;
  border-right: 1px solid #0f3460;
  padding: 16px;
  overflow-y: auto;
}

.sidebar-section {
  margin-bottom: 24px;
}

.sidebar-section h3 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #e5c07b;
}

.btn {
  width: 100%;
  padding: 10px 16px;
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

.doc-list {
  margin-top: 12px;
}

.doc-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: #1f3460;
  border-radius: 6px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.doc-item:hover {
  background: #2a4a7a;
}

.doc-item.active {
  background: #61afef;
  color: #1a1a2e;
}

.doc-name {
  font-size: 13px;
  font-family: monospace;
}

.doc-users {
  font-size: 12px;
  opacity: 0.8;
}

.user-list {
  margin-top: 8px;
}

.user-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #1f3460;
  border-radius: 6px;
  margin-bottom: 6px;
}

.user-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.user-name {
  flex: 1;
  font-size: 13px;
}

.you-badge {
  font-size: 10px;
  background: #98c379;
  color: #1a1a2e;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.content {
  flex: 1;
  padding: 16px;
  overflow: hidden;
}
</style>
