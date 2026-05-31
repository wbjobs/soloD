let scene, camera, renderer, controls;
let world;
let voxels = [];
let raycaster;
let mouse;
let voxelCount = 125;
let meshToBodyMap = new Map();

const VOXEL_SIZE = 1;
const GRID_SIZE = 5;
const GRAVITY = -9.8;

function init() {
    initThree();
    initCannon();
    createGround();
    createVoxelCube();
    setupRaycaster();
    animate();
}

function initThree() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(8, 8, 12);
    camera.lookAt(0, 2, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 2, 0);

    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -20;
    directionalLight.shadow.camera.right = 20;
    directionalLight.shadow.camera.top = 20;
    directionalLight.shadow.camera.bottom = -20;
    scene.add(directionalLight);

    window.addEventListener('resize', onWindowResize);
}

function initCannon() {
    world = new CANNON.World();
    world.gravity.set(0, GRAVITY, 0);
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.solver.iterations = 20;
    world.solver.tolerance = 0.001;
    world.allowSleep = true;
    world.defaultContactMaterial.contactEquationStiffness = 1e7;
    world.defaultContactMaterial.contactEquationRelaxation = 3;
    world.defaultContactMaterial.frictionEquationStiffness = 1e7;
    world.defaultContactMaterial.frictionEquationRelaxation = 3;
}

function createGround() {
    const groundGeometry = new THREE.PlaneGeometry(50, 50);
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x2d3436,
        roughness: 0.8,
        metalness: 0.2
    });
    const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    const groundBody = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Plane(),
        material: new CANNON.Material({ friction: 0.3, restitution: 0.3 })
    });
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    world.addBody(groundBody);

    const gridHelper = new THREE.GridHelper(50, 50, 0x444444, 0x333333);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);
}

function createVoxelCube() {
    const colors = [
        0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6,
        0x1abc9c, 0xe67e22, 0x34495e, 0xe91e63, 0x00bcd4
    ];

    const offset = (GRID_SIZE - 1) * VOXEL_SIZE / 2;

    for (let x = 0; x < GRID_SIZE; x++) {
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let z = 0; z < GRID_SIZE; z++) {
                const colorIndex = (x + y + z) % colors.length;
                createVoxel(
                    x * VOXEL_SIZE - offset,
                    y * VOXEL_SIZE + VOXEL_SIZE / 2,
                    z * VOXEL_SIZE - offset,
                    colors[colorIndex]
                );
            }
        }
    }
}

function createVoxel(x, y, z, color) {
    const geometry = new THREE.BoxGeometry(VOXEL_SIZE * 0.95, VOXEL_SIZE * 0.95, VOXEL_SIZE * 0.95);
    const material = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.5,
        metalness: 0.3
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const shape = new CANNON.Box(new CANNON.Vec3(VOXEL_SIZE * 0.475, VOXEL_SIZE * 0.475, VOXEL_SIZE * 0.475));
    const body = new CANNON.Body({
        mass: 2,
        shape: shape,
        position: new CANNON.Vec3(x, y, z),
        material: new CANNON.Material({ friction: 0.8, restitution: 0.0 }),
        linearDamping: 0.5,
        angularDamping: 0.5
    });
    body.sleepSpeedLimit = 0.1;
    body.sleepTimeLimit = 0.5;
    world.addBody(body);

    const voxel = { mesh, body };
    voxels.push(voxel);
    meshToBodyMap.set(mesh, voxel);
}

function setupRaycaster() {
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    renderer.domElement.addEventListener('click', onMouseClick);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
}

function onMouseClick(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const meshes = voxels.map(v => v.mesh);
    const intersects = raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
        const hitMesh = intersects[0].object;
        destroyVoxel(hitMesh);
    }
}

function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const meshes = voxels.map(v => v.mesh);
    const intersects = raycaster.intersectObjects(meshes, false);

    meshes.forEach(mesh => {
        mesh.material.emissive.setHex(0x000000);
    });

    if (intersects.length > 0) {
        intersects[0].object.material.emissive.setHex(0x333333);
    }
}

