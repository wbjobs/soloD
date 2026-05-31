import init, { SoftBody } from './pkg/soft_body_sim.js';

let wasmReady = false;
let softBody = null;
let canvas, ctx;
let animationId;

const GRID_SIZE = 15;
const SPACING = 25;

const config = {
    iterations: 5,
    forceStrength: 20,
    forceRadius: 80,
    showSprings: true,
    showPoints: true
};

const mouse = {
    x: 0,
    y: 0,
    isDown: false,
    lastX: 0,
    lastY: 0
};

let frameCount = 0;
let lastFpsUpdate = performance.now();

async function run() {
    await init();
    wasmReady = true;
    
    initCanvas();
    initSoftBody();
    initControls();
    initMouseEvents();
    
    animate();
}

function initCanvas() {
    canvas = document.getElementById('simulation');
    ctx = canvas.getContext('2d');
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
    const wrapper = document.querySelector('.canvas-wrapper');
    const rect = wrapper.getBoundingClientRect();
    
    canvas.width = rect.width;
    canvas.height = Math.min(600, window.innerHeight * 0.5);
    
    if (softBody) {
        softBody.set_dimensions(canvas.width, canvas.height);
    }
}

function initSoftBody() {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 3;
    
    softBody = SoftBody.new(centerX, centerY, GRID_SIZE, SPACING);
    softBody.set_dimensions(canvas.width, canvas.height);
}

function initControls() {
    const iterationsSlider = document.getElementById('iterations');
    const iterationsValue = document.getElementById('iterations-value');
    
    iterationsSlider.addEventListener('input', (e) => {
        config.iterations = parseInt(e.target.value);
        iterationsValue.textContent = config.iterations;
    });
    
    const forceSlider = document.getElementById('force');
    const forceValue = document.getElementById('force-value');
    
    forceSlider.addEventListener('input', (e) => {
        config.forceStrength = parseInt(e.target.value);
        forceValue.textContent = config.forceStrength;
    });
    
    const radiusSlider = document.getElementById('radius');
    const radiusValue = document.getElementById('radius-value');
    
    radiusSlider.addEventListener('input', (e) => {
        config.forceRadius = parseInt(e.target.value);
        radiusValue.textContent = config.forceRadius;
    });
    
    const resetBtn = document.getElementById('reset-btn');
    resetBtn.addEventListener('click', () => {
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 3;
        softBody.reset(centerX, centerY, GRID_SIZE, SPACING);
    });
}

function initMouseEvents() {
    canvas.addEventListener('mousedown', (e) => {
        mouse.isDown = true;
        updateMousePosition(e);
        mouse.lastX = mouse.x;
        mouse.lastY = mouse.y;
    });
    
    canvas.addEventListener('mousemove', (e) => {
        updateMousePosition(e);
    });
    
    canvas.addEventListener('mouseup', () => {
        mouse.isDown = false;
    });
    
    canvas.addEventListener('mouseleave', () => {
        mouse.isDown = false;
    });
    
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        mouse.isDown = true;
        updateTouchPosition(e);
        mouse.lastX = mouse.x;
        mouse.lastY = mouse.y;
    });
    
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        updateTouchPosition(e);
    });
    
    canvas.addEventListener('touchend', () => {
        mouse.isDown = false;
    });
}

function updateMousePosition(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    mouse.x = (e.clientX - rect.left) * scaleX;
    mouse.y = (e.clientY - rect.top) * scaleY;
}

function updateTouchPosition(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const touch = e.touches[0];
    
    mouse.x = (touch.clientX - rect.left) * scaleX;
    mouse.y = (touch.clientY - rect.top) * scaleY;
}

function applyForce() {
    if (!mouse.isDown) return;
    
    const dx = mouse.x - mouse.lastX;
    const dy = mouse.y - mouse.lastY;
    
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0.5) {
        const fx = dx * config.forceStrength * 0.1;
        const fy = dy * config.forceStrength * 0.1;
        softBody.apply_force(mouse.x, mouse.y, config.forceRadius, fx, fy);
    }
    
    mouse.lastX = mouse.x;
    mouse.lastY = mouse.y;
}

