import { WebGPURenderer, type FluidParams, type MouseData } from './WebGPURenderer';

export class FluidSimulator {
  private renderer: WebGPURenderer;
  private animationId: number | null = null;
  private lastTime: number = 0;
  private frameCount: number = 0;
  private fps: number = 0;

  private params: FluidParams = {
    velocity: 5.0,
    viscosity: 0.0,
    gravity: 9.8,
    vorticity: 3.0,
    dt: 0.016,
  };

  private mouse: MouseData = {
    position: { x: 0, y: 0 },
    direction: { x: 0, y: 0 },
    pressure: 0,
  };

  private lastMousePos: { x: number; y: number } = { x: 0, y: 0 };
  private onFpsUpdate?: (fps: number) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGPURenderer(canvas);
  }

  async init(): Promise<void> {
    await this.renderer.init();
    this.renderer.updateParams(this.params);
    this.renderer.updateMouse(this.mouse);
  }

  start(): void {
    this.lastTime = performance.now();
    this.animate();
  }

  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private animate = (): void => {
    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    this.frameCount++;
    if (deltaTime > 0) {
      const instantFps = 1 / deltaTime;
      this.fps = this.fps * 0.9 + instantFps * 0.1;
      if (this.frameCount % 30 === 0 && this.onFpsUpdate) {
        this.onFpsUpdate(Math.round(this.fps));
      }
    }

    this.params.dt = Math.min(deltaTime, 0.033);
    this.renderer.updateParams(this.params);
    this.renderer.render();

    this.animationId = requestAnimationFrame(this.animate);
  };

  setVelocity(value: number): void {
    this.params.velocity = value;
    this.renderer.updateParams(this.params);
  }

  setViscosity(value: number): void {
    this.params.viscosity = value;
    this.renderer.updateParams(this.params);
  }

  setGravity(value: number): void {
    this.params.gravity = value;
    this.renderer.updateParams(this.params);
  }

  setVorticity(value: number): void {
    this.params.vorticity = value;
    this.renderer.updateParams(this.params);
  }

  getParams(): FluidParams {
    return { ...this.params };
  }

  updateMousePosition(x: number, y: number, isDown: boolean): void {
    this.mouse.direction = {
      x: (x - this.lastMousePos.x) * 2,
      y: (y - this.lastMousePos.y) * 2,
    };
    this.mouse.position = { x, y };
    this.mouse.pressure = isDown ? 1.0 : 0.0;

    this.lastMousePos = { x, y };
    this.renderer.updateMouse(this.mouse);
  }

  setFpsCallback(callback: (fps: number) => void): void {
    this.onFpsUpdate = callback;
  }
}
