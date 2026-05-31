export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Material {
  albedo: Vec3;
  metallic: number;
  roughness: number;
  emission: Vec3;
  ior: number;
  transmission: number;
}

export interface Sphere {
  center: Vec3;
  radius: number;
  materialIndex: number;
}

export interface Triangle {
  v0: Vec3;
  v1: Vec3;
  v2: Vec3;
  normal: Vec3;
  materialIndex: number;
}

export interface BVHNode {
  min: Vec3;
  max: Vec3;
  leftChild: number;
  rightChild: number;
  triangleStart: number;
  triangleCount: number;
}

export interface Camera {
  position: Vec3;
  forward: Vec3;
  up: Vec3;
  right: Vec3;
  fov: number;
}

export interface RenderSettings {
  samplesPerPixel: number;
  maxBounces: number;
  adaptiveSampling: boolean;
  denoising: boolean;
}

export interface GPUDeviceInfo {
  adapter: GPUAdapter;
  device: GPUDevice;
  name: string;
  index: number;
}

export interface GPURenderTask {
  deviceInfo: GPUDeviceInfo;
  startY: number;
  endY: number;
  width: number;
  height: number;
  outputTexture: GPUTexture;
}

export interface SceneData {
  spheres: Sphere[];
  triangles: Triangle[];
  materials: Material[];
  bvhNodes: BVHNode[];
  triangleIndices: number[];
}

export const BORDER_OVERLAP = 64;
export const RESTIR_SPATIAL_RADIUS = 3;
export const RESTIR_TEMPORAL_HISTORY_LENGTH = 8;
export const RESTIR_RESERVOIR_COUNT = 1;
export const DENOISE_FILTER_RADIUS = 2;
