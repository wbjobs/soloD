class VideoDecoderManager {
  constructor(webglRenderer) {
    this.decoder = null;
    this.webglRenderer = webglRenderer;
    this.frameCount = 0;
    this.lastFrameTime = 0;
    this.fps = 0;
    this.width = 0;
    this.height = 0;
    this.codec = '';
    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = 5;
    this.onError = null;
    this.isFlushing = false;
    this.init();
  }

  init() {
    if (!('VideoDecoder' in window)) {
      throw new Error('WebCodecs API 不受此浏览器支持');
    }

    this.createDecoder();
  }

  createDecoder() {
    if (this.decoder) {
      try {
        this.decoder.close();
      } catch (e) {
        console.warn('关闭旧解码器失败:', e);
      }
    }

    const init = {
      output: (frame) => this.handleFrameOutput(frame),
      error: (error) => {
        this.consecutiveErrors++;
        console.error('解码错误:', error, `连续错误: ${this.consecutiveErrors}`);
        this.log(`解码错误: ${error.message} (连续错误: ${this.consecutiveErrors})`, 'error');
        
        if (this.onError) {
          this.onError(error);
        }
        
        if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
          this.log(`连续错误达到阈值 (${this.maxConsecutiveErrors})，触发重置`, 'error');
          if (this.onError) {
            this.onError(new Error('Too many consecutive decode errors'));
          }
        }
      }
    };

    this.decoder = new VideoDecoder(init);
    this.consecutiveErrors = 0;
  }

  configure(width, height, codec = 'avc1.42001E') {
    this.width = width;
    this.height = height;
    this.codec = codec;
    
    const config = {
      codec: codec,
      codedWidth: width,
      codedHeight: height,
      optimizeForLatency: true
    };

    try {
      this.decoder.configure(config);
      this.log(`解码器配置: ${width}x${height}, 编码: ${codec}`, 'info');
    } catch (e) {
      this.log(`解码器配置失败: ${e.message}`, 'error');
      throw e;
    }
  }

  decodeChunk(data, timestamp, type = 'key') {
    if (this.decoder.state !== 'configured') {
      this.log(`解码器状态异常: ${this.decoder.state}，跳过解码`, 'warning');
      return;
    }

    try {
      const chunk = new EncodedVideoChunk({
        type: type,
        timestamp: timestamp,
        data: data
      });

      this.decoder.decode(chunk);
    } catch (e) {
      this.consecutiveErrors++;
      this.log(`创建编码块失败: ${e.message}`, 'error');
      if (this.onError && this.consecutiveErrors >= this.maxConsecutiveErrors) {
        this.onError(e);
      }
    }
  }

  handleFrameOutput(frame) {
    this.frameCount++;
    this.consecutiveErrors = 0;
    
    const now = performance.now();
    if (now - this.lastFrameTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastFrameTime = now;
    }

    try {
      this.renderFrame(frame);
    } catch (e) {
      console.error('渲染帧失败:', e);
      this.log(`渲染帧失败: ${e.message}`, 'error');
    } finally {
      frame.close();
    }
  }

  async renderFrame(frame) {
    try {
      const buffer = new Uint8Array(frame.allocationSize());
      await frame.copyTo(buffer);
      
      const width = frame.displayWidth;
      const height = frame.displayHeight;
      
      if (width <= 0 || height <= 0) {
        throw new Error(`无效的帧尺寸: ${width}x${height}`);
      }
      
      const ySize = width * height;
      const uvSize = Math.ceil(width / 2) * Math.ceil(height / 2);
      const totalSize = ySize + uvSize * 2;
      
      if (buffer.length < totalSize) {
        throw new Error(`缓冲区大小不足: 需要 ${totalSize}, 实际 ${buffer.length}`);
      }
      
      const yData = buffer.subarray(0, ySize);
      const uData = buffer.subarray(ySize, ySize + uvSize);
      const vData = buffer.subarray(ySize + uvSize, ySize + uvSize * 2);
      
      this.webglRenderer.render(yData, uData, vData, width, height);
    } catch (e) {
      console.error('渲染帧失败:', e);
      throw e;
    }
  }

  async flush() {
    if (this.isFlushing) {
      return;
    }
    this.isFlushing = true;
    try {
      await this.decoder.flush();
    } finally {
      this.isFlushing = false;
    }
  }

  reset() {
    try {
      if (this.decoder.state !== 'closed') {
        this.decoder.reset();
      }
    } catch (e) {
      console.warn('解码器重置失败，重新创建解码器:', e);
      this.createDecoder();
      if (this.width && this.height) {
        this.configure(this.width, this.height, this.codec);
      }
    }
    this.frameCount = 0;
    this.consecutiveErrors = 0;
  }

  close() {
    if (this.decoder) {
      this.decoder.close();
      this.decoder = null;
    }
  }

  log(message, type = 'info') {
    const logEl = document.getElementById('statusLog');
    if (logEl) {
      const entry = document.createElement('div');
      entry.className = `log-entry log-${type}`;
      entry.textContent = `[${new Date().toLocaleTimeString()}] [Decoder] ${message}`;
      logEl.appendChild(entry);
      logEl.scrollTop = logEl.scrollHeight;
    }
    console.log(`[Decoder] ${message}`);
  }
}

class AnnexBParser {
  static findNalUnits(data) {
    const nalUnits = [];
    let i = 0;
    
    while (i < data.length - 3) {
      if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1) {
        const start = i + 3;
        let end = start;
        
        while (end < data.length - 3) {
          if (data[end] === 0 && data[end + 1] === 0 && data[end + 2] === 1) {
            break;
          }
          end++;
        }
        
        nalUnits.push({
          start: start,
          end: end,
          type: data[start] & 0x1F
        });
        
        i = end;
      } else {
        i++;
      }
    }
    
    return nalUnits;
  }

  static isKeyFrame(data) {
    const nalUnits = this.findNalUnits(data);
    for (const nal of nalUnits) {
      if (nal.type === 5 || nal.type === 7 || nal.type === 8) {
        return true;
      }
    }
    return false;
  }
}
