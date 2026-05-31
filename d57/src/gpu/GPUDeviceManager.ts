import { GPUDeviceInfo } from '../types';

export class GPUDeviceManager {
  private devices: GPUDeviceInfo[] = [];
  private onDevicesChanged: ((devices: GPUDeviceInfo[]) => void) | null = null;

  async initialize(): Promise<GPUDeviceInfo[]> {
    if (!navigator.gpu) {
      throw new Error('WebGPU is not supported in this browser');
    }

    this.devices = [];
    
    try {
      const adapters = await this.enumerateAdapters();
      
      for (let i = 0; i < adapters.length; i++) {
        const adapter = adapters[i];
        const device = await adapter.requestDevice({
          requiredFeatures: ['texture-compression-bc'] as GPUFeatureName[],
          requiredLimits: {
            maxComputeWorkgroupStorageSize: 32768,
            maxComputeInvocationsPerWorkgroup: 1024,
            maxComputeWorkgroupSizeX: 1024,
            maxComputeWorkgroupSizeY: 1024,
            maxComputeWorkgroupSizeZ: 64,
            maxComputeWorkgroupsPerDimension: 65535,
            maxStorageBufferBindingSize: 268435456,
            maxBufferSize: 268435456,
          }
        });

        const info = adapter.info;
        const name = info?.description || `GPU ${i + 1}`;
        
        this.devices.push({
          adapter,
          device,
          name,
          index: i
        });

        device.lost.then(() => {
          console.warn(`Device ${name} lost`);
          this.handleDeviceLost(i);
        });
      }
    } catch (error) {
      console.error('Error initializing GPU devices:', error);
      
      const fallbackAdapter = await navigator.gpu.requestAdapter();
      if (fallbackAdapter) {
        const device = await fallbackAdapter.requestDevice();
        this.devices.push({
          adapter: fallbackAdapter,
          device,
          name: 'Fallback GPU',
          index: 0
        });
      }
    }

    if (this.devices.length === 0) {
      throw new Error('No GPU devices available');
    }

    console.log(`Initialized ${this.devices.length} GPU device(s):`);
    this.devices.forEach(d => console.log(`  - ${d.name}`));

    this.onDevicesChanged?.(this.devices);
    return this.devices;
  }

  private async enumerateAdapters(): Promise<GPUAdapter[]> {
    const adapters: GPUAdapter[] = [];
    
    try {
      if ('requestAdapter' in navigator.gpu) {
        const primaryAdapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (primaryAdapter) {
          adapters.push(primaryAdapter);
        }
        
        const lowPowerAdapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' });
        if (lowPowerAdapter && lowPowerAdapter !== primaryAdapter) {
          const info1 = primaryAdapter?.info;
          const info2 = lowPowerAdapter.info;
          if (info1?.description !== info2?.description) {
            adapters.push(lowPowerAdapter);
          }
        }
      }
    } catch (e) {
      console.warn('Multi-GPU enumeration limited:', e);
    }

    if (adapters.length === 0) {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        adapters.push(adapter);
      }
    }

    return adapters;
  }

  private handleDeviceLost(index: number): void {
    this.devices = this.devices.filter((_, i) => i !== index);
    this.onDevicesChanged?.(this.devices);
  }

  getDevices(): GPUDeviceInfo[] {
    return this.devices;
  }

  getPrimaryDevice(): GPUDeviceInfo {
    return this.devices[0];
  }

  getDeviceCount(): number {
    return this.devices.length;
  }

  setDevicesChangedCallback(callback: (devices: GPUDeviceInfo[]) => void): void {
    this.onDevicesChanged = callback;
  }

  destroy(): void {
    this.devices.forEach(d => d.device.destroy());
    this.devices = [];
  }
}
