class RobotArmVisualizer {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 100);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        this.joints = [];
        this.targetMarker = null;
        this.isDragging = false;
        this.isRightDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.cameraAngleX = 0.5;
        this.cameraAngleY = 0.5;
        this.cameraDistance = 1.5;
        
        this.lastIKRequest = 0;
        this.currentAngles = [0, 0, 0, 0, 0, 0];
        
        this.init();
        this.setupEventListeners();
        this.animate();
    }
    
    init() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0xf0f5fa);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.getElementById('canvas-container').appendChild(this.renderer.domElement);
        
        this.camera.position.set(1, 1, 1);
        this.updateCameraPosition();
        
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 5);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        this.scene.add(directionalLight);
        
        this.createGround();
        this.createRobotArm();
        this.createTargetMarker();
        this.createWorkspace();
    }
    
    createGround() {
        const groundGeometry = new THREE.PlaneGeometry(3, 3);
        const groundMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xcccccc,
            roughness: 0.8,
            metalness: 0.2
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
        
        const gridHelper = new THREE.GridHelper(3, 30, 0x888888, 0xcccccc);
        this.scene.add(gridHelper);
    }
    
    createRobotArm() {
        const linkColors = [0x2196F3, 0x4CAF50, 0xFF9800, 0xE91E63, 0x9C27B0, 0x00BCD4];
        const linkLengths = [0.15, 0.15, 0.15, 0.1, 0.08, 0.05];
        
        let parent = this.scene;
        
        for (let i = 0; i < 6; i++) {
            const jointGroup = new THREE.Group();
            parent.add(jointGroup);
            this.joints.push(jointGroup);
            
            const jointGeometry = new THREE.CylinderGeometry(0.03, 0.035, 0.02, 16);
            const jointMaterial = new THREE.MeshStandardMaterial({ 
                color: 0x333333,
                metalness: 0.8,
                roughness: 0.3
            });
            const joint = new THREE.Mesh(jointGeometry, jointMaterial);
            joint.rotation.x = Math.PI / 2;
            joint.castShadow = true;
            jointGroup.add(joint);
            
            if (i < 5) {
                const linkGeometry = new THREE.CylinderGeometry(0.02, 0.02, linkLengths[i], 12);
                const linkMaterial = new THREE.MeshStandardMaterial({ 
                    color: linkColors[i],
                    metalness: 0.3,
                    roughness: 0.5
                });
                const link = new THREE.Mesh(linkGeometry, linkMaterial);
                link.position.y = linkLengths[i] / 2;
                link.castShadow = true;
                jointGroup.add(link);
                
                if (i === 0) {
                    const baseGeometry = new THREE.CylinderGeometry(0.08, 0.1, 0.05, 32);
                    const baseMaterial = new THREE.MeshStandardMaterial({ 
                        color: 0x555555,
                        metalness: 0.8,
                        roughness: 0.3
                    });
                    const base = new THREE.Mesh(baseGeometry, baseMaterial);
                    base.position.y = -0.025;
                    base.castShadow = true;
                    jointGroup.add(base);
                }
            }
            
            if (i === 5) {
                const endGeometry = new THREE.SphereGeometry(0.025, 16, 16);
                const endMaterial = new THREE.MeshStandardMaterial({ 
                    color: 0xff4444,
                    emissive: 0xff0000,
                    emissiveIntensity: 0.3
                });
                const end = new THREE.Mesh(endGeometry, endMaterial);
                end.position.y = 0.025;
                jointGroup.add(end);
            }
            
            if (i < 5) {
                jointGroup.position.y = linkLengths[i];
            }
            
            parent = jointGroup;
        }
    }
    
    createTargetMarker() {
        const geometry = new THREE.SphereGeometry(0.03, 16, 16);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.9
        });
        this.targetMarker = new THREE.Mesh(geometry, material);
        this.targetMarker.position.set(0, 0.3, 0);
        this.targetMarker.castShadow = true;
        this.scene.add(this.targetMarker);
        
        const ringGeometry = new THREE.RingGeometry(0.035, 0.045, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xffff00,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.6
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        this.targetMarker.add(ring);
    }
    
    createWorkspace() {
        const workspaceGeometry = new THREE.SphereGeometry(0.6, 32, 32);
        const workspaceMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            wireframe: true,
            transparent: true,
            opacity: 0.1
        });
        const workspace = new THREE.Mesh(workspaceGeometry, workspaceMaterial);
        workspace.position.y = 0.3;
        this.scene.add(workspace);
    }
    
    updateCameraPosition() {
        const x = this.cameraDistance * Math.sin(this.cameraAngleY) * Math.cos(this.cameraAngleX);
        const z = this.cameraDistance * Math.sin(this.cameraAngleY) * Math.sin(this.cameraAngleX);
        const y = this.cameraDistance * Math.cos(this.cameraAngleY);
        
        this.camera.position.set(x, y + 0.2, z);
        this.camera.lookAt(0, 0.2, 0);
    }
    
    setupEventListeners() {
        const canvas = this.renderer.domElement;
        
        canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        canvas.addEventListener('wheel', (e) => this.onWheel(e));
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        
        window.addEventListener('resize', () => this.onWindowResize());
    }
    
    onMouseDown(e) {
        if (e.button === 0) {
            this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
            
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObject(this.targetMarker);
            
            if (intersects.length > 0) {
                this.isDragging = true;
            }
        } else if (e.button === 2) {
            this.isRightDragging = true;
        }
        
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
    }
    
    onMouseMove(e) {
        if (this.isDragging) {
            const rect = this.renderer.domElement.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            
            const vector = new THREE.Vector3(x, y, 0.5);
            vector.unproject(this.camera);
            const dir = vector.sub(this.camera.position).normalize();
            const distance = -this.camera.position.y / dir.y;
            const pos = this.camera.position.clone().add(dir.multiplyScalar(distance));
            
            this.targetMarker.position.x = Math.max(-0.5, Math.min(0.5, pos.x));
            this.targetMarker.position.z = Math.max(-0.5, Math.min(0.5, pos.z));
            
            const newY = pos.y + 0.15;
            this.targetMarker.position.y = Math.max(0.1, Math.min(0.7, newY));
            
            this.updateTargetDisplay();
            this.requestIKSolve();
        }
        
        if (this.isRightDragging) {
            const deltaX = e.clientX - this.lastMouseX;
            const deltaY = e.clientY - this.lastMouseY;
            
            this.cameraAngleX += deltaX * 0.01;
            this.cameraAngleY = Math.max(0.1, Math.min(Math.PI - 0.1, this.cameraAngleY + deltaY * 0.01));
            
            this.updateCameraPosition();
        }
        
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
    }
    
    onMouseUp(e) {
        this.isDragging = false;
        this.isRightDragging = false;
    }
    
    onWheel(e) {
        e.preventDefault();
        this.cameraDistance = Math.max(0.5, Math.min(3, this.cameraDistance + e.deltaY * 0.002));
        this.updateCameraPosition();
    }
    
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    updateTargetDisplay() {
        document.getElementById('target-x').textContent = this.targetMarker.position.x.toFixed(3);
        document.getElementById('target-y').textContent = this.targetMarker.position.y.toFixed(3);
        document.getElementById('target-z').textContent = this.targetMarker.position.z.toFixed(3);
    }
    
    async requestIKSolve() {
        const now = Date.now();
        if (now - this.lastIKRequest < 100) return;
        this.lastIKRequest = now;
        
        const pos = this.targetMarker.position;
        
        try {
            const response = await fetch('/api/solve-ik', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    x: pos.x,
                    y: pos.y,
                    z: pos.z
                })
            });
            
            const result = await response.json();
            this.handleIKResult(result);
        } catch (error) {
            console.error('IK求解请求失败:', error);
        }
    }
    
    handleIKResult(result) {
        const statusInfo = document.getElementById('status-info');
        
        if (result.success) {
            this.currentAngles = result.angles_rad;
            this.updateRobotArm();
            
            for (let i = 0; i < 6; i++) {
                document.getElementById(`j${i + 1}`).textContent = result.angles_deg[i].toFixed(2);
            }
            
            statusInfo.className = 'error-info success';
            statusInfo.innerHTML = `求解成功<br>误差: ${result.error.toFixed(6)} m`;
        } else {
            statusInfo.className = 'error-info error';
            statusInfo.innerHTML = `求解失败<br>${result.message}`;
        }
    }
    
    updateRobotArm() {
        const rotationAxes = ['y', 'x', 'x', 'y', 'x', 'y'];
        
        for (let i = 0; i < 6; i++) {
            if (rotationAxes[i] === 'x') {
                this.joints[i].rotation.x = this.currentAngles[i];
            } else if (rotationAxes[i] === 'y') {
                this.joints[i].rotation.y = this.currentAngles[i];
            }
        }
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        this.targetMarker.rotation.y += 0.01;
        
        this.renderer.render(this.scene, this.camera);
    }
}

