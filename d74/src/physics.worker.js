importScripts('https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js');

const { World, Vec3, Body, Box, NaiveBroadphase, ContactMaterial, Material, SplitSolver } = CANNON;

const world = new World({
    gravity: new Vec3(0, -30, 0),
    broadphase: new NaiveBroadphase(),
});

world.allowSleep = true;

const groundMaterial = new Material('ground');
const voxelMaterial = new Material('voxel');

const groundVoxelContactMaterial = new ContactMaterial(groundMaterial, voxelMaterial, {
    friction: 0.8,
    restitution: 0.0,
    contactEquationStiffness: 1e8,
    contactEquationRelaxation: 3,
    frictionEquationStiffness: 1e8,
    frictionEquationRelaxation: 3,
});

world.addContactMaterial(groundVoxelContactMaterial);

const voxels = new Map();
const staticBodies = new Map();

const groundShape = new Box(new Vec3(200, 1, 200));
const groundBody = new Body({
    mass: 0,
    material: groundMaterial,
    linearDamping: 0,
    angularDamping: 0,
});
groundBody.addShape(groundShape);
groundBody.position.set(32, -1.5, 32);
groundBody.collisionResponse = true;
world.addBody(groundBody);

const voxelShape = new Box(new Vec3(0.48, 0.48, 0.48));

const fixedTimeStep = 1 / 60;
const maxSubSteps = 10;
let lastTime = performance.now();

function updatePhysics() {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    
    world.step(fixedTimeStep, dt, maxSubSteps);
    
    const updates = [];
    voxels.forEach((body, id) => {
        if (body.mass > 0 && !body.sleepState) {
            updates.push({
                id,
                position: { x: body.position.x, y: body.position.y, z: body.position.z },
                quaternion: { x: body.quaternion.x, y: body.quaternion.y, z: body.quaternion.z, w: body.quaternion.w },
            });
        }
    });
    
    if (updates.length > 0) {
        postMessage({ type: 'update', updates });
    }
    
    requestAnimationFrame(updatePhysics);
}

function addStaticVoxel(x, y, z, id) {
    const body = new Body({
        mass: 0,
        material: groundMaterial,
        linearDamping: 0,
        angularDamping: 0,
    });
    body.addShape(voxelShape);
    body.position.set(x, y, z);
    body.collisionResponse = true;
    world.addBody(body);
    staticBodies.set(id, body);
}

function removeStaticVoxel(id) {
    const body = staticBodies.get(id);
    if (body) {
        world.removeBody(body);
        staticBodies.delete(id);
    }
}

function addDynamicVoxel(x, y, z, id, color) {
    const body = new Body({
        mass: 1,
        material: voxelMaterial,
        linearDamping: 0.85,
        angularDamping: 0.9,
        linearFactor: new Vec3(1, 1, 1),
        angularFactor: new Vec3(0.5, 0.5, 0.5),
    });
    body.addShape(voxelShape);
    body.position.set(x, y, z);
    body.collisionResponse = true;
    body.allowSleep = true;
    body.sleepSpeedLimit = 0.1;
    body.sleepTimeLimit = 0.2;
    world.addBody(body);
    voxels.set(id, body);
}

function removeDynamicVoxel(id) {
    const body = voxels.get(id);
    if (body) {
        world.removeBody(body);
        voxels.delete(id);
    }
}

function checkSupport(x, y, z) {
    const key = `${x},${y - 1},${z}`;
    return staticBodies.has(key) || voxels.has(key);
}

function convertToDynamic(x, y, z, id) {
    removeStaticVoxel(id);
    addDynamicVoxel(x, y, z, id);
}

onmessage = function(e) {
    const { type, data } = e.data;
    
    switch (type) {
        case 'addStatic':
            addStaticVoxel(data.x, data.y, data.z, data.id);
            break;
        case 'removeStatic':
            removeStaticVoxel(data.id);
            break;
        case 'addDynamic':
            addDynamicVoxel(data.x, data.y, data.z, data.id, data.color);
            break;
        case 'removeDynamic':
            removeDynamicVoxel(data.id);
            break;
        case 'convertToDynamic':
            convertToDynamic(data.x, data.y, data.z, data.id);
            break;
        case 'clearAll':
            voxels.forEach((body, id) => {
                world.removeBody(body);
            });
            voxels.clear();
            staticBodies.forEach((body, id) => {
                world.removeBody(body);
            });
            staticBodies.clear();
            break;
    }
};

requestAnimationFrame(updatePhysics);
