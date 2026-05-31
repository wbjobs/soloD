import { GPUDeviceInfo, Camera, RenderSettings, BORDER_OVERLAP, RESTIR_SPATIAL_RADIUS, DENOISE_FILTER_RADIUS } from '../types';
import { SceneManager } from '../scene/SceneManager';
import raytraceShader from '../shaders/raytrace.wgsl?raw';
import denoiseShader from '../shaders/denoise.wgsl?raw';
import restirShader from '../shaders/restir.wgsl?raw';
import bilateralShader from '../shaders/bilateral_denoise.wgsl?raw';

interface GPURenderResources {
  deviceInfo: GPUDeviceInfo;
  raytracePipeline: GPUComputePipeline;
  denoisePipeline: GPUComputePipeline;
  restirTemporalPipeline: GPUComputePipeline;
  restirSpatialPipeline: GPUComputePipeline;
  restirShadePipeline: GPUComputePipeline;
  bilateralPipeline: GPUComputePipeline;
  bindGroupLayout: GPUBindGroupLayout;
  spheresBuffer: GPUBuffer;
  trianglesBuffer: GPUBuffer;
  materialsBuffer: GPUBuffer;
  bvhNodesBuffer: GPUBuffer;
  triangleIndicesBuffer: GPUBuffer;
  cameraBuffer: GPUBuffer;
  settingsBuffer: GPUBuffer;
  accumulatorBuffer: GPUBuffer;
  sampleCountBuffer: GPUBuffer;
  varianceBuffer: GPUBuffer;
  borderWeightsBuffer: GPUBuffer;
  gbufferBuffer: GPUBuffer;
  reservoirsBuffer: GPUBuffer;
  historyReservoirsBuffer: GPUBuffer;
  motionVectorsBuffer: GPUBuffer;
  denoiseOutputBuffer: GPUBuffer;
  restirOutputBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  globalStartY: number;
  globalEndY: number;
  localStartY: number;
  localEndY: number;
}

export class MultiGPURenderer {
  private devices: GPUDeviceInfo[] = [];
  private renderResources: GPURenderResources[] = [];
  private sceneManager: SceneManager;
  private canvas: HTMLCanvasElement;
  private ctx: GPUCanvasContext;
  private presentationFormat: GPUTextureFormat;
  private width: number = 0;
  private height: number = 0;
  private frame: number = 0;
  private camera: Camera;
  private settings: RenderSettings;
  private compositeTexture: GPUTexture | null = null;

  constructor(canvas: HTMLCanvasElement, sceneManager: SceneManager) {
    this.canvas = canvas;
    this.sceneManager = sceneManager;
    this.ctx = canvas.getContext('webgpu')!;
    this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    
    this.camera = {
      position: { x: 0, y: 0, z: 5 },
      forward: { x: 0, y: 0, z: -1 },
      up: { x: 0, y: 1, z: 0 },
      right: { x: 1, y: 0, z: 0 },
      fov: 60
    };
    
    this.settings = {
      samplesPerPixel: 16,
      maxBounces: 5,
      adaptiveSampling: true,
      denoising: true
    };
  }

  async initialize(devices: GPUDeviceInfo[]): Promise<void> {
    this.devices = devices;
    
    this.resize(this.canvas.width, this.canvas.height);
    
    for (let i = 0; i < devices.length; i++) {
      const resources = await this.createRenderResources(devices[i], i);
      this.renderResources.push(resources);
    }
    
    console.log(`Initialized ${this.renderResources.length} GPU renderer(s)`);
  }

