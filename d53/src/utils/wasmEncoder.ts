declare global {
    interface Window {
        Module: any;
    }
}

export class WasmHEVCEncoder {
    private module: any;
    private encoder: number = 0;
    private width: number;
    private height: number;
    private qp: number;
    private isReady: boolean = false;
    private onReadyCallback: (() => void) | null = null;

    constructor(width: number, height: number, qp: number = 32) {
        this.width = width;
        this.height = height;
        this.qp = qp;
    }

    async init(): Promise<void> {
        if (this.isReady) return;

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = '/hevc_encoder.js';
            script.onload = () => {
                window.Module().then((module: any) => {
                    this.module = module;
                    this.encoder = module._HEVCEncoder_create(
                        this.width, this.height, this.qp, 3, 0
                    );
                    this.isReady = true;
                    if (this.onReadyCallback) this.onReadyCallback();
                    resolve();
                }).catch(reject);
            };
            script.onerror = reject;
            document.body.appendChild(script);
        });
    }

    encodeFrame(yData: Uint8Array, stride: number): Uint8Array | null {
        if (!this.isReady || !this.encoder) return null;

        const inputPtr = this.module._malloc(yData.length);
        this.module.HEAPU8.set(yData, inputPtr);

        const outDataPtr = this.module._malloc(4);
        const outSizePtr = this.module._malloc(4);

        const result = this.module._HEVCEncoder_encodeFrame(
            this.encoder, inputPtr, stride, outDataPtr, outSizePtr
        );

        let bitstream: Uint8Array | null = null;

        if (result === 0) {
            const dataPtr = this.module.getValue(outDataPtr, 'i32');
            const size = this.module.getValue(outSizePtr, 'i32');
            
            if (dataPtr && size > 0) {
                bitstream = new Uint8Array(size);
                bitstream.set(this.module.HEAPU8.subarray(dataPtr, dataPtr + size));
                this.module._HEVCEncoder_freeBitstream(dataPtr);
            }
        }

        this.module._free(inputPtr);
        this.module._free(outDataPtr);
        this.module._free(outSizePtr);

        return bitstream;
    }

    getFrameCount(): number {
        if (!this.isReady || !this.encoder) return 0;
        return this.module._HEVCEncoder_getFrameCount(this.encoder);
    }

    getBitsEncoded(): number {
        if (!this.isReady() || !this.encoder) return 0;
        return this.module._HEVCEncoder_getBitsEncoded(this.encoder);
    }

    enableMLPrediction(): void {
        if (!this.isReady() || !this.encoder) return;
        this.module._HEVCEncoder_enableMLPrediction(this.encoder, null, 0);
    }

    isMLEnabled(): boolean {
        if (!this.isReady() || !this.encoder) return false;
        return this.module._HEVCEncoder_isMLEnabled(this.encoder) !== 0;
    }

    getMLStats(): { totalBlocks: number; mlPredicted: number; reused: number; avgConfidence: number } {
        const stats = { totalBlocks: 0, mlPredicted: 0, reused: 0, avgConfidence: 0.0 };
        if (!this.isReady() || !this.encoder) return stats;

        const totalPtr = this.module._malloc(4);
        const mlPtr = this.module._malloc(4);
        const reusedPtr = this.module._malloc(4);
        const confPtr = this.module._malloc(4);

        this.module._HEVCEncoder_getMLStats(this.encoder, totalPtr, mlPtr, reusedPtr, confPtr);

        stats.totalBlocks = this.module.getValue(totalPtr, 'i32');
        stats.mlPredicted = this.module.getValue(mlPtr, 'i32');
        stats.reused = this.module.getValue(reusedPtr, 'i32');
        stats.avgConfidence = this.module.getValue(confPtr, 'float');

        this.module._free(totalPtr);
        this.module._free(mlPtr);
        this.module._free(reusedPtr);
        this.module._free(confPtr);

        return stats;
    }

    destroy(): void {
        if (this.encoder && this.module) {
            this.module._HEVCEncoder_destroy(this.encoder);
            this.encoder = 0;
        }
        this.isReady = false;
    }
}
