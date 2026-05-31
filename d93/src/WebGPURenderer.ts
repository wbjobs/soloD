export interface FluidParams {
  velocity: number;
  viscosity: number;
  gravity: number;
  vorticity: number;
  dt: number;
}

export interface MouseData {
  position: { x: number; y: number };
  direction: { x: number; y: number };
  pressure: number;
}

export class WebGPURenderer {
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private presentationFormat!: GPUTextureFormat;

  private paramsBuffer!: GPUBuffer;
  private mouseBuffer!: GPUBuffer;

  private velocityTexture!: GPUTexture;
  private velocityTextureNext!: GPUTexture;
  private pressureTexture!: GPUTexture;
  private pressureTextureNext!: GPUTexture;
  private divergenceTexture!: GPUTexture;
  private dyeTexture!: GPUTexture;
  private dyeTextureNext!: GPUTexture;

  private advectionPipeline!: GPUComputePipeline;
  private diffusionPipeline!: GPUComputePipeline;
  private divergencePipeline!: GPUComputePipeline;
  private pressurePipeline!: GPUComputePipeline;
  private projectionPipeline!: GPUComputePipeline;
  private mouseInputPipeline!: GPUComputePipeline;
  private renderPipeline!: GPURenderPipeline;

  private width: number;
  private height: number;
  private simWidth: number;
  private simHeight: number;

  private bindGroupLayouts!: {
    mouse: GPUBindGroupLayout;
    advection: GPUBindGroupLayout;
    diffusion: GPUBindGroupLayout;
    divergence: GPUBindGroupLayout;
    pressure: GPUBindGroupLayout;
    projection: GPUBindGroupLayout;
    render: GPUBindGroupLayout;
  };

  constructor(private canvas: HTMLCanvasElement) {
    this.width = canvas.width;
    this.height = canvas.height;
    this.simWidth = Math.floor(this.width / 2);
    this.simHeight = Math.floor(this.height / 2);
  }

