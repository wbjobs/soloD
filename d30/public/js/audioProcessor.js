class AudioProcessor {
    constructor(options = {}) {
        this.sampleRate = options.sampleRate || 16000;
        this.bufferSize = options.bufferSize || 512;
        this.hopLength = options.hopLength || 160;
        this.nMfcc = options.nMfcc || 13;
        this.nFft = options.nFft || 512;
        this.audioContext = null;
        this.mediaStream = null;
        this.scriptProcessor = null;
        this.analyser = null;
        this.onAudioProcess = options.onAudioProcess || (() => {});
        
        this.melFilterBank = this.createMelFilterBank();
        this.dctMatrix = this.createDCTMatrix();
        this.hannWindow = this.createHannWindow();
        
        this.pitchHistory = [];
        this.maxPitchHistory = 20;
        this.lastPitch = 0;
    }

    createHannWindow() {
        const window = new Float32Array(this.nFft);
        for (let i = 0; i < this.nFft; i++) {
            window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (this.nFft - 1)));
        }
        return window;
    }

    createMelFilterBank() {
        const nFilters = 26;
        const lowFreq = 0;
        const highFreq = this.sampleRate / 2;
        const lowMel = this.freqToMel(lowFreq);
        const highMel = this.freqToMel(highFreq);
        const melPoints = new Float32Array(nFilters + 2);
        
        for (let i = 0; i < nFilters + 2; i++) {
            const mel = lowMel + (highMel - lowMel) * i / (nFilters + 1);
            melPoints[i] = this.melToFreq(mel);
        }

        const bin = melPoints.map(f => Math.floor((this.nFft + 1) * f / this.sampleRate));
        const filters = [];

        for (let i = 0; i < nFilters; i++) {
            const filter = new Float32Array(this.nFft / 2 + 1);
            for (let j = bin[i]; j < bin[i + 1]; j++) {
                filter[j] = (j - bin[i]) / (bin[i + 1] - bin[i]);
            }
            for (let j = bin[i + 1]; j < bin[i + 2]; j++) {
                filter[j] = (bin[i + 2] - j) / (bin[i + 2] - bin[i + 1]);
            }
            filters.push(filter);
        }
        return filters;
    }

    createDCTMatrix() {
        const matrix = [];
        for (let i = 0; i < this.nMfcc; i++) {
            const row = new Float32Array(26);
            for (let j = 0; j < 26; j++) {
                row[j] = Math.cos(Math.PI * i * (j + 0.5) / 26);
            }
            matrix.push(row);
        }
        return matrix;
    }

    freqToMel(freq) {
        return 2595 * Math.log10(1 + freq / 700);
    }

    melToFreq(mel) {
        return 700 * (Math.pow(10, mel / 2595) - 1);
    }

    async init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: this.sampleRate,
                latencyHint: 'interactive'
            });

            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: this.sampleRate
                }
            });

            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = this.nFft;
            
            this.scriptProcessor = this.audioContext.createScriptProcessor(this.bufferSize, 1, 1);
            
            this.scriptProcessor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                this.processAudioFrame(inputData);
            };

            source.connect(this.analyser);
            source.connect(this.scriptProcessor);
            this.scriptProcessor.connect(this.audioContext.destination);

            console.log('Audio processor initialized with low latency settings');
            return true;
        } catch (error) {
            console.error('Failed to initialize audio:', error);
            return false;
        }
    }

    detectPitch(audioData) {
        const n = audioData.length;
        let maxCorrelation = 0;
        let bestLag = 0;
        
        const minFreq = 80;
        const maxFreq = 1000;
        const minLag = Math.floor(this.sampleRate / maxFreq);
        const maxLag = Math.floor(this.sampleRate / minFreq);
        
        for (let lag = minLag; lag <= maxLag; lag++) {
            let correlation = 0;
            for (let i = 0; i < n - lag; i++) {
                correlation += audioData[i] * audioData[i + lag];
            }
            if (correlation > maxCorrelation) {
                maxCorrelation = correlation;
                bestLag = lag;
            }
        }
        
        if (bestLag === 0 || maxCorrelation < 0.01) {
            return 0;
        }
        
        return this.sampleRate / bestLag;
    }
    
    calculateVolume(audioData) {
        let sum = 0;
        for (let i = 0; i < audioData.length; i++) {
            sum += audioData[i] * audioData[i];
        }
        return Math.sqrt(sum / audioData.length);
    }
    
    analyzeEmotion(pitch, volume) {
        this.pitchHistory.push(pitch);
        if (this.pitchHistory.length > this.maxPitchHistory) {
            this.pitchHistory.shift();
        }
        
        const avgPitch = this.pitchHistory.reduce((a, b) => a + b, 0) / this.pitchHistory.length;
        const pitchVariance = this.pitchHistory.reduce((sum, p) => sum + Math.pow(p - avgPitch, 2), 0) / this.pitchHistory.length;
        const pitchStd = Math.sqrt(pitchVariance);
        
        const normalizedPitch = Math.min(1, Math.max(0, (avgPitch - 80) / 400));
        const normalizedVariance = Math.min(1, pitchStd / 50);
        const normalizedVolume = Math.min(1, volume * 10);
        
        let emotion = {
            type: 'neutral',
            intensity: 0,
            eyebrowRaise: 0,
            eyebrowLower: 0,
            browInnerUp: 0
        };
        
        if (normalizedVolume < 0.1) {
            return emotion;
        }
        
        if (normalizedPitch > 0.6 && normalizedVariance > 0.4) {
            emotion.type = 'excited';
            emotion.intensity = Math.min(1, (normalizedPitch + normalizedVariance) / 2);
            emotion.eyebrowRaise = emotion.intensity * 0.8;
            emotion.browInnerUp = emotion.intensity * 0.3;
        } else if (normalizedPitch > 0.4 && normalizedVolume > 0.5) {
            emotion.type = 'happy';
            emotion.intensity = (normalizedPitch + normalizedVolume) / 2;
            emotion.eyebrowRaise = emotion.intensity * 0.5;
            emotion.browInnerUp = emotion.intensity * 0.4;
        } else if (normalizedPitch < 0.25 && normalizedVariance < 0.15 && normalizedVolume > 0.2) {
            emotion.type = 'angry';
            emotion.intensity = Math.min(1, (1 - normalizedPitch) + normalizedVolume);
            emotion.eyebrowLower = emotion.intensity * 0.7;
        } else if (normalizedPitch < 0.3 && normalizedVariance > 0.3) {
            emotion.type = 'sad';
            emotion.intensity = (1 - normalizedPitch) * normalizedVariance;
            emotion.eyebrowRaise = emotion.intensity * 0.2;
            emotion.browInnerUp = emotion.intensity * 0.6;
        } else {
            emotion.type = 'neutral';
            emotion.intensity = 0.2;
            emotion.eyebrowRaise = 0.1;
        }
        
        return emotion;
    }

    processAudioFrame(audioData) {
        const startTime = performance.now();
        
        const windowed = this.applyWindow(audioData);
        const fft = this.performFFT(windowed);
        const powerSpectrum = this.computePowerSpectrum(fft);
        const melEnergies = this.applyMelFilters(powerSpectrum);
        const logMel = this.logTransform(melEnergies);
        const mfcc = this.applyDCT(logMel);
        
        const pitch = this.detectPitch(audioData);
        const volume = this.calculateVolume(audioData);
        const emotion = this.analyzeEmotion(pitch, volume);

        const latency = performance.now() - startTime;
        if (latency > 50) {
            console.warn(`MFCC extraction took ${latency.toFixed(1)}ms`);
        }

        this.onAudioProcess({
            mfcc: Array.from(mfcc),
            timestamp: Date.now(),
            latency: latency,
            pitch: pitch,
            volume: volume,
            emotion: emotion
        });
    }

    applyWindow(audioData) {
        const result = new Float32Array(this.nFft);
        const len = Math.min(audioData.length, this.nFft);
        for (let i = 0; i < len; i++) {
            result[i] = audioData[i] * this.hannWindow[i];
        }
        return result;
    }

    performFFT(data) {
        const n = data.length;
        const real = new Float32Array(n);
        const imag = new Float32Array(n);
        
        for (let i = 0; i < n; i++) {
            real[i] = data[i];
            imag[i] = 0;
        }

        this.bitReversePermutation(real, imag);
        
        for (let size = 2; size <= n; size <<= 1) {
            const angle = -2 * Math.PI / size;
            for (let m = 0; m < n; m += size) {
                for (let k = 0; k < size / 2; k++) {
                    const evenIdx = m + k;
                    const oddIdx = m + k + size / 2;
                    
                    const cos = Math.cos(angle * k);
                    const sin = Math.sin(angle * k);
                    
                    const tReal = cos * real[oddIdx] - sin * imag[oddIdx];
                    const tImag = sin * real[oddIdx] + cos * imag[oddIdx];
                    
                    real[oddIdx] = real[evenIdx] - tReal;
                    imag[oddIdx] = imag[evenIdx] - tImag;
                    real[evenIdx] = real[evenIdx] + tReal;
                    imag[evenIdx] = imag[evenIdx] + tImag;
                }
            }
        }
        
        return { real, imag };
    }

    bitReversePermutation(real, imag) {
        const n = real.length;
        let j = 0;
        for (let i = 1; i < n; i++) {
            let bit = n >> 1;
            while (j & bit) {
                j ^= bit;
                bit >>= 1;
            }
            j ^= bit;
            if (i < j) {
                [real[i], real[j]] = [real[j], real[i]];
                [imag[i], imag[j]] = [imag[j], imag[i]];
            }
        }
    }

    computePowerSpectrum(fft) {
        const n = fft.real.length / 2 + 1;
        const power = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            power[i] = (fft.real[i] ** 2 + fft.imag[i] ** 2) / fft.real.length;
        }
        return power;
    }

    applyMelFilters(powerSpectrum) {
        const energies = new Float32Array(this.melFilterBank.length);
        for (let i = 0; i < this.melFilterBank.length; i++) {
            let sum = 0;
            const filter = this.melFilterBank[i];
            for (let j = 0; j < powerSpectrum.length; j++) {
                sum += powerSpectrum[j] * filter[j];
            }
            energies[i] = Math.max(sum, 1e-10);
        }
        return energies;
    }

    logTransform(energies) {
        const result = new Float32Array(energies.length);
        for (let i = 0; i < energies.length; i++) {
            result[i] = Math.log(energies[i]);
        }
        return result;
    }

    applyDCT(logMel) {
        const mfcc = new Float32Array(this.nMfcc);
        for (let i = 0; i < this.nMfcc; i++) {
            let sum = 0;
            const row = this.dctMatrix[i];
            for (let j = 0; j < logMel.length; j++) {
                sum += logMel[j] * row[j];
            }
            mfcc[i] = sum;
        }
        return mfcc;
    }

    stop() {
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
        }
        if (this.scriptProcessor) {
            this.scriptProcessor.disconnect();
        }
        if (this.audioContext) {
            this.audioContext.close();
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioProcessor;
}
