import { GPUDeviceManager } from './gpu/GPUDeviceManager';
import { MultiGPURenderer } from './gpu/MultiGPURenderer';
import { SceneManager } from './scene/SceneManager';
import { CameraController } from './CameraController';

async function main() {
  const canvas = document.getElementById('raytraceCanvas') as HTMLCanvasElement;
  if (!canvas) {
    console.error('Canvas not found');
    return;
  }

  if (!navigator.gpu) {
    alert('WebGPU is not supported in this browser. Please use Chrome 113+, Edge 113+, or Safari 17+.');
    return;
  }

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const gpuManager = new GPUDeviceManager();
  const sceneManager = new SceneManager();
  
  try {
    const devices = await gpuManager.initialize();
    
    updateGPUInfo(devices);
    
    const renderer = new MultiGPURenderer(canvas, sceneManager);
    await renderer.initialize(devices);
    
    const cameraController = new CameraController(canvas, renderer.getCamera());
    cameraController.setCameraChangedCallback(() => {
      renderer.setCamera(cameraController.getCamera());
    });

    setupControls(renderer);

    let lastTime = performance.now();
    let frameCount = 0;
    let fps = 0;

    function animate() {
      const cameraMoved = cameraController.update();
      if (cameraMoved) {
        renderer.setCamera(cameraController.getCamera());
      }

      renderer.render();
      frameCount++;

      const currentTime = performance.now();
      if (currentTime - lastTime >= 1000) {
        fps = frameCount;
        frameCount = 0;
        lastTime = currentTime;
        updateStats(fps, renderer.getFrame() * renderer.getSettings().samplesPerPixel, sceneManager.getTriangleCount());
      }

      requestAnimationFrame(animate);
    }

    animate();

    window.addEventListener('resize', () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      renderer.resize(canvas.width, canvas.height);
      renderer.reinitialize();
    });

  } catch (error) {
    console.error('Failed to initialize:', error);
    alert('Failed to initialize WebGPU: ' + (error as Error).message);
  }
}

function updateGPUInfo(devices: { name: string; index: number }[]): void {
  const gpuList = document.getElementById('gpuList');
  if (!gpuList) return;

  gpuList.innerHTML = '';
  
  devices.forEach(device => {
    const div = document.createElement('div');
    div.className = 'gpu-item';
    div.textContent = `GPU ${device.index + 1}: ${device.name}`;
    gpuList.appendChild(div);
  });
}

function updateStats(fps: number, totalSamples: number, triangleCount: number): void {
  const fpsEl = document.getElementById('fps');
  const samplesEl = document.getElementById('totalSamples');
  const objectsEl = document.getElementById('objectCount');

  if (fpsEl) fpsEl.textContent = fps.toString();
  if (samplesEl) samplesEl.textContent = totalSamples.toLocaleString();
  if (objectsEl) objectsEl.textContent = triangleCount.toString();
}

function setupControls(renderer: MultiGPURenderer): void {
  const samplesSlider = document.getElementById('samples') as HTMLInputElement;
  const samplesValue = document.getElementById('samplesValue');
  const bouncesSlider = document.getElementById('bounces') as HTMLInputElement;
  const bouncesValue = document.getElementById('bouncesValue');
  const adaptiveCheckbox = document.getElementById('adaptive') as HTMLInputElement;
  const denoiseCheckbox = document.getElementById('denoise') as HTMLInputElement;
  const fovSlider = document.getElementById('fov') as HTMLInputElement;
  const fovValue = document.getElementById('fovValue');

  if (samplesSlider && samplesValue) {
    samplesSlider.addEventListener('input', () => {
      const value = parseInt(samplesSlider.value);
      samplesValue.textContent = value.toString();
      renderer.setSettings({ samplesPerPixel: value });
    });
  }

  if (bouncesSlider && bouncesValue) {
    bouncesSlider.addEventListener('input', () => {
      const value = parseInt(bouncesSlider.value);
      bouncesValue.textContent = value.toString();
      renderer.setSettings({ maxBounces: value });
    });
  }

  if (adaptiveCheckbox) {
    adaptiveCheckbox.addEventListener('change', () => {
      renderer.setSettings({ adaptiveSampling: adaptiveCheckbox.checked });
    });
  }

  if (denoiseCheckbox) {
    denoiseCheckbox.addEventListener('change', () => {
      renderer.setSettings({ denoising: denoiseCheckbox.checked });
    });
  }

  if (fovSlider && fovValue) {
    fovSlider.addEventListener('input', () => {
      const value = parseInt(fovSlider.value);
      fovValue.textContent = value.toString();
      const camera = renderer.getCamera();
      camera.fov = value;
      renderer.setCamera(camera);
    });
  }
}

main().catch(console.error);
