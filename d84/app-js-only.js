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

class Point {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.oldX = x;
        this.oldY = y;
        this.pinned = false;
        this.mass = 1.0;
    }
}

class Spring {
    constructor(p1Idx, p2Idx, restLength, stiffness) {
        this.p1Idx = p1Idx;
        this.p2Idx = p2Idx;
        this.restLength = restLength;
        this.stiffness = stiffness;
    }
}

class SoftBodyJS {
    constructor(centerX, centerY, size, spacing) {
        this.points = [];
        this.springs = [];
        this.gravity = 0.5;
        this.damping = 0.99;
        this.pointRadius = spacing * 0.4;
        this.width = 1000;
        this.height = 600;
        this.maxStretchRatio = 1.5;
        this.maxCorrectionRatio = 0.2;
        this.friction = 0.01;
        
        const startX = centerX - (size * spacing) / 2;
        const startY = centerY - (size * spacing) / 2;
        
        for (let j = 0; j < size; j++) {
            for (let i = 0; i < size; i++) {
                const x = startX + i * spacing;
                const y = startY + j * spacing;
                this.points.push(new Point(x, y));
            }
        }
        
        const stiffness = 0.5;
        const diagonalStiffness = 0.3;
        
        for (let j = 0; j < size; j++) {
            for (let i = 0; i < size; i++) {
                const idx = j * size + i;
                
                if (i < size - 1) {
                    this.springs.push(new Spring(idx, idx + 1, spacing, stiffness));
                }
                
                if (j < size - 1) {
                    this.springs.push(new Spring(idx, idx + size, spacing, stiffness));
                }
                
                if (i < size - 1 && j < size - 1) {
                    const diagonalLength = spacing * Math.sqrt(2);
                    this.springs.push(new Spring(idx, idx + size + 1, diagonalLength, diagonalStiffness));
                    this.springs.push(new Spring(idx + 1, idx + size, diagonalLength, diagonalStiffness));
                }
                
                if (i < size - 2) {
                    this.springs.push(new Spring(idx, idx + 2, spacing * 2, stiffness * 0.5));
                }
                if (j < size - 2) {
                    this.springs.push(new Spring(idx, idx + size * 2, spacing * 2, stiffness * 0.5));
                }
            }
        }
    }
    
    update(dt, iterations) {
        const maxVelocity = 50.0;
        const friction = this.friction;
        
        for (const point of this.points) {
            if (!point.pinned) {
                let vx = (point.x - point.oldX) * this.damping;
                let vy = (point.y - point.oldY) * this.damping;
                
                const speed = Math.sqrt(vx * vx + vy * vy);
                if (speed > maxVelocity) {
                    const scale = maxVelocity / speed;
                    vx *= scale;
                    vy *= scale;
                }
                
                vx *= 1.0 - friction;
                vy *= 1.0 - friction;
                
                point.oldX = point.x;
                point.oldY = point.y;
                
                point.x += vx;
                point.y += vy + this.gravity * dt * dt;
            }
        }
        
        for (let iter = 0; iter < iterations; iter++) {
            this.solveSprings();
            this.solveCollisions();
            this.solveBoundaries();
        }
    }
    
