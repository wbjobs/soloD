const mongoose = require('mongoose');

const componentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, required: true },
  category: { type: String, required: true },
  icon: String,
  schema: { type: Object, required: true },
  previewImage: String,
  version: { type: String, default: '1.0.0' },
  status: { type: String, enum: ['draft', 'published'], default: 'draft' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Component', componentSchema);