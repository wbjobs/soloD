import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let G = 50;
const TRAIL_LENGTH = 500;
const DT = 0.016;
const SUBSTEPS = 10;
const BOUNDARY_RADIUS = 500;
const ENERGY_CORRECTION_THRESHOLD = 0.1;

const SCENE_CONFIGS = {
    chaotic: {
        name: '混沌初始条件',
        description: '三个质量相等天体的随机初始条件，展示混沌特性',
        bodies: [
            { mass: 100, position: new THREE.Vector3(-50, 0, 0), velocity: new THREE.Vector3(0, 2, 0.5), color: 0xff4444, radius: 4 },
            { mass: 100, position: new THREE.Vector3(50, 0, 0), velocity: new THREE.Vector3(0, -2, -0.5), color: 0x44ff44, radius: 4 },
            { mass: 100, position: new THREE.Vector3(0, 50, 20), velocity: new THREE.Vector3(2, 0, 0), color: 0x4444ff, radius: 4 }
        ]
    },
    figure8: {
        name: '8字形解',
        description: '三体问题的著名周期解，三个天体沿8字形轨道运动',
        bodies: [
            { mass: 100, position: new THREE.Vector3(-40, 0, 0), velocity: new THREE.Vector3(0.347113, 0.532726, 0), color: 0xff4444, radius: 4 },
            { mass: 100, position: new THREE.Vector3(40, 0, 0), velocity: new THREE.Vector3(0.347113, 0.532726, 0), color: 0x44ff44, radius: 4 },
            { mass: 100, position: new THREE.Vector3(0, 0, 0), velocity: new THREE.Vector3(-0.694226, -1.065452, 0), color: 0x4444ff, radius: 4 }
        ]
    },
    lagrange: {
        name: '拉格朗日等边三角形',
        description: '三个天体构成等边三角形，绕质心旋转的稳定构型',
        bodies: [
            { mass: 100, position: new THREE.Vector3(-50, 0, 0), velocity: new THREE.Vector3(0, 2.5, 0), color: 0xff4444, radius: 4 },
            { mass: 100, position: new THREE.Vector3(50, 0, 0), velocity: new THREE.Vector3(0, -2.5, 0), color: 0x44ff44, radius: 4 },
            { mass: 100, position: new THREE.Vector3(0, 86.6, 0), velocity: new THREE.Vector3(-4.33, 0, 0), color: 0x4444ff, radius: 4 }
        ]
    },
    binary: {
        name: '双星系统 + 行星',
        description: '两个大质量天体组成双星，第三个小天体围绕它们运动',
        bodies: [
            { mass: 200, position: new THREE.Vector3(-30, 0, 0), velocity: new THREE.Vector3(0, 2, 0), color: 0xffaa00, radius: 6 },
            { mass: 200, position: new THREE.Vector3(30, 0, 0), velocity: new THREE.Vector3(0, -2, 0), color: 0xff6600, radius: 6 },
            { mass: 10, position: new THREE.Vector3(0, 100, 0), velocity: new THREE.Vector3(3, 0, 0), color: 0x88ccff, radius: 2 }
        ]
    },
    sun_earth_moon: {
        name: '简化日地月系统',
        description: '太阳、地球、月球的简化质量比例模型',
        bodies: [
            { mass: 1000, position: new THREE.Vector3(0, 0, 0), velocity: new THREE.Vector3(0, 0, 0), color: 0xffdd00, radius: 10 },
            { mass: 30, position: new THREE.Vector3(80, 0, 0), velocity: new THREE.Vector3(0, 7, 0), color: 0x4488ff, radius: 4 },
            { mass: 1, position: new THREE.Vector3(95, 0, 0), velocity: new THREE.Vector3(0, 9.5, 0), color: 0xcccccc, radius: 2 }
        ]
    }
};

class CelestialBody {
    constructor(mass, position, velocity, color, radius) {
        this.mass = mass;
        this.position = position.clone();
        this.prevPosition = position.clone().sub(velocity.clone().multiplyScalar(DT));
        this.velocity = velocity.clone();
        this.color = color;
        this.radius = radius;
        
        this.mesh = this.createMesh();
        this.trail = this.createTrail();
        this.trailPositions = [];
    }