    solveSprings() {
        const maxStretch = this.maxStretchRatio;
        const maxCorrection = this.maxCorrectionRatio;
        
        for (const spring of this.springs) {
            const p1 = this.points[spring.p1Idx];
            const p2 = this.points[spring.p2Idx];
            
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < 0.0001) continue;
            
            const maxLength = spring.restLength * maxStretch;
            const minLength = spring.restLength * (2.0 - maxStretch);
            
            let correctedDist = dist;
            if (dist > maxLength) {
                correctedDist = maxLength;
            } else if (dist < minLength) {
                correctedDist = minLength;
            }
            
            const diff = (correctedDist - spring.restLength) / dist * spring.stiffness;
            let offsetX = dx * diff * 0.5;
            let offsetY = dy * diff * 0.5;
            
            const maxOffset = spring.restLength * maxCorrection;
            const offsetMag = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
            if (offsetMag > maxOffset) {
                const scale = maxOffset / offsetMag;
                offsetX *= scale;
                offsetY *= scale;
            }
            
            if (!p1.pinned) {
                p1.x += offsetX;
                p1.y += offsetY;
            }
            if (!p2.pinned) {
                p2.x -= offsetX;
                p2.y -= offsetY;
            }
        }
    }
    
    solveCollisions() {
        const cellSize = this.pointRadius * 4;
        const gridWidth = Math.floor(this.width / cellSize) + 2;
        const gridHeight = Math.floor(this.height / cellSize) + 2;
        
        const grid = new Array(gridWidth * gridHeight).fill(null).map(() => []);
        
        for (let idx = 0; idx < this.points.length; idx++) {
            const point = this.points[idx];
            const gx = Math.min(Math.max(Math.floor(point.x / cellSize), 0), gridWidth - 1);
            const gy = Math.min(Math.max(Math.floor(point.y / cellSize), 0), gridHeight - 1);
            grid[gy * gridWidth + gx].push(idx);
        }
        
        const minDist = this.pointRadius * 2;
        const repulsion = 0.3;
        
        for (let gy = 0; gy < gridHeight; gy++) {
            for (let gx = 0; gx < gridWidth; gx++) {
                const cellIdx = gy * gridWidth + gx;
                
                for (let dy = 0; dy <= 1; dy++) {
                    for (let dx = 0; dx <= 1; dx++) {
                        const ngx = gx + dx;
                        const ngy = gy + dy;
                        if (ngx >= gridWidth || ngy >= gridHeight) continue;
                        
                        const neighborIdx = ngy * gridWidth + ngx;
                        
                        for (const i of grid[cellIdx]) {
                            for (const j of grid[neighborIdx]) {
                                if (i >= j) continue;
                                
                                const pi = this.points[i];
                                const pj = this.points[j];
                                
                                const dx = pj.x - pi.x;
                                const dy = pj.y - pi.y;
                                const distSq = dx * dx + dy * dy;
                                
                                if (distSq < minDist * minDist && distSq > 0.0001) {
                                    const dist = Math.sqrt(distSq);
                                    const overlap = (minDist - dist) / dist * repulsion;
                                    const ox = dx * overlap * 0.5;
                                    const oy = dy * overlap * 0.5;
                                    
                                    if (!pi.pinned) {
                                        pi.x -= ox;
                                        pi.y -= oy;
                                    }
                                    if (!pj.pinned) {
                                        pj.x += ox;
                                        pj.y += oy;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    solveBoundaries() {
        const margin = this.pointRadius;
        const ground = this.height - margin;
        
        for (const point of this.points) {
            if (point.x < margin) point.x = margin;
            if (point.x > this.width - margin) point.x = this.width - margin;
            if (point.y < margin) point.y = margin;
            if (point.y > ground) {
                point.y = ground;
                point.oldY = point.y + (point.y - point.oldY) * 0.5;
            }
        }
    }
    
    applyForce(x, y, radius, fx, fy) {
        for (const point of this.points) {
            const dx = point.x - x;
            const dy = point.y - y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < radius) {
                const strength = 1 - dist / radius;
                point.x += fx * strength;
                point.y += fy * strength;
            }
        }
    }
    
    getPoints() {
        return this.points;
    }
    
    getSprings() {
        return this.springs;
    }
    
    reset(centerX, centerY, size, spacing) {
        const startX = centerX - (size * spacing) / 2;
        const startY = centerY - (size * spacing) / 2;
        
        let idx = 0;
        for (let j = 0; j < size; j++) {
            for (let i = 0; i < size; i++) {
                const x = startX + i * spacing;
                const y = startY + j * spacing;
                if (idx < this.points.length) {
                    this.points[idx].x = x;
                    this.points[idx].y = y;
                    this.points[idx].oldX = x;
                    this.points[idx].oldY = y;
                }
                idx++;
            }
        }
    }
    
    setDimensions(width, height) {
        this.width = width;
        this.height = height;
    }
    
    setDamping(damping) {
        this.damping = Math.max(0, Math.min(1, damping));
    }
    
    setFriction(friction) {
        this.friction = Math.max(0, Math.min(1, friction));
    }
    
    setGravity(gravity) {
        this.gravity = gravity;
    }
    
    setStiffness(stiffness) {
        for (const spring of this.springs) {
            spring.stiffness = spring.stiffness / 0.5 * stiffness;
        }
    }
}

function run() {
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
        softBody.setDimensions(canvas.width, canvas.height);
    }
}

function initSoftBody() {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 3;
    
    softBody = new SoftBodyJS(centerX, centerY, GRID_SIZE, SPACING);
    softBody.setDimensions(canvas.width, canvas.height);
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
    
    const dampingSlider = document.getElementById('damping');
    const dampingValue = document.getElementById('damping-value');
    
    dampingSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        dampingValue.textContent = value.toFixed(2);
        softBody.setDamping(value);
    });
    
    const frictionSlider = document.getElementById('friction');
    const frictionValue = document.getElementById('friction-value');
    
    frictionSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        frictionValue.textContent = value.toFixed(3);
        softBody.setFriction(value);
    });
    
    const gravitySlider = document.getElementById('gravity');
    const gravityValue = document.getElementById('gravity-value');
    
    gravitySlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        gravityValue.textContent = value.toFixed(1);
        softBody.setGravity(value);
    });
    
    const stiffnessSlider = document.getElementById('stiffness');
    const stiffnessValue = document.getElementById('stiffness-value');
    
    stiffnessSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        stiffnessValue.textContent = value.toFixed(2);
        softBody.setStiffness(value);
    });
    
    const resetBtn = document.getElementById('reset-btn');
    resetBtn.addEventListener('click', () => {
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 3;
        softBody.reset(centerX, centerY, GRID_SIZE, SPACING);
        
        dampingSlider.value = 0.99;
        dampingValue.textContent = '0.99';
        frictionSlider.value = 0.01;
        frictionValue.textContent = '0.01';
        gravitySlider.value = 0.5;
        gravityValue.textContent = '0.5';
        stiffnessSlider.value = 0.5;
        stiffnessValue.textContent = '0.5';
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
        softBody.applyForce(mouse.x, mouse.y, config.forceRadius, fx, fy);
    }
    
    mouse.lastX = mouse.x;
    mouse.lastY = mouse.y;
}

function animate() {
    if (!softBody) {
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
    
    const points = softBody.getPoints();
    const springs = softBody.getSprings();
    
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
        const p1 = points[spring.p1Idx];
        const p2 = points[spring.p2Idx];
        
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

run();
