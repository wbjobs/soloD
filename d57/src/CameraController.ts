import { Camera } from './types';

export class CameraController {
  private camera: Camera;
  private canvas: HTMLCanvasElement;
  private isDragging: boolean = false;
  private lastX: number = 0;
  private lastY: number = 0;
  private yaw: number = -90;
  private pitch: number = 0;
  private keys: Set<string> = new Set();
  private moveSpeed: number = 0.05;
  private sensitivity: number = 0.15;
  private onCameraChanged: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, camera: Camera) {
    this.canvas = canvas;
    this.camera = { ...camera };
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.canvas.addEventListener('mouseleave', this.onMouseUp.bind(this));
    this.canvas.addEventListener('wheel', this.onWheel.bind(this));
    window.addEventListener('keydown', this.onKeyDown.bind(this));
    window.addEventListener('keyup', this.onKeyUp.bind(this));
  }

  private onMouseDown(e: MouseEvent): void {
    this.isDragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.canvas.style.cursor = 'grabbing';
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.isDragging) return;

    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;

    this.lastX = e.clientX;
    this.lastY = e.clientY;

    this.yaw += dx * this.sensitivity;
    this.pitch -= dy * this.sensitivity;

    this.pitch = Math.max(-89, Math.min(89, this.pitch));
    this.updateCameraVectors();
    this.onCameraChanged?.();
  }

  private onMouseUp(): void {
    this.isDragging = false;
    this.canvas.style.cursor = 'grab';
  }

  private onWheel(e: WheelEvent): void {
    this.camera.fov = Math.max(30, Math.min(120, this.camera.fov + e.deltaY * 0.05));
    this.onCameraChanged?.();
  }

  private onKeyDown(e: KeyboardEvent): void {
    this.keys.add(e.key.toLowerCase());
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.key.toLowerCase());
  }

  private updateCameraVectors(): void {
    const yawRad = (this.yaw * Math.PI) / 180;
    const pitchRad = (this.pitch * Math.PI) / 180;

    this.camera.forward = {
      x: Math.cos(pitchRad) * Math.cos(yawRad),
      y: Math.sin(pitchRad),
      z: Math.cos(pitchRad) * Math.sin(yawRad)
    };

    const up = { x: 0, y: 1, z: 0 };
    this.camera.right = this.normalize(this.cross(this.camera.forward, up));
    this.camera.up = this.normalize(this.cross(this.camera.right, this.camera.forward));
  }

  private cross(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  }

  private normalize(v: { x: number; y: number; z: number }) {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (len === 0) return { x: 0, y: 0, z: 0 };
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }

  update(): boolean {
    let moved = false;

    const forward = this.camera.forward;
    const right = this.camera.right;

    if (this.keys.has('w') || this.keys.has('arrowup')) {
      this.camera.position.x += forward.x * this.moveSpeed;
      this.camera.position.y += forward.y * this.moveSpeed;
      this.camera.position.z += forward.z * this.moveSpeed;
      moved = true;
    }
    if (this.keys.has('s') || this.keys.has('arrowdown')) {
      this.camera.position.x -= forward.x * this.moveSpeed;
      this.camera.position.y -= forward.y * this.moveSpeed;
      this.camera.position.z -= forward.z * this.moveSpeed;
      moved = true;
    }
    if (this.keys.has('a') || this.keys.has('arrowleft')) {
      this.camera.position.x -= right.x * this.moveSpeed;
      this.camera.position.y -= right.y * this.moveSpeed;
      this.camera.position.z -= right.z * this.moveSpeed;
      moved = true;
    }
    if (this.keys.has('d') || this.keys.has('arrowright')) {
      this.camera.position.x += right.x * this.moveSpeed;
      this.camera.position.y += right.y * this.moveSpeed;
      this.camera.position.z += right.z * this.moveSpeed;
      moved = true;
    }
    if (this.keys.has('q')) {
      this.camera.position.y -= this.moveSpeed;
      moved = true;
    }
    if (this.keys.has('e')) {
      this.camera.position.y += this.moveSpeed;
      moved = true;
    }

    return moved;
  }

  getCamera(): Camera {
    return { ...this.camera };
  }

  setCamera(camera: Camera): void {
    this.camera = { ...camera };
    this.updateCameraVectors();
  }

  setCameraChangedCallback(callback: () => void): void {
    this.onCameraChanged = callback;
  }

  setMoveSpeed(speed: number): void {
    this.moveSpeed = speed;
  }

  setSensitivity(sensitivity: number): void {
    this.sensitivity = sensitivity;
  }

  destroy(): void {
    this.canvas.removeEventListener('mousedown', this.onMouseDown.bind(this));
    this.canvas.removeEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.removeEventListener('mouseup', this.onMouseUp.bind(this));
    this.canvas.removeEventListener('mouseleave', this.onMouseUp.bind(this));
    this.canvas.removeEventListener('wheel', this.onWheel.bind(this));
    window.removeEventListener('keydown', this.onKeyDown.bind(this));
    window.removeEventListener('keyup', this.onKeyUp.bind(this));
  }
}
