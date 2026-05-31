const mongoose = require('mongoose');

const voxelSchema = new mongoose.Schema({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  z: { type: Number, required: true },
  color: { type: String, required: true },
  isStatic: { type: Boolean, default: true }
});

const sceneSchema = new mongoose.Schema({
  name: { type: String, default: '未命名场景' },
  voxels: [voxelSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('VoxelScene', sceneSchema);
