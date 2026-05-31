const { ipcRenderer } = require('electron');
const Papa = require('papaparse');
const cytoscape = require('cytoscape');

let cy;
let graphData = {
  nodes: [],
  edges: []
};
let originalGraphData = {
  nodes: [],
  edges: []
};
let isLargeDataset = false;
const PERFORMANCE_THRESHOLD = 500;
const LARGE_DATASET_THRESHOLD = 2000;
let isFiltered = false;

document.addEventListener('DOMContentLoaded', () => {
  initCytoscape();
  bindEvents();
});

function initCytoscape() {
  cy = cytoscape({
    container: document.getElementById('cy'),
    wheelSensitivity: 0.3,
    maxZoom: 5,
    minZoom: 0.1,
    style: getGraphStyle(false),
    layout: {
      name: 'grid',
      rows: 5
    }
  });

  cy.on('tap', 'node', (evt) => {
    const node = evt.target;
    showNodeInfo(node);
  });

  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      clearNodeInfo();
    }
  });

  cy.on('zoom', () => {
    updateDetailLevel();
  });
}

function getGraphStyle(isSimplified) {
  const baseStyle = [
    {
      selector: 'node',
      style: {
        'background-color': '#667eea',
        'width': isSimplified ? '15px' : 'mapData(transactionCount, 0, 50, 30, 80)',
        'height': isSimplified ? '15px' : 'mapData(transactionCount, 0, 50, 30, 80)',
        'label': isSimplified ? '' : 'data(shortLabel)',
        'font-size': isSimplified ? '0px' : '10px',
        'text-valign': 'center',
        'text-halign': 'center',
        'color': '#fff',
        'text-outline-width': isSimplified ? 0 : 1,
        'text-outline-color': '#667eea'
      }
    },
    {
      selector: 'node[transactionAmount > 0]',
      style: {
        'background-color': '#10b981',
        'text-outline-color': '#10b981'
      }
    },
    {
      selector: 'node[transactionAmount < 0]',
      style: {
        'background-color': '#ef4444',
        'text-outline-color': '#ef4444'
      }
    },
    {
      selector: 'edge',
      style: {
        'width': isSimplified ? '1px' : 'mapData(amount, 0, 100000, 1, 8)',
        'line-color': isSimplified ? '#c7d2fe' : '#a5b4fc',
        'target-arrow-color': isSimplified ? '#c7d2fe' : '#a5b4fc',
        'target-arrow-shape': isSimplified ? 'none' : 'triangle',
        'curve-style': 'straight',
        'label': '',
        'opacity': isSimplified ? 0.6 : 1
      }
    },
    {
      selector: 'edge[amount > 10000]',
      style: {
        'line-color': '#ef4444',
        'target-arrow-color': '#ef4444',
        'opacity': 0.9
      }
    },
    {
      selector: ':selected',
      style: {
        'background-color': '#f59e0b',
        'line-color': '#f59e0b',
        'target-arrow-color': '#f59e0b',
        'source-arrow-color': '#f59e0b',
        'label': 'data(label)',
        'font-size': '12px',
        'z-index': 9999
      }
    },
    {
      selector: 'node:selected',
      style: {
        'label': 'data(label)',
        'font-size': '14px'
      }
    }
  ];

  return baseStyle;
}

function updateDetailLevel() {
  if (!isLargeDataset) return;
  
  const zoom = cy.zoom();
  const elements = cy.elements();
  
  if (zoom < 0.5) {
    elements.style('label', '');
    elements.style('font-size', '0px');
    cy.edges().style('target-arrow-shape', 'none');
  } else if (zoom < 1) {
    elements.style('label', 'data(shortLabel)');
    elements.style('font-size', '8px');
    cy.edges().style('target-arrow-shape', 'none');
  } else {
    elements.style('label', 'data(shortLabel)');
    elements.style('font-size', '10px');
    cy.edges().style('target-arrow-shape', 'triangle');
  }
}

let detectedCycles = [];
let selectedCycleIndex = -1;

