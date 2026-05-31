const mongoose = require('mongoose');

const pageVersionSchema = new mongoose.Schema({
  pageId: { type: mongoose.Schema.Types.Types.ObjectId, ref: 'Page', required: true },
  version: { type: Number, required: true },
  name: { type: String, default: '' },
  description: String,
  schema: { type: Object, required: true },
  createdBy: { type: mongoose.Schema.Types.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PageVersion', pageVersionSchema);