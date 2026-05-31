<template>
  <div class="info-panel">
    <div class="stats-section">
      <h3 class="panel-title">
        <span class="icon">📊</span>
        统计信息
      </h3>
      <div v-if="metadata" class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">{{ metadata.nodeCount }}</div>
          <div class="stat-label">节点数量</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ metadata.linkCount }}</div>
          <div class="stat-label">连接数量</div>
        </div>
        <div class="stat-card platform">
          <div class="stat-value platform-icon">{{ getPlatformIcon(metadata.platform) }}</div>
          <div class="stat-label">{{ metadata.platform.toUpperCase() }}</div>
        </div>
        <div class="stat-card root">
          <div class="stat-value root-user">@{{ metadata.rootUser }}</div>
          <div class="stat-label">根节点用户</div>
        </div>
      </div>
      <div v-else class="empty-state">
        <span class="empty-icon">🔮</span>
        <p>请输入用户并生成图谱</p>
      </div>
    </div>

    <div v-if="selectedNode" class="node-detail-section">
      <h3 class="panel-title">
        <span class="icon">👤</span>
        节点详情
      </h3>
      <div class="node-detail-card">
        <div class="node-header">
          <div class="node-avatar">
            {{ selectedNode.username.charAt(0).toUpperCase() }}
          </div>
          <div class="node-info">
            <div class="node-username">{{ selectedNode.username }}</div>
            <div class="node-group">层级: {{ selectedNode.group }}</div>
          </div>
        </div>
        <div class="node-stats">
          <div class="node-stat">
            <span class="stat-number">{{ formatNumber(selectedNode.followers || 0) }}</span>
            <span class="stat-desc">关注者</span>
          </div>
          <div class="node-stat">
            <span class="stat-number">{{ formatNumber(selectedNode.following || 0) }}</span>
            <span class="stat-desc">正在关注</span>
          </div>
          <div class="node-stat full-width">
            <div class="pagerank-bar">
              <div class="pagerank-fill" :style="{ width: (selectedNode.pageRank || 0) * 100 + '%' }"></div>
            </div>
            <span class="stat-desc">PageRank: {{ ((selectedNode.pageRank || 0) * 100).toFixed(1) }}%</span>
          </div>
        </div>
        <button @click="$emit('clear-selection')" class="close-btn">
          ✕ 关闭
        </button>
      </div>
    </div>

    <div class="legend-section">
      <h3 class="panel-title">
        <span class="icon">🎨</span>
        图例
      </h3>
      <div class="legend-items">
        <div class="legend-item">
          <div class="legend-dot group-0"></div>
          <span>根节点</span>
        </div>
        <div class="legend-item">
          <div class="legend-dot group-1"></div>
          <span>直接关注</span>
        </div>
        <div class="legend-item">
          <div class="legend-dot group-2"></div>
          <span>二级关注</span>
        </div>
        <div class="legend-item">
          <div class="legend-dot group-3"></div>
          <span>三级关注</span>
        </div>
      </div>
      <div class="pagerank-legend">
        <div class="legend-title">📊 PageRank 中心度</div>
        <div class="pagerank-scale">
          <span class="scale-label">低</span>
          <div class="scale-bar"></div>
          <span class="scale-label">高</span>
        </div>
        <p class="scale-desc">节点越大、颜色越亮，表示重要性越高</p>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  metadata: Object,
  selectedNode: Object
})

defineEmits(['clear-selection'])

const getPlatformIcon = (platform) => {
  return platform === 'twitter' ? '🐦' : '🐙'
}

const formatNumber = (num) => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}
</script>

<style scoped>
.info-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.stats-section,
.node-detail-section,
.legend-section {
  background: rgba(26, 26, 46, 0.9);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(0, 212, 255, 0.2);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.panel-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 16px;
  font-weight: 600;
  color: #00d4ff;
  margin: 0 0 16px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.stat-card {
  background: rgba(22, 33, 62, 0.8);
  border-radius: 10px;
  padding: 14px;
  text-align: center;
  border: 1px solid rgba(0, 212, 255, 0.1);
  transition: all 0.3s ease;
}

.stat-card:hover {
  border-color: rgba(0, 212, 255, 0.3);
  transform: translateY(-2px);
}

.stat-card.platform {
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.1), rgba(157, 78, 221, 0.1));
}

