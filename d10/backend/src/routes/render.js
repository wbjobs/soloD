const express = require('express');
const router = express.Router();
const Page = require('../models/Page');
const Component = require('../models/Component');

router.get('/page/:pageId', async (req, res) => {
  try {
    const page = await Page.findById(req.params.pageId);
    if (!page) {
      return res.status(404).json({ success: false, message: '页面不存在' });
    }
    res.json({ success: true, data: page.schema });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/page-by-path/:projectId/:path', async (req, res) => {
  try {
    const { projectId, path } = req.params;
    const page = await Page.findOne({ projectId, path: `/${path}` });
    if (!page) {
      return res.status(404).json({ success: false, message: '页面不存在' });
    }
    res.json({ success: true, data: page.schema });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/components', async (req, res) => {
  try {
    const components = await Component.find({ status: 'published' });
    res.json({ success: true, data: components });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;