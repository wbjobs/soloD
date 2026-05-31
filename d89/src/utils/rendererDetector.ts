export type RendererType = 'webgpu' | 'webgl' | 'webgl2';

export interface RendererInfo {
  type: RendererType;
  name: string;
  supported: boolean;
}

export async function detectBestRenderer(): Promise<RendererInfo> {
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    try {
      const adapter = await (navigator as any).gpu.requestAdapter();
      if (adapter) {
        const device = await adapter.requestDevice();
        if (device) {
          device.destroy();
          return {
            type: 'webgpu',
            name: 'WebGPU',
            supported: true,
          };
        }
      }
    } catch (e) {
      console.log('WebGPU not available, falling back to WebGL');
    }
  }

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    try {
      const gl2 = canvas.getContext('webgl2');
      if (gl2) {
        return {
          type: 'webgl2',
          name: 'WebGL 2.0',
          supported: true,
        };
      }
    } catch (e) {
      console.log('WebGL 2.0 not available, falling back to WebGL 1.0');
    }

    try {
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        return {
          type: 'webgl',
          name: 'WebGL 1.0',
          supported: true,
        };
      }
    } catch (e) {
      console.log('WebGL not available');
    }
  }

  return {
    type: 'webgl',
    name: 'Unknown',
    supported: false,
  };
}