  private async createRenderResources(deviceInfo: GPUDeviceInfo, gpuIndex: number): Promise<GPURenderResources> {
    const device = deviceInfo.device;
    
    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 9, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 10, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ]
    });
    
    const raytraceModule = device.createShaderModule({ code: raytraceShader });
    const denoiseModule = device.createShaderModule({ code: denoiseShader });
    const restirModule = device.createShaderModule({ code: restirShader });
    const bilateralModule = device.createShaderModule({ code: bilateralShader });
    
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout]
    });
    
    const raytracePipeline = device.createComputePipeline({
      layout: pipelineLayout,
      compute: { module: raytraceModule, entryPoint: 'main' }
    });
    
    const denoisePipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [device.createBindGroupLayout({
          entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
            { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
            { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
          ]
        })]
      }),
      compute: { module: denoiseModule, entryPoint: 'main' }
    });
    
    const restirBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ]
    });
    
    const restirPipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [restirBindGroupLayout]
    });
    
    const restirTemporalPipeline = device.createComputePipeline({
      layout: restirPipelineLayout,
      compute: { module: restirModule, entryPoint: 'restir_temporal_pass' }
    });
    
    const restirSpatialPipeline = device.createComputePipeline({
      layout: restirPipelineLayout,
      compute: { module: restirModule, entryPoint: 'restir_spatial_pass' }
    });
    
    const restirShadePipeline = device.createComputePipeline({
      layout: restirPipelineLayout,
      compute: { module: restirModule, entryPoint: 'restir_shade_pass' }
    });
    
    const bilateralBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ]
    });
    
    const bilateralPipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bilateralBindGroupLayout] }),
      compute: { module: bilateralModule, entryPoint: 'bilateral_filter' }
    });
    
    const sceneData = this.sceneManager.getSceneData();
    const gpuCount = this.devices.length;
    const localStartY = Math.floor((this.height / gpuCount) * gpuIndex);
    const localEndY = Math.floor((this.height / gpuCount) * (gpuIndex + 1));
    
    let globalStartY = Math.max(0, localStartY - BORDER_OVERLAP);
    let globalEndY = Math.min(this.height, localEndY + BORDER_OVERLAP);
    
    if (gpuCount === 1) {
      globalStartY = 0;
      globalEndY = this.height;
    }
    
    const renderHeight = globalEndY - globalStartY;
    
    const spheresBuffer = this.createStructBuffer(device, sceneData.spheres, 32);
    const trianglesBuffer = this.createStructBuffer(device, sceneData.triangles, 64);
    const materialsBuffer = this.createStructBuffer(device, sceneData.materials, 32);
    const bvhNodesBuffer = this.createStructBuffer(device, sceneData.bvhNodes, 32);
    const triangleIndicesBuffer = this.createUIntBuffer(device, sceneData.triangleIndices);
    
    const cameraBuffer = device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    
    const settingsBuffer = device.createBuffer({
      size: 128,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    
    const pixelCount = this.width * renderHeight;
    const accumulatorBuffer = device.createBuffer({
      size: pixelCount * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });
    
    const sampleCountBuffer = device.createBuffer({
      size: pixelCount * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });
    
    const varianceBuffer = device.createBuffer({
      size: pixelCount * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });
    
    const borderWeightsBuffer = device.createBuffer({
      size: pixelCount * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });
    
    const gbufferBuffer = device.createBuffer({
      size: pixelCount * 64,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });
    
    const reservoirsBuffer = device.createBuffer({
      size: pixelCount * 64,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });
    
    const historyReservoirsBuffer = device.createBuffer({
      size: pixelCount * 64,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });
    
    const motionVectorsBuffer = device.createBuffer({
      size: pixelCount * 8,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });
    
    const denoiseOutputBuffer = device.createBuffer({
      size: pixelCount * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    });
    
    const restirOutputBuffer = device.createBuffer({
      size: pixelCount * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    });
    
    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: spheresBuffer } },
        { binding: 1, resource: { buffer: trianglesBuffer } },
        { binding: 2, resource: { buffer: materialsBuffer } },
        { binding: 3, resource: { buffer: bvhNodesBuffer } },
        { binding: 4, resource: { buffer: triangleIndicesBuffer } },
        { binding: 5, resource: { buffer: cameraBuffer } },
        { binding: 6, resource: { buffer: settingsBuffer } },
        { binding: 7, resource: { buffer: accumulatorBuffer } },
        { binding: 8, resource: { buffer: sampleCountBuffer } },
        { binding: 9, resource: { buffer: varianceBuffer } },
        { binding: 10, resource: { buffer: borderWeightsBuffer } },
        { binding: 11, resource: { buffer: gbufferBuffer } },
        { binding: 12, resource: { buffer: reservoirsBuffer } },
        { binding: 13, resource: { buffer: motionVectorsBuffer } },
      ]
    });
    
    return {
      deviceInfo,
      raytracePipeline,
      denoisePipeline,
      restirTemporalPipeline,
      restirSpatialPipeline,
      restirShadePipeline,
      bilateralPipeline,
      bindGroupLayout,
      spheresBuffer,
      trianglesBuffer,
      materialsBuffer,
      bvhNodesBuffer,
      triangleIndicesBuffer,
      cameraBuffer,
      settingsBuffer,
      accumulatorBuffer,
      sampleCountBuffer,
      varianceBuffer,
      borderWeightsBuffer,
      gbufferBuffer,
      reservoirsBuffer,
      historyReservoirsBuffer,
      motionVectorsBuffer,
      denoiseOutputBuffer,
      restirOutputBuffer,
      bindGroup,
      globalStartY,
      globalEndY,
      localStartY,
      localEndY
    };
  }

  private createStructBuffer(device: GPUDevice, data: unknown[], stride: number): GPUBuffer {
    const arrayData = data as Record<string, unknown>[];
    const buffer = device.createBuffer({
      size: arrayData.length * stride,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });
    
    const values = new Float32Array(arrayData.length * (stride / 4));
    
    for (let i = 0; i < arrayData.length; i++) {
      const obj = arrayData[i];
      let offset = i * (stride / 4);
      
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (typeof val === 'number') {
          values[offset++] = val;
        } else if (val && typeof val === 'object') {
          const vec = val as { x?: number; y?: number; z?: number };
          if (vec.x !== undefined) values[offset++] = vec.x;
          if (vec.y !== undefined) values[offset++] = vec.y;
          if (vec.z !== undefined) values[offset++] = vec.z;
        }
      }
    }
    
    device.queue.writeBuffer(buffer, 0, values);
    return buffer;
  }

  private createUIntBuffer(device: GPUDevice, data: number[]): GPUBuffer {
    const buffer = device.createBuffer({
      size: data.length * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });
    
    device.queue.writeBuffer(buffer, 0, new Uint32Array(data));
    return buffer;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    
    this.ctx.configure({
      device: this.devices[0]?.device || null,
      format: this.presentationFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST,
      alphaMode: 'premultiplied'
    });
    
    this.compositeTexture = this.devices[0]?.device.createTexture({
      size: [width, height],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    }) || null;
    
    this.frame = 0;
    this.renderResources = [];
  }

  async reinitialize(): Promise<void> {
    this.renderResources = [];
    
    for (let i = 0; i < this.devices.length; i++) {
      const resources = await this.createRenderResources(this.devices[i], i);
      this.renderResources.push(resources);
    }
    
    this.frame = 0;
  }

  render(): void {
    if (this.renderResources.length === 0) return;
    
    const promises: Promise<void>[] = [];
    
    for (const resources of this.renderResources) {
      promises.push(this.renderOnGPU(resources));
    }
    
    Promise.all(promises).then(() => {
      this.compositeAndPresent();
    });
    
    this.frame++;
  }

  private async renderOnGPU(resources: GPURenderResources): Promise<void> {
    const device = resources.deviceInfo.device;
    const renderHeight = resources.globalEndY - resources.globalStartY;
    
    const cameraData = new Float32Array(16);
    cameraData[0] = this.camera.position.x;
    cameraData[1] = this.camera.position.y;
    cameraData[2] = this.camera.position.z;
    cameraData[4] = this.camera.forward.x;
    cameraData[5] = this.camera.forward.y;
    cameraData[6] = this.camera.forward.z;
    cameraData[8] = this.camera.up.x;
    cameraData[9] = this.camera.up.y;
    cameraData[10] = this.camera.up.z;
    cameraData[12] = this.camera.right.x;
    cameraData[13] = this.camera.right.y;
    cameraData[14] = this.camera.right.z;
    cameraData[15] = this.camera.fov;
    
    device.queue.writeBuffer(resources.cameraBuffer, 0, cameraData);
    
    const settingsData = new Uint32Array(32);
    settingsData[0] = this.settings.samplesPerPixel;
    settingsData[1] = this.settings.maxBounces;
    settingsData[2] = this.frame;
    settingsData[3] = this.settings.adaptiveSampling ? 1 : 0;
    settingsData[4] = this.settings.denoising ? 1 : 0;
    settingsData[5] = this.width;
    settingsData[6] = this.height;
    settingsData[7] = resources.localStartY;
    settingsData[8] = resources.localEndY;
    settingsData[9] = resources.globalStartY;
    settingsData[10] = resources.globalEndY;
    settingsData[11] = BORDER_OVERLAP;
    settingsData[12] = resources.deviceInfo.index;
    settingsData[13] = this.devices.length;
    
    device.queue.writeBuffer(resources.settingsBuffer, 0, settingsData);
    
    const encoder = device.createCommandEncoder();
    
    const raytracePass = encoder.beginComputePass();
    raytracePass.setPipeline(resources.raytracePipeline);
    raytracePass.setBindGroup(0, resources.bindGroup);
    raytracePass.dispatchWorkgroups(
      Math.ceil(this.width / 8),
      Math.ceil(renderHeight / 8)
    );
    raytracePass.end();
    
    if (this.frame > 0) {
      encoder.copyBufferToBuffer(
        resources.reservoirsBuffer,
        0,
        resources.historyReservoirsBuffer,
        0,
        resources.reservoirsBuffer.size
      );
    }
    
    if (this.settings.denoising) {
      const restirSettingsData = new Float32Array(16);
      restirSettingsData[0] = this.width;
      restirSettingsData[1] = this.height;
      restirSettingsData[2] = this.frame;
      restirSettingsData[3] = RESTIR_SPATIAL_RADIUS;
      restirSettingsData[4] = 0.9;
      restirSettingsData[5] = 1;
      restirSettingsData[6] = 1;
      
      const restirSettingsBuffer = device.createBuffer({
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });
      device.queue.writeBuffer(restirSettingsBuffer, 0, restirSettingsData);
      
      const restirBindGroup = device.createBindGroup({
        layout: resources.restirTemporalPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: resources.accumulatorBuffer } },
          { binding: 1, resource: { buffer: resources.restirOutputBuffer } },
          { binding: 2, resource: { buffer: resources.reservoirsBuffer } },
          { binding: 3, resource: { buffer: resources.historyReservoirsBuffer } },
          { binding: 4, resource: { buffer: resources.gbufferBuffer } },
          { binding: 5, resource: { buffer: resources.motionVectorsBuffer } },
          { binding: 6, resource: { buffer: restirSettingsBuffer } },
        ]
      });
      
      if (this.frame > 0) {
        const temporalPass = encoder.beginComputePass();
        temporalPass.setPipeline(resources.restirTemporalPipeline);
        temporalPass.setBindGroup(0, restirBindGroup);
        temporalPass.dispatchWorkgroups(
          Math.ceil(this.width / 8),
          Math.ceil(renderHeight / 8)
        );
        temporalPass.end();
      }
      
      const spatialPass = encoder.beginComputePass();
      spatialPass.setPipeline(resources.restirSpatialPipeline);
      spatialPass.setBindGroup(0, restirBindGroup);
      spatialPass.dispatchWorkgroups(
        Math.ceil(this.width / 8),
        Math.ceil(renderHeight / 8)
      );
      spatialPass.end();
      
      const shadePass = encoder.beginComputePass();
      shadePass.setPipeline(resources.restirShadePipeline);
      shadePass.setBindGroup(0, restirBindGroup);
      shadePass.dispatchWorkgroups(
        Math.ceil(this.width / 8),
        Math.ceil(renderHeight / 8)
      );
      shadePass.end();
      
      const bilateralSettingsData = new Float32Array(16);
      bilateralSettingsData[0] = this.width;
      bilateralSettingsData[1] = this.height;
      bilateralSettingsData[2] = DENOISE_FILTER_RADIUS;
      bilateralSettingsData[3] = 2.0;
      bilateralSettingsData[4] = 0.5;
      bilateralSettingsData[5] = 2.0;
      bilateralSettingsData[6] = 1.0;
      bilateralSettingsData[7] = 1;
      
      const bilateralSettingsBuffer = device.createBuffer({
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });
      device.queue.writeBuffer(bilateralSettingsBuffer, 0, bilateralSettingsData);
      
      const bilateralBindGroup = device.createBindGroup({
        layout: resources.bilateralPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: resources.restirOutputBuffer } },
          { binding: 1, resource: { buffer: resources.denoiseOutputBuffer } },
          { binding: 2, resource: { buffer: resources.gbufferBuffer } },
          { binding: 3, resource: { buffer: resources.varianceBuffer } },
          { binding: 4, resource: { buffer: bilateralSettingsBuffer } },
        ]
      });
      
      const bilateralPass = encoder.beginComputePass();
      bilateralPass.setPipeline(resources.bilateralPipeline);
      bilateralPass.setBindGroup(0, bilateralBindGroup);
      bilateralPass.dispatchWorkgroups(
        Math.ceil(this.width / 8),
        Math.ceil(renderHeight / 8)
      );
      bilateralPass.end();
    }
    
    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);
    
    await device.queue.onSubmittedWorkDone();
  }

  private compositeAndPresent(): void {
    if (this.renderResources.length === 0 || !this.compositeTexture) return;
    
    const primaryDevice = this.renderResources[0].deviceInfo.device;
    
    if (this.renderResources.length === 1) {
      const resources = this.renderResources[0];
      const encoder = primaryDevice.createCommandEncoder();
      
      const sourceBuffer = this.settings.denoising 
        ? resources.denoiseOutputBuffer 
        : resources.accumulatorBuffer;
      
      encoder.copyBufferToTexture(
        { buffer: sourceBuffer, bytesPerRow: this.width * 16 },
        { texture: this.compositeTexture },
        [this.width, this.height]
      );
      
      primaryDevice.queue.submit([encoder.finish()]);
      this.copyToCanvas();
      return;
    }
    
    this.compositeWithWeights(primaryDevice);
    this.copyToCanvas();
  }

  private compositeWithWeights(device: GPUDevice): void {
    if (!this.compositeTexture) return;
    
    const gpuCount = this.renderResources.length;
    
    let compositeShader = `
      struct GPURange {
        startY: u32,
        endY: u32,
      }
      
      struct PushConstants {
        width: u32,
        height: u32,
        gpuCount: u32,
      }
      
      @group(0) @binding(0) var<storage, read_write> output: array<vec4<f32>>;
      @group(0) @binding(1) var<uniform> constants: PushConstants;
      @group(0) @binding(2) var<uniform> ranges: array<GPURange, 8>;
    `;
    
    for (let i = 0; i < gpuCount; i++) {
      compositeShader += `
        @group(0) @binding(${3 + i * 2}) var<storage, read> colorBuffer${i}: array<vec4<f32>>;
        @group(0) @binding(${3 + i * 2 + 1}) var<storage, read> weightBuffer${i}: array<f32>;
      `;
    }
    
    compositeShader += `
      @compute @workgroup_size(8, 8)
      fn main(@builtin(global_invocation_id) id: vec3<u32>) {
        if (id.x >= constants.width || id.y >= constants.height) {
          return;
        }
        
        let pixelIdx = id.y * constants.width + id.x;
        var finalColor = vec3<f32>(0.0);
        var totalWeight = 0.0;
    `;
    
    for (let i = 0; i < gpuCount; i++) {
      compositeShader += `
        if (id.y >= ranges[${i}].startY && id.y < ranges[${i}].endY) {
          let localY = id.y - ranges[${i}].startY;
          let localIdx = localY * constants.width + id.x;
          let color = colorBuffer${i}[localIdx].rgb;
          let weight = weightBuffer${i}[localIdx];
          finalColor = finalColor + color * weight;
          totalWeight = totalWeight + weight;
        }
      `;
    }
    
    compositeShader += `
        if (totalWeight > 0.0) {
          finalColor = finalColor / totalWeight;
        }
        
        output[pixelIdx] = vec4<f32>(finalColor, 1.0);
      }
    `;
    
    const shaderModule = device.createShaderModule({ code: compositeShader });
    
    const pipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: shaderModule, entryPoint: 'main' }
    });
    
    const constantBuffer = device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    
    const rangeBuffer = device.createBuffer({
      size: 8 * 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    
    const outputBuffer = device.createBuffer({
      size: this.width * this.height * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    });
    
    const constantsData = new Uint32Array(16);
    constantsData[0] = this.width;
    constantsData[1] = this.height;
    constantsData[2] = gpuCount;
    device.queue.writeBuffer(constantBuffer, 0, constantsData);
    
    const rangeData = new Uint32Array(8 * 4);
    for (let i = 0; i < gpuCount; i++) {
      rangeData[i * 2] = this.renderResources[i].globalStartY;
      rangeData[i * 2 + 1] = this.renderResources[i].globalEndY;
    }
    device.queue.writeBuffer(rangeBuffer, 0, rangeData);
    
    const bindGroupEntries: GPUBindGroupEntry[] = [
      { binding: 0, resource: { buffer: outputBuffer } },
      { binding: 1, resource: { buffer: constantBuffer } },
      { binding: 2, resource: { buffer: rangeBuffer } },
    ];
    
    for (let i = 0; i < gpuCount; i++) {
      const resources = this.renderResources[i];
      const sourceBuffer = this.settings.denoising ? resources.denoiseOutputBuffer : resources.accumulatorBuffer;
      bindGroupEntries.push({ binding: 3 + i * 2, resource: { buffer: sourceBuffer } });
      bindGroupEntries.push({ binding: 3 + i * 2 + 1, resource: { buffer: resources.borderWeightsBuffer } });
    }
    
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: bindGroupEntries
    });
    
    const encoder = device.createCommandEncoder();
    
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(
      Math.ceil(this.width / 8),
      Math.ceil(this.height / 8)
    );
    pass.end();
    
    encoder.copyBufferToTexture(
      { buffer: outputBuffer, bytesPerRow: this.width * 16 },
      { texture: this.compositeTexture },
      [this.width, this.height]
    );
    
    device.queue.submit([encoder.finish()]);
  }

  private copyToCanvas(): void {
    if (!this.compositeTexture || this.renderResources.length === 0) return;
    
    const device = this.renderResources[0].deviceInfo.device;
    const encoder = device.createCommandEncoder();
    
    const texture = this.ctx.getCurrentTexture();
    encoder.copyTextureToTexture(
      { texture: this.compositeTexture },
      { texture },
      [this.width, this.height]
    );
    
    device.queue.submit([encoder.finish()]);
  }

  setCamera(camera: Camera): void {
    this.camera = { ...camera };
    this.frame = 0;
  }

  getCamera(): Camera {
    return { ...this.camera };
  }

  setSettings(settings: Partial<RenderSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  getSettings(): RenderSettings {
    return { ...this.settings };
  }

  getFrame(): number {
    return this.frame;
  }

  getGPUDevices(): GPUDeviceInfo[] {
    return [...this.devices];
  }

  destroy(): void {
    this.compositeTexture?.destroy();
  }
}