    createMesh() {
        const geometry = new THREE.SphereGeometry(this.radius, 32, 32);
        const material = new THREE.MeshStandardMaterial({
            color: this.color,
            emissive: this.color,
            emissiveIntensity: 0.3,
            metalness: 0.3,
            roughness: 0.5
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(this.position);
        return mesh;
    }

    createTrail() {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(TRAIL_LENGTH * 3);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const material = new THREE.LineBasicMaterial({
            color: this.color,
            opacity: 0.8,
            transparent: true
        });
        
        const line = new THREE.Line(geometry, material);
        line.visible = false;
        return line;
    }

    updateTrail() {
        this.trailPositions.push(this.position.clone());
        
        if (this.trailPositions.length > TRAIL_LENGTH) {
            this.trailPositions.shift();
        }
        
        const positions = this.trail.geometry.attributes.position.array;
        for (let i = 0; i < this.trailPositions.length; i++) {
            positions[i * 3] = this.trailPositions[i].x;
            positions[i * 3 + 1] = this.trailPositions[i].y;
            positions[i * 3 + 2] = this.trailPositions[i].z;
        }
        
        this.trail.geometry.attributes.position.needsUpdate = true;
        this.trail.geometry.setDrawRange(0, this.trailPositions.length);
        
        if (this.trailPositions.length > 2) {
            this.trail.visible = true;
        }
    }

    updateMesh() {
        this.mesh.position.copy(this.position);
    }

    getVelocityFromVerlet(dt) {
        return this.position.clone().sub(this.prevPosition).divideScalar(dt);
    }

    getKineticEnergy() {
        const speedSq = this.velocity.lengthSq();
        return 0.5 * this.mass * speedSq;
    }
}

class Simulation {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.bodies = [];
        this.initialTotalEnergy = 0;
        this.currentScene = 'chaotic';
        this.init();
        this.createBodies();
        this.setupUI();
        this.initialTotalEnergy = this.getTotalEnergy();
        this.animate();
    }

    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000011);

        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            2000
        );
        this.camera.position.set(0, 80, 150);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        document.getElementById('canvas-container').appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        this.addLights();
        this.addStars();
        this.addAxesHelper();

        window.addEventListener('resize', () => this.onWindowResize());
    }

    addLights() {
        const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
        this.scene.add(ambientLight);

        const pointLight1 = new THREE.PointLight(0xffffff, 1, 500);
        pointLight1.position.set(50, 50, 50);
        this.scene.add(pointLight1);

        const pointLight2 = new THREE.PointLight(0xffffff, 0.5, 500);
        pointLight2.position.set(-50, -50, -50);
        this.scene.add(pointLight2);
    }

    addStars() {
        const starsGeometry = new THREE.BufferGeometry();
        const starsMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.5,
            sizeAttenuation: true
        });

        const starsVertices = [];
        for (let i = 0; i < 2000; i++) {
            const x = (Math.random() - 0.5) * 1000;
            const y = (Math.random() - 0.5) * 1000;
            const z = (Math.random() - 0.5) * 1000;
            starsVertices.push(x, y, z);
        }

        starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
        const stars = new THREE.Points(starsGeometry, starsMaterial);
        this.scene.add(stars);
    }

    addAxesHelper() {
        const axesHelper = new THREE.AxesHelper(50);
        this.scene.add(axesHelper);
    }

    createBodies(sceneKey = 'chaotic') {
        this.bodies.forEach(body => {
            this.scene.remove(body.mesh);
            this.scene.remove(body.trail);
        });
        this.bodies = [];

        const config = SCENE_CONFIGS[sceneKey];
        config.bodies.forEach(bodyConfig => {
            const body = new CelestialBody(
                bodyConfig.mass,
                bodyConfig.position,
                bodyConfig.velocity,
                bodyConfig.color,
                bodyConfig.radius
            );
            this.bodies.push(body);
            this.scene.add(body.mesh);
            this.scene.add(body.trail);
        });

        this.initialTotalEnergy = this.getTotalEnergy();
    }

    resetScene(sceneKey) {
        this.currentScene = sceneKey;
        this.createBodies(sceneKey);
        const config = SCENE_CONFIGS[sceneKey];
        document.getElementById('scene-desc').textContent = config.description;
    }

    setupUI() {
        const sceneSelect = document.getElementById('scene-select');
        const gSlider = document.getElementById('g-slider');
        const gValue = document.getElementById('g-value');
        const resetBtn = document.getElementById('reset-btn');

        sceneSelect.addEventListener('change', (e) => {
            this.resetScene(e.target.value);
        });

        gSlider.addEventListener('input', (e) => {
            G = parseFloat(e.target.value);
            gValue.textContent = G;
        });

        resetBtn.addEventListener('click', () => {
            this.resetScene(this.currentScene);
        });
    }

    calculateAccelerations() {
        const accelerations = this.bodies.map(() => new THREE.Vector3(0, 0, 0));

        for (let i = 0; i < this.bodies.length; i++) {
            for (let j = i + 1; j < this.bodies.length; j++) {
                const bodyA = this.bodies[i];
                const bodyB = this.bodies[j];

                const diff = new THREE.Vector3().subVectors(bodyB.position, bodyA.position);
                const distance = diff.length();
                const minDistance = bodyA.radius + bodyB.radius;
                const safeDistance = Math.max(distance, minDistance);

                const forceMagnitude = (G * bodyA.mass * bodyB.mass) / (safeDistance * safeDistance);
                const force = diff.normalize().multiplyScalar(forceMagnitude);

                accelerations[i].add(force.clone().divideScalar(bodyA.mass));
                accelerations[j].sub(force.clone().divideScalar(bodyB.mass));
            }
        }

        return accelerations;
    }

    integrateVerlet(dt) {
        const accelerations = this.calculateAccelerations();

        for (let i = 0; i < this.bodies.length; i++) {
            const body = this.bodies[i];
            
            const newPosition = body.position.clone()
                .multiplyScalar(2)
                .sub(body.prevPosition)
                .add(accelerations[i].multiplyScalar(dt * dt));

            body.prevPosition.copy(body.position);
            body.position.copy(newPosition);
            
            body.velocity.copy(body.getVelocityFromVerlet(dt));
        }
    }

    handleCollisions() {
        for (let i = 0; i < this.bodies.length; i++) {
            for (let j = i + 1; j < this.bodies.length; j++) {
                const bodyA = this.bodies[i];
                const bodyB = this.bodies[j];

                const diff = new THREE.Vector3().subVectors(bodyB.position, bodyA.position);
                const distance = diff.length();
                const minDistance = bodyA.radius + bodyB.radius;

                if (distance < minDistance) {
                    const normal = diff.normalize();
                    const overlap = minDistance - distance;
                    
                    const totalMass = bodyA.mass + bodyB.mass;
                    const moveA = (bodyB.mass / totalMass) * overlap * 0.5;
                    const moveB = (bodyA.mass / totalMass) * overlap * 0.5;
                    
                    bodyA.position.add(normal.clone().multiplyScalar(-moveA));
                    bodyB.position.add(normal.clone().multiplyScalar(moveB));

                    const relVel = new THREE.Vector3().subVectors(bodyB.velocity, bodyA.velocity);
                    const normalVel = relVel.dot(normal);
                    
                    if (normalVel < 0) {
                        const restitution = 0.9;
                        const impulse = -(1 + restitution) * normalVel / (1 / bodyA.mass + 1 / bodyB.mass);
                        
                        bodyA.velocity.add(normal.clone().multiplyScalar(-impulse / bodyA.mass));
                        bodyB.velocity.add(normal.clone().multiplyScalar(impulse / bodyB.mass));
                    }
                }
            }
        }
    }

    applyBoundaryConditions() {
        for (const body of this.bodies) {
            const distance = body.position.length();
            if (distance > BOUNDARY_RADIUS) {
                const normal = body.position.clone().normalize();
                body.position.copy(normal.multiplyScalar(BOUNDARY_RADIUS * 0.95));
                
                const normalVel = body.velocity.dot(normal);
                if (normalVel > 0) {
                    body.velocity.add(normal.clone().multiplyScalar(-2 * normalVel));
                }
            }
        }
    }

    getPotentialEnergy() {
        let potentialEnergy = 0;
        for (let i = 0; i < this.bodies.length; i++) {
            for (let j = i + 1; j < this.bodies.length; j++) {
                const bodyA = this.bodies[i];
                const bodyB = this.bodies[j];
                const distance = bodyA.position.distanceTo(bodyB.position);
                potentialEnergy -= (G * bodyA.mass * bodyB.mass) / Math.max(distance, 1);
            }
        }
        return potentialEnergy;
    }

    getTotalEnergy() {
        let kinetic = 0;
        for (const body of this.bodies) {
            kinetic += body.getKineticEnergy();
        }
        const potential = this.getPotentialEnergy();
        return kinetic + potential;
    }

    correctEnergy() {
        const currentEnergy = this.getTotalEnergy();
        const energyRatio = this.initialTotalEnergy / currentEnergy;
        
        if (Math.abs(energyRatio - 1) > ENERGY_CORRECTION_THRESHOLD) {
            const correctionFactor = Math.sqrt(Math.max(energyRatio, 0.5));
            for (const body of this.bodies) {
                body.velocity.multiplyScalar(correctionFactor);
                const midPoint = body.position.clone().add(body.prevPosition).multiplyScalar(0.5);
                const offset = body.position.clone().sub(midPoint).multiplyScalar(correctionFactor);
                body.prevPosition.copy(midPoint).sub(offset);
                body.position.copy(midPoint).add(offset);
            }
        }
    }

    update() {
        for (let step = 0; step < SUBSTEPS; step++) {
            this.integrateVerlet(DT / SUBSTEPS);
            this.handleCollisions();
            this.applyBoundaryConditions();
        }
        
        this.correctEnergy();

        this.bodies.forEach(body => {
            body.updateMesh();
            body.updateTrail();
        });
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        this.update();
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

new Simulation();
