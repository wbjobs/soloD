const mongoose = require('mongoose');

const customComponentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, required: true, unique: true },
  category: { type: String, default: 'custom' },
  icon: { type: String, default: '🔧' },
  description: String,
  version: { type: String, default: '1.0.0' },
  author: String,
  schema: {
    props: { type: Object, default: {} },
    style: { type: Object, default: {} },
    events: { type: Array, default: [] }
  },
  sourceCode: { type: Object, required: true },
  thumbnail: String,
  status: { type: String, enum: ['draft', 'published', 'deprecated'], default: 'draft' },
  isSystem: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('CustomComponent', customComponentSchema);