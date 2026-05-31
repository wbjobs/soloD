class WebGLRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    if (!this.gl) {
      throw new Error('WebGL 不受支持');
    }
    
    this.program = null;
    this.textures = { y: null, u: null, v: null };
    this.buffers = {};
    this.width = 0;
    this.height = 0;
    
    this.init();
  }

  init() {
    const gl = this.gl;
    
    const vertexShaderSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;
    
    const fragmentShaderSource = `
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_textureY;
      uniform sampler2D u_textureU;
      uniform sampler2D u_textureV;
      uniform vec2 u_resolution;
      
      void main() {
        float y = texture2D(u_textureY, v_texCoord).r;
        float u = texture2D(u_textureU, v_texCoord).r - 0.5;
        float v = texture2D(u_textureV, v_texCoord).r - 0.5;
        
        float r = y + 1.13983 * v;
        float g = y - 0.39465 * u - 0.58060 * v;
        float b = y + 2.03211 * u;
        
        gl_FragColor = vec4(r, g, b, 1.0);
      }
    `;
    
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    
    this.program = gl.createProgram();
    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);
    
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error('着色器程序链接失败: ' + gl.getProgramInfoLog(this.program));
    }
    
    gl.useProgram(this.program);
    
    const positions = new Float32Array([
      -1, -1,  1, -1,  -1, 1,
      -1,  1,  1, -1,   1, 1
    ]);
    
    const texCoords = new Float32Array([
      0, 1,  1, 1,  0, 0,
      0, 0,  1, 1,  1, 0
    ]);
    
    this.buffers.position = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    
    const positionLocation = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    
    this.buffers.texCoord = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.texCoord);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
    
    const texCoordLocation = gl.getAttribLocation(this.program, 'a_texCoord');
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
    
    this.textures.y = this.createTexture();
    this.textures.u = this.createTexture();
    this.textures.v = this.createTexture();
    
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_textureY'), 0);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_textureU'), 1);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_textureV'), 2);
  }

  compileShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error('着色器编译失败: ' + error);
    }
    
    return shader;
  }

  createTexture() {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return texture;
  }

  uploadTexture(texture, width, height, data) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + [this.textures.y, this.textures.u, this.textures.v].indexOf(texture));
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, width, height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, data);
  }

  render(yData, uData, vData, width, height) {
    const gl = this.gl;
    
    try {
      if (this.width !== width || this.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.width = width;
        this.height = height;
        gl.viewport(0, 0, width, height);
      }
      
      const uvWidth = Math.ceil(width / 2);
      const uvHeight = Math.ceil(height / 2);
      
      if (yData.length !== width * height ||
          uData.length !== uvWidth * uvHeight ||
          vData.length !== uvWidth * uvHeight) {
        throw new Error(`数据大小不匹配: Y(${yData.length})=${width}x${height}, ` +
                       `U(${uData.length})=${uvWidth}x${uvHeight}, ` +
                       `V(${vData.length})=${uvWidth}x${uvHeight}`);
      }
      
      this.uploadTexture(this.textures.y, width, height, yData);
      this.uploadTexture(this.textures.u, uvWidth, uvHeight, uData);
      this.uploadTexture(this.textures.v, uvWidth, uvHeight, vData);
      
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      
      const error = gl.getError();
      if (error !== gl.NO_ERROR) {
        console.warn(`WebGL 渲染警告: ${error}`);
      }
    } catch (e) {
      console.error('WebGL 渲染失败:', e);
      this.clear();
      throw e;
    }
  }

  clear() {
    const gl = this.gl;
    try {
      gl.clearColor(0.0, 0.0, 0.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      
      this.width = 0;
      this.height = 0;
    } catch (e) {
      console.error('清屏失败:', e);
    }
  }

  destroy() {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteBuffer(this.buffers.position);
    gl.deleteBuffer(this.buffers.texCoord);
    gl.deleteTexture(this.textures.y);
    gl.deleteTexture(this.textures.u);
    gl.deleteTexture(this.textures.v);
  }
}

class LocalVideoRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.video = document.createElement('video');
    this.video.autoplay = true;
    this.video.muted = true;
    this.animationId = null;
  }

  async start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 },
        audio: true 
      });
      this.video.srcObject = stream;
      this.renderLoop();
      return stream;
    } catch (e) {
      console.error('获取摄像头失败:', e);
      throw e;
    }
  }

  renderLoop() {
    const render = () => {
      if (this.video.readyState >= 2) {
        if (this.canvas.width !== this.video.videoWidth) {
          this.canvas.width = this.video.videoWidth;
          this.canvas.height = this.video.videoHeight;
        }
        this.ctx.drawImage(this.video, 0, 0);
      }
      this.animationId = requestAnimationFrame(render);
    };
    render();
  }

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.video.srcObject) {
      this.video.srcObject.getTracks().forEach(track => track.stop());
    }
  }
}
