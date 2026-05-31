import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const GRID_SIZE = 64;
const MAX_INSTANCES = 10000;

class VoxelEditor {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        
        this.staticVoxels = new Map();
        this.dynamicVoxels = new Map();
        
        this.staticInstancedMesh = null;
        this.dynamicInstancedMesh = null;
        this.dummy = new THREE.Object3D();
        this.staticColorArray = null;
        this.dynamicColorArray = null;
        this.instanceMatrixNeedsUpdate = false;
        
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.selectedColor = '#e74c3c';
        this.physicsWorker = null;
        this.voxelIdCounter = 0;
        this.frameCount = 0;
        this.lastFpsUpdate = performance.now();
        this.needsUpdate = false;
        
        this.init();
    }

    init() {
        this.setupScene();
        this.setupCamera();
        this.setupRenderer();
        this.setupLights();
        this.setupControls();
        this.setupInstancedMesh();
        this.setupPhysics();
        this.setupEventListeners();
        this.setupUI();
        this.loadLatestScene();
        this.animate();
    }

    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.fog = new THREE.Fog(0x87CEEB, 50, 150);
    }

    setupCamera() {
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(40, 40, 40);
    }

    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.getElementById('container').appendChild(this.renderer.domElement);
    }

    setupLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 100, 50);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 500;
        directionalLight.shadow.camera.left = -100;
        directionalLight.shadow.camera.right = 100;
        directionalLight.shadow.camera.top = 100;
        directionalLight.shadow.camera.bottom = -100;
        this.scene.add(directionalLight);
    }

    setupControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxDistance = 120;
        this.controls.minDistance = 5;
        this.controls.target.set(32, 20, 32);
    }

    setupInstancedMesh() {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshLambertMaterial({ 
            vertexColors: true,
            side: THREE.DoubleSide
        });
        
        this.staticInstancedMesh = new THREE.InstancedMesh(geometry, material, MAX_INSTANCES);
        this.staticInstancedMesh.castShadow = true;
        this.staticInstancedMesh.receiveShadow = true;
        this.staticInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        
        this.staticColorArray = new Float32Array(MAX_INSTANCES * 3);
        this.staticInstancedMesh.instanceColor = new THREE.InstancedBufferAttribute(this.staticColorArray, 3);
        this.staticInstancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        
        this.dynamicInstancedMesh = new THREE.InstancedMesh(geometry.clone(), material.clone(), MAX_INSTANCES);
        this.dynamicInstancedMesh.castShadow = true;
        this.dynamicInstancedMesh.receiveShadow = true;
        this.dynamicInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        
        this.dynamicColorArray = new Float32Array(MAX_INSTANCES * 3);
        this.dynamicInstancedMesh.instanceColor = new THREE.InstancedBufferAttribute(this.dynamicColorArray, 3);
        this.dynamicInstancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        
        this.scene.add(this.staticInstancedMesh);
        this.scene.add(this.dynamicInstancedMesh);
    }

    setupPhysics() {
        this.physicsWorker = new Worker('./src/physics.worker.js');
        
        this.physicsWorker.onmessage = (e) => {
            if (e.data.type === 'update') {
                e.data.updates.forEach(update => {
                    const voxel = this.dynamicVoxels.get(update.id);
                    if (voxel) {
                        voxel.x = update.position.x;
                        voxel.y = update.position.y;
                        voxel.z = update.position.z;
                        voxel.quaternion = update.quaternion;
                        this.instanceMatrixNeedsUpdate = true;
                    }
                });
            }
        };
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.onWindowResize());
        this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.renderer.domElement.addEventListener('click', (e) => this.onClick(e));
        this.renderer.domElement.addEventListener('contextmenu', (e) => this.onRightClick(e));
    }

    setupUI() {
        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.style.backgroundColor = btn.dataset.color;
            btn.addEventListener('click', () => {
                document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedColor = btn.dataset.color;
            });
        });

        document.getElementById('generateTerrain').addEventListener('click', () => {
            this.generateTerrain();
        });

        document.getElementById('clearAll').addEventListener('click', () => {
            this.clearAll();
        });

        document.getElementById('saveScene').addEventListener('click', async () => {
            const sceneName = document.getElementById('sceneName').value || '未命名场景';
            await this.saveScene(sceneName);
        });

        document.getElementById('loadScene').addEventListener('click', async () => {
            await this.showSceneListModal();
        });
    }

    async showSceneListModal() {
        const scenes = await this.getSceneList();
        
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.position = 'relative';
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.onclick = () => document.body.removeChild(overlay);
        
        const title = document.createElement('h3');
        title.textContent = '📂 选择场景';
        
        const content = document.createElement('div');
        
        if (scenes.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = '暂无已保存的场景';
            content.appendChild(empty);
        } else {
            scenes.forEach(scene => {
                const item = document.createElement('div');
                item.className = 'scene-item';
                
                const info = document.createElement('div');
                info.className = 'scene-info';
                
                const nameEl = document.createElement('h4');
                nameEl.textContent = scene.name;
                
                const dateEl = document.createElement('p');
                dateEl.textContent = new Date(scene.updatedAt).toLocaleString('zh-CN');
                
                info.appendChild(nameEl);
                info.appendChild(dateEl);
                
                const actions = document.createElement('div');
                actions.className = 'scene-actions';
                
                const loadBtn = document.createElement('button');
                loadBtn.className = 'btn-load';
                loadBtn.textContent = '加载';
                loadBtn.onclick = async () => {
                    try {
                        const response = await fetch(`http://localhost:3001/api/scenes/${scene._id}`);
                        const result = await response.json();
                        if (result.success && result.scene) {
                            await this.loadScene(result.scene.voxels);
                            document.getElementById('sceneName').value = result.scene.name;
                            document.body.removeChild(overlay);
                        }
                    } catch (error) {
                        console.error('加载场景错误:', error);
                        this.showMessage('加载失败', 'error');
                    }
                };
                
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn-delete';
                deleteBtn.textContent = '删除';
                deleteBtn.onclick = async () => {
                    if (confirm('确定要删除这个场景吗？')) {
                        await this.deleteScene(scene._id);
                        item.remove();
                        const remainingItems = modal.querySelectorAll('.scene-item');
                        if (remainingItems.length === 0) {
                            content.innerHTML = '';
                            const empty = document.createElement('div');
                            empty.className = 'empty-state';
                            empty.textContent = '暂无已保存的场景';
                            content.appendChild(empty);
                        }
                    }
                };
                
                actions.appendChild(loadBtn);
                actions.appendChild(deleteBtn);
                
                item.appendChild(info);
                item.appendChild(actions);
                content.appendChild(item);
            });
        }
        
        modal.appendChild(closeBtn);
        modal.appendChild(title);
        modal.appendChild(content);
        overlay.appendChild(modal);
        
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
            }
        };
        
        document.body.appendChild(overlay);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    onMouseMove(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16) / 255,
            g: parseInt(result[2], 16) / 255,
            b: parseInt(result[3], 16) / 255
        } : { r: 1, g: 0, b: 0 };
    }

    onClick(event) {
        if (event.button !== 0) return;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        const meshes = [this.staticInstancedMesh, this.dynamicInstancedMesh];
        const intersects = this.raycaster.intersectObjects(meshes, false);
        
        if (intersects.length > 0) {
            const intersect = intersects[0];
            const faceNormal = intersect.face.normal.clone();
            
            const instanceId = intersect.instanceId;
            const matrix = new THREE.Matrix4();
            intersect.object.getMatrixAt(instanceId, matrix);
            const position = new THREE.Vector3();
            position.setFromMatrixPosition(matrix);
            const worldNormal = faceNormal.transformDirection(matrix);
            const pos = position.add(worldNormal.multiplyScalar(1));
            
            const x = Math.round(pos.x);
            const y = Math.round(pos.y);
            const z = Math.round(pos.z);
            
            this.addVoxel(x, y, z, this.selectedColor);
        }
    }

    onRightClick(event) {
        event.preventDefault();
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        const meshes = [this.staticInstancedMesh, this.dynamicInstancedMesh];
        const intersects = this.raycaster.intersectObjects(meshes, false);
        
        if (intersects.length > 0) {
            const intersect = intersects[0];
            const instanceId = intersect.instanceId;
            
            if (intersect.object === this.staticInstancedMesh) {
                this.removeStaticVoxelByIndex(instanceId);
            } else {
                this.removeDynamicVoxelByIndex(instanceId);
            }
        }
    }

    addVoxel(x, y, z, color) {
        const key = `${x},${y},${z}`;
        
        if (this.staticVoxels.has(key)) return;
        
        const rgb = this.hexToRgb(color);
        const voxelData = { x, y, z, color, rgb, key };
        
        const index = this.staticVoxels.size;
        this.staticVoxels.set(key, { ...voxelData, index });
        
        this.updateStaticInstancedMesh();
        
        this.physicsWorker.postMessage({
            type: 'addStatic',
            data: { x, y, z, id: key }
        });

        this.updateBlockCount();
        this.checkFallingBlocks();
    }

    removeStaticVoxelByIndex(instanceId) {
        let targetKey = null;
        this.staticVoxels.forEach((voxel, key) => {
            if (voxel.index === instanceId) {
                targetKey = key;
            }
        });
        
        if (targetKey) {
            const voxel = this.staticVoxels.get(targetKey);
            this.staticVoxels.delete(targetKey);
            
            this.staticVoxels.forEach((v, k) => {
                if (v.index > voxel.index) {
                    v.index--;
                }
            });
            
            this.updateStaticInstancedMesh();
            
            this.physicsWorker.postMessage({
                type: 'removeStatic',
                data: { id: targetKey }
            });
            
            this.updateBlockCount();
            this.checkFallingBlocks();
        }
    }

    removeDynamicVoxelByIndex(instanceId) {
        let targetKey = null;
        this.dynamicVoxels.forEach((voxel, key) => {
            if (voxel.index === instanceId) {
                targetKey = key;
            }
        });
        
        if (targetKey) {
            const voxel = this.dynamicVoxels.get(targetKey);
            this.dynamicVoxels.delete(targetKey);
            
            this.dynamicVoxels.forEach((v, k) => {
                if (v.index > voxel.index) {
                    v.index--;
                }
            });
            
            this.instanceMatrixNeedsUpdate = true;
            
            this.physicsWorker.postMessage({
                type: 'removeDynamic',
                data: { id: targetKey }
            });
            
            this.updateBlockCount();
            this.checkFallingBlocks();
        }
    }

    updateStaticInstancedMesh() {
        let index = 0;
        this.staticVoxels.forEach((voxel) => {
            voxel.index = index;
            this.dummy.position.set(voxel.x, voxel.y, voxel.z);
            this.dummy.quaternion.set(0, 0, 0, 1);
            this.dummy.updateMatrix();
            this.staticInstancedMesh.setMatrixAt(index, this.dummy.matrix);
            
            const colorIndex = index * 3;
            this.staticColorArray[colorIndex] = voxel.rgb.r;
            this.staticColorArray[colorIndex + 1] = voxel.rgb.g;
            this.staticColorArray[colorIndex + 2] = voxel.rgb.b;
            
            index++;
        });
        
        this.staticInstancedMesh.count = this.staticVoxels.size;
        this.staticInstancedMesh.instanceMatrix.needsUpdate = true;
        this.staticInstancedMesh.instanceColor.needsUpdate = true;
    }

    updateDynamicInstancedMesh() {
        let index = 0;
        this.dynamicVoxels.forEach((voxel) => {
            voxel.index = index;
            this.dummy.position.set(voxel.x, voxel.y, voxel.z);
            if (voxel.quaternion) {
                this.dummy.quaternion.set(
                    voxel.quaternion.x,
                    voxel.quaternion.y,
                    voxel.quaternion.z,
                    voxel.quaternion.w
                );
            } else {
                this.dummy.quaternion.set(0, 0, 0, 1);
            }
            this.dummy.updateMatrix();
            this.dynamicInstancedMesh.setMatrixAt(index, this.dummy.matrix);
            
            const colorIndex = index * 3;
            this.dynamicColorArray[colorIndex] = voxel.rgb.r;
            this.dynamicColorArray[colorIndex + 1] = voxel.rgb.g;
            this.dynamicColorArray[colorIndex + 2] = voxel.rgb.b;
            
            index++;
        });
        
        this.dynamicInstancedMesh.count = this.dynamicVoxels.size;
        this.dynamicInstancedMesh.instanceMatrix.needsUpdate = true;
        this.dynamicInstancedMesh.instanceColor.needsUpdate = true;
    }

    checkFallingBlocks() {
        const toConvert = [];
        
        this.staticVoxels.forEach((voxel, key) => {
            const { x, y, z } = voxel;
            const belowKey = `${x},${y - 1},${z}`;
            
            if (!this.staticVoxels.has(belowKey) && y > 0) {
                toConvert.push({ voxel, key, x, y, z });
            }
        });
        
        toConvert.forEach(({ voxel, key, x, y, z }) => {
            this.staticVoxels.delete(key);
            
            const index = this.dynamicVoxels.size;
            this.dynamicVoxels.set(key, { ...voxel, index });
            
            this.physicsWorker.postMessage({
                type: 'convertToDynamic',
                data: { x, y, z, id: key }
            });
        });
        
        if (toConvert.length > 0) {
            this.updateStaticInstancedMesh();
            this.updateDynamicInstancedMesh();
        }
    }

    generateTerrain() {
        this.clearAll(false);
        
        const scale = 0.08;
        const amplitude = 8;
        
        const voxelsToAdd = [];
        
        for (let x = 0; x < GRID_SIZE; x++) {
            for (let z = 0; z < GRID_SIZE; z++) {
                const noise = this.simpleNoise(x * scale, z * scale);
                const height = Math.floor(noise * amplitude) + 10;
                
                for (let y = 0; y < height; y++) {
                    let color;
                    if (y === height - 1) {
                        color = '#2ecc71';
                    } else if (y > height - 4) {
                        color = '#8B4513';
                    } else {
                        color = '#7f8c8d';
                    }
                    
                    voxelsToAdd.push({ x: x, y: y, z: z, color });
                }
            }
        }
        
        voxelsToAdd.forEach(({ x, y, z, color }) => {
            const key = `${x},${y},${z}`;
            const rgb = this.hexToRgb(color);
            const index = this.staticVoxels.size;
            this.staticVoxels.set(key, { x, y, z, color, rgb, key, index });
            
            this.physicsWorker.postMessage({
                type: 'addStatic',
                data: { x, y, z, id: key }
            });
        });
        
        this.updateStaticInstancedMesh();
        this.updateBlockCount();
    }

    simpleNoise(x, z) {
        const sin = Math.sin(x * 1.5) * Math.cos(z * 1.5);
        const sin2 = Math.sin(x * 0.7 + z * 0.7) * 0.5;
        return (sin + sin2) / 1.5;
    }

    clearAll(updateUI = true) {
        this.staticVoxels.clear();
        this.dynamicVoxels.clear();
        
        this.updateStaticInstancedMesh();
        this.updateDynamicInstancedMesh();
        
        this.physicsWorker.postMessage({ type: 'clearAll' });
        
        if (updateUI) {
            this.updateBlockCount();
        }
    }

    updateBlockCount() {
        const count = this.staticVoxels.size + this.dynamicVoxels.size;
        document.getElementById('blockCount').textContent = count;
    }

    serializeScene() {
        const voxels = [];
        
        this.staticVoxels.forEach((voxel) => {
            voxels.push({
                x: voxel.x,
                y: voxel.y,
                z: voxel.z,
                color: voxel.color,
                isStatic: true
            });
        });
        
        this.dynamicVoxels.forEach((voxel) => {
            voxels.push({
                x: voxel.x,
                y: voxel.y,
                z: voxel.z,
                color: voxel.color,
                isStatic: false
            });
        });
        
        return voxels;
    }

    async loadScene(voxelsData) {
        this.clearAll(false);
        
        voxelsData.forEach(voxelData => {
            const key = `${voxelData.x},${voxelData.y},${voxelData.z}`;
            const rgb = this.hexToRgb(voxelData.color);
            
            if (voxelData.isStatic) {
                const index = this.staticVoxels.size;
                this.staticVoxels.set(key, { 
                    x: voxelData.x, 
                    y: voxelData.y, 
                    z: voxelData.z, 
                    color: voxelData.color, 
                    rgb, 
                    key, 
                    index 
                });
                
                this.physicsWorker.postMessage({
                    type: 'addStatic',
                    data: { x: voxelData.x, y: voxelData.y, z: voxelData.z, id: key }
                });
            } else {
                const index = this.dynamicVoxels.size;
                this.dynamicVoxels.set(key, { 
                    x: voxelData.x, 
                    y: voxelData.y, 
                    z: voxelData.z, 
                    color: voxelData.color, 
                    rgb, 
                    key, 
                    index 
                });
                
                this.physicsWorker.postMessage({
                    type: 'addDynamic',
                    data: { x: voxelData.x, y: voxelData.y, z: voxelData.z, id: key, color: voxelData.color }
                });
            }
        });
        
        this.updateStaticInstancedMesh();
        this.updateDynamicInstancedMesh();
        this.updateBlockCount();
    }

    async saveScene(sceneName = '默认场景') {
        const voxels = this.serializeScene();
        
        try {
            const response = await fetch('http://localhost:3001/api/scenes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: sceneName, voxels })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showMessage('场景保存成功！', 'success');
                return result;
            } else {
                this.showMessage('保存失败: ' + result.message, 'error');
                return null;
            }
        } catch (error) {
            console.error('保存场景错误:', error);
            this.showMessage('保存失败: 无法连接到服务器', 'error');
            return null;
        }
    }

    async loadLatestScene() {
        try {
            const response = await fetch('http://localhost:3001/api/scenes/latest');
            const result = await response.json();
            
            if (result.success && result.scene) {
                await this.loadScene(result.scene.voxels);
                this.showMessage('场景加载成功！', 'success');
                return result.scene;
            } else {
                console.log('没有找到已保存的场景');
                return null;
            }
        } catch (error) {
            console.error('加载场景错误:', error);
            this.showMessage('加载失败: 无法连接到服务器', 'error');
            return null;
        }
    }

    async getSceneList() {
        try {
            const response = await fetch('http://localhost:3001/api/scenes');
            const result = await response.json();
            
            if (result.success) {
                return result.scenes;
            }
            return [];
        } catch (error) {
            console.error('获取场景列表错误:', error);
            return [];
        }
    }

    async deleteScene(sceneId) {
        try {
            const response = await fetch(`http://localhost:3001/api/scenes/${sceneId}`, {
                method: 'DELETE'
            });
            const result = await response.json();
            
            if (result.success) {
                this.showMessage('场景删除成功！', 'success');
                return true;
            }
            return false;
        } catch (error) {
            console.error('删除场景错误:', error);
            return false;
        }
    }

    showMessage(text, type = 'info') {
        const msgEl = document.createElement('div');
        msgEl.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            padding: 12px 24px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            animation: fadeInOut 3s ease-in-out;
            background: ${type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : '#3498db'};
        `;
        msgEl.textContent = text;
        
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeInOut {
                0% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
                15% { opacity: 1; transform: translateX(-50%) translateY(0); }
                85% { opacity: 1; transform: translateX(-50%) translateY(0); }
                100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(msgEl);
        
        setTimeout(() => {
            document.body.removeChild(msgEl);
            document.head.removeChild(style);
        }, 3000);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        
        this.controls.update();
        
        if (this.instanceMatrixNeedsUpdate) {
            this.updateDynamicInstancedMesh();
            this.instanceMatrixNeedsUpdate = false;
        }
        
        this.renderer.render(this.scene, this.camera);
        
        this.frameCount++;
        const now = performance.now();
        if (now - this.lastFpsUpdate >= 1000) {
            document.getElementById('fps').textContent = this.frameCount;
            this.frameCount = 0;
            this.lastFpsUpdate = now;
        }
    }
}

new VoxelEditor();