let visualizer;

window.onload = function() {
    visualizer = new RobotArmVisualizer();
};

function toggleHistory() {
    const panel = document.getElementById('history-panel');
    if (panel.style.display === 'block') {
        panel.style.display = 'none';
    } else {
        panel.style.display = 'block';
        loadHistory();
    }
}

async function loadHistory() {
    try {
        const response = await fetch('/api/history?limit=20');
        const records = await response.json();
        
        const list = document.getElementById('history-list');
        list.innerHTML = '';
        
        records.forEach(record => {
            const item = document.createElement('div');
            item.className = 'history-item';
            item.innerHTML = `
                <div class="timestamp">${record.created_at}</div>
                <div>目标: (${record.target.x.toFixed(3)}, ${record.target.y.toFixed(3)}, ${record.target.z.toFixed(3)})</div>
                <div style="color: ${record.success ? '#2e7d32' : '#c62828'}">
                    ${record.success ? '✓ 成功' : '✗ 失败'} | 误差: ${record.error.toFixed(5)}
                </div>
            `;
            item.onclick = () => loadRecord(record);
            list.appendChild(item);
        });
    } catch (error) {
        console.error('加载历史记录失败:', error);
    }
}

function loadRecord(record) {
    if (!visualizer) return;
    
    visualizer.targetMarker.position.set(
        record.target.x,
        record.target.y,
        record.target.z
    );
    visualizer.updateTargetDisplay();
    
    if (record.success && record.angles_deg) {
        visualizer.currentAngles = record.angles_deg.map(deg => deg * Math.PI / 180);
        visualizer.updateRobotArm();
        
        for (let i = 0; i < 6; i++) {
            document.getElementById(`j${i + 1}`).textContent = record.angles_deg[i].toFixed(2);
        }
    }
    
    toggleHistory();
}

