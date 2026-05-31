const mongoose = require('mongoose');

const pagePermissionSchema = new mongoose.Schema({
  pageId: { type: mongoose.Schema.Types.Types.ObjectId, ref: 'Page', required: true },
  userId: { type: mongoose.Schema.Types.Types.ObjectId, ref: 'User', required: true },
  permissions: {
    view: { type: Boolean, default: true },
    edit: { type: Boolean, default: false },
    publish: { type: Boolean, default: false },
    delete: { type: Boolean, default: false }
  },
  createdBy: { type: mongoose.Schema.Types.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

pagePermissionSchema.index({ pageId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('PagePermission', pagePermissionSchema);