function bindEvents() {
  document.getElementById('importBtn').addEventListener('click', importCSV);
  document.getElementById('saveBtn').addEventListener('click', saveGraph);
  document.getElementById('loadBtn').addEventListener('click', loadGraph);
  document.getElementById('clearBtn').addEventListener('click', clearGraph);
  
  document.getElementById('layoutCircle').addEventListener('click', () => setLayout('circle'));
  document.getElementById('layoutGrid').addEventListener('click', () => setLayout('grid'));
  document.getElementById('layoutConcentric').addEventListener('click', () => setLayout('concentric'));
  document.getElementById('layoutCose').addEventListener('click', () => setLayout('cose'));
  
  document.getElementById('applyFilter').addEventListener('click', applyTopNFilter);
  document.getElementById('showAllNodes').addEventListener('click', showAllNodes);
  
  document.getElementById('detectRisk').addEventListener('click', detectCycles);
  document.getElementById('clearRisk').addEventListener('click', clearRiskHighlight);
}

function applyTopNFilter() {
  const topN = parseInt(document.getElementById('topNFilter').value) || 1000;
  
  showLoading(`正在筛选 Top ${topN} 活跃节点...`);
  
  setTimeout(() => {
    const sortedNodes = [...originalGraphData.nodes].sort((a, b) => 
      b.transactionCount - a.transactionCount
    );
    
    const topNodes = sortedNodes.slice(0, topN);
    const nodeIds = new Set(topNodes.map(n => n.id));
    
    const filteredEdges = originalGraphData.edges.filter(edge => 
      nodeIds.has(edge.source) && nodeIds.has(edge.target)
    );
    
    graphData.nodes = topNodes;
    graphData.edges = filteredEdges;
    isFiltered = true;
    
    updateGraph();
    
    const totalAmount = filteredEdges.reduce((sum, e) => sum + e.amount, 0);
    updateStats(totalAmount);
    hideLoading();
    
    document.getElementById('performanceHint').textContent = 
      `⚡ 显示 Top ${topN} 节点 (共 ${originalGraphData.nodes.length} 个)`;
  }, 50);
}

function showAllNodes() {
  showLoading('正在恢复全部节点...');
  
  setTimeout(() => {
    graphData.nodes = [...originalGraphData.nodes];
    graphData.edges = [...originalGraphData.edges];
    isFiltered = false;
    
    updateGraph();
    
    const totalAmount = graphData.edges.reduce((sum, e) => sum + e.amount, 0);
    updateStats(totalAmount);
    hideLoading();
    
    document.getElementById('performanceHint').textContent = '⚡ 大数据模式已启用 - 缩放以查看更多详情';
  }, 50);
}

async function importCSV() {
  const result = await ipcRenderer.invoke('select-csv-file');
  
  if (result.success) {
    parseCSV(result.content);
  }
}

function parseCSV(content) {
  const payerColumn = document.getElementById('payerColumn').value || '付款方';
  const payeeColumn = document.getElementById('payeeColumn').value || '收款方';
  const amountColumn = document.getElementById('amountColumn').value || '金额';
  const dateColumn = document.getElementById('dateColumn').value || '交易日期';
  const remarkColumn = document.getElementById('remarkColumn').value || '备注';

  const parsed = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    encoding: 'UTF-8'
  });

  if (parsed.errors.length > 0) {
    alert('CSV解析错误: ' + parsed.errors[0].message);
    return;
  }

  const transactions = parsed.data;
  buildGraph(transactions, {
    payerColumn,
    payeeColumn,
    amountColumn,
    dateColumn,
    remarkColumn
  });
}

function showLoading(text = '正在加载数据...') {
  document.getElementById('loadingText').textContent = text;
  document.getElementById('loadingState').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loadingState').classList.add('hidden');
}

function showPerformanceHint() {
  document.getElementById('performanceHint').classList.remove('hidden');
}

function hidePerformanceHint() {
  document.getElementById('performanceHint').classList.add('hidden');
}

function buildGraph(transactions, columns) {
  showLoading('正在构建交易图谱...');
  
  setTimeout(() => {
    processTransactions(transactions, columns);
  }, 50);
}

