import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

export interface VideoFrame {
    yData: Uint8Array;
    uData: Uint8Array;
    vData: Uint8Array;
    width: number;
    height: number;
    stride: number;
    timestamp: number;
}

export class VideoDecoder {
    private ffmpeg: FFmpeg;
    private isLoaded: boolean = false;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;

    constructor() {
        this.ffmpeg = new FFmpeg();
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d')!;
    }

    async load(): Promise<void> {
        if (this.isLoaded) return;

        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
        
        await this.ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js', 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm', 'application/wasm'),
        });

        this.isLoaded = true;
    }

    async decodeVideo(file: File, onFrame: (frame: VideoFrame) => void): Promise<void> {
        if (!this.isLoaded) {
            throw new Error('FFmpeg not loaded');
        }

        await this.ffmpeg.writeFile('input.mp4', await fetchFile(file));

        await this.ffmpeg.exec([
            '-i', 'input.mp4',
            '-vf', 'fps=30',
            '-f', 'image2pipe',
            '-vcodec', 'rawvideo',
            '-pix_fmt', 'yuv420p',
            'frame-%03d.yuv'
        ]);

        const files = await this.ffmpeg.listDir('.');
        const yuvFiles = files.filter(f => f.name.endsWith('.yuv') && f.isDir === false);

        let frameIndex = 0;
        for (const file of yuvFiles) {
            const data = await this.ffmpeg.readFile(file.name);
            const yuvData = new Uint8Array(data);
            
            const frame = this.parseYUV420P(yuvData, 0, 0);
            frame.timestamp = frameIndex / 30;
            
            onFrame(frame);
            frameIndex++;
            
            await this.ffmpeg.deleteFile(file.name);
        }

        await this.ffmpeg.deleteFile('input.mp4');
    }

    private parseYUV420P(data: Uint8Array, width: number, height: number): VideoFrame {
        const ySize = width * height;
        const uvSize = (width / 2) * (height / 2);

        return {
            yData: data.subarray(0, ySize),
            uData: data.subarray(ySize, ySize + uvSize),
            vData: data.subarray(ySize + uvSize, ySize + 2 * uvSize),
            width,
            height,
            stride: width,
            timestamp: 0
        };
    }

    extractYUVFromCanvas(imageData: ImageData): VideoFrame {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;

        const yData = new Uint8Array(width * height);
        const uData = new Uint8Array((width / 2) * (height / 2));
        const vData = new Uint8Array((width / 2) * (height / 2));

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];

                const yVal = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
                yData[y * width + x] = Math.max(0, Math.min(255, yVal));

                if (y % 2 === 0 && x % 2 === 0) {
                    const uvIdx = (y / 2) * (width / 2) + (x / 2);
                    const uVal = Math.round(-0.168736 * r - 0.331264 * g + 0.5 * b + 128);
                    const vVal = Math.round(0.5 * r - 0.418688 * g - 0.081312 * b + 128);
                    uData[uvIdx] = Math.max(0, Math.min(255, uVal));
                    vData[uvIdx] = Math.max(0, Math.min(255, vVal));
                }
            }
        }

        return {
            yData,
            uData,
            vData,
            width,
            height,
            stride: width,
            timestamp: 0
        };
    }

    getIsLoaded(): boolean {
        return this.isLoaded;
    }
}