  async init(): Promise<void> {
    if (!navigator.gpu) {
      throw new Error('WebGPU_NOT_SUPPORTED: 您的浏览器不支持WebGPU API');
    }

    let adapter: GPUAdapter | null;
    try {
      adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance',
      });
    } catch (e) {
      throw new Error('WEBGPU_ADAPTER_FAILED: 无法获取GPU适配器，请确保您的浏览器启用了WebGPU');
    }

    if (!adapter) {
      throw new Error('WEBGPU_NO_ADAPTER: 没有可用的GPU适配器，您的硬件可能不支持WebGPU');
    }

    const features = Array.from(adapter.features);
    const limits = adapter.limits;
    console.log('WebGPU Adapter Info:', {
      features,
      limits: {
        maxTextureDimension2D: limits.maxTextureDimension2D,
        maxStorageBufferBindingSize: limits.maxStorageBufferBindingSize,
      },
    });

    try {
      this.device = await adapter.requestDevice({
        requiredLimits: {
          maxStorageBufferBindingSize: Math.min(limits.maxStorageBufferBindingSize, 1024 * 1024 * 1024),
        },
      });
    } catch (e) {
      throw new Error('WEBGPU_DEVICE_FAILED: 无法创建GPU设备，请尝试更新您的图形驱动');
    }

    this.device.lost.then((info) => {
      console.error('WebGPU Device Lost:', info);
      throw new Error(`WEBGPU_DEVICE_LOST: ${info.reason}`);
    });

    this.device.addEventListener('uncapturederror', (event) => {
      console.error('WebGPU Uncaptured Error:', event.error);
    });

    this.context = this.canvas.getContext('webgpu')!;
    if (!this.context) {
      throw new Error('WEBGPU_CONTEXT_FAILED: 无法获取WebGPU Canvas上下文');
    }

    this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    console.log('Presentation Format:', this.presentationFormat);

    try {
      this.context.configure({
        device: this.device,
        format: this.presentationFormat,
        alphaMode: 'premultiplied',
      });
    } catch (e) {
      throw new Error('WEBGPU_CONFIGURE_FAILED: Canvas配置失败');
    }

    this.createBuffers();
    this.createTextures();
    this.createBindGroupLayouts();
    await this.createPipelines();

    console.log('WebGPU Fluid Simulator initialized successfully!');
  }

  private createBuffers(): void {
    this.paramsBuffer = this.device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.mouseBuffer = this.device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  private createTexture(width: number, height: number): GPUTexture {
    return this.device.createTexture({
      size: [width, height],
      format: 'rgba32float',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.COPY_DST,
    });
  }

  private createTextures(): void {
    this.velocityTexture = this.createTexture(this.simWidth, this.simHeight);
    this.velocityTextureNext = this.createTexture(this.simWidth, this.simHeight);
    this.pressureTexture = this.createTexture(this.simWidth, this.simHeight);
    this.pressureTextureNext = this.createTexture(this.simWidth, this.simHeight);
    this.divergenceTexture = this.createTexture(this.simWidth, this.simHeight);
    this.dyeTexture = this.createTexture(this.simWidth, this.simHeight);
    this.dyeTextureNext = this.createTexture(this.simWidth, this.simHeight);

    this.clearTexture(this.velocityTexture);
    this.clearTexture(this.velocityTextureNext);
    this.clearTexture(this.pressureTexture);
    this.clearTexture(this.pressureTextureNext);
    this.clearTexture(this.divergenceTexture);
    this.clearTexture(this.dyeTexture);
    this.clearTexture(this.dyeTextureNext);
  }

  private clearTexture(texture: GPUTexture): void {
    const data = new Float32Array(this.simWidth * this.simHeight * 4);
    this.device.queue.writeTexture(
      { texture },
      data,
      { bytesPerRow: this.simWidth * 16, rowsPerImage: this.simHeight },
      { width: this.simWidth, height: this.simHeight }
    );
  }

  private createBindGroupLayouts(): void {
    this.bindGroupLayouts = {
      mouse: this.device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
          { binding: 3, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
          { binding: 4, visibility: GPUShaderStage.COMPUTE, storageTexture: { format: 'rgba32float', access: 'write-only' } },
          { binding: 5, visibility: GPUShaderStage.COMPUTE, storageTexture: { format: 'rgba32float', access: 'write-only' } },
        ],
      }),
      advection: this.device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
          { binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: { format: 'rgba32float', access: 'write-only' } },
        ],
      }),
      diffusion: this.device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { format: 'rgba32float', access: 'write-only' } },
        ],
      }),
      divergence: this.device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { format: 'rgba32float', access: 'write-only' } },
        ],
      }),
      pressure: this.device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
          { binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: { format: 'rgba32float', access: 'write-only' } },
        ],
      }),
      projection: this.device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
          { binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: { format: 'rgba32float', access: 'write-only' } },
        ],
      }),
      render: this.device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        ],
      }),
    };
  }

  private async loadShader(filename: string): Promise<string> {
    const response = await fetch(new URL(`./shaders/${filename}`, import.meta.url));
    return response.text();
  }

  private async createPipelines(): Promise<void> {
    const advectionShaderCode = await this.loadShader('advection.wgsl');
    const diffusionShaderCode = await this.loadShader('diffusion.wgsl');
    const divergenceShaderCode = await this.loadShader('divergence.wgsl');
    const pressureShaderCode = await this.loadShader('pressure.wgsl');
    const projectionShaderCode = await this.loadShader('projection.wgsl');
    const mouseInputShaderCode = await this.loadShader('mouse_input.wgsl');
    const renderShaderCode = await this.loadShader('render.wgsl');

    this.advectionPipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayouts.advection] }),
      compute: { module: this.device.createShaderModule({ code: advectionShaderCode }), entryPoint: 'main' },
    });

    this.diffusionPipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayouts.diffusion] }),
      compute: { module: this.device.createShaderModule({ code: diffusionShaderCode }), entryPoint: 'main' },
    });

    this.divergencePipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayouts.divergence] }),
      compute: { module: this.device.createShaderModule({ code: divergenceShaderCode }), entryPoint: 'main' },
    });

    this.pressurePipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayouts.pressure] }),
      compute: { module: this.device.createShaderModule({ code: pressureShaderCode }), entryPoint: 'main' },
    });

    this.projectionPipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayouts.projection] }),
      compute: { module: this.device.createShaderModule({ code: projectionShaderCode }), entryPoint: 'main' },
    });

    this.mouseInputPipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayouts.mouse] }),
      compute: { module: this.device.createShaderModule({ code: mouseInputShaderCode }), entryPoint: 'main' },
    });

    this.renderPipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayouts.render] }),
      vertex: { module: this.device.createShaderModule({ code: renderShaderCode }), entryPoint: 'vertex_main' },
      fragment: {
        module: this.device.createShaderModule({ code: renderShaderCode }),
        entryPoint: 'fragment_main',
        targets: [{ format: this.presentationFormat }],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  updateParams(params: FluidParams): void {
    const data = new Float32Array([
      this.width,
      this.height,
      params.dt,
      params.velocity,
      params.viscosity,
      params.gravity,
      params.vorticity,
    ]);
    this.device.queue.writeBuffer(this.paramsBuffer, 0, data);
  }

  updateMouse(mouse: MouseData): void {
    const data = new Float32Array([
      mouse.position.x,
      mouse.position.y,
      mouse.direction.x,
      mouse.direction.y,
      mouse.pressure,
    ]);
    this.device.queue.writeBuffer(this.mouseBuffer, 0, data);
  }

  private swap(a: GPUTexture, b: GPUTexture): [GPUTexture, GPUTexture] {
    return [b, a];
  }

  render(): void {
    const commandEncoder = this.device.createCommandEncoder();

    this.dispatchCompute(commandEncoder);

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0.02, g: 0.05, b: 0.1, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    renderPass.setPipeline(this.renderPipeline);

    const renderBindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayouts.render,
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuffer } },
        { binding: 1, resource: this.dyeTexture.createView() },
      ],
    });
    renderPass.setBindGroup(0, renderBindGroup);
    renderPass.draw(6);
    renderPass.end();

    this.device.queue.submit([commandEncoder.finish()]);
  }

  private dispatchCompute(commandEncoder: GPUCommandEncoder): void {
    const workgroupSizeX = 16;
    const workgroupSizeY = 16;
    const dispatchX = Math.ceil(this.simWidth / workgroupSizeX);
    const dispatchY = Math.ceil(this.simHeight / workgroupSizeY);

    const mouseBindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayouts.mouse,
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuffer } },
        { binding: 1, resource: { buffer: this.mouseBuffer } },
        { binding: 2, resource: this.velocityTexture.createView() },
        { binding: 3, resource: this.dyeTexture.createView() },
        { binding: 4, resource: this.velocityTextureNext.createView() },
        { binding: 5, resource: this.dyeTextureNext.createView() },
      ],
    });

    let mousePass = commandEncoder.beginComputePass();
    mousePass.setPipeline(this.mouseInputPipeline);
    mousePass.setBindGroup(0, mouseBindGroup);
    mousePass.dispatchWorkgroups(dispatchX, dispatchY);
    mousePass.end();

    [this.velocityTexture, this.velocityTextureNext] = this.swap(this.velocityTexture, this.velocityTextureNext);
    [this.dyeTexture, this.dyeTextureNext] = this.swap(this.dyeTexture, this.dyeTextureNext);

    const velocityDiffusionBindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayouts.diffusion,
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuffer } },
        { binding: 1, resource: this.velocityTexture.createView() },
        { binding: 2, resource: this.velocityTextureNext.createView() },
      ],
    });

    let velocityDiffusionPass = commandEncoder.beginComputePass();
    velocityDiffusionPass.setPipeline(this.diffusionPipeline);
    velocityDiffusionPass.setBindGroup(0, velocityDiffusionBindGroup);
    velocityDiffusionPass.dispatchWorkgroups(dispatchX, dispatchY);
    velocityDiffusionPass.end();

    [this.velocityTexture, this.velocityTextureNext] = this.swap(this.velocityTexture, this.velocityTextureNext);

    const dyeDiffusionBindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayouts.diffusion,
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuffer } },
        { binding: 1, resource: this.dyeTexture.createView() },
        { binding: 2, resource: this.dyeTextureNext.createView() },
      ],
    });

    let dyeDiffusionPass = commandEncoder.beginComputePass();
    dyeDiffusionPass.setPipeline(this.diffusionPipeline);
    dyeDiffusionPass.setBindGroup(0, dyeDiffusionBindGroup);
    dyeDiffusionPass.dispatchWorkgroups(dispatchX, dispatchY);
    dyeDiffusionPass.end();

    [this.dyeTexture, this.dyeTextureNext] = this.swap(this.dyeTexture, this.dyeTextureNext);

    const divergenceBindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayouts.divergence,
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuffer } },
        { binding: 1, resource: this.velocityTexture.createView() },
        { binding: 2, resource: this.divergenceTexture.createView() },
      ],
    });

    let divergencePass = commandEncoder.beginComputePass();
    divergencePass.setPipeline(this.divergencePipeline);
    divergencePass.setBindGroup(0, divergenceBindGroup);
    divergencePass.dispatchWorkgroups(dispatchX, dispatchY);
    divergencePass.end();

    for (let i = 0; i < 20; i++) {
      const pressureBindGroup = this.device.createBindGroup({
        layout: this.bindGroupLayouts.pressure,
        entries: [
          { binding: 0, resource: { buffer: this.paramsBuffer } },
          { binding: 1, resource: this.pressureTexture.createView() },
          { binding: 2, resource: this.divergenceTexture.createView() },
          { binding: 3, resource: this.pressureTextureNext.createView() },
        ],
      });

      let pressurePass = commandEncoder.beginComputePass();
      pressurePass.setPipeline(this.pressurePipeline);
      pressurePass.setBindGroup(0, pressureBindGroup);
      pressurePass.dispatchWorkgroups(dispatchX, dispatchY);
      pressurePass.end();

      [this.pressureTexture, this.pressureTextureNext] = this.swap(this.pressureTexture, this.pressureTextureNext);
    }

    const projectionBindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayouts.projection,
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuffer } },
        { binding: 1, resource: this.velocityTexture.createView() },
        { binding: 2, resource: this.pressureTexture.createView() },
        { binding: 3, resource: this.velocityTextureNext.createView() },
      ],
    });

    let projectionPass = commandEncoder.beginComputePass();
    projectionPass.setPipeline(this.projectionPipeline);
    projectionPass.setBindGroup(0, projectionBindGroup);
    projectionPass.dispatchWorkgroups(dispatchX, dispatchY);
    projectionPass.end();

    [this.velocityTexture, this.velocityTextureNext] = this.swap(this.velocityTexture, this.velocityTextureNext);

    const advectionVelBindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayouts.advection,
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuffer } },
        { binding: 1, resource: this.velocityTexture.createView() },
        { binding: 2, resource: this.velocityTexture.createView() },
        { binding: 3, resource: this.velocityTextureNext.createView() },
      ],
    });

    let advectionVelPass = commandEncoder.beginComputePass();
    advectionVelPass.setPipeline(this.advectionPipeline);
    advectionVelPass.setBindGroup(0, advectionVelBindGroup);
    advectionVelPass.dispatchWorkgroups(dispatchX, dispatchY);
    advectionVelPass.end();

    [this.velocityTexture, this.velocityTextureNext] = this.swap(this.velocityTexture, this.velocityTextureNext);

    const advectionDyeBindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayouts.advection,
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuffer } },
        { binding: 1, resource: this.velocityTexture.createView() },
        { binding: 2, resource: this.dyeTexture.createView() },
        { binding: 3, resource: this.dyeTextureNext.createView() },
      ],
    });

    let advectionDyePass = commandEncoder.beginComputePass();
    advectionDyePass.setPipeline(this.advectionPipeline);
    advectionDyePass.setBindGroup(0, advectionDyeBindGroup);
    advectionDyePass.dispatchWorkgroups(dispatchX, dispatchY);
    advectionDyePass.end();

    [this.dyeTexture, this.dyeTextureNext] = this.swap(this.dyeTexture, this.dyeTextureNext);
  }

  getDevice(): GPUDevice {
    return this.device;
  }
}
