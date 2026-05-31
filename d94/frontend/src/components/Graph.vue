<template>
  <div class="graph-container" ref="containerRef">
    <svg ref="svgRef" class="graph-svg"></svg>
    <div v-if="!hasData" class="graph-empty">
      <div class="empty-content">
        <span class="empty-icon">🌐</span>
        <h3>社交关系图谱</h3>
        <p>输入用户名，探索社交网络的连接</p>
      </div>
    </div>
    <div v-if="loading" class="graph-loading">
      <div class="loading-spinner"></div>
      <p>正在构建关系图谱...</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, onUnmounted } from 'vue'
import * as d3 from 'd3'

const props = defineProps({
  nodes: Array,
  links: Array,
  loading: Boolean
})

const emit = defineEmits(['node-click'])

const containerRef = ref(null)
const svgRef = ref(null)
const hasData = ref(false)

let simulation = null
let svg = null
let linkGroup = null
let nodeGroup = null
let labelGroup = null

const groupColors = {
  0: '#ff6b35',
  1: '#00d4ff',
  2: '#9d4edd',
  3: '#2ec4b6'
}

const getNodeRadius = (d) => {
  const baseRadius = d.group === 0 ? 28 : 18
  const pageRank = d.pageRank || 0.5
  return baseRadius + pageRank * 15
}