.stat-card.root {
  background: linear-gradient(135deg, rgba(255, 107, 53, 0.1), rgba(255, 195, 0, 0.1));
}

.stat-value {
  font-family: 'Orbitron', sans-serif;
  font-size: 24px;
  font-weight: 700;
  color: #ffffff;
  margin-bottom: 4px;
}

.stat-value.platform-icon {
  font-size: 28px;
}

.stat-value.root-user {
  font-size: 14px;
  color: #ffc300;
  word-break: break-all;
}

.stat-label {
  font-size: 11px;
  color: #a0a0c0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.empty-state {
  text-align: center;
  padding: 30px 20px;
  color: #606080;
}

.empty-icon {
  font-size: 40px;
  display: block;
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-state p {
  margin: 0;
  font-size: 13px;
}

.node-detail-card {
  background: rgba(22, 33, 62, 0.8);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid rgba(255, 107, 53, 0.3);
}

.node-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.node-avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff6b35, #ffc300);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Orbitron', sans-serif;
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  box-shadow: 0 4px 15px rgba(255, 107, 53, 0.4);
}

.node-info {
  flex: 1;
}

.node-username {
  font-family: 'Orbitron', sans-serif;
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
}

.node-group {
  font-size: 12px;
  color: #ffc300;
  margin-top: 2px;
}

.node-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 16px;
}

.node-stat {
  text-align: center;
  flex: 1;
  min-width: 80px;
}

.node-stat.full-width {
  flex: 1 1 100%;
  text-align: left;
}

.node-stat .stat-number {
  display: block;
  font-family: 'Orbitron', sans-serif;
  font-size: 18px;
  font-weight: 700;
  color: #00d4ff;
}

.node-stat .stat-desc {
  display: block;
  font-size: 11px;
  color: #a0a0c0;
  margin-top: 2px;
}

.pagerank-bar {
  width: 100%;
  height: 8px;
  background: rgba(0, 212, 255, 0.15);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 6px;
}

.pagerank-fill {
  height: 100%;
  background: linear-gradient(90deg, #00d4ff, #9d4edd);
  border-radius: 4px;
  transition: width 0.5s ease;
  box-shadow: 0 0 10px rgba(0, 212, 255, 0.5);
}

.close-btn {
  width: 100%;
  padding: 10px;
  border: 1px solid rgba(255, 107, 53, 0.3);
  border-radius: 8px;
  background: rgba(255, 107, 53, 0.1);
  color: #ff6b35;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.close-btn:hover {
  background: rgba(255, 107, 53, 0.2);
}

.legend-items {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #c0c0e0;
}

.pagerank-legend {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid rgba(0, 212, 255, 0.15);
}

.legend-title {
  font-size: 14px;
  font-weight: 600;
  color: #00d4ff;
  margin-bottom: 12px;
}

.pagerank-scale {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.scale-label {
  font-size: 11px;
  color: #a0a0c0;
}

.scale-bar {
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(90deg, rgba(0, 212, 255, 0.2), rgba(157, 78, 221, 0.8));
}

.scale-desc {
  font-size: 11px;
  color: #8080a0;
  margin: 0;
  text-align: center;
}

.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  box-shadow: 0 0 8px currentColor;
}

.legend-dot.group-0 {
  background: #ff6b35;
  color: #ff6b35;
}

.legend-dot.group-1 {
  background: #00d4ff;
  color: #00d4ff;
}

.legend-dot.group-2 {
  background: #9d4edd;
  color: #9d4edd;
}

.legend-dot.group-3 {
  background: #2ec4b6;
  color: #2ec4b6;
}
</style>
