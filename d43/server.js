const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

app.use('/3dtiles', express.static(path.join(__dirname, '3dtiles'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json');
    } else if (filePath.endsWith('.b3dm')) {
      res.setHeader('Content-Type', 'application/octet-stream');
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
}));

app.get('/api/buildings/:id', (req, res) => {
  const buildingId = req.params.id;
  const buildingData = getBuildingMetadata(buildingId);
  
  if (buildingData) {
    res.json(buildingData);
  } else {
    res.status(404).json({ error: 'Building not found' });
  }
});

app.get('/api/buildings', (req, res) => {
  const buildings = getAllBuildings();
  res.json(buildings);
});

function getBuildingMetadata(buildingId) {
  const metadata = {
    'building_001': {
      id: 'building_001',
      name: '科技园区A座',
      type: '办公楼',
      floors: 25,
      height: 98.5,
      area: 45000,
      yearBuilt: 2020,
      address: '科技园区创新大道88号',
      owner: '科技创新发展有限公司',
      usage: '商业办公',
      status: '正常使用',
      lastInspection: '2024-01-15',
      materials: {
        structure: '钢筋混凝土框架',
        facade: '玻璃幕墙',
        roof: '钢结构'
      },
      facilities: ['电梯8部', '中央空调', '消防系统', '智能安防', '地下车位300个']
    },
    'building_002': {
      id: 'building_002',
      name: '研发中心B栋',
      type: '研发楼',
      floors: 12,
      height: 52.3,
      area: 28000,
      yearBuilt: 2021,
      address: '科技园区研发路168号',
      owner: '科技创新发展有限公司',
      usage: '研发实验',
      status: '正常使用',
      lastInspection: '2024-02-20',
      materials: {
        structure: '钢筋混凝土框架',
        facade: '铝板幕墙',
        roof: '混凝土屋面'
      },
      facilities: ['电梯4部', '中央空调', '实验室通风系统', '消防系统', '智能安防']
    },
    'building_003': {
      id: 'building_003',
      name: '员工公寓C区',
      type: '宿舍楼',
      floors: 8,
      height: 28.6,
      area: 15000,
      yearBuilt: 2019,
      address: '科技园区生活路88号',
      owner: '科技创新发展有限公司',
      usage: '员工宿舍',
      status: '正常使用',
      lastInspection: '2023-12-10',
      materials: {
        structure: '砖混结构',
        facade: '外墙涂料',
        roof: '平屋面'
      },
      facilities: ['电梯2部', '热水供应', '消防系统', '监控系统']
    }
  };
  
  return metadata[buildingId] || null;
}

function getAllBuildings() {
  return [
    { id: 'building_001', name: '科技园区A座', type: '办公楼', position: [116.3974, 39.9087, 0] },
    { id: 'building_002', name: '研发中心B栋', type: '研发楼', position: [116.3980, 39.9090, 0] },
    { id: 'building_003', name: '员工公寓C区', type: '宿舍楼', position: [116.3968, 39.9085, 0] }
  ];
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   3D Tiles BIM Server is running!                         ║
║                                                           ║
║   📡 Server:    http://localhost:${PORT}                    ║
║   🌐 Frontend:  http://localhost:${PORT}                    ║
║   🗂️  3D Tiles:  http://localhost:${PORT}/3dtiles            ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
