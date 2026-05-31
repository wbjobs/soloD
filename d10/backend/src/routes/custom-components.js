const express = require('express');
const router = express.Router();
const CustomComponent = require('../models/CustomComponent');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../../uploads/custom-components');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

const upload = multer({ storage });

router.get('/', async (req, res) => {
  try {
    const { category, status, isSystem } = req.query;
    const query = {};
    if (category) query.category = category;
    if (status) query.status = status;
    if (isSystem !== undefined) query.isSystem = isSystem === 'true';
    
    const components = await CustomComponent.find(query).sort({ createdAt: -1 });
    res.json({ success: true, data: components });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const component = await CustomComponent.findById(req.params.id);
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
    const component = new CustomComponent({
      ...req.body,
      updatedAt: Date.now()
    });
    await component.save();
    res.json({ success: true, data: component });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    req.body.updatedAt = Date.now();
    const component = await CustomComponent.findByIdAndUpdate(
      req.params.id,
      req.body,
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

router.delete('/:id', async (req, res) => {
  try {
    const component = await CustomComponent.findByIdAndDelete(req.params.id);
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
    const component = await CustomComponent.findByIdAndUpdate(
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

router.post('/upload', upload.single('component'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '请上传组件文件' });
    }
    
    const componentData = JSON.parse(fs.readFileSync(req.file.path, 'utf8'));
    
    const component = new CustomComponent({
      ...componentData,
      updatedAt: Date.now()
    });
    await component.save();
    
    fs.unlinkSync(req.file.path);
    
    res.json({ success: true, data: component, message: '组件上传成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/export/:id', async (req, res) => {
  try {
    const component = await CustomComponent.findById(req.params.id);
    if (!component) {
      return res.status(404).json({ success: false, message: '组件不存在' });
    }
    
    const exportData = component.toObject();
    delete exportData._id;
    delete exportData.__v;
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${component.name}.json"`);
    res.send(JSON.stringify(exportData, null, 2));
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;