let waypoints = [];
let plannedTrajectory = null;
let isPlaying = false;
let currentFrame = 0;
let animationId = null;
let playbackSpeed = 1.0;

function addCurrentWaypoint() {
    if (!visualizer) return;
    
    const pos = visualizer.targetMarker.position;
    waypoints.push([pos.x, pos.y, pos.z]);
    updateWaypointList();
    updateTrajectoryStatus(`已添加第${waypoints.length}个目标点`, 'info');
    createWaypointMarker(pos.x, pos.y, pos.z, waypoints.length);
}

function deleteWaypoint(index) {
    waypoints.splice(index, 1);
    updateWaypointList();
    clearWaypointMarkers();
    waypoints.forEach((wp, i) => createWaypointMarker(wp[0], wp[1], wp[2], i + 1));
    updateTrajectoryStatus('已删除目标点', 'info');
}

function clearWaypoints() {
    waypoints = [];
    plannedTrajectory = null;
    updateWaypointList();
    clearWaypointMarkers();
    updateTrajectoryStatus('已清空所有目标点', 'info');
    document.getElementById('progress-container').style.display = 'none';
}

function updateWaypointList() {
    const list = document.getElementById('waypoint-list');
    
    if (waypoints.length === 0) {
        list.innerHTML = `
            <div style="text-align: center; color: #999; padding: 20px; font-size: 12px;">
                暂无目标点<br>点击"添加当前位置"添加
            </div>
        `;
        return;
    }
    
    list.innerHTML = waypoints.map((wp, i) => `
        <div class="waypoint-item">
            <span class="coords">#${i + 1}: (${wp[0].toFixed(3)}, ${wp[1].toFixed(3)}, ${wp[2].toFixed(3)})</span>
            <button class="delete-btn" onclick="deleteWaypoint(${i})">删除</button>
        </div>
    `).join('');
}

let waypointMarkers = [];

function createWaypointMarker(x, y, z, index) {
    if (!visualizer) return;
    
    const geometry = new THREE.SphereGeometry(0.015, 16, 16);
    const material = new THREE.MeshStandardMaterial({
        color: 0xFF9800,
        emissive: 0xFF9800,
        emissiveIntensity: 0.3
    });
    const marker = new THREE.Mesh(geometry, material);
    marker.position.set(x, y, z);
    visualizer.scene.add(marker);
    waypointMarkers.push(marker);
    
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xFF9800, opacity: 0.5, transparent: true });
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, 0, z),
        new THREE.Vector3(x, y, z)
    ]);
    const line = new THREE.Line(lineGeometry, lineMaterial);
    visualizer.scene.add(line);
    waypointMarkers.push(line);
}

function clearWaypointMarkers() {
    if (!visualizer) return;
    waypointMarkers.forEach(m => visualizer.scene.remove(m));
    waypointMarkers = [];
}

