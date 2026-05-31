const mongoose = require('mongoose');

const maintenanceRecordSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  description: { type: String, required: true },
  technician: String,
  cost: Number
});

const pipelineSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, required: true, enum: ['water', 'sewage', 'gas', 'electric', 'telecom'] },
  material: { type: String, required: true },
  diameter: Number,
  installationDate: Date,
  depth: Number,
  coordinates: {
    type: { type: String, enum: ['LineString'], required: true },
    coordinates: { type: [[Number]], required: true }
  },
  maintenanceRecords: [maintenanceRecordSchema],
  status: { type: String, enum: ['active', 'maintenance', 'decommissioned'], default: 'active' },
  createdAt: { type: Date, default: Date.now }
});

pipelineSchema.index({ coordinates: '2dsphere' });

pipelineSchema.index({ coordinates: '2dsphere', type: 1, status: 1 });

pipelineSchema.index({ coordinates: '2dsphere', depth: 1 });

pipelineSchema.index({ type: 1, status: 1 });

pipelineSchema.index({ status: 1 });

pipelineSchema.index({ depth: 1 });

module.exports = mongoose.model('Pipeline', pipelineSchema);