function destroyVoxel(mesh) {
    const voxel = meshToBodyMap.get(mesh);
    
    if (voxel) {
        const explosionCenter = new CANNON.Vec3().copy(voxel.body.position);
        const explosionRadius = 1.5;
        
        const voxelsToRemove = [];
        voxels.forEach(v => {
            const dist = v.body.position.distanceTo(explosionCenter);
            if (dist <= explosionRadius) {
                voxelsToRemove.push(v);
            }
        });
        
        voxelsToRemove.forEach(v => {
            createDebrisEffect(v.mesh.position, v.mesh.material.color);
        });
        
        createExplosionFlash(explosionCenter);
        
        voxelsToRemove.forEach(v => {
            scene.remove(v.mesh);
            world.removeBody(v.body);
            meshToBodyMap.delete(v.mesh);
        });
        
        voxels = voxels.filter(v => !voxelsToRemove.includes(v));
        voxelCount -= voxelsToRemove.length;
        document.getElementById('voxel-count').textContent = voxelCount;
        
        applyExplosionForce(explosionCenter, explosionRadius);
    }
}

function createDebrisEffect(position, color) {
    const debrisCount = 25;
    const debris = [];

    for (let i = 0; i < debrisCount; i++) {
        const size = 0.05 + Math.random() * 0.1;
        const geo = new THREE.BoxGeometry(size, size, size);
        const mat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(color.r, color.g, color.b),
            transparent: true,
            opacity: 1
        });
        const piece = new THREE.Mesh(geo, mat);
        piece.position.set(
            position.x + (Math.random() - 0.5) * 0.3,
            position.y + (Math.random() - 0.5) * 0.3,
            position.z + (Math.random() - 0.5) * 0.3
        );
        scene.add(piece);

        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.4,
            0.2 + Math.random() * 0.4,
            (Math.random() - 0.5) * 0.4
        );

        const rotationSpeed = new THREE.Vector3(
            (Math.random() - 0.5) * 0.3,
            (Math.random() - 0.5) * 0.3,
            (Math.random() - 0.5) * 0.3
        );

        debris.push({ mesh: piece, velocity, rotationSpeed, gravity: 0.015 });
    }

    let frame = 0;
    const maxFrames = 60;

    function animateDebris() {
        frame++;
        if (frame > maxFrames) {
            debris.forEach(d => {
                scene.remove(d.mesh);
                d.mesh.geometry.dispose();
                d.mesh.material.dispose();
            });
            return;
        }

        debris.forEach(d => {
            d.velocity.y -= d.gravity;
            d.mesh.position.add(d.velocity);
            d.mesh.rotation.x += d.rotationSpeed.x;
            d.mesh.rotation.y += d.rotationSpeed.y;
            d.mesh.rotation.z += d.rotationSpeed.z;
            d.mesh.material.opacity = 1 - (frame / maxFrames);
        });

        requestAnimationFrame(animateDebris);
    }

    animateDebris();
}

function createExplosionFlash(center) {
    const flashGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    const flashMaterial = new THREE.MeshBasicMaterial({
        color: 0xffaa44,
        transparent: true,
        opacity: 1
    });
    const flash = new THREE.Mesh(flashGeometry, flashMaterial);
    flash.position.set(center.x, center.y, center.z);
    scene.add(flash);

    let frame = 0;
    const maxFrames = 15;

    function animateFlash() {
        frame++;
        if (frame > maxFrames) {
            scene.remove(flash);
            flashGeometry.dispose();
            flashMaterial.dispose();
            return;
        }

        const scale = 1 + (frame / maxFrames) * 2;
        flash.scale.set(scale, scale, scale);
        flash.material.opacity = 1 - (frame / maxFrames);

        requestAnimationFrame(animateFlash);
    }

    animateFlash();
}

function applyExplosionForce(center, radius) {
    const explosionStrength = 12;
    
    voxels.forEach(voxel => {
        const dist = voxel.body.position.distanceTo(center);
        if (dist < radius * 2 && dist > 0.01) {
            const strength = explosionStrength * (1 - (dist / (radius * 2)));
            const direction = new CANNON.Vec3();
            direction.copy(voxel.body.position);
            direction.vsub(center, direction);
            direction.normalize();
            
            const force = new CANNON.Vec3(
                direction.x * strength,
                Math.abs(direction.y) * strength * 0.5 + strength * 0.3,
                direction.z * strength
            );
            
            voxel.body.wakeUp();
            voxel.body.applyImpulse(force, voxel.body.position);
        }
    });
}

const fixedTimeStep = 1.0 / 60.0;
let lastTime = performance.now();

function updatePhysics() {
    const now = performance.now();
    const deltaTime = (now - lastTime) / 1000;
    lastTime = now;

    world.step(fixedTimeStep, deltaTime, 3);

    voxels.forEach(voxel => {
        voxel.mesh.position.copy(voxel.body.position);
        voxel.mesh.quaternion.copy(voxel.body.quaternion);
    });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    
    updatePhysics();
    controls.update();
    renderer.render(scene, camera);
}

init();