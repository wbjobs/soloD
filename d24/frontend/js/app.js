let ws;
let orders = [];
let filteredOrders = [];
let pressureHistory = [];
let totalOrders = 0;
let isFiltering = false;
let orderUpdateTimer = null;
let pendingOrders = [];
const UPDATE_THROTTLE = 100;

let isReplaying = false;
let isPaused = false;
let replayData = [];
let replayIndex = 0;
let playSpeed = 1;
let replayTimer = null;
let originalOrders = [];
let isLiveMode = true;

function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
        console.log('WebSocket connected');
        ws.send(JSON.stringify({ type: 'getHistory' }));
        ws.send(JSON.stringify({ type: 'getAnnotations' }));
    };

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleMessage(message);
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting...');
        setTimeout(initWebSocket, 3000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function handleMessage(message) {
    switch (message.type) {
        case 'order':
            if (isLiveMode) handleOrder(message.data);
            break;
        case 'ordersBatch':
            if (isLiveMode) handleOrdersBatch(message.data);
            break;
        case 'pressure':
            if (isLiveMode) handlePressure(message.data);
            break;
        case 'history':
            orders = message.data;
            filteredOrders = [...orders];
            totalOrders = orders.length;
            updateOrderCount();
            updateCharts();
            break;
        case 'replayData':
            replayData = message.data;
            replayIndex = 0;
            document.getElementById('replayProgress').textContent = `已加载: ${replayData.length} 笔订单`;
            alert(`成功加载 ${replayData.length} 笔订单数据，点击播放开始回放`);
            break;
        case 'annotations':
            loadAnnotations(message.data);
            break;
        case 'annotationSaved':
            addAnnotationToList(message.data);
            break;
    }
}

function handleOrdersBatch(ordersBatch) {
    if (!isFiltering) {
        orders.push(...ordersBatch);
        filteredOrders.push(...ordersBatch);
        
        const excess = orders.length - 1000;
        if (excess > 0) {
            orders.splice(0, excess);
            filteredOrders.splice(0, excess);
        }
    }
    totalOrders += ordersBatch.length;
    
    pendingOrders.push(...ordersBatch);
    throttleUpdate();
}

function handleOrder(order) {
    if (!isFiltering) {
        orders.push(order);
        filteredOrders.push(order);
        if (orders.length > 1000) {
            orders.shift();
            filteredOrders.shift();
        }
    }
    totalOrders++;
    
    pendingOrders.push(order);
    throttleUpdate();
}

function throttleUpdate() {
    if (orderUpdateTimer) return;
    
    orderUpdateTimer = setTimeout(() => {
        updateOrderCount();
        if (pendingOrders.length > 0) {
            updateWaterfallChartBatch();
        }
        pendingOrders = [];
        orderUpdateTimer = null;
    }, UPDATE_THROTTLE);
}

function handlePressure(pressure) {
    pressure.timestamp = new Date();
    pressureHistory.push(pressure);
    if (pressureHistory.length > 100) {
        pressureHistory.shift();
    }
    updatePressureDisplay(pressure);
    updatePressureChart();
}

function updateOrderCount() {
    document.getElementById('orderCount').textContent = totalOrders.toLocaleString();
}

function updatePressureDisplay(pressure) {
    document.getElementById('buyPressure').textContent = Math.round(pressure.buyPressure).toLocaleString();
    document.getElementById('sellPressure').textContent = Math.round(pressure.sellPressure).toLocaleString();
    document.getElementById('pressureRatio').textContent = pressure.ratio;
}

function filterByTime() {
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;
    
    if (!startTime || !endTime) {
        alert('请选择开始和结束时间');
        return;
    }

    isFiltering = true;
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();

    ws.send(JSON.stringify({
        type: 'getHistory',
        data: { startTime, endTime }
    }));
}

function resetFilter() {
    isFiltering = false;
    document.getElementById('startTime').value = '';
    document.getElementById('endTime').value = '';
    ws.send(JSON.stringify({ type: 'getHistory' }));
}

function loadReplayData() {
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;
    
    ws.send(JSON.stringify({
        type: 'getReplayData',
        data: { startTime, endTime }
    }));
}

function togglePlay() {
    if (replayData.length === 0) {
        alert('请先加载回放数据');
        return;
    }
    
    if (isReplaying && !isPaused) {
        pauseReplay();
    } else {
        startReplay();
    }
}

function startReplay() {
    if (replayIndex === 0) {
        originalOrders = [...orders];
        orders = [];
        filteredOrders = [];
        pressureHistory = [];
        isLiveMode = false;
    }
    
    isReplaying = true;
    isPaused = false;
    document.getElementById('playBtn').textContent = '⏸️ 暂停';
    
    playNextBatch();
}

function pauseReplay() {
    isPaused = true;
    document.getElementById('playBtn').textContent = '▶️ 继续';
    if (replayTimer) {
        clearTimeout(replayTimer);
        replayTimer = null;
    }
}

function stopReplay() {
    isReplaying = false;
    isPaused = false;
    isLiveMode = true;
    if (replayTimer) {
        clearTimeout(replayTimer);
        replayTimer = null;
    }
    replayIndex = 0;
    document.getElementById('playBtn').textContent = '▶️ 播放';
    document.getElementById('replayProgress').textContent = `已加载: ${replayData.length} 笔`;
    
    orders = [...originalOrders];
    filteredOrders = [...orders];
    updateCharts();
}

function playNextBatch() {
    if (!isReplaying || isPaused) return;
    if (replayIndex >= replayData.length) {
        stopReplay();
        alert('回放完成！');
        return;
    }
    
    const batchSize = Math.min(10 * playSpeed, replayData.length - replayIndex);
    const batch = replayData.slice(replayIndex, replayIndex + batchSize);
    
    batch.forEach(order => {
        orders.push(order);
        filteredOrders.push(order);
    });
    
    const excess = orders.length - 1000;
    if (excess > 0) {
        orders.splice(0, excess);
        filteredOrders.splice(0, excess);
    }
    
    replayIndex += batchSize;
    totalOrders = replayIndex;
    
    updateOrderCount();
    updateReplayPressure();
    updateWaterfallChartBatch();
    
    document.getElementById('replayProgress').textContent = 
        `进度: ${Math.round(replayIndex / replayData.length * 100)}% (${replayIndex}/${replayData.length})`;
    
    const delay = Math.max(10, 100 / playSpeed);
    replayTimer = setTimeout(playNextBatch, delay);
}

function updateReplayPressure() {
    let buyPressure = 0;
    let sellPressure = 0;
    const now = new Date();
    const windowStart = new Date(now.getTime() - 1000);
    
    orders.forEach(order => {
        const orderTime = new Date(order.timestamp);
        if (orderTime >= windowStart) {
            if (order.direction === 'buy') {
                buyPressure += order.value;
            } else {
                sellPressure += order.value;
            }
        }
    });
    
    pressureHistory.push({
        timestamp: now,
        buyPressure,
        sellPressure
    });
    
    if (pressureHistory.length > 100) {
        pressureHistory.shift();
    }
    
    updatePressureChart();
}

function setPlaySpeed(speed) {
    playSpeed = parseFloat(speed);
}

document.addEventListener('DOMContentLoaded', () => {
    initWebSocket();
    initCharts();
    initDrawing();
    
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    document.getElementById('endTime').value = now.toISOString().slice(0, 16);
    document.getElementById('startTime').value = tenMinutesAgo.toISOString().slice(0, 16);
});