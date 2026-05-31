const express = require('express');
const router = express.Router();
const Component = require('../models/Component');

router.get('/', async (req, res) => {
  try {
    const { category, status } = req.query;
    const query = {};
    if (category) query.category = category;
    if (status) query.status = status;
    const components = await Component.find(query).sort({ createdAt: -1 });
    res.json({ success: true, data: components });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const component = await Component.findById(req.params.id);
    if (!component) {
      return res.status(404).json({ success: false, message: '组件不存在' });
    }
    res.json({ success: true, data: component });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const component = new Component(req.body);
    await component.save();
    res.json({ success: true, data: component });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    req.body.updatedAt = Date.now();
    const component = await Component.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!component) {
      return res.status(404).json({ success: false, message: '组件不存在' });
    }
    res.json({ success: true, data: component });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const component = await Component.findByIdAndDelete(req.params.id);
    if (!component) {
      return res.status(404).json({ success: false, message: '组件不存在' });
    }
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/:id/publish', async (req, res) => {
  try {
    const component = await Component.findByIdAndUpdate(
      req.params.id,
      { status: 'published', updatedAt: Date.now() },
      { new: true }
    );
    if (!component) {
      return res.status(404).json({ success: false, message: '组件不存在' });
    }
    res.json({ success: true, data: component });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;