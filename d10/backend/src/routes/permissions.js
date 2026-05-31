const express = require('express');
const router = express.Router();
const PagePermission = require('../models/PagePermission');
const User = require('../models/User');

router.get('/:pageId', async (req, res) => {
  try {
    const { pageId } = req.params;
    const permissions = await PagePermission.find({ pageId })
      .populate('userId', 'username email role avatar');
    res.json({ success: true, data: permissions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const permissions = await PagePermission.find({ userId });
    res.json({ success: true, data: permissions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/check', async (req, res) => {
  try {
    const { pageId, userId, permission } = req.body;
    
    const user = await User.findById(userId);
    if (user?.role === 'admin') {
      return res.json({ success: true, data: { allowed: true } });
    }
    
    const pagePermission = await PagePermission.findOne({ pageId, userId });
    if (!pagePermission) {
      return res.json({ success: true, data: { allowed: false } });
    }
    
    const allowed = pagePermission.permissions[permission] === true;
    res.json({ success: true, data: { allowed, permissions: pagePermission.permissions } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { pageId, userId, permissions } = req.body;
    
    let permission = await PagePermission.findOne({ pageId, userId });
    
    if (permission) {
      permission.permissions = permissions;
      permission.updatedAt = Date.now();
      await permission.save();
    } else {
      permission = new PagePermission({ pageId, userId, permissions });
      await permission.save();
    }
    
    await permission.populate('userId', 'username email role avatar');
    res.json({ success: true, data: permission });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const permission = await PagePermission.findByIdAndDelete(req.params.id);
    if (!permission) {
      return res.status(404).json({ success: false, message: '权限不存在' });
    }
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/batch', async (req, res) => {
  try {
    const { pageId, permissions } = req.body;
    
    const result = [];
    for (const perm of permissions) {
      let permission = await PagePermission.findOne({ pageId, userId: perm.userId });
      
      if (permission) {
        permission.permissions = perm.permissions;
        permission.updatedAt = Date.now();
        await permission.save();
      } else {
        permission = new PagePermission({ pageId, userId: perm.userId, permissions: perm.permissions });
        await permission.save();
      }
      
      await permission.populate('userId', 'username email role avatar');
      result.push(permission);
    }
    
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;