function processTransactions(transactions, columns) {
  const nodes = new Map();
  const edges = new Map();
  let totalAmount = 0;
  const chunkSize = 1000;
  let processed = 0;

  function processChunk() {
    const endIndex = Math.min(processed + chunkSize, transactions.length);
    
    for (let i = processed; i < endIndex; i++) {
      const tx = transactions[i];
      const payer = tx[columns.payerColumn]?.trim();
      const payee = tx[columns.payeeColumn]?.trim();
      let amount = parseFloat(tx[columns.amountColumn]?.replace(/[^0-9.-]/g, '')) || 0;
      const date = tx[columns.dateColumn] || '';
      const remark = tx[columns.remarkColumn] || '';

      if (!payer || !payee || amount === 0) continue;

      totalAmount += Math.abs(amount);

      if (!nodes.has(payer)) {
        nodes.set(payer, {
          id: payer,
          label: payer,
          transactionCount: 0,
          transactionAmount: 0,
          outgoing: 0,
          incoming: 0,
          transactions: []
        });
      }

      if (!nodes.has(payee)) {
        nodes.set(payee, {
          id: payee,
          label: payee,
          transactionCount: 0,
          transactionAmount: 0,
          outgoing: 0,
          incoming: 0,
          transactions: []
        });
      }

      const payerNode = nodes.get(payer);
      const payeeNode = nodes.get(payee);

      payerNode.transactionCount++;
      payerNode.outgoing += amount;
      payerNode.transactionAmount -= amount;
      payerNode.transactions.push({
        type: 'out',
        counterparty: payee,
        amount: amount,
        date: date,
        remark: remark
      });

      payeeNode.transactionCount++;
      payeeNode.incoming += amount;
      payeeNode.transactionAmount += amount;
      payeeNode.transactions.push({
        type: 'in',
        counterparty: payer,
        amount: amount,
        date: date,
        remark: remark
      });

      const edgeId = `${payer}->${payee}`;
      if (!edges.has(edgeId)) {
        edges.set(edgeId, {
          id: edgeId,
          source: payer,
          target: payee,
          amount: 0,
          count: 0,
          transactions: []
        });
      }

      const edge = edges.get(edgeId);
      edge.amount += amount;
      edge.count++;
      edge.transactions.push({
        amount: amount,
        date: date,
        remark: remark
      });
    }

    processed = endIndex;
    
    if (processed < transactions.length) {
      document.getElementById('loadingText').textContent = 
        `正在处理交易数据... ${Math.round(processed / transactions.length * 100)}%`;
      requestAnimationFrame(processChunk);
    } else {
      originalGraphData.nodes = Array.from(nodes.values());
      originalGraphData.edges = Array.from(edges.values()).map(edge => ({
        ...edge,
        amountLabel: formatAmount(edge.amount)
      }));
      
      graphData.nodes = [...originalGraphData.nodes];
      graphData.edges = [...originalGraphData.edges];
      isFiltered = false;

      updateGraph();
      updateStats(totalAmount);
      hideEmptyState();
      hideLoading();
      
      if (graphData.nodes.length >= PERFORMANCE_THRESHOLD) {
        showPerformanceHint();
        document.getElementById('filterPanel').style.display = 'block';
      } else {
        hidePerformanceHint();
        document.getElementById('filterPanel').style.display = 'none';
      }
    }
  }

  processChunk();
}

function updateGraph() {
  const nodeCount = graphData.nodes.length;
  isLargeDataset = nodeCount >= PERFORMANCE_THRESHOLD;
  
  graphData.nodes.forEach(node => {
    node.shortLabel = node.label.length > 8 ? node.label.substring(0, 8) + '...' : node.label;
  });
  
  cy.style(getGraphStyle(isLargeDataset));
  cy.elements().remove();
  
  if (isLargeDataset) {
    addElementsInBatches();
  } else {
    cy.add([
      ...graphData.nodes.map(node => ({ group: 'nodes', data: node })),
      ...graphData.edges.map(edge => ({ group: 'edges', data: edge }))
    ]);
    setLayout('cose');
  }
}

function addElementsInBatches() {
  const batchSize = 500;
  const allNodes = graphData.nodes.map(node => ({ group: 'nodes', data: node }));
  const allEdges = graphData.edges.map(edge => ({ group: 'edges', data: edge }));
  const allElements = [...allNodes, ...allEdges];
  
  let currentIndex = 0;
  
  function addBatch() {
    const endIndex = Math.min(currentIndex + batchSize, allElements.length);
    const batch = allElements.slice(currentIndex, endIndex);
    
    cy.add(batch);
    currentIndex = endIndex;
    
    if (currentIndex < allElements.length) {
      requestAnimationFrame(addBatch);
    } else {
      setLayout(isLargeDataset ? 'grid' : 'cose');
    }
  }
  
  addBatch();
}

