const express = require('express');
const router = express.Router();
const PageVersion = require('../models/PageVersion');
const Page = require('../models/Page');

router.get('/:pageId', async (req, res) => {
  try {
    const { pageId } = req.params;
    const versions = await PageVersion.find({ pageId }).sort({ version: -1 });
    res.json({ success: true, data: versions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:pageId/:version', async (req, res) => {
  try {
    const { pageId, version } = req.params;
    const pageVersion = await PageVersion.findOne({ pageId, version: Number(version) });
    if (!pageVersion) {
      return res.status(404).json({ success: false, message: '版本不存在' });
    }
    res.json({ success: true, data: pageVersion });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/create', async (req, res) => {
  try {
    const { pageId, name, description } = req.body;
    
    const page = await Page.findById(pageId);
    if (!page) {
      return res.status(404).json({ success: false, message: '页面不存在' });
    }
    
    const lastVersion = await PageVersion.findOne({ pageId }).sort({ version: -1 });
    const newVersion = (lastVersion?.version || 0) + 1;
    
    const pageVersion = new PageVersion({
      pageId,
      version: newVersion,
      name: name || `v${newVersion}`,
      description: description || page.description || '',
      schema: page.schema
    });
    await pageVersion.save();
    
    res.json({ success: true, data: pageVersion, message: '版本创建成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/rollback', async (req, res) => {
  try {
    const { pageId, version } = req.body;
    
    const pageVersion = await PageVersion.findOne({ pageId, version: Number(version) });
    if (!pageVersion) {
      return res.status(404).json({ success: false, message: '版本不存在' });
    }
    
    const page = await Page.findByIdAndUpdate(
      pageId,
      { schema: pageVersion.schema, updatedAt: Date.now() },
      { new: true }
    );
    
    res.json({ success: true, data: page, message: '版本回退成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/compare/:pageId', async (req, res) => {
  try {
    const { pageId } = req.params;
    const { version1, version2 } = req.query;
    
    const v1 = await PageVersion.findOne({ pageId, version: Number(version1) });
    const v2 = await PageVersion.findOne({ pageId, version: Number(version2) });
    
    if (!v1 || !v2) {
      return res.status(404).json({ success: false, message: '版本不存在' });
    }
    
    const diff = {
      components: {
        added: [],
        removed: [],
        modified: []
      },
      style: {
        before: v1.schema.style,
        after: v2.schema.style
      }
    };
    
    const v1Components = v1.schema.components || [];
    const v2Components = v2.schema.components || [];
    
    const v1Ids = new Set(v1Components.map(c => c.id));
    const v2Ids = new Set(v2Components.map(c => c.id));
    
    for (const comp of v2Components) {
      if (!v1Ids.has(comp.id)) {
        diff.components.added.push(comp);
      } else {
        const oldComp = v1Components.find(c => c.id === comp.id);
        if (JSON.stringify(oldComp) !== JSON.stringify(comp)) {
          diff.components.modified.push({ before: oldComp, after: comp });
        }
      }
    }
    
    for (const comp of v1Components) {
      if (!v2Ids.has(comp.id)) {
        diff.components.removed.push(comp);
      }
    }
    
    res.json({
      success: true,
      data: {
        version1: v1,
        version2: v2,
        diff
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const version = await PageVersion.findByIdAndDelete(req.params.id);
    if (!version) {
      return res.status(404).json({ success: false, message: '版本不存在' });
    }
    res.json({ success: true, message: '版本删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;