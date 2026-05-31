class BlendshapeModel {
    constructor() {
        this.isInitialized = false;
        this.inputSize = 13;
        this.hiddenSize = 64;
        this.outputSize = 45;
        this.weights = {};
        this.lastBlendshapes = null;
        this.smoothingFactor = 0.3;
    }

    async init() {
        if (this.isInitialized) return;

        this.initializeWeights();
        this.setupPhonemeMapping();
        
        this.isInitialized = true;
        console.log('Blendshape model initialized (simulated)');
    }

    initializeWeights() {
        this.weights.inputHidden = this.randomMatrix(this.inputSize, this.hiddenSize);
        this.weights.hiddenBias = this.randomArray(this.hiddenSize);
        this.weights.hiddenOutput = this.randomMatrix(this.hiddenSize, this.outputSize);
        this.weights.outputBias = this.randomArray(this.outputSize);
    }

    randomMatrix(rows, cols) {
        const matrix = [];
        for (let i = 0; i < rows; i++) {
            const row = new Float32Array(cols);
            for (let j = 0; j < cols; j++) {
                row[j] = (Math.random() - 0.5) * 0.2;
            }
            matrix.push(row);
        }
        return matrix;
    }

    randomArray(size) {
        const arr = new Float32Array(size);
        for (let i = 0; i < size; i++) {
            arr[i] = (Math.random() - 0.5) * 0.1;
        }
        return arr;
    }

    setupPhonemeMapping() {
        this.phonemeBlendshapes = {
            A: { jawOpen: 0.8, mouthOpen: 0.6 },
            E: { jawOpen: 0.5, mouthSmileLeft: 0.3, mouthSmileRight: 0.3 },
            I: { jawOpen: 0.3, mouthSmileLeft: 0.4, mouthSmileRight: 0.4 },
            O: { jawOpen: 0.6, mouthPucker: 0.7 },
            U: { jawOpen: 0.4, mouthPucker: 0.8 },
            F: { mouthLowerDownLeft: 0.5, mouthLowerDownRight: 0.5 },
            V: { mouthLowerDownLeft: 0.5, mouthLowerDownRight: 0.5 },
            M: { mouthClose: 0.8 },
            B: { mouthClose: 0.6 },
            P: { mouthClose: 0.6 },
            L: { mouthUpperUpLeft: 0.4, mouthUpperUpRight: 0.4 },
            TH: { tongueOut: 0.3 },
            CH: { mouthPressLeft: 0.4, mouthPressRight: 0.4 },
            J: { mouthPressLeft: 0.4, mouthPressRight: 0.4 },
            S: { mouthStretchLeft: 0.3, mouthStretchRight: 0.3 },
            Z: { mouthStretchLeft: 0.3, mouthStretchRight: 0.3 },
            SH: { mouthPucker: 0.4, mouthStretchLeft: 0.2, mouthStretchRight: 0.2 },
            R: { mouthUpperUpLeft: 0.3, mouthUpperUpRight: 0.3 }
        };

        this.blendshapeIndexMap = {
            'jawOpen': 9,
            'mouthClose': 10,
            'mouthPucker': 12,
            'mouthSmileLeft': 15,
            'mouthSmileRight': 16,
            'mouthFrownLeft': 17,
            'mouthFrownRight': 18,
            'mouthLowerDownLeft': 29,
            'mouthLowerDownRight': 30,
            'mouthUpperUpLeft': 31,
            'mouthUpperUpRight': 32,
            'mouthStretchLeft': 21,
            'mouthStretchRight': 22,
            'mouthPressLeft': 27,
            'mouthPressRight': 28,
            'tongueOut': 44
        };
    }

    detectPhoneme(mfcc) {
        const energy = mfcc.reduce((sum, val) => sum + Math.abs(val), 0) / mfcc.length;
        
        if (energy < 0.3) {
            return null;
        }

        const mfcc0 = mfcc[0] || 0;
        const mfcc1 = mfcc[1] || 0;
        const mfcc2 = mfcc[2] || 0;

        if (mfcc0 > 1.5 && mfcc1 > 0.5) {
            return 'A';
        } else if (mfcc0 > 0.8 && mfcc1 < -0.3) {
            return 'E';
        } else if (mfcc0 < 0.5 && mfcc1 > 1.0) {
            return 'I';
        } else if (mfcc0 > 1.0 && mfcc1 < -0.8) {
            return 'O';
        } else if (mfcc0 < 0.3 && mfcc1 < -1.0) {
            return 'U';
        } else if (mfcc2 > 0.8) {
            return 'F';
        } else if (mfcc2 < -0.8) {
            return 'M';
        } else if (mfcc1 > 0 && mfcc2 > 0) {
            return 'L';
        } else if (Math.abs(mfcc1) < 0.3 && Math.abs(mfcc2) < 0.3) {
            return 'S';
        }

        const phonemes = ['A', 'E', 'I', 'O', 'U', 'M', 'L', 'S'];
        return phonemes[Math.floor(Math.random() * phonemes.length)];
    }

    phonemeToBlendshapes(phoneme) {
        const blendshapes = new Float32Array(this.outputSize).fill(0);

        if (!phoneme) {
            return blendshapes;
        }

        const phonemeData = this.phonemeBlendshapes[phoneme];
        if (phonemeData) {
            for (const [name, value] of Object.entries(phonemeData)) {
                const index = this.blendshapeIndexMap[name];
                if (index !== undefined) {
                    blendshapes[index] = value;
                }
            }
        }

        return blendshapes;
    }

    matrixVectorMultiply(matrix, vector) {
        const result = new Float32Array(matrix[0].length);
        for (let i = 0; i < matrix[0].length; i++) {
            let sum = 0;
            for (let j = 0; j < matrix.length; j++) {
                sum += matrix[j][i] * vector[j];
            }
            result[i] = sum;
        }
        return result;
    }

    vectorAdd(a, b) {
        const result = new Float32Array(a.length);
        for (let i = 0; i < a.length; i++) {
            result[i] = a[i] + b[i];
        }
        return result;
    }

    relu(vector) {
        const result = new Float32Array(vector.length);
        for (let i = 0; i < vector.length; i++) {
            result[i] = Math.max(0, vector[i]);
        }
        return result;
    }

    sigmoid(vector) {
        const result = new Float32Array(vector.length);
        for (let i = 0; i < vector.length; i++) {
            result[i] = 1 / (1 + Math.exp(-vector[i]));
        }
        return result;
    }

    smoothBlendshapes(newBlendshapes) {
        if (!this.lastBlendshapes) {
            this.lastBlendshapes = new Float32Array(newBlendshapes);
            return newBlendshapes;
        }

        const smoothed = new Float32Array(newBlendshapes.length);
        for (let i = 0; i < newBlendshapes.length; i++) {
            smoothed[i] = this.lastBlendshapes[i] + (newBlendshapes[i] - this.lastBlendshapes[i]) * this.smoothingFactor;
        }
        
        this.lastBlendshapes = new Float32Array(smoothed);
        return smoothed;
    }

    applyEmotionToBlendshapes(blendshapes, emotion) {
        if (!emotion) return blendshapes;
        
        const browOuterUpLeftIdx = 36;
        const browOuterUpRightIdx = 37;
        const browDownLeftIdx = 34;
        const browDownRightIdx = 35;
        const browInnerUpIdx = 33;
        
        if (emotion.eyebrowRaise) {
            blendshapes[browOuterUpLeftIdx] = Math.max(blendshapes[browOuterUpLeftIdx], emotion.eyebrowRaise);
            blendshapes[browOuterUpRightIdx] = Math.max(blendshapes[browOuterUpRightIdx], emotion.eyebrowRaise);
        }
        
        if (emotion.eyebrowLower) {
            blendshapes[browDownLeftIdx] = Math.max(blendshapes[browDownLeftIdx], emotion.eyebrowLower);
            blendshapes[browDownRightIdx] = Math.max(blendshapes[browDownRightIdx], emotion.eyebrowLower);
        }
        
        if (emotion.browInnerUp) {
            blendshapes[browInnerUpIdx] = Math.max(blendshapes[browInnerUpIdx], emotion.browInnerUp);
        }
        
        return blendshapes;
    }

    async infer(mfcc, emotion = null) {
        if (!this.isInitialized) {
            throw new Error('Model not initialized');
        }

        return new Promise((resolve) => {
            setTimeout(() => {
                const phoneme = this.detectPhoneme(mfcc);
                let blendshapes = this.phonemeToBlendshapes(phoneme);
                
                if (emotion) {
                    blendshapes = this.applyEmotionToBlendshapes(blendshapes, emotion);
                }
                
                blendshapes = this.smoothBlendshapes(blendshapes);
                resolve(Array.from(blendshapes));
            }, 5 + Math.random() * 10);
        });
    }
}

module.exports = new BlendshapeModel();