function setLayout(name) {
  const nodeCount = graphData.nodes.length;
  const useAnimation = nodeCount < PERFORMANCE_THRESHOLD;
  
  const layouts = {
    circle: { 
      name: 'circle', 
      radius: Math.min(500, Math.max(200, nodeCount * 5)),
      animate: useAnimation,
      animationDuration: useAnimation ? 500 : 0
    },
    grid: { 
      name: 'grid', 
      rows: Math.ceil(Math.sqrt(nodeCount)),
      animate: useAnimation,
      animationDuration: useAnimation ? 500 : 0
    },
    concentric: { 
      name: 'concentric', 
      minNodeSpacing: nodeCount > 1000 ? 30 : 80,
      animate: useAnimation,
      animationDuration: useAnimation ? 800 : 0
    },
    cose: { 
      name: nodeCount > PERFORMANCE_THRESHOLD ? 'grid' : 'cose',
      animate: useAnimation,
      animationDuration: useAnimation ? 1000 : 0,
      idealEdgeLength: nodeCount > 1000 ? 30 : 100,
      nodeOverlap: nodeCount > 1000 ? 5 : 20,
      rows: Math.ceil(Math.sqrt(nodeCount))
    }
  };

  const layoutConfig = layouts[name];
  if (nodeCount > LARGE_DATASET_THRESHOLD && layoutConfig.name !== 'grid') {
    layoutConfig.name = 'grid';
    layoutConfig.rows = Math.ceil(Math.sqrt(nodeCount));
  }

  cy.layout(layoutConfig).run();
}

function updateStats(totalAmount) {
  document.getElementById('nodeCount').textContent = graphData.nodes.length;
  document.getElementById('edgeCount').textContent = graphData.edges.length;
  document.getElementById('totalAmount').textContent = formatAmount(totalAmount);
}

