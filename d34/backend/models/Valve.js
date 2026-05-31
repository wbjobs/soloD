const mongoose = require('mongoose');

const valveSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['gate', 'butterfly', 'ball', 'check'], default: 'gate' },
  status: { type: String, enum: ['open', 'closed', 'maintenance'], default: 'open' },
  diameter: Number,
  location: {
    type: { type: String, enum: ['Point'], required: true },
    coordinates: { type: [Number], required: true }
  },
  connectedPipelines: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pipeline'
  }],
  installationDate: Date,
  lastMaintenanceDate: Date,
  notes: String,
  createdAt: { type: Date, default: Date.now }
});

valveSchema.index({ location: '2dsphere' });
valveSchema.index({ status: 1 });

module.exports = mongoose.model('Valve', valveSchema);
