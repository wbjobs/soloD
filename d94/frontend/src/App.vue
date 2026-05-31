<template>
  <div class="app">
    <header class="app-header">
      <div class="header-content">
        <div class="logo">
          <span class="logo-icon">🔗</span>
          <h1 class="logo-text">Social Graph</h1>
        </div>
        <div class="header-tagline">社交媒体关系图谱分析工具</div>
      </div>
    </header>
    
    <main class="app-main">
      <aside class="sidebar-left">
        <ControlPanel @fetch="handleFetch" />
      </aside>
      
      <section class="graph-area">
        <Graph 
          :nodes="graphData.nodes" 
          :links="graphData.links" 
          :loading="loading"
          @node-click="handleNodeClick"
        />
      </section>
      
      <aside class="sidebar-right">
        <InfoPanel 
          :metadata="graphData.metadata" 
          :selected-node="selectedNode"
          @clear-selection="selectedNode = null"
        />
      </aside>
    </main>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import ControlPanel from './components/ControlPanel.vue'
import InfoPanel from './components/InfoPanel.vue'
import Graph from './components/Graph.vue'
import { fetchGraph } from './api/graph'

const loading = ref(false)
const selectedNode = ref(null)
const graphData = reactive({
  nodes: [],
  links: [],
  metadata: null
})

const handleFetch = async (platform, username, depth) => {
  loading.value = true
  selectedNode.value = null
  
  try {
    const data = await fetchGraph(platform, username, depth)
    graphData.nodes = data.nodes || []
    graphData.links = data.links || []
    graphData.metadata = data.metadata || null
  } catch (error) {
    console.error('Failed to fetch graph:', error)
    graphData.nodes = []
    graphData.links = []
    graphData.metadata = null
  } finally {
    loading.value = false
  }
}

const handleNodeClick = (node) => {
  selectedNode.value = node
}
</script>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #0f0f1a;
}

.app-header {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border-bottom: 1px solid rgba(0, 212, 255, 0.2);
  padding: 16px 24px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.header-content {
  max-width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-icon {
  font-size: 32px;
}

.logo-text {
  font-family: 'Orbitron', sans-serif;
  font-size: 24px;
  font-weight: 700;
  background: linear-gradient(135deg, #00d4ff, #9d4edd);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
}

.header-tagline {
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  color: #a0a0c0;
}

.app-main {
  flex: 1;
  display: grid;
  grid-template-columns: 280px 1fr 300px;
  gap: 20px;
  padding: 20px;
  height: calc(100vh - 80px);
  box-sizing: border-box;
}

.sidebar-left,
.sidebar-right {
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}

.graph-area {
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3),
              0 0 60px rgba(0, 212, 255, 0.1);
  border: 1px solid rgba(0, 212, 255, 0.2);
}

@media (max-width: 1200px) {
  .app-main {
    grid-template-columns: 260px 1fr;
    grid-template-rows: 1fr auto;
  }
  
  .sidebar-right {
    grid-column: 1 / -1;
    flex-direction: row;
  }
}

@media (max-width: 768px) {
  .app-main {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr auto;
    height: auto;
    min-height: 100vh;
  }
  
  .graph-area {
    height: 500px;
  }
  
  .header-tagline {
    display: none;
  }
}
</style>
