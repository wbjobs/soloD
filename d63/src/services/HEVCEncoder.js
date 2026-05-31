import Module from '../../public/hevc_encoder.js';

class HEVCEncoder {
  constructor() {
    this.module = null;
    this.encoder = null;
    this.initialized = false;
    this.width = 0;
    this.height = 0;
    this.qp = 26;
  }

  async init(width, height, qp = 26) {
    this.width = width;
    this.height = height;
    this.qp = qp;

    this.module = await Module();
    
    const initFn = this.module.cwrap('hevc_encoder_init', 'number', ['number', 'number', 'number']);
    this.encoder = initFn(width, height, qp);
    
    if (this.encoder === 0) {
      throw new Error('Failed to initialize HEVC encoder');
    }
    
    this.initialized = true;
    return true;
  }

  encodeFrame(yuvData) {
    if (!this.initialized || !this.encoder) {
      throw new Error('Encoder not initialized');
    }

    const dataSize = yuvData.length;
    const dataPtr = this.module._malloc(dataSize);
    this.module.HEAPU8.set(yuvData, dataPtr);

    const encodeFn = this.module.cwrap('hevc_encoder_encode_frame', 'number', ['number', 'number']);
    const result = encodeFn(this.encoder, dataPtr);
    
    this.module._free(dataPtr);
    
    if (result !== 0) {
      throw new Error(`Encoding failed with code ${result}`);
    }

    return this.getBitstream();
  }

  getBitstream() {
    if (!this.initialized || !this.encoder) {
      return null;
    }

    const getSizeFn = this.module.cwrap('hevc_encoder_get_bitstream_size', 'number', ['number']);
    const getDataFn = this.module.cwrap('hevc_encoder_get_bitstream', 'number', ['number']);
    
    const size = getSizeFn(this.encoder);
    const dataPtr = getDataFn(this.encoder);
    
    if (size === 0 || dataPtr === 0) {
      return null;
    }

    const bitstream = new Uint8Array(size);
    bitstream.set(this.module.HEAPU8.subarray(dataPtr, dataPtr + size));
    
    return bitstream;
  }

  destroy() {
    if (this.initialized && this.encoder) {
      const destroyFn = this.module.cwrap('hevc_encoder_destroy', 'void', ['number']);
      destroyFn(this.encoder);
      this.encoder = null;
      this.initialized = false;
    }
  }

  isInitialized() {
    return this.initialized;
  }

  getConfig() {
    return {
      width: this.width,
      height: this.height,
      qp: this.qp
    };
  }
}

export default HEVCEncoder;