async function planTrajectory() {
    if (waypoints.length < 2) {
        updateTrajectoryStatus('错误: 至少需要2个目标点', 'error');
        return;
    }
    
    updateTrajectoryStatus('正在规划轨迹...', 'info');
    
    try {
        const response = await fetch('/api/plan-trajectory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                waypoints: waypoints,
                duration: 2.0,
                samples: 100,
                method: 'quintic'
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            plannedTrajectory = result.trajectory;
            updateTrajectoryStatus(`规划成功! 共${result.total_frames}帧, ${result.waypoints.length}个路标点`, 'success');
            document.getElementById('progress-container').style.display = 'block';
            drawTrajectoryLine();
        } else {
            updateTrajectoryStatus(`规划失败: ${result.message}`, 'error');
        }
    } catch (error) {
        updateTrajectoryStatus(`请求失败: ${error.message}`, 'error');
    }
}

let trajectoryLine = null;

function drawTrajectoryLine() {
    if (!visualizer || !plannedTrajectory) return;
    
    if (trajectoryLine) {
        visualizer.scene.remove(trajectoryLine);
    }
    
    const points = plannedTrajectory.map(frame => {
        const angles = frame.angles_rad;
        return calculateEndEffector(angles);
    });
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineDashedMaterial({
        color: 0x4CAF50,
        dashSize: 0.01,
        gapSize: 0.005
    });
    trajectoryLine = new THREE.Line(geometry, material);
    trajectoryLine.computeLineDistances();
    visualizer.scene.add(trajectoryLine);
}

function calculateEndEffector(angles) {
    const linkLengths = [0.15, 0.15, 0.15, 0.1, 0.08, 0.05];
    
    let y = 0;
    let z = 0;
    let x = 0;
    
    for (let i = 0; i < 3; i++) {
        y += Math.cos(angles[i + 1]) * linkLengths[i];
        z += Math.sin(angles[i + 1]) * linkLengths[i];
    }
    
    const sinJ1 = Math.sin(angles[0]);
    const cosJ1 = Math.cos(angles[0]);
    const newX = x * cosJ1 - z * sinJ1;
    const newZ = x * sinJ1 + z * cosJ1;
    
    return new THREE.Vector3(newX, y, newZ);
}

function playTrajectory() {
    if (!plannedTrajectory || plannedTrajectory.length === 0) {
        updateTrajectoryStatus('请先规划轨迹', 'error');
        return;
    }
    
    if (isPlaying) {
        isPlaying = false;
        document.getElementById('play-btn').textContent = '▶️ 播放';
        return;
    }
    
    isPlaying = true;
    document.getElementById('play-btn').textContent = '⏸️ 暂停';
    updateTrajectoryStatus('正在播放轨迹...', 'info');
    
    playNextFrame();
}

function playNextFrame() {
    if (!isPlaying || !plannedTrajectory) return;
    
    const frame = plannedTrajectory[currentFrame];
    
    if (visualizer) {
        visualizer.currentAngles = frame.angles_rad;
        visualizer.updateRobotArm();
        
        for (let i = 0; i < 6; i++) {
            document.getElementById(`j${i + 1}`).textContent = frame.angles_deg[i].toFixed(2);
        }
        
        const endPos = calculateEndEffector(frame.angles_rad);
        document.getElementById('target-x').textContent = endPos.x.toFixed(3);
        document.getElementById('target-y').textContent = endPos.y.toFixed(3);
        document.getElementById('target-z').textContent = endPos.z.toFixed(3);
    }
    
    const progress = ((currentFrame + 1) / plannedTrajectory.length) * 100;
    document.getElementById('progress-fill').style.width = `${progress}%`;
    document.getElementById('progress-text').textContent = `${progress.toFixed(1)}%`;
    
    currentFrame++;
    
    if (currentFrame >= plannedTrajectory.length) {
        currentFrame = 0;
        isPlaying = false;
        document.getElementById('play-btn').textContent = '▶️ 播放';
        updateTrajectoryStatus('播放完成!', 'success');
        return;
    }
    
    const delay = 16 / playbackSpeed;
    setTimeout(playNextFrame, delay);
}

function stopTrajectory() {
    isPlaying = false;
    currentFrame = 0;
    document.getElementById('play-btn').textContent = '▶️ 播放';
    document.getElementById('progress-fill').style.width = '0%';
    document.getElementById('progress-text').textContent = '0%';
    updateTrajectoryStatus('已停止播放', 'info');
}

function updateTrajectoryStatus(message, type) {
    const status = document.getElementById('trajectory-status');
    status.className = `trajectory-status ${type}`;
    status.textContent = message;
}

document.addEventListener('DOMContentLoaded', function() {
    const slider = document.getElementById('speed-slider');
    if (slider) {
        slider.addEventListener('input', function(e) {
            playbackSpeed = parseFloat(e.target.value);
            document.getElementById('speed-value').textContent = `${playbackSpeed.toFixed(1)}x`;
        });
    }
});
