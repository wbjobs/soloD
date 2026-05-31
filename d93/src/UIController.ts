import type { FluidSimulator } from './FluidSimulator';

export class UIController {
  private velocitySlider: HTMLInputElement;
  private viscositySlider: HTMLInputElement;
  private gravitySlider: HTMLInputElement;
  private vorticitySlider: HTMLInputElement;
  private velocityValue: HTMLElement;
  private viscosityValue: HTMLElement;
  private gravityValue: HTMLElement;
  private vorticityValue: HTMLElement;
  private fpsDisplay: HTMLElement;
  private canvas: HTMLCanvasElement;

  constructor(private simulator: FluidSimulator, canvas: HTMLCanvasElement) {
    this.velocitySlider = document.getElementById('velocity') as HTMLInputElement;
    this.viscositySlider = document.getElementById('viscosity') as HTMLInputElement;
    this.gravitySlider = document.getElementById('gravity') as HTMLInputElement;
    this.vorticitySlider = document.getElementById('vorticity') as HTMLInputElement;
    this.velocityValue = document.getElementById('velocityValue')!;
    this.viscosityValue = document.getElementById('viscosityValue')!;
    this.gravityValue = document.getElementById('gravityValue')!;
    this.vorticityValue = document.getElementById('vorticityValue')!;
    this.fpsDisplay = document.getElementById('fps')!;
    this.canvas = canvas;

    this.init();
  }

  private init(): void {
    const params = this.simulator.getParams();
    
    this.velocitySlider.value = params.velocity.toString();
    this.viscositySlider.value = params.viscosity.toString();
    this.gravitySlider.value = params.gravity.toString();
    this.vorticitySlider.value = params.vorticity.toString();
    
    this.velocityValue.textContent = params.velocity.toFixed(1);
    this.viscosityValue.textContent = params.viscosity.toFixed(2);
    this.gravityValue.textContent = params.gravity.toFixed(1);
    this.vorticityValue.textContent = params.vorticity.toFixed(1);

    this.velocitySlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      this.simulator.setVelocity(value);
      this.velocityValue.textContent = value.toFixed(1);
    });

    this.viscositySlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      this.simulator.setViscosity(value);
      this.viscosityValue.textContent = value.toFixed(2);
    });

    this.gravitySlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      this.simulator.setGravity(value);
      this.gravityValue.textContent = value.toFixed(1);
    });

    this.vorticitySlider.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      this.simulator.setVorticity(value);
      this.vorticityValue.textContent = value.toFixed(1);
    });

    this.setupMouseEvents();
    this.setupTouchEvents();

    this.simulator.setFpsCallback((fps) => {
      this.fpsDisplay.textContent = `${fps} FPS`;
    });
  }

  private setupMouseEvents(): void {
    let isMouseDown = false;

    this.canvas.addEventListener('mousedown', (e) => {
      isMouseDown = true;
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = rect.height - (e.clientY - rect.top);
      this.simulator.updateMousePosition(x, y, true);
    });

    this.canvas.addEventListener('mouseup', () => {
      isMouseDown = false;
      const rect = this.canvas.getBoundingClientRect();
      this.simulator.updateMousePosition(
        this.canvas.width / 2,
        rect.height / 2,
        false
      );
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = rect.height - (e.clientY - rect.top);
      this.simulator.updateMousePosition(x, y, isMouseDown);
    });

    this.canvas.addEventListener('mouseleave', () => {
      isMouseDown = false;
    });
  }

  private setupTouchEvents(): void {
    let isTouching = false;

    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      isTouching = true;
      const rect = this.canvas.getBoundingClientRect();
      const touch = e.touches[0];
      const x = touch.clientX - rect.left;
      const y = rect.height - (touch.clientY - rect.top);
      this.simulator.updateMousePosition(x, y, true);
    });

    this.canvas.addEventListener('touchend', () => {
      isTouching = false;
      this.simulator.updateMousePosition(
        this.canvas.width / 2,
        this.canvas.height / 2,
        false
      );
    });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!isTouching) return;
      const rect = this.canvas.getBoundingClientRect();
      const touch = e.touches[0];
      const x = touch.clientX - rect.left;
      const y = rect.height - (touch.clientY - rect.top);
      this.simulator.updateMousePosition(x, y, true);
    });
  }
}
