const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class ModelVersionController {
  constructor() {
    this.modelsDir = path.join(__dirname, '../../models');
    this.ensureModelsDir();
    this.modelRegistry = this.loadModelRegistry();
    this.abTestSessions = new Map();
    this.userModelAssignment = new Map();
    this.experimentMetrics = new Map();
  }

  ensureModelsDir() {
    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true });
    }
  }

  loadModelRegistry() {
    const registryPath = path.join(this.modelsDir, 'registry.json');
    if (fs.existsSync(registryPath)) {
      return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    }
    return {
      models: [
        {
          id: 'lstm_v1.0',
          name: 'LSTM 带宽预测模型 v1.0',
          version: 'v1.0',
          description: '基础 LSTM 模型，使用 30 步历史数据预测 5 秒趋势',
          path: '/models/lstm_bandwidth_v1/model.json',
          weight: 0.3,
          mlWeight: 0.3,
          smoothingFactor: 0.85,
          status: 'active',
          created: new Date().toISOString(),
          metrics: {
            accuracy: 0.78,
            latencyAvg: 15
          }
        },
        {
          id: 'lstm_v1.1',
          name: 'LSTM 带宽预测模型 v1.1',
          version: 'v1.1',
          description: '优化版 LSTM，增加注意力机制，改进异常检测',
          path: '/models/lstm_bandwidth_v1.1/model.json',
          weight: 0.35,
          mlWeight: 0.35,
          smoothingFactor: 0.82,
          status: 'beta',
          created: new Date().toISOString(),
          metrics: {
            accuracy: 0.82,
            latencyAvg: 18
          }
        },
        {
          id: 'heuristic_v1.0',
          name: '启发式预测 v1.0',
          version: 'v1.0',
          description: '基于规则的启发式预测器（无 ML 依赖）',
          path: null,
          weight: 0,
          mlWeight: 0,
          smoothingFactor: 0.9,
          status: 'fallback',
          created: new Date().toISOString(),
          metrics: {
            accuracy: 0.65,
            latencyAvg: 2
          }
        }
      ],
      defaultModel: 'lstm_v1.0',
      experiments: []
    };
  }

  saveModelRegistry() {
    const registryPath = path.join(this.modelsDir, 'registry.json');
    fs.writeFileSync(registryPath, JSON.stringify(this.modelRegistry, null, 2));
  }

  getAllModels() {
    return this.modelRegistry.models;
  }

  getModelById(modelId) {
    return this.modelRegistry.models.find(m => m.id === modelId);
  }

  getActiveModels() {
    return this.modelRegistry.models.filter(m => m.status === 'active' || m.status === 'beta');
  }

  getDefaultModel() {
    return this.getModelById(this.modelRegistry.defaultModel);
  }

  setDefaultModel(modelId) {
    const model = this.getModelById(modelId);
    if (model && model.status === 'active') {
      this.modelRegistry.defaultModel = modelId;
      this.saveModelRegistry();
      return true;
    }
    return false;
  }

  registerModel(modelConfig) {
    const existing = this.modelRegistry.models.find(m => m.id === modelConfig.id);
    if (existing) {
      Object.assign(existing, modelConfig);
    } else {
      this.modelRegistry.models.push({
        ...modelConfig,
        created: new Date().toISOString()
      });
    }
    this.saveModelRegistry();
  }

  updateModelStatus(modelId, status) {
    const model = this.getModelById(modelId);
    if (model) {
      model.status = status;
      this.saveModelRegistry();
      return true;
    }
    return false;
  }

  createExperiment(experimentConfig) {
    const experimentId = 'exp_' + crypto.randomUUID().slice(0, 8);
    const experiment = {
      id: experimentId,
      name: experimentConfig.name,
      description: experimentConfig.description,
      variants: experimentConfig.variants.map(v => ({
        modelId: v.modelId,
        weight: v.weight,
        name: v.name
      })),
      status: 'created',
      created: new Date().toISOString(),
      trafficAllocation: experimentConfig.trafficAllocation || 0.5,
      metrics: {}
    };

    this.modelRegistry.experiments.push(experiment);
    this.experimentMetrics.set(experimentId, new Map());
    this.saveModelRegistry();

    return experiment;
  }

  startExperiment(experimentId) {
    const experiment = this.modelRegistry.experiments.find(e => e.id === experimentId);
    if (experiment) {
      experiment.status = 'running';
      experiment.started = new Date().toISOString();
      this.saveModelRegistry();
      return true;
    }
    return false;
  }

  stopExperiment(experimentId) {
    const experiment = this.modelRegistry.experiments.find(e => e.id === experimentId);
    if (experiment) {
      experiment.status = 'completed';
      experiment.completed = new Date().toISOString();
      this.saveModelRegistry();
      return true;
    }
    return false;
  }

  getAllExperiments() {
    return this.modelRegistry.experiments;
  }

  getExperimentById(experimentId) {
    return this.modelRegistry.experiments.find(e => e.id === experimentId);
  }

  assignUserToModel(userId) {
    if (this.userModelAssignment.has(userId)) {
      return this.userModelAssignment.get(userId);
    }

    const runningExperiments = this.modelRegistry.experiments.filter(e => e.status === 'running');
    
    if (runningExperiments.length > 0 && Math.random() < runningExperiments[0].trafficAllocation) {
      const experiment = runningExperiments[0];
      const random = Math.random();
      let cumulativeWeight = 0;

      for (const variant of experiment.variants) {
        cumulativeWeight += variant.weight;
        if (random < cumulativeWeight) {
          const assignment = {
            userId,
            modelId: variant.modelId,
            experimentId: experiment.id,
            variant: variant.name,
            assignedAt: new Date().toISOString()
          };
          this.userModelAssignment.set(userId, assignment);
          return assignment;
        }
      }
    }

    const defaultModel = this.getDefaultModel();
    const assignment = {
      userId,
      modelId: defaultModel.id,
      experimentId: null,
      variant: 'control',
      assignedAt: new Date().toISOString()
    };
    this.userModelAssignment.set(userId, assignment);
    return assignment;
  }

  getUserAssignment(userId) {
    return this.userModelAssignment.get(userId);
  }

  recordExperimentMetric(experimentId, variant, metricName, value) {
    if (!this.experimentMetrics.has(experimentId)) {
      this.experimentMetrics.set(experimentId, new Map());
    }

    const experimentMetrics = this.experimentMetrics.get(experimentId);
    if (!experimentMetrics.has(variant)) {
      experimentMetrics.set(variant, new Map());
    }

    const variantMetrics = experimentMetrics.get(variant);
    if (!variantMetrics.has(metricName)) {
      variantMetrics.set(metricName, []);
    }

    variantMetrics.get(metricName).push(value);
  }

  getExperimentResults(experimentId) {
    const experiment = this.getExperimentById(experimentId);
    if (!experiment) return null;

    const metrics = this.experimentMetrics.get(experimentId);
    if (!metrics) return null;

    const results = {};
    metrics.forEach((variantMetrics, variantName) => {
      results[variantName] = {};
      variantMetrics.forEach((values, metricName) => {
        if (values.length > 0) {
          const avg = values.reduce((a, b) => a + b, 0) / values.length;
          results[variantName][metricName] = {
            average: avg,
            count: values.length,
            min: Math.min(...values),
            max: Math.max(...values)
          };
        }
      });
    });

    return {
      experiment,
      results
    };
  }

  getModelConfigForUser(userId) {
    const assignment = this.assignUserToModel(userId);
    const model = this.getModelById(assignment.modelId);
    return {
      ...model,
      assignment
    };
  }

  clearUserAssignment(userId) {
    this.userModelAssignment.delete(userId);
  }

  getActiveExperimentStats() {
    const runningExperiments = this.modelRegistry.experiments.filter(e => e.status === 'running');
    return runningExperiments.map(exp => {
      const assignmentCount = Array.from(this.userModelAssignment.values())
        .filter(a => a.experimentId === exp.id).length;
      
      return {
        id: exp.id,
        name: exp.name,
        assignmentCount,
        started: exp.started,
        variants: exp.variants
      };
    });
  }
}

module.exports = new ModelVersionController();
