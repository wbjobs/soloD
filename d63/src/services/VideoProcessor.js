import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

class VideoProcessor {
  constructor() {
    this.ffmpeg = null;
    this.initialized = false;
    this.videoFile = null;
    this.width = 0;
    this.height = 0;
    this.fps = 0;
    this.duration = 0;
    this.totalFrames = 0;
    this.currentFrame = 0;
    this.frameBuffers = [];
  }

  async init() {
    if (this.initialized) return true;

    this.ffmpeg = new FFmpeg();
    
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    
    this.ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg]', message);
    });

    await this.ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    this.initialized = true;
    return true;
  }

  async loadVideo(file) {
    if (!this.initialized) {
      await this.init();
    }

    this.videoFile = file;
    
    await this.ffmpeg.writeFile('input.mp4', await fetchFile(file));
    
    await this.ffmpeg.exec([
      '-i', 'input.mp4',
      '-f', 'rawvideo',
      '-pix_fmt', 'yuv420p',
      'output.yuv'
    ]);

    const yuvData = await this.ffmpeg.readFile('output.yuv');
    
    await this.ffmpeg.exec([
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,r_frame_rate,duration,nb_frames',
      '-of', 'json',
      'input.mp4',
      '-show_entries', 'stream_tags=rotate',
      '-of', 'json'
    ]);

    const stdout = await this.ffmpeg.readFile('stdout.txt').catch(() => null);
    if (stdout) {
      const info = JSON.parse(new TextDecoder().decode(stdout));
      if (info.streams && info.streams[0]) {
        this.width = info.streams[0].width;
        this.height = info.streams[0].height;
        const fpsParts = info.streams[0].r_frame_rate.split('/');
        this.fps = parseInt(fpsParts[0]) / parseInt(fpsParts[1] || 1);
        this.duration = parseFloat(info.streams[0].duration);
        this.totalFrames = parseInt(info.streams[0].nb_frames);
      }
    }

    const frameSize = this.width * this.height * 3 / 2;
    const numFrames = Math.floor(yuvData.length / frameSize);
    
    this.frameBuffers = [];
    for (let i = 0; i < numFrames; i++) {
      const offset = i * frameSize;
      const frame = new Uint8Array(yuvData.buffer, offset, frameSize);
      this.frameBuffers.push(frame);
    }

    this.totalFrames = this.frameBuffers.length;
    this.currentFrame = 0;

    return {
      width: this.width,
      height: this.height,
      fps: this.fps,
      duration: this.duration,
      totalFrames: this.totalFrames
    };
  }

  getNextFrame() {
    if (this.currentFrame >= this.frameBuffers.length) {
      return null;
    }
    return this.frameBuffers[this.currentFrame++];
  }

  getFrame(index) {
    if (index < 0 || index >= this.frameBuffers.length) {
      return null;
    }
    this.currentFrame = index + 1;
    return this.frameBuffers[index];
  }

  reset() {
    this.currentFrame = 0;
  }

  hasMoreFrames() {
    return this.currentFrame < this.frameBuffers.length;
  }

  getProgress() {
    if (this.totalFrames === 0) return 0;
    return (this.currentFrame / this.totalFrames) * 100;
  }

  getVideoInfo() {
    return {
      width: this.width,
      height: this.height,
      fps: this.fps,
      duration: this.duration,
      totalFrames: this.totalFrames,
      currentFrame: this.currentFrame
    };
  }

  destroy() {
    if (this.ffmpeg) {
      this.ffmpeg.terminate();
    }
    this.frameBuffers = [];
    this.initialized = false;
  }
}

export default VideoProcessor;
