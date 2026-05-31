const fs = require('fs');
const path = require('path');

function createModelJson(modelName, version) {
  return {
    format: 'layers-model',
    generatedBy: 'TensorFlow.js v4.11.0',
    convertedBy: null,
    modelTopology: {
      class_name: 'Sequential',
      config: {
        name: 'bandwidth_predictor',
        layers: [
          {
            class_name: 'LSTM',
            config: {
              name: 'lstm_1',
              units: 64,
              activation: 'tanh',
              recurrent_activation: 'sigmoid',
              return_sequences: true,
              input_shape: [30, 3]
            }
          },
          {
            class_name: 'Dropout',
            config: {
              name: 'dropout_1',
              rate: 0.2
            }
          },
          {
            class_name: 'LSTM',
            config: {
              name: 'lstm_2',
              units: 32,
              activation: 'tanh',
              recurrent_activation: 'sigmoid',
              return_sequences: false
            }
          },
          {
            class_name: 'Dropout',
            config: {
              name: 'dropout_2',
              rate: 0.2
            }
          },
          {
            class_name: 'Dense',
            config: {
              name: 'dense_1',
              units: 3,
              activation: 'softmax'
            }
          }
        ]
      }
    },
    weightsManifest: [
      {
        paths: [`./weights_${version}.bin`],
        weights: [
          { name: 'lstm_1/kernel', dtype: 'float32', shape: [3, 256] },
          { name: 'lstm_1/recurrent_kernel', dtype: 'float32', shape: [64, 256] },
          { name: 'lstm_1/bias', dtype: 'float32', shape: [256] },
          { name: 'lstm_2/kernel', dtype: 'float32', shape: [64, 128] },
          { name: 'lstm_2/recurrent_kernel', dtype: 'float32', shape: [32, 128] },
          { name: 'lstm_2/bias', dtype: 'float32', shape: [128] },
          { name: 'dense_1/kernel', dtype: 'float32', shape: [32, 3] },
          { name: 'dense_1/bias', dtype: 'float32', shape: [3] }
        ]
      }
    ],
    trainingConfig: {
      loss: 'categoricalCrossentropy',
      optimizer_config: {
        class_name: 'Adam',
        config: { learning_rate: 0.001 }
      },
      metrics: ['accuracy']
    }
  };
}

function generateRandomWeights(shape) {
  const size = shape.reduce((a, b) => a * b, 1);
  const buffer = new ArrayBuffer(size * 4);
  const view = new Float32Array(buffer);
  
  for (let i = 0; i < size; i++) {
    view[i] = (Math.random() - 0.5) * 0.1;
  }
  
  return buffer;
}

function createWeightsFile(modelName, version) {
  const weights = [];
  
  weights.push(generateRandomWeights([3, 256]));
  weights.push(generateRandomWeights([64, 256]));
  weights.push(generateRandomWeights([256]));
  weights.push(generateRandomWeights([64, 128]));
  weights.push(generateRandomWeights([32, 128]));
  weights.push(generateRandomWeights([128]));
  weights.push(generateRandomWeights([32, 3]));
  weights.push(generateRandomWeights([3]));
  
  const totalSize = weights.reduce((sum, w) => sum + w.byteLength, 0);
  const combinedBuffer = new ArrayBuffer(totalSize);
  let offset = 0;
  
  for (const weight of weights) {
    new Uint8Array(combinedBuffer, offset).set(new Uint8Array(weight));
    offset += weight.byteLength;
  }
  
  return Buffer.from(combinedBuffer);
}

function generateModel(modelDir, modelName, version) {
  const fullPath = path.join(__dirname, '../models', modelDir);
  
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
  
  const modelJson = createModelJson(modelName, version);
  fs.writeFileSync(
    path.join(fullPath, 'model.json'),
    JSON.stringify(modelJson, null, 2)
  );
  
  const weightsBuffer = createWeightsFile(modelName, version);
  fs.writeFileSync(
    path.join(fullPath, `weights_${version}.bin`),
    weightsBuffer
  );
  
  console.log(`Created dummy model: ${modelDir}`);
}

generateModel('lstm_bandwidth_v1', 'v1.0');
generateModel('lstm_bandwidth_v1.1', 'v1.1');

console.log('All dummy models created successfully!');
console.log('Note: These are dummy models with random weights for testing purposes.');
console.log('For production, train a real model with actual bandwidth data.');