const getNodeColor = (d) => {
  const pageRank = d.pageRank || 0.5
  const groupColor = groupColors[d.group] || '#00d4ff'
  
  const r = parseInt(groupColor.slice(1, 3), 16)
  const g = parseInt(groupColor.slice(3, 5), 16)
  const b = parseInt(groupColor.slice(5, 7), 16)
  
  const intensity = 0.4 + pageRank * 0.6
  const newR = Math.min(255, Math.floor(r * intensity + 255 * (1 - intensity) * 0.3))
  const newG = Math.min(255, Math.floor(g * intensity + 255 * (1 - intensity) * 0.3))
  const newB = Math.min(255, Math.floor(b * intensity + 255 * (1 - intensity) * 0.3))
  
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`
}

const initGraph = () => {
  if (!svgRef.value || !containerRef.value) return

  const width = containerRef.value.clientWidth
  const height = containerRef.value.clientHeight

  svg = d3.select(svgRef.value)
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', [0, 0, width, height])

  svg.selectAll('*').remove()

  const g = svg.append('g')

  const zoom = d3.zoom()
    .scaleExtent([0.1, 4])
    .on('zoom', (event) => {
      g.attr('transform', event.transform)
    })

  svg.call(zoom)

  linkGroup = g.append('g').attr('class', 'links')
  nodeGroup = g.append('g').attr('class', 'nodes')
  labelGroup = g.append('g').attr('class', 'labels')

  simulation = d3.forceSimulation()
    .force('link', d3.forceLink().id(d => d.id).distance(180).strength(0.5))
    .force('charge', d3.forceManyBody().strength(-800).distanceMax(500))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(65).strength(0.8))
    .force('x', d3.forceX(width / 2).strength(0.05))
    .force('y', d3.forceY(height / 2).strength(0.05))
}

const updateGraph = (nodes, links) => {
  if (!simulation || !nodes || !links || nodes.length === 0) {
    hasData.value = false
    return
  }

  hasData.value = true

  linkGroup.selectAll('.link')
    .data(links, d => `${d.source}-${d.target}`)
    .join(
      enter => enter.append('line')
        .attr('class', 'link')
        .attr('stroke', 'rgba(157, 78, 221, 0.4)')
        .attr('stroke-width', 1.5)
        .style('opacity', 0)
        .transition()
        .duration(800)
        .style('opacity', 1),
      update => update,
      exit => exit.remove()
    )

  const nodeEnter = nodeGroup.selectAll('.node')
    .data(nodes, d => d.id)
    .join(
      enter => {
        const g = enter.append('g')
          .attr('class', 'node')
          .style('cursor', 'pointer')
          .style('opacity', 0)
          .on('click', (event, d) => {
            emit('node-click', d)
          })
          .call(d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended)
          )

        g.transition()
          .duration(800)
          .style('opacity', 1)

        g.append('circle')
          .attr('r', d => getNodeRadius(d))
          .attr('fill', d => getNodeColor(d))
          .style('filter', d => `drop-shadow(0 0 ${10 + (d.pageRank || 0.5) * 10}px ${getNodeColor(d)})`)
          .style('transition', 'all 0.3s ease')

        g.append('text')
          .text(d => d.username.charAt(0).toUpperCase())
          .attr('text-anchor', 'middle')
          .attr('dy', 5)
          .attr('fill', '#fff')
          .attr('font-family', "'Orbitron', sans-serif")
          .attr('font-size', d => d.group === 0 ? '14px' : '12px')
          .attr('font-weight', '700')
          .style('pointer-events', 'none')

        return g
      },
      update => update,
      exit => exit.remove()
    )

  nodeEnter.selectAll('circle')
    .on('mouseover', function(event, d) {
      const baseRadius = getNodeRadius(d)
      d3.select(this)
        .transition()
        .duration(200)
        .attr('r', baseRadius * 1.25)
        .style('filter', `drop-shadow(0 0 25px ${getNodeColor(d)})`)
    })
    .on('mouseout', function(event, d) {
      const baseRadius = getNodeRadius(d)
      d3.select(this)
        .transition()
        .duration(200)
        .attr('r', baseRadius)
        .style('filter', `drop-shadow(0 0 ${10 + (d.pageRank || 0.5) * 10}px ${getNodeColor(d)})`)
    })

  labelGroup.selectAll('.label')
    .data(nodes, d => d.id)
    .join(
      enter => enter.append('text')
        .attr('class', 'label')
        .text(d => d.username)
        .attr('text-anchor', 'middle')
        .attr('fill', '#c0c0e0')
        .attr('font-family', "'Inter', sans-serif")
        .attr('font-size', '11px')
        .style('pointer-events', 'none')
        .style('opacity', 0)
        .transition()
        .duration(800)
        .style('opacity', 1),
      update => update,
      exit => exit.remove()
    )

  simulation.nodes(nodes)
  simulation.force('link').links(links)
  simulation.alpha(0.8).restart()

  simulation.on('tick', () => {
    linkGroup.selectAll('.link')
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y)

    nodeGroup.selectAll('.node')
      .attr('transform', d => `translate(${d.x},${d.y})`)

    labelGroup.selectAll('.label')
      .attr('x', d => d.x)
      .attr('y', d => d.y + 45)
  })
}

const dragstarted = (event, d) => {
  if (!event.active) simulation.alphaTarget(0.3).restart()
  d.fx = d.x
  d.fy = d.y
}

const dragged = (event, d) => {
  d.fx = event.x
  d.fy = event.y
}

const dragended = (event, d) => {
  if (!event.active) simulation.alphaTarget(0)
  d.fx = null
  d.fy = null
}

watch(() => [props.nodes, props.links], ([newNodes, newLinks]) => {
  if (newNodes && newLinks) {
    updateGraph(newNodes, newLinks)
  }
}, { deep: true })

onMounted(() => {
  initGraph()
  
  window.addEventListener('resize', () => {
    if (containerRef.value && svgRef.value) {
      const width = containerRef.value.clientWidth
      const height = containerRef.value.clientHeight
      d3.select(svgRef.value)
        .attr('width', width)
        .attr('height', height)
      if (simulation) {
        simulation.force('center', d3.forceCenter(width / 2, height / 2))
        simulation.alpha(0.3).restart()
      }
    }
  })
})

onUnmounted(() => {
  if (simulation) {
    simulation.stop()
  }
})
</script>

<style scoped>
.graph-container {
  width: 100%;
  height: 100%;
  background: radial-gradient(ellipse at center, #1a1a2e 0%, #0f0f1a 100%);
  position: relative;
  overflow: hidden;
}

.graph-container::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image: 
    radial-gradient(circle at 20% 30%, rgba(0, 212, 255, 0.05) 0%, transparent 50%),
    radial-gradient(circle at 80% 70%, rgba(157, 78, 221, 0.05) 0%, transparent 50%);
  pointer-events: none;
}

.graph-svg {
  display: block;
}

.graph-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: #606080;
}

.empty-content {
  padding: 60px;
  background: rgba(26, 26, 46, 0.8);
  border: 1px solid rgba(0, 212, 255, 0.2);
  border-radius: 20px;
  backdrop-filter: blur(10px);
}

.empty-icon {
  font-size: 60px;
  display: block;
  margin-bottom: 20px;
}

.graph-empty h3 {
  font-family: 'Orbitron', sans-serif;
  font-size: 24px;
  color: #00d4ff;
  margin: 0 0 10px 0;
}

.graph-empty p {
  font-size: 14px;
  margin: 0;
  color: #a0a0c0;
}

.graph-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: #00d4ff;
}

.loading-spinner {
  width: 50px;
  height: 50px;
  border: 3px solid rgba(0, 212, 255, 0.2);
  border-top: 3px solid #00d4ff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 20px;
  box-shadow: 0 0 20px rgba(0, 212, 255, 0.3);
}

.graph-loading p {
  font-family: 'Orbitron', sans-serif;
  font-size: 14px;
  margin: 0;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

:deep(.link) {
  stroke-linecap: round;
}

:deep(.node:hover circle) {
  stroke: #fff;
  stroke-width: 3px;
}
</style>