function animate() {
    if (!wasmReady || !softBody) {
        animationId = requestAnimationFrame(animate);
        return;
    }
    
    softBody.update(1.0, config.iterations);
    applyForce();
    
    render();
    updateFPS();
    
    animationId = requestAnimationFrame(animate);
}

function render() {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const points = softBody.get_points();
    const springs = softBody.get_springs();
    
    if (config.showSprings) {
        drawSprings(springs, points);
    }
    
    drawSoftBodySurface(points);
    
    if (config.showPoints) {
        drawPoints(points);
    }
    
    if (mouse.isDown) {
        drawForceIndicator();
    }
}

function drawSprings(springs, points) {
    ctx.strokeStyle = 'rgba(0, 245, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    for (const spring of springs) {
        const p1 = points[spring.p1_idx];
        const p2 = points[spring.p2_idx];
        
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
    }
    
    ctx.stroke();
}

function drawSoftBodySurface(points) {
    const size = GRID_SIZE;
    const margin = 2;
    
    const gradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0,
        canvas.width / 2, canvas.height / 2, canvas.width / 2
    );
    gradient.addColorStop(0, 'rgba(0, 255, 136, 0.4)');
    gradient.addColorStop(0.5, 'rgba(0, 245, 255, 0.3)');
    gradient.addColorStop(1, 'rgba(0, 136, 255, 0.2)');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    
    for (let i = margin; i < size - margin; i++) {
        const idx = margin * size + i;
        const p = points[idx];
        if (i === margin) {
            ctx.moveTo(p.x, p.y);
        } else {
            ctx.lineTo(p.x, p.y);
        }
    }
    
    for (let j = margin; j < size - margin; j++) {
        const idx = j * size + (size - 1 - margin);
        const p = points[idx];
        ctx.lineTo(p.x, p.y);
    }
    
    for (let i = size - 1 - margin; i >= margin; i--) {
        const idx = (size - 1 - margin) * size + i;
        const p = points[idx];
        ctx.lineTo(p.x, p.y);
    }
    
    for (let j = size - 1 - margin; j >= margin; j--) {
        const idx = j * size + margin;
        const p = points[idx];
        ctx.lineTo(p.x, p.y);
    }
    
    ctx.closePath();
    ctx.fill();
    
    ctx.strokeStyle = 'rgba(0, 245, 255, 0.6)';
    ctx.lineWidth = 3;
    ctx.stroke();
    
    ctx.shadowColor = 'rgba(0, 245, 255, 0.5)';
    ctx.shadowBlur = 20;
    ctx.stroke();
    ctx.shadowBlur = 0;
}

function drawPoints(points) {
    for (const point of points) {
        const gradient = ctx.createRadialGradient(
            point.x, point.y, 0,
            point.x, point.y, 8
        );
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
        gradient.addColorStop(1, 'rgba(0, 245, 255, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawForceIndicator() {
    const gradient = ctx.createRadialGradient(
        mouse.x, mouse.y, 0,
        mouse.x, mouse.y, config.forceRadius
    );
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
    gradient.addColorStop(0.7, 'rgba(0, 245, 255, 0.1)');
    gradient.addColorStop(1, 'rgba(0, 245, 255, 0)');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(mouse.x, mouse.y, config.forceRadius, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
}

function updateFPS() {
    frameCount++;
    const now = performance.now();
    
    if (now - lastFpsUpdate >= 1000) {
        const fps = Math.round(frameCount * 1000 / (now - lastFpsUpdate));
        document.getElementById('fps-counter').textContent = `FPS: ${fps}`;
        frameCount = 0;
        lastFpsUpdate = now;
    }
}

run().catch(console.error);
