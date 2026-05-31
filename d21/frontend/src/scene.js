import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

class WeatherScene {
  constructor(container) {
    this.container = container;
    this.particles = null;
    this.weatherData = [];
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.onParticleClick = null;
    this.isPlaybackMode = false;
    this.particleHistory = [];
    this.historyIndex = 0;
    
    this.init();
  }

  init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
    this.scene.fog = new THREE.Fog(0x1a1a2e, 50, 200);

    this.camera = new THREE.PerspectiveCamera(
      60,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 10, 40);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 100;

    this.addLights();
    this.addGround();
    this.createParticles();
    this.addEventListeners();
    this.animate();
  }

  addLights() {
    const ambientLight = new THREE.AmbientLight(0x404080, 0.6);
    this.scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0x4fc3f7, 1, 100);
    pointLight.position.set(20, 30, 20);
    this.scene.add(pointLight);

    const pointLight2 = new THREE.PointLight(0xff7043, 0.5, 100);
    pointLight2.position.set(-20, 20, -20);
    this.scene.add(pointLight2);
  }

  addGround() {
    const geometry = new THREE.PlaneGeometry(200, 200, 50, 50);
    const material = new THREE.MeshPhongMaterial({
      color: 0x16213e,
      transparent: true,
      opacity: 0.3,
      wireframe: true
    });
    const ground = new THREE.Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    const gridHelper = new THREE.GridHelper(200, 50, 0x4fc3f7, 0x2a2a4e);
    this.scene.add(gridHelper);
  }

  createParticles() {
    const particleCount = 2000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    const stationIds = new Int32Array(particleCount);

    const stations = [
      { id: 1, x: -15, z: -10, color: new THREE.Color(0x4fc3f7) },
      { id: 2, x: 0, z: 5, color: new THREE.Color(0x81c784) },
      { id: 3, x: 15, z: -5, color: new THREE.Color(0xffb74d) }
    ];

    for (let i = 0; i < particleCount; i++) {
      const station = stations[i % 3];
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 8;
      
      positions[i * 3] = station.x + Math.cos(angle) * radius;
      positions[i * 3 + 1] = Math.random() * 20;
      positions[i * 3 + 2] = station.z + Math.sin(angle) * radius;

      colors[i * 3] = station.color.r;
      colors[i * 3 + 1] = station.color.g;
      colors[i * 3 + 2] = station.color.b;

      sizes[i] = Math.random() * 2 + 1;
      stationIds[i] = station.id;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('stationId', new THREE.BufferAttribute(stationIds, 1));

    const material = new THREE.PointsMaterial({
      size: 0.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);

    this.stationMarkers = [];
    stations.forEach(station => {
      const markerGeometry = new THREE.SphereGeometry(1, 32, 32);
      const markerMaterial = new THREE.MeshPhongMaterial({
        color: station.color,
        emissive: station.color,
        emissiveIntensity: 0.3
      });
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.set(station.x, 0, station.z);
      marker.userData = { stationId: station.id, isMarker: true };
      this.scene.add(marker);
      this.stationMarkers.push(marker);
    });
  }

  updateWeatherData(data) {
    if (!this.isPlaybackMode) {
      this.weatherData = data;
    }
  }

  setPlaybackMode(enabled) {
    this.isPlaybackMode = enabled;
    if (enabled) {
      this.controls.enabled = false;
    } else {
      this.controls.enabled = true;
    }
  }

  setPlaybackData(historyData) {
    this.particleHistory = historyData;
  }

  setPlaybackIndex(index) {
    this.historyIndex = Math.max(0, Math.min(index, this.particleHistory.length - 1));
    
    if (this.particleHistory[this.historyIndex]) {
      const frameData = this.particleHistory[this.historyIndex];
      this.weatherData = frameData.data;
    }
  }

  updateParticles() {
    if (!this.particles) return;

    const positions = this.particles.geometry.attributes.position.array;
    const stationIds = this.particles.geometry.attributes.stationId.array;

    for (let i = 0; i < positions.length / 3; i++) {
      const stationId = stationIds[i];
      const stationData = this.weatherData.find(s => s.station_id === stationId);

      if (stationData) {
        const windRad = (stationData.wind_direction * Math.PI) / 180;
        const windStrength = stationData.wind_speed * 0.002;
        
        positions[i * 3] += Math.sin(windRad) * windStrength + (Math.random() - 0.5) * 0.05;
        positions[i * 3 + 1] += (Math.random() - 0.3) * 0.05;
        positions[i * 3 + 2] += Math.cos(windRad) * windStrength + (Math.random() - 0.5) * 0.05;

        positions[i * 3 + 1] += 0.02;

        if (positions[i * 3 + 1] > 25) {
          const stations = [
            { x: -15, z: -10 },
            { x: 0, z: 5 },
            { x: 15, z: -5 }
          ];
          const station = stations[i % 3];
          const angle = Math.random() * Math.PI * 2;
          const radius = Math.random() * 8;
          
          positions[i * 3] = station.x + Math.cos(angle) * radius;
          positions[i * 3 + 1] = 0;
          positions[i * 3 + 2] = station.z + Math.sin(angle) * radius;
        }

        const bounds = 50;
        if (Math.abs(positions[i * 3]) > bounds || Math.abs(positions[i * 3 + 2]) > bounds) {
          const stations = [
            { x: -15, z: -10 },
            { x: 0, z: 5 },
            { x: 15, z: -5 }
          ];
          const station = stations[i % 3];
          const angle = Math.random() * Math.PI * 2;
          const radius = Math.random() * 8;
          
          positions[i * 3] = station.x + Math.cos(angle) * radius;
          positions[i * 3 + 1] = Math.random() * 10;
          positions[i * 3 + 2] = station.z + Math.sin(angle) * radius;
        }
      }
    }

    this.particles.geometry.attributes.position.needsUpdate = true;
  }

  addEventListeners() {
    window.addEventListener('resize', () => this.onResize());
    
    this.renderer.domElement.addEventListener('click', (event) => {
      this.mouse.x = (event.clientX / this.container.clientWidth) * 2 - 1;
      this.mouse.y = -(event.clientY / this.container.clientHeight) * 2 + 1;
      
      this.raycaster.setFromCamera(this.mouse, this.camera);
      
      const intersects = this.raycaster.intersectObjects([this.particles, ...this.stationMarkers]);
      
      if (intersects.length > 0 && this.onParticleClick) {
        const object = intersects[0].object;
        
        if (object.userData && object.userData.isMarker) {
          this.onParticleClick(object.userData.stationId);
        } else if (object === this.particles && intersects[0].index !== undefined) {
          const index = intersects[0].index;
          const stationIds = this.particles.geometry.attributes.stationId.array;
          const stationId = stationIds[index];
          this.onParticleClick(stationId);
        }
      }
    });
  }

  onResize() {
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    
    this.controls.update();
    this.updateParticles();
    this.renderer.render(this.scene, this.camera);
  }
}

export default WeatherScene;
