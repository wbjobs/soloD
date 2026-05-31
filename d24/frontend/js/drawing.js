let isDrawing = false;
let currentDrawColor = '#ff6b6b';
let currentPath = [];
let annotations = [];
let activeCanvas = null;

function initDrawing() {
    setupCanvas('pressureCanvas', 'pressureWrapper');
    setupCanvas('waterfallCanvas', 'waterfallWrapper');
    
    window.addEventListener('resize', () => {
        resizeCanvases();
        redrawAllAnnotations();
    });
}

function setupCanvas(canvasId, wrapperId) {
    const canvas = document.getElementById(canvasId);
    const wrapper = document.getElementById(wrapperId);
    
    function resize() {
        const rect = wrapper.getBoundingClientRect();
        canvas.width = rect.width - 30;
        canvas.height = 400;
    }
    
    resize();
    canvas.resize = resize;
    
    canvas.addEventListener('mousedown', (e) => startDrawing(e, canvas));
    canvas.addEventListener('mousemove', (e) => draw(e, canvas));
    canvas.addEventListener('mouseup', (e) => stopDrawing(e, canvas));
    canvas.addEventListener('mouseleave', (e) => stopDrawing(e, canvas));
}

function resizeCanvases() {
    document.getElementById('pressureCanvas').resize();
    document.getElementById('waterfallCanvas').resize();
}

function toggleDrawing() {
    isDrawing = !isDrawing;
    const btn = document.getElementById('drawBtn');
    const pressureCanvas = document.getElementById('pressureCanvas');
    const waterfallCanvas = document.getElementById('waterfallCanvas');
    
    if (isDrawing) {
        btn.classList.add('active');
        btn.textContent = '🖌️ 停止标注';
        pressureCanvas.classList.add('active');
        waterfallCanvas.classList.add('active');
    } else {
        btn.classList.remove('active');
        btn.textContent = '🖌️ 开始标注';
        pressureCanvas.classList.remove('active');
        waterfallCanvas.classList.remove('active');
    }
}

function setDrawColor(color) {
    currentDrawColor = color;
    document.querySelectorAll('.color-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.style.background === color || btn.style.backgroundColor === color) {
            btn.classList.add('active');
        }
    });
}

function startDrawing(e, canvas) {
    if (!isDrawing) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    activeCanvas = canvas;
    currentPath = [{ x, y }];
}

function draw(e, canvas) {
    if (!isDrawing || !currentPath.length || canvas !== activeCanvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    currentPath.push({ x, y });
    
    const ctx = canvas.getContext('2d');
    const lastPoint = currentPath[currentPath.length - 2];
    
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(x, y);
    ctx.strokeStyle = currentDrawColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
}

function stopDrawing(e, canvas) {
    if (!isDrawing || !currentPath.length || canvas !== activeCanvas) return;
    
    if (currentPath.length > 1) {
        const annotation = {
            id: Date.now().toString(),
            canvasId: canvas.id,
            path: [...currentPath],
            color: currentDrawColor,
            timestamp: new Date().toISOString()
        };
        
        annotations.push(annotation);
        saveAnnotation(annotation);
    }
    
    currentPath = [];
    activeCanvas = null;
}

function saveAnnotation(annotation) {
    ws.send(JSON.stringify({
        type: 'saveAnnotation',
        data: annotation
    }));
}

function addAnnotationToList(annotation) {
    const list = document.getElementById('annotationsList');
    const time = new Date(annotation.timestamp).toLocaleString();
    
    const item = document.createElement('div');
    item.className = 'annotation-item';
    item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <div class="annotation-color" style="background: ${annotation.color}"></div>
            <span>${annotation.canvasId === 'pressureCanvas' ? '压力图' : '瀑布图'} 标注</span>
        </div>
        <span class="annotation-time">${time}</span>
    `;
    
    list.insertBefore(item, list.firstChild);
}

function loadAnnotations(annotationList) {
    annotations = annotationList || [];
    const list = document.getElementById('annotationsList');
    list.innerHTML = '';
    
    annotations.forEach(annotation => {
        addAnnotationToList(annotation);
    });
    
    redrawAllAnnotations();
}

function redrawAllAnnotations() {
    ['pressureCanvas', 'waterfallCanvas'].forEach(canvasId => {
        const canvas = document.getElementById(canvasId);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        annotations
            .filter(a => a.canvasId === canvasId)
            .forEach(annotation => {
                drawAnnotationPath(ctx, annotation.path, annotation.color);
            });
    });
}

function drawAnnotationPath(ctx, path, color) {
    if (path.length < 2) return;
    
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    
    for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x, path[i].y);
    }
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
}

function clearAnnotations() {
    annotations = [];
    redrawAllAnnotations();
    document.getElementById('annotationsList').innerHTML = '';
    
    ws.send(JSON.stringify({
        type: 'clearAnnotations'
    }));
}