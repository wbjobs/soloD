class City3D {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.pois = [];
    this.roads = [];
    this.heatmapData = [];
    this.heatmapMesh = null;
    this.pathMeshes = {};
    this.currentPathType = 'shortest';
    this.currentPaths = {};

    this.isPlaying = false;
    this.playSpeed = 1;
    this.currentHour = 12;
    this.lastFrameTime = 0;

    this.enableLOD = true;
    this.enableFog = true;
    this.renderDistance = 1000;
    this.buildings = [];
    this.buildingLODs = [];

    this.frameCount = 0;
    this.lastFpsUpdate = 0;

    this.API_BASE = 'http://localhost:3000/api';
    this.init();
  }

  async init() {
    this.setupScene();
    this.setupCamera();
    this.setupRenderer();
    this.setupLights();
    this.createGround();

    await this.loadData();
    this.createBuildingsWithLOD();
    this.createRoads();
    this.createPOIs();
    this.createHeatmap();

    this.setupControls();
    this.setupEvents();
    this.animate();
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 500, 1500);
  }

  setupCamera() {
    const container = document.getElementById('canvas-container');
    this.camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      3000
    );
    this.camera.position.set(400, 400, 400);
    this.camera.lookAt(0, 0, 0);
  }

  setupRenderer() {
    const container = document.getElementById('canvas-container');
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
  }

  setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(200, 400, 200);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 1000;
    directionalLight.shadow.camera.left = -500;
    directionalLight.shadow.camera.right = 500;
    directionalLight.shadow.camera.top = 500;
    directionalLight.shadow.camera.bottom = -500;
    this.scene.add(directionalLight);
  }

  createGround() {
    const groundGeometry = new THREE.PlaneGeometry(2000, 2000);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x3d5c3d,
      roughness: 0.8,
      metalness: 0.2
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const gridHelper = new THREE.GridHelper(2000, 100, 0x444444, 0x444444);
    gridHelper.position.y = 0.1;
    this.scene.add(gridHelper);
  }

  async loadData() {
    try {
      const [poisRes, roadsRes, heatmapRes] = await Promise.all([
        fetch(`${this.API_BASE}/pois`),
        fetch(`${this.API_BASE}/pathfinding/roads`),
        fetch(`${this.API_BASE}/heatmap/current?hour=12`)
      ]);

      this.pois = await poisRes.json();
      this.roads = await roadsRes.json();
      this.heatmapData = await heatmapRes.json();
    } catch (error) {
      console.log('Loading demo data...');
      this.loadDemoData();
    }
    this.populatePOISelectors();
  }

  loadDemoData() {
    this.pois = [
      { id: 1, name: '火车站', type: 'transport', x: 0, y: 0, z: 0 },
      { id: 2, name: '购物中心', type: 'commercial', x: 200, y: 100, z: 0 },
      { id: 3, name: '市政府', type: 'government', x: -150, y: 200, z: 0 },
      { id: 4, name: '人民医院', type: 'hospital', x: 100, y: -150, z: 0 },
      { id: 5, name: '大学城', type: 'education', x: -200, y: -100, z: 0 },
      { id: 6, name: '中央公园', type: 'park', x: 50, y: 150, z: 0 },
      { id: 7, name: '体育馆', type: 'sports', x: -100, y: -200, z: 0 },
      { id: 8, name: '科技园区', type: 'business', x: 250, y: -50, z: 0 },
      { id: 9, name: '博物馆', type: 'culture', x: -50, y: 50, z: 0 },
      { id: 10, name: '酒店', type: 'hotel', x: 150, y: 200, z: 0 },
    ];

    this.roads = [
      { start_x: 0, start_y: 0, start_z: 0, end_x: 200, end_y: 100, end_z: 0 },
      { start_x: 0, start_y: 0, start_z: 0, end_x: -150, end_y: 200, end_z: 0 },
      { start_x: 0, start_y: 0, start_z: 0, end_x: 100, end_y: -150, end_z: 0 },
      { start_x: 0, start_y: 0, start_z: 0, end_x: -200, end_y: -100, end_z: 0 },
      { start_x: 200, start_y: 100, start_z: 0, end_x: 50, end_y: 150, end_z: 0 },
      { start_x: -150, start_y: 200, start_z: 0, end_x: 50, end_y: 150, end_z: 0 },
      { start_x: 100, start_y: -150, start_z: 0, end_x: -100, end_y: -200, end_z: 0 },
      { start_x: -200, start_y: -100, start_z: 0, end_x: -100, end_y: -200, end_z: 0 },
      { start_x: -100, start_y: -200, start_z: 0, end_x: 250, end_y: -50, end_z: 0 },
      { start_x: 200, start_y: 100, start_z: 0, end_x: 150, end_y: 200, end_z: 0 },
      { start_x: -50, start_y: 50, start_z: 0, end_x: 0, end_y: 0, end_z: 0 },
      { start_x: -50, start_y: 50, start_z: 0, end_x: -150, end_y: 200, end_z: 0 },
    ];

    for (let i = 0; i < 50; i++) {
      this.heatmapData.push({
        x: (Math.random() - 0.5) * 600,
        y: (Math.random() - 0.5) * 600,
        intensity: Math.random()
      });
    }
  }

  populatePOISelectors() {
    const startSelect = document.getElementById('startPoint');
    const endSelect = document.getElementById('endPoint');

    this.pois.forEach(poi => {
      const option1 = document.createElement('option');
      option1.value = poi.id;
      option1.textContent = poi.name;
      startSelect.appendChild(option1);

      const option2 = document.createElement('option');
      option2.value = poi.id;
      option2.textContent = poi.name;
      endSelect.appendChild(option2);
    });
  }

  createBuildingsWithLOD() {
    const buildingColors = {
      commercial: 0x8b4513,
      government: 0x4a4a8a,
      hospital: 0xffffff,
      education: 0x6b8e23,
      transport: 0x708090,
      park: 0x228b22,
      sports: 0xdaa520,
      business: 0x4169e1,
      culture: 0x9932cc,
      hotel: 0xffd700
    };

    this.pois.forEach((poi, index) => {
      const height = 30 + Math.random() * 50;
      const width = 20 + Math.random() * 20;
      const depth = 20 + Math.random() * 20;

      const lod = new THREE.LOD();

      const highGeom = new THREE.BoxGeometry(width, height, depth);
      const highMat = new THREE.MeshStandardMaterial({
        color: buildingColors[poi.type] || 0x808080,
        roughness: 0.7,
        metalness: 0.3
      });
      const highMesh = new THREE.Mesh(highGeom, highMat);
      highMesh.position.set(poi.x, height / 2, poi.y);
      highMesh.castShadow = true;
      highMesh.receiveShadow = true;
      lod.addLevel(highMesh, 100);

      const midGeom = new THREE.BoxGeometry(width * 0.95, height * 0.95, depth * 0.95);
      const midMesh = new THREE.Mesh(midGeom, highMat);
      midMesh.position.set(poi.x, height / 2, poi.y);
      lod.addLevel(midMesh, 300);

      const lowGeom = new THREE.BoxGeometry(width * 0.9, height * 0.9, depth * 0.9);
      const lowMat = new THREE.MeshLambertMaterial({
        color: buildingColors[poi.type] || 0x808080
      });
      const lowMesh = new THREE.Mesh(lowGeom, lowMat);
      lowMesh.position.set(poi.x, height / 2, poi.y);
      lod.addLevel(lowMesh, 600);

      lod.userData = { poi, index };
      this.scene.add(lod);
      this.buildingLODs.push(lod);

      const roofGeometry = new THREE.BoxGeometry(width * 0.8, 3, depth * 0.8);
      const roofMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.5
      });
      const roof = new THREE.Mesh(roofGeometry, roofMaterial);
      roof.position.set(poi.x, height + 1.5, poi.y);
      roof.castShadow = true;
      this.scene.add(roof);
    });

    this.generateSurroundingBuildings();
  }

  generateSurroundingBuildings() {
    const buildingMat = new THREE.MeshLambertMaterial({ color: 0x708090 });

    for (let i = 0; i < 200; i++) {
      const x = (Math.random() - 0.5) * 1500;
      const z = (Math.random() - 0.5) * 1500;
      const dist = Math.sqrt(x * x + z * z);
      if (dist < 150) continue;

      const height = 10 + Math.random() * 30;
      const width = 8 + Math.random() * 12;
      const depth = 8 + Math.random() * 12;

      const geometry = new THREE.BoxGeometry(width, height, depth);
      const mesh = new THREE.Mesh(geometry, buildingMat);
      mesh.position.set(x, height / 2, z);
      mesh.userData = { isDistantBuilding: true };
      this.scene.add(mesh);
      this.buildings.push(mesh);
    }
  }

  createRoads() {
    this.roads.forEach(road => {
      const points = [
        new THREE.Vector3(road.start_x, 0.2, road.start_y),
        new THREE.Vector3(road.end_x, 0.2, road.end_y)
      ];

      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({ color: 0x333333 });
      const line = new THREE.Line(geometry, material);
      this.scene.add(line);

      const roadGeometry = new THREE.PlaneGeometry(
        Math.sqrt(Math.pow(road.end_x - road.start_x, 2) + Math.pow(road.end_y - road.start_y, 2)),
        8
      );
      const roadMaterial = new THREE.MeshStandardMaterial({
        color: 0x444444,
        roughness: 0.9
      });
      const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);
      roadMesh.rotation.x = -Math.PI / 2;
      roadMesh.position.set(
        (road.start_x + road.end_x) / 2,
        0.1,
        (road.start_y + road.end_y) / 2
      );
      roadMesh.rotation.z = Math.atan2(road.end_y - road.start_y, road.end_x - road.start_x);
      roadMesh.receiveShadow = true;
      this.scene.add(roadMesh);
    });
  }

  createPOIs() {
    const poiColors = {
      commercial: 0xff6347,
      government: 0x4169e1,
      hospital: 0xff0000,
      education: 0x32cd32,
      transport: 0xffd700,
      park: 0x90ee90,
      sports: 0xff8c00,
      business: 0x00ced1,
      culture: 0x9932cc,
      hotel: 0xff69b4
    };

    this.pois.forEach(poi => {
      const geometry = new THREE.SphereGeometry(8, 16, 16);
      const material = new THREE.MeshStandardMaterial({
        color: poiColors[poi.type] || 0x808080,
        emissive: poiColors[poi.type] || 0x808080,
        emissiveIntensity: 0.3
      });

      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.set(poi.x, 10, poi.y);
      sphere.castShadow = true;
      sphere.userData = { poi };
      this.scene.add(sphere);
    });
  }

  createHeatmap() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillRect(0, 0, 1024, 1024);

    this.heatmapData.forEach(point => {
      const x = ((point.x + 1000) / 2000) * 1024;
      const y = 1024 - ((point.y + 1000) / 2000) * 1024;
      const radius = 40 + point.intensity * 50;

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      const alpha = point.intensity * 0.9;
      gradient.addColorStop(0, `rgba(255, 50, 50, ${alpha})`);
      gradient.addColorStop(0.4, `rgba(255, 200, 50, ${alpha * 0.6})`);
      gradient.addColorStop(0.7, `rgba(100, 255, 100, ${alpha * 0.3})`);
      gradient.addColorStop(1, 'rgba(0, 100, 255, 0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    });

    const texture = new THREE.CanvasTexture(canvas);
    const geometry = new THREE.PlaneGeometry(2000, 2000);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    if (this.heatmapMesh) {
      this.scene.remove(this.heatmapMesh);
      this.heatmapMesh.geometry.dispose();
      this.heatmapMesh.material.dispose();
    }

    this.heatmapMesh = new THREE.Mesh(geometry, material);
    this.heatmapMesh.rotation.x = -Math.PI / 2;
    this.heatmapMesh.position.y = 2;
    this.heatmapMesh.renderOrder = 100;
    this.scene.add(this.heatmapMesh);
  }

  async updateHeatmap(hour) {
    try {
      const response = await fetch(`${this.API_BASE}/heatmap/current?hour=${hour}`);
      this.heatmapData = await response.json();
    } catch (error) {
      this.heatmapData = [];
      const baseIntensity = Math.sin((hour - 6) * Math.PI / 12) * 0.3 + 0.5;
      for (let i = 0; i < 50; i++) {
        this.heatmapData.push({
          x: (Math.random() - 0.5) * 800,
          y: (Math.random() - 0.5) * 800,
          intensity: Math.max(0.1, Math.random() * baseIntensity)
        });
      }
    }
    this.createHeatmap();
  }

  async findAllPaths(startId, endId) {
    const pathTypes = ['shortest', 'fastest', 'scenic'];
    const results = {};

    for (const type of pathTypes) {
      try {
        const response = await fetch(`${this.API_BASE}/pathfinding/find`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startId, endId, weightType: type })
        });
        results[type] = await response.json();
      } catch (error) {
        results[type] = this.findPathDemo(startId, endId, type);
      }
    }

    return results;
  }

  findPathDemo(startId, endId, type) {
    const startPOI = this.pois.find(p => p.id == startId);
    const endPOI = this.pois.find(p => p.id == endId);

    if (!startPOI || !endPOI) return null;

    let path;
    switch (type) {
      case 'shortest':
        path = [
          { id: startPOI.id, x: startPOI.x, y: startPOI.y, z: 0 },
          { id: 0, x: (startPOI.x + endPOI.x) / 2, y: (startPOI.y + endPOI.y) / 2, z: 0 },
          { id: endPOI.id, x: endPOI.x, y: endPOI.y, z: 0 }
        ];
        break;
      case 'fastest':
        path = [
          { id: startPOI.id, x: startPOI.x, y: startPOI.y, z: 0 },
          { id: 0, x: startPOI.x + 50, y: startPOI.y + 30, z: 0 },
          { id: 0, x: endPOI.x - 50, y: endPOI.y - 30, z: 0 },
          { id: endPOI.id, x: endPOI.x, y: endPOI.y, z: 0 }
        ];
        break;
      case 'scenic':
        path = [
          { id: startPOI.id, x: startPOI.x, y: startPOI.y, z: 0 },
          { id: 0, x: startPOI.x - 80, y: startPOI.y + 100, z: 0 },
          { id: 0, x: (startPOI.x + endPOI.x) / 2 - 50, y: (startPOI.y + endPOI.y) / 2 + 50, z: 0 },
          { id: 0, x: endPOI.x + 30, y: endPOI.y + 80, z: 0 },
          { id: endPOI.id, x: endPOI.x, y: endPOI.y, z: 0 }
        ];
        break;
    }

    let distance = 0;
    for (let i = 1; i < path.length; i++) {
      distance += Math.sqrt(
        Math.pow(path[i].x - path[i-1].x, 2) +
        Math.pow(path[i].y - path[i-1].y, 2)
      );
    }

    const timeMultiplier = { shortest: 1, fastest: 0.8, scenic: 1.5 };

    return {
      path,
      distance,
      estimatedTime: Math.round(distance * timeMultiplier[type] / 10)
    };
  }

  showPath(pathData, type) {
    const colors = {
      shortest: { main: 0x007bff, glow: 0x0056b3 },
      fastest: { main: 0x28a745, glow: 0x1e7e34 },
      scenic: { main: 0xffc107, glow: 0xd39e00 }
    };

    const color = colors[type] || colors.shortest;

    const points = pathData.path.map(p => new THREE.Vector3(p.x, 8, p.y));
    const curve = new THREE.CatmullRomCurve3(points);
    curve.tension = 0.1;

    const tubeGeometry = new THREE.TubeGeometry(curve, 64, 2, 6, false);
    const tubeMaterial = new THREE.MeshBasicMaterial({
      color: color.main,
      transparent: true,
      opacity: type === this.currentPathType ? 0.9 : 0.3
    });

    const tubeMesh = new THREE.Mesh(tubeGeometry, tubeMaterial);
    tubeMesh.renderOrder = 1000;
    tubeMesh.userData = { isPath: true, type };
    this.scene.add(tubeMesh);

    if (this.pathMeshes[type]) {
      this.clearPathByType(type);
    }
    this.pathMeshes[type] = tubeMesh;
    this.currentPaths[type] = pathData;

    this.updatePathInfo();
  }

  updatePathInfo() {
    const pathData = this.currentPaths[this.currentPathType];
    if (!pathData) return;

    document.getElementById('pathDistance').textContent = `距离: ${pathData.distance.toFixed(1)} 单位`;
    document.getElementById('pathPoints').textContent = `节点数: ${pathData.path.length}`;
    document.getElementById('pathTime').textContent = `预计时间: ${pathData.estimatedTime || Math.round(pathData.distance / 10)} 分钟`;
    document.getElementById('pathInfo').classList.add('show');
  }

  switchPathType(type) {
    this.currentPathType = type;

    Object.entries(this.pathMeshes).forEach(([pathType, mesh]) => {
      if (mesh) {
        mesh.material.opacity = pathType === type ? 0.9 : 0.2;
      }
    });

    this.updatePathInfo();

    document.querySelectorAll('.path-option').forEach(btn => {
      btn.classList.remove('active');
      btn.style.backgroundColor = '';
      btn.style.color = '';
    });

    const activeBtn = document.querySelector(`.path-option[data-type="${type}"]`);
    if (activeBtn) {
      activeBtn.classList.add('active');
      const colors = {
        shortest: '#007bff',
        fastest: '#28a745',
        scenic: '#ffc107'
      };
      activeBtn.style.backgroundColor = colors[type];
      activeBtn.style.color = type === 'scenic' ? '#000' : '#fff';
    }
  }

  clearPathByType(type) {
    if (this.pathMeshes[type]) {
      this.scene.remove(this.pathMeshes[type]);
      this.pathMeshes[type].geometry.dispose();
      this.pathMeshes[type].material.dispose();
      delete this.pathMeshes[type];
    }
  }

  clearAllPaths() {
    Object.keys(this.pathMeshes).forEach(type => {
      this.clearPathByType(type);
    });

    const pathObjects = [];
    this.scene.traverse(obj => {
      if (obj.userData && obj.userData.isPath) {
        pathObjects.push(obj);
      }
    });
    pathObjects.forEach(obj => {
      this.scene.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });

    this.currentPaths = {};
    this.pathMeshes = {};
    document.getElementById('pathInfo').classList.remove('show');
    document.getElementById('pathOptions').style.display = 'none';
  }

  setupControls() {
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let isRightDragging = false;

    const canvas = this.renderer.domElement;

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) isDragging = true;
      else if (e.button === 2) isRightDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('mouseup', () => {
      isDragging = false;
      isRightDragging = false;
    });

    canvas.addEventListener('mousemove', (e) => {
      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;

      if (isDragging) {
        const spherical = new THREE.Spherical();
        spherical.setFromVector3(this.camera.position);
        spherical.theta -= deltaX * 0.005;
        spherical.phi += deltaY * 0.005;
        spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));
        this.camera.position.setFromSpherical(spherical);
        this.camera.lookAt(0, 0, 0);
      }

      if (isRightDragging) {
        const right = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        this.camera.getWorldDirection(right);
        right.cross(up).normalize();

        this.camera.position.addScaledVector(right, -deltaX * 0.5);
        this.camera.position.y += deltaY * 0.5;
      }

      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const direction = new THREE.Vector3();
      this.camera.getWorldDirection(direction);
      this.camera.position.addScaledVector(direction, -e.deltaY * 0.2);
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setupEvents() {
    document.getElementById('findPathBtn').addEventListener('click', async () => {
      const startId = document.getElementById('startPoint').value;
      const endId = document.getElementById('endPoint').value;

      if (!startId || !endId) {
        alert('请选择起点和终点');
        return;
      }

      this.clearAllPaths();
      const allPaths = await this.findAllPaths(startId, endId);

      Object.entries(allPaths).forEach(([type, pathData]) => {
        if (pathData) {
          this.showPath(pathData, type);
        }
      });

      document.getElementById('pathOptions').style.display = 'flex';
      this.switchPathType('shortest');
    });

    document.getElementById('clearPathBtn').addEventListener('click', () => {
      this.clearAllPaths();
    });

    document.querySelectorAll('.path-option').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchPathType(btn.dataset.type);
      });
    });

    document.getElementById('heatmapTime').addEventListener('input', (e) => {
      this.currentHour = parseInt(e.target.value);
      document.getElementById('timeDisplay').textContent =
        `${this.currentHour.toString().padStart(2, '0')}:00`;
      this.updateHeatmap(this.currentHour);
    });

    document.getElementById('heatmapOpacity').addEventListener('input', (e) => {
      if (this.heatmapMesh) {
        this.heatmapMesh.material.opacity = e.target.value / 100;
      }
    });

    document.getElementById('showHeatmap').addEventListener('change', (e) => {
      if (this.heatmapMesh) {
        this.heatmapMesh.visible = e.target.checked;
      }
    });

    document.getElementById('playBtn').addEventListener('click', () => {
      this.isPlaying = true;
      document.getElementById('playBtn').textContent = '⏸ 暂停';
    });

    document.getElementById('stopBtn').addEventListener('click', () => {
      this.isPlaying = false;
      document.getElementById('playBtn').textContent = '▶ 播放';
    });

    document.getElementById('playSpeed').addEventListener('change', (e) => {
      this.playSpeed = parseFloat(e.target.value);
    });

    document.getElementById('enableLOD').addEventListener('change', (e) => {
      this.enableLOD = e.target.checked;
    });

    document.getElementById('enableFog').addEventListener('change', (e) => {
      this.enableFog = e.target.checked;
      if (this.scene.fog) {
        this.scene.fog.far = e.target.checked ? this.renderDistance : 5000;
      }
    });

    document.getElementById('renderDistance').addEventListener('input', (e) => {
      this.renderDistance = parseInt(e.target.value);
      if (this.scene.fog) {
        this.scene.fog.far = this.renderDistance;
      }
    });

    const canvas = this.renderer.domElement;
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, this.camera);
      const intersects = raycaster.intersectObjects(this.buildingLODs);

      if (intersects.length > 0) {
        const poi = intersects[0].object.parent.userData.poi;
        if (poi) {
          alert(`POI信息:\n名称: ${poi.name}\n类型: ${poi.type}\n坐标: (${poi.x.toFixed(1)}, ${poi.y.toFixed(1)})`);
        }
      }
    });

    window.addEventListener('resize', () => {
      const container = document.getElementById('canvas-container');
      this.camera.aspect = container.clientWidth / container.clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(container.clientWidth, container.clientHeight);
    });
  }

  updatePerformanceSettings() {
    if (this.enableLOD) {
      this.buildingLODs.forEach(lod => lod.visible = true);
    }

    let visibleBuildings = 0;
    const cameraPos = this.camera.position;

    this.buildings.forEach(building => {
      const dist = building.position.distanceTo(cameraPos);
      const shouldBeVisible = dist < this.renderDistance;
      if (shouldBeVisible) visibleBuildings++;
      building.visible = shouldBeVisible;
    });

    return visibleBuildings;
  }

  updateFPS(timestamp) {
    this.frameCount++;
    if (timestamp - this.lastFpsUpdate >= 1000) {
      const fps = Math.round(this.frameCount * 1000 / (timestamp - this.lastFpsUpdate));
      document.getElementById('fpsValue').textContent = fps;
      this.frameCount = 0;
      this.lastFpsUpdate = timestamp;
    }
  }

  updateTimelineAnimation(timestamp) {
    if (!this.isPlaying) return;

    const deltaTime = timestamp - this.lastFrameTime;
    if (deltaTime >= 1000 / this.playSpeed) {
      this.currentHour = (this.currentHour + 1) % 24;
      document.getElementById('heatmapTime').value = this.currentHour;
      document.getElementById('timeDisplay').textContent =
        `${this.currentHour.toString().padStart(2, '0')}:00`;
      this.updateHeatmap(this.currentHour);
      this.lastFrameTime = timestamp;
    }
  }

  animate(timestamp = 0) {
    requestAnimationFrame((t) => this.animate(t));

    this.updateFPS(t);
    this.updateTimelineAnimation(t);
    const visibleBuildings = this.updatePerformanceSettings();

    const time = Date.now() * 0.001;
    this.buildingLODs.forEach((lod, i) => {
      lod.update(this.camera);
    });

    Object.values(this.pathMeshes).forEach((mesh, i) => {
      if (mesh && mesh.material) {
        const pulse = Math.sin(time * 3 + i) * 0.15 + 0.85;
        mesh.material.opacity = mesh.material.opacity > 0.5 ? pulse : 0.2;
      }
    });

    this.renderer.render(this.scene, this.camera);

    if (this.frameCount % 60 === 0) {
      const info = this.renderer.info;
      document.getElementById('trianglesValue').textContent = info.render.triangles.toLocaleString();
      document.getElementById('drawCallsValue').textContent = info.render.calls;
      document.getElementById('buildingsValue').textContent = visibleBuildings;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new City3D();
});
