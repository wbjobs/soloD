const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const VoxelScene = require('./models/VoxelScene');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

mongoose.connect('mongodb://localhost:27017/voxelEditor', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB 连接成功'))
.catch(err => console.error('MongoDB 连接失败:', err));

app.post('/api/scenes', async (req, res) => {
  try {
    const { name, voxels } = req.body;
    
    let scene;
    const existingScene = await VoxelScene.findOne().sort({ createdAt: -1 });
    
    if (existingScene) {
      existingScene.name = name || existingScene.name;
      existingScene.voxels = voxels;
      existingScene.updatedAt = Date.now();
      scene = await existingScene.save();
    } else {
      scene = new VoxelScene({
        name: name || '默认场景',
        voxels
      });
      await scene.save();
    }
    
    res.json({ success: true, sceneId: scene._id, message: '保存成功' });
  } catch (error) {
    console.error('保存场景错误:', error);
    res.status(500).json({ success: false, message: '保存失败', error: error.message });
  }
});

app.get('/api/scenes/latest', async (req, res) => {
  try {
    const scene = await VoxelScene.findOne().sort({ createdAt: -1 });
    
    if (scene) {
      res.json({
        success: true,
        scene: {
          id: scene._id,
          name: scene.name,
          voxels: scene.voxels,
          createdAt: scene.createdAt,
          updatedAt: scene.updatedAt
        }
      });
    } else {
      res.json({ success: true, scene: null, message: '没有找到已保存的场景' });
    }
  } catch (error) {
    console.error('加载场景错误:', error);
    res.status(500).json({ success: false, message: '加载失败', error: error.message });
  }
});

app.get('/api/scenes', async (req, res) => {
  try {
    const scenes = await VoxelScene.find().sort({ createdAt: -1 }).select('_id name createdAt updatedAt');
    res.json({ success: true, scenes });
  } catch (error) {
    console.error('获取场景列表错误:', error);
    res.status(500).json({ success: false, message: '获取失败', error: error.message });
  }
});

app.get('/api/scenes/:id', async (req, res) => {
  try {
    const scene = await VoxelScene.findById(req.params.id);
    
    if (scene) {
      res.json({
        success: true,
        scene: {
          id: scene._id,
          name: scene.name,
          voxels: scene.voxels,
          createdAt: scene.createdAt,
          updatedAt: scene.updatedAt
        }
      });
    } else {
      res.status(404).json({ success: false, message: '场景不存在' });
    }
  } catch (error) {
    console.error('获取场景错误:', error);
    res.status(500).json({ success: false, message: '获取失败', error: error.message });
  }
});

app.delete('/api/scenes/:id', async (req, res) => {
  try {
    await VoxelScene.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('删除场景错误:', error);
    res.status(500).json({ success: false, message: '删除失败', error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