function showNodeInfo(node) {
  const data = node.data();
  const nodeInfo = document.getElementById('nodeInfo');
  
  let transactionsHtml = '';
  if (data.transactions && data.transactions.length > 0) {
    const recentTransactions = data.transactions.slice(-10).reverse();
    transactionsHtml = `
      <div class="node-detail-item">
        <div class="node-detail-label">最近交易:</div>
        <div class="transaction-list">
          ${recentTransactions.map(tx => `
            <div class="transaction-item">
              <div>
                ${tx.type === 'in' ? '← 收入' : '→ 支出'}: 
                <span class="transaction-amount">${formatAmount(tx.amount)}</span>
                <span class="transaction-date">${tx.date}</span>
              </div>
              <div>对方: ${tx.counterparty}</div>
              ${tx.remark ? `<div class="transaction-remark">备注: ${tx.remark}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  nodeInfo.innerHTML = `
    <div class="node-details">
      <div class="node-detail-item">
        <div class="node-detail-label">账户名称:</div>
        <div class="node-detail-value">${data.label}</div>
      </div>
      <div class="node-detail-item">
        <div class="node-detail-label">交易次数:</div>
        <div class="node-detail-value">${data.transactionCount} 次</div>
      </div>
      <div class="node-detail-item">
        <div class="node-detail-label">总收入:</div>
        <div class="node-detail-value" style="color: #10b981;">+${formatAmount(data.incoming)}</div>
      </div>
      <div class="node-detail-item">
        <div class="node-detail-label">总支出:</div>
        <div class="node-detail-value" style="color: #ef4444;">-${formatAmount(data.outgoing)}</div>
      </div>
      <div class="node-detail-item">
        <div class="node-detail-label">净收支:</div>
        <div class="node-detail-value" style="color: ${data.transactionAmount >= 0 ? '#10b981' : '#ef4444'};">
          ${data.transactionAmount >= 0 ? '+' : ''}${formatAmount(data.transactionAmount)}
        </div>
      </div>
      ${transactionsHtml}
    </div>
  `;
}

function clearNodeInfo() {
  document.getElementById('nodeInfo').innerHTML = '<p class="empty-text">点击节点查看详情</p>';
}

function formatAmount(amount) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2
  }).format(Math.abs(amount));
}

async function saveGraph() {
  if (graphData.nodes.length === 0) {
    alert('没有数据可保存');
    return;
  }
  
  await ipcRenderer.invoke('save-graph-data', graphData);
}

async function loadGraph() {
  const result = await ipcRenderer.invoke('load-graph-data');
  
  if (result.success) {
    originalGraphData = JSON.parse(JSON.stringify(result.data));
    graphData = result.data;
    isFiltered = false;
    
    updateGraph();
    
    const totalAmount = graphData.edges.reduce((sum, edge) => sum + edge.amount, 0);
    updateStats(totalAmount);
    hideEmptyState();
    
    if (graphData.nodes.length >= PERFORMANCE_THRESHOLD) {
      showPerformanceHint();
      document.getElementById('filterPanel').style.display = 'block';
    } else {
      hidePerformanceHint();
      document.getElementById('filterPanel').style.display = 'none';
    }
  }
}

function clearGraph() {
  graphData = { nodes: [], edges: [] };
  cy.elements().remove();
  updateStats(0);
  clearNodeInfo();
  showEmptyState();
  hidePerformanceHint();
}

function hideEmptyState() {
  document.getElementById('emptyState').classList.add('hidden');
}

function showEmptyState() {
  document.getElementById('emptyState').classList.remove('hidden');
}

function detectCycles() {
  if (graphData.nodes.length === 0) {
    alert('请先导入交易数据');
    return;
  }

  showLoading('正在分析交易环路...');
  detectedCycles = [];
  selectedCycleIndex = -1;

  setTimeout(() => {
    const cycles = findAllCycles();
    const scoredCycles = cycles.map(cycle => ({
      path: cycle,
      amount: calculateCycleAmount(cycle),
      riskScore: calculateRiskScore(cycle),
      nodeCount: cycle.length
    }));

    scoredCycles.sort((a, b) => b.riskScore - a.riskScore);
    detectedCycles = scoredCycles.slice(0, 50);

    displayRiskResults(detectedCycles);
    hideLoading();

    if (detectedCycles.length > 0) {
      highlightCycle(0);
    }
  }, 100);
}

function findAllCycles() {
  const adjacency = buildAdjacencyList();
  const cycles = [];
  const maxCycles = 100;
  const maxPathLength = 15;
  const startTime = Date.now();
  const timeout = 30000;

  const nodes = Object.keys(adjacency);
  
  for (let startNode of nodes) {
    if (cycles.length >= maxCycles || Date.now() - startTime > timeout) break;
    
    const visited = new Set();
    const path = [];
    
    function dfs(current, start) {
      if (cycles.length >= maxCycles || Date.now() - startTime > timeout) return;
      if (path.length > maxPathLength) return;
      
      visited.add(current);
      path.push(current);

      const neighbors = adjacency[current] || [];
      for (let neighbor of neighbors) {
        if (neighbor === start && path.length >= 2) {
          const cycle = [...path, start];
          const normalized = normalizeCycle(cycle);
          if (!isDuplicateCycle(cycles, normalized)) {
            cycles.push(normalized);
          }
        } else if (!visited.has(neighbor) && path.indexOf(neighbor) === -1) {
          dfs(neighbor, start);
        }
      }

      path.pop();
      visited.delete(current);
    }

    dfs(startNode, startNode);
  }

  return cycles;
}

function buildAdjacencyList() {
  const adjacency = {};
  
  for (let edge of graphData.edges) {
    if (!adjacency[edge.source]) {
      adjacency[edge.source] = [];
    }
    if (!adjacency[edge.source].includes(edge.target)) {
      adjacency[edge.source].push(edge.target);
    }
  }
  
  return adjacency;
}

function normalizeCycle(cycle) {
  const minIndex = cycle.indexOf(Math.min(...cycle.slice(0, -1)));
  const normalized = [...cycle.slice(minIndex, -1), ...cycle.slice(0, minIndex + 1)];
  return normalized;
}

function isDuplicateCycle(cycles, newCycle) {
  const newCycleKey = newCycle.join('->');
  return cycles.some(cycle => {
    const cycleKey = cycle.join('->');
    const reversedCycleKey = [...cycle].reverse().join('->');
    return cycleKey === newCycleKey || reversedCycleKey === newCycleKey;
  });
}

function calculateCycleAmount(cycle) {
  let totalAmount = 0;
  
  for (let i = 0; i < cycle.length - 1; i++) {
    const source = cycle[i];
    const target = cycle[i + 1];
    
    const edge = graphData.edges.find(e => 
      e.source === source && e.target === target
    );
    
    if (edge) {
      totalAmount += edge.amount;
    }
  }
  
  return totalAmount;
}

function calculateRiskScore(cycle) {
  let score = 0;
  const cycleAmount = calculateCycleAmount(cycle);
  const pathLength = cycle.length - 1;

  score += Math.min(pathLength * 10, 50);

  const amountLog = Math.log10(cycleAmount + 1);
  score += Math.min(amountLog * 8, 40);

  const nodeActivity = cycle.slice(0, -1).map(nodeId => {
    const node = graphData.nodes.find(n => n.id === nodeId);
    return node ? node.transactionCount : 0;
  });
  const avgActivity = nodeActivity.reduce((a, b) => a + b, 0) / nodeActivity.length;
  score += Math.min(avgActivity / 5, 30);

  if (cycleAmount >= 1000000) score += 20;
  else if (cycleAmount >= 100000) score += 10;
  else if (cycleAmount >= 10000) score += 5;

  return Math.min(Math.round(score), 100);
}

function getRiskLevel(score) {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function highlightCycle(index) {
  if (index < 0 || index >= detectedCycles.length) return;

  clearRiskHighlight();
  selectedCycleIndex = index;

  const cycle = detectedCycles[index];
  const nodeIds = cycle.path.slice(0, -1);
  const edgeIds = [];

  for (let i = 0; i < cycle.path.length - 1; i++) {
    const source = cycle.path[i];
    const target = cycle.path[i + 1];
    const edge = graphData.edges.find(e => e.source === source && e.target === target);
    if (edge) edgeIds.push(edge.id);
  }

  const nodes = cy.nodes(nodeIds.map(id => `[id = "${id}"]`).join(','));
  const edges = cy.edges(edgeIds.map(id => `[id = "${id}"]`).join(','));

  nodes.style({
    'background-color': '#ef4444',
    'border-width': 4,
    'border-color': '#b91c1c',
    'z-index': 9999
  });

  edges.style({
    'line-color': '#ef4444',
    'target-arrow-color': '#ef4444',
    'width': (ele) => Math.max(ele.width() * 1.5, 8),
    'z-index': 9998
  });

  const riskItems = document.querySelectorAll('.risk-item');
  riskItems.forEach((item, i) => {
    item.classList.toggle('selected', i === index);
  });

  nodes.layout({ name: 'preset' }).run();
}

function clearRiskHighlight() {
  cy.nodes().style({
    'background-color': (node) => {
      const data = node.data();
      if (data.transactionAmount > 0) return '#10b981';
      if (data.transactionAmount < 0) return '#ef4444';
      return '#667eea';
    },
    'border-width': 0,
    'z-index': 1
  });

  cy.edges().style({
    'line-color': (edge) => edge.data('amount') > 10000 ? '#ef4444' : '#a5b4fc',
    'target-arrow-color': (edge) => edge.data('amount') > 10000 ? '#ef4444' : '#a5b4fc',
    'width': isLargeDataset ? 1 : 'mapData(amount, 0, 100000, 1, 8)',
    'z-index': 1
  });

  selectedCycleIndex = -1;
  document.querySelectorAll('.risk-item').forEach(item => {
    item.classList.remove('selected');
  });
}

function displayRiskResults(cycles) {
  const riskList = document.getElementById('riskList');
  const riskStats = document.getElementById('riskStats');

  if (cycles.length === 0) {
    riskList.innerHTML = '<p class="empty-text">未发现可疑环路交易</p>';
    riskStats.style.display = 'none';
    return;
  }

  riskStats.style.display = 'block';
  document.getElementById('cycleCount').textContent = cycles.length;
  
  const totalRiskAmount = cycles.reduce((sum, c) => sum + c.amount, 0);
  document.getElementById('totalRiskAmount').textContent = formatAmount(totalRiskAmount);

  riskList.innerHTML = cycles.map((cycle, index) => {
    const riskLevel = getRiskLevel(cycle.riskScore);
    const pathStr = cycle.path.join(' → ');
    
    return `
      <div class="risk-item risk-level-${riskLevel}" onclick="window.highlightCycleByIndex(${index})">
        <div class="risk-title">
          环路 #${index + 1} - ${riskLevel === 'high' ? '高风险' : riskLevel === 'medium' ? '中风险' : '低风险'}
        </div>
        <div class="risk-path" title="${pathStr}">
          ${pathStr.length > 60 ? pathStr.substring(0, 60) + '...' : pathStr}
        </div>
        <div class="risk-meta">
          <span class="risk-score">风险评分: ${cycle.riskScore}/100</span>
          <span class="risk-amount">涉及金额: ${formatAmount(cycle.amount)}</span>
        </div>
      </div>
    `;
  }).join('');
}

window.highlightCycleByIndex = function(index) {
  highlightCycle(index);
};
