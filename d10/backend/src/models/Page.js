const mongoose = require('mongoose');

const pageSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  name: { type: String, required: true },
  path: { type: String, required: true },
  schema: { type: Object, required: true },
  status: { type: String, enum: ['draft', 'published'], default: 'draft' },
  version: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Page', pageSchema);