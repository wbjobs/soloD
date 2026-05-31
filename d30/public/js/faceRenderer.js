class FaceRenderer {
    constructor(options = {}) {
        this.container = options.container || document.body;
        this.width = options.width || 400;
        this.height = options.height || 400;
        
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.faceMesh = null;
        this.morphTargets = [];
        
        this.blendshapeNames = [
            'eyeBlinkLeft', 'eyeBlinkRight', 'eyeSquintLeft', 'eyeSquintRight',
            'eyeWideLeft', 'eyeWideRight', 'jawForward', 'jawLeft', 'jawRight',
            'jawOpen', 'mouthClose', 'mouthFunnel', 'mouthPucker', 'mouthLeft',
            'mouthRight', 'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft',
            'mouthFrownRight', 'mouthDimpleLeft', 'mouthDimpleRight', 'mouthStretchLeft',
            'mouthStretchRight', 'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower',
            'mouthShrugUpper', 'mouthPressLeft', 'mouthPressRight', 'mouthLowerDownLeft',
            'mouthLowerDownRight', 'mouthUpperUpLeft', 'mouthUpperUpRight', 'browDownLeft',
            'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight',
            'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight', 'noseSneerLeft',
            'noseSneerRight', 'tongueOut'
        ];
        
        this.currentBlendshapes = new Float32Array(this.blendshapeNames.length).fill(0);
        this.targetBlendshapes = new Float32Array(this.blendshapeNames.length).fill(0);
        this.smoothingFactor = options.smoothingFactor || 0.3;
        
        this.isAnimating = false;
        this.animationId = null;
    }

    async init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);

        this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.1, 1000);
        this.camera.position.set(0, 0, 3);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1, 1, 1);
        this.scene.add(directionalLight);

        await this.createFace();
        
        this.startAnimation();
        
        console.log('Face renderer initialized');
        return true;
    }

    async createFace() {
        const geometry = new THREE.SphereGeometry(1, 64, 64);
        
        const positions = geometry.attributes.position.array;
        const morphAttributes = {};
        
        for (let i = 0; i < this.blendshapeNames.length; i++) {
            const morphPositions = new Float32Array(positions.length);
            for (let j = 0; j < positions.length; j++) {
                morphPositions[j] = positions[j];
            }
            morphAttributes[this.blendshapeNames[i]] = morphPositions;
        }

        this.applyMorphModifications(morphAttributes);
        
        for (const [name, data] of Object.entries(morphAttributes)) {
            geometry.morphAttributes.position = geometry.morphAttributes.position || [];
            geometry.morphAttributes.position.push(new THREE.Float32BufferAttribute(data, 3));
        }

        geometry.morphTargetsRelative = false;

        const material = new THREE.MeshStandardMaterial({
            color: 0xffdbac,
            morphTargets: true,
            roughness: 0.8,
            metalness: 0.1
        });

        this.faceMesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.faceMesh);

        const eyeGeometry = new THREE.SphereGeometry(0.1, 16, 16);
        const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
        
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.35, 0.3, 0.85);
        this.faceMesh.add(leftEye);

        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.35, 0.3, 0.85);
        this.faceMesh.add(rightEye);

        const pupilGeometry = new THREE.SphereGeometry(0.04, 16, 16);
        const pupilMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
        
        const leftPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
        leftPupil.position.set(-0.35, 0.3, 0.93);
        this.faceMesh.add(leftPupil);

        const rightPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
        rightPupil.position.set(0.35, 0.3, 0.93);
        this.faceMesh.add(rightPupil);
    }

    applyMorphModifications(morphAttributes) {
        const jawOpen = morphAttributes['jawOpen'];
        for (let i = 0; i < jawOpen.length; i += 3) {
            const y = jawOpen[i + 1];
            const z = jawOpen[i + 2];
            if (y < -0.3 && z > 0.5) {
                jawOpen[i + 1] -= 0.3;
            }
        }

        const mouthSmileLeft = morphAttributes['mouthSmileLeft'];
        const mouthSmileRight = morphAttributes['mouthSmileRight'];
        for (let i = 0; i < mouthSmileLeft.length; i += 3) {
            const x = mouthSmileLeft[i];
            const y = mouthSmileLeft[i + 1];
            if (x < -0.2 && y > -0.3 && y < 0.1) {
                mouthSmileLeft[i] -= 0.05;
                mouthSmileLeft[i + 1] += 0.05;
            }
            if (x > 0.2 && y > -0.3 && y < 0.1) {
                mouthSmileRight[i] += 0.05;
                mouthSmileRight[i + 1] += 0.05;
            }
        }

        const eyeBlinkLeft = morphAttributes['eyeBlinkLeft'];
        const eyeBlinkRight = morphAttributes['eyeBlinkRight'];
        for (let i = 0; i < eyeBlinkLeft.length; i += 3) {
            const x = eyeBlinkLeft[i];
            const y = eyeBlinkLeft[i + 1];
            const z = eyeBlinkLeft[i + 2];
            if (x < -0.2 && x > -0.5 && y > 0.1 && y < 0.5 && z > 0.5) {
                eyeBlinkLeft[i + 1] -= 0.1;
            }
            if (x > 0.2 && x < 0.5 && y > 0.1 && y < 0.5 && z > 0.5) {
                eyeBlinkRight[i + 1] -= 0.1;
            }
        }
    }

    updateBlendshapes(blendshapes) {
        for (let i = 0; i < Math.min(blendshapes.length, this.blendshapeNames.length); i++) {
            this.targetBlendshapes[i] = Math.max(0, Math.min(1, blendshapes[i]));
        }
    }

    smoothUpdate() {
        for (let i = 0; i < this.currentBlendshapes.length; i++) {
            this.currentBlendshapes[i] += (this.targetBlendshapes[i] - this.currentBlendshapes[i]) * this.smoothingFactor;
        }
    }

    applyBlendshapes() {
        if (!this.faceMesh || !this.faceMesh.morphTargetInfluences) return;

        for (let i = 0; i < this.currentBlendshapes.length; i++) {
            if (i < this.faceMesh.morphTargetInfluences.length) {
                this.faceMesh.morphTargetInfluences[i] = this.currentBlendshapes[i];
            }
        }
    }

    startAnimation() {
        this.isAnimating = true;
        this.animate();
    }

    animate() {
        if (!this.isAnimating) return;

        this.animationId = requestAnimationFrame(() => this.animate());

        this.smoothUpdate();
        this.applyBlendshapes();
        
        if (this.faceMesh) {
            this.faceMesh.rotation.y += 0.002;
        }

        this.renderer.render(this.scene, this.camera);
    }

    stopAnimation() {
        this.isAnimating = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
    }

    dispose() {
        this.stopAnimation();
        if (this.renderer) {
            this.renderer.dispose();
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FaceRenderer;
}
