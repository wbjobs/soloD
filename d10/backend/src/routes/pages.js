const express = require('express');
const router = express.Router();
const Page = require('../models/Page');

router.get('/', async (req, res) => {
  try {
    const { projectId } = req.query;
    const query = projectId ? { projectId } : {};
    const pages = await Page.find(query).sort({ createdAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const page = await Page.findById(req.params.id);
    if (!page) {
      return res.status(404).json({ success: false, message: '页面不存在' });
    }
    res.json({ success: true, data: page });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const page = new Page(req.body);
    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    req.body.updatedAt = Date.now();
    const page = await Page.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!page) {
      return res.status(404).json({ success: false, message: '页面不存在' });
    }
    res.json({ success: true, data: page });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const page = await Page.findByIdAndDelete(req.params.id);
    if (!page) {
      return res.status(404).json({ success: false, message: '页面不存在' });
    }
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;