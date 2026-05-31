# Protein Structure Visualizer

一个基于React和Python Flask的全栈蛋白质结构可视化应用，支持PDB文件上传、3D渲染和生物信息分析。

## 功能特性

### 前端功能
- **3D蛋白质结构渲染**：使用Three.js加载并渲染PDB格式的蛋白质结构
- **交互控制**：支持鼠标旋转、缩放和平移
- **原子高亮**：点击或悬停显示原子详细信息
- **多种着色模式**：
  - 按元素类型着色
  - 按疏水性着色
  - 按静电势能着色
- **热力图可视化**：展示残基疏水性和电荷分布
- **文件上传模块**：支持PDB格式文件上传

### 后端功能
- **RESTful API**：提供文件上传和分析接口
- **PDB文件解析**：使用Biopython解析PDB文件
- **生物信息计算**：
  - 计算氨基酸疏水性
  - 计算静电势能
- **CORS支持**：跨域资源共享

## 项目结构

```
d31/
├── backend/
│   ├── app.py              # Flask后端主应用
│   ├── requirements.txt    # Python依赖
│   └── __pycache__/       # Python缓存目录
├── frontend/
│   ├── public/             # 静态资源目录
│   ├── src/
│   │   ├── components/
│   │   │   ├── ProteinViewer.js   # 3D蛋白质渲染组件
│   │   │   └── Heatmap.js         # 热力图组件
│   │   ├── App.js          # React主应用
│   │   ├── index.js        # 应用入口
│   │   └── index.css       # 全局样式
│   └── package.json        # Node.js依赖
└── README.md               # 项目说明文档
```

## 安装和运行

### 后端设置

1. 进入后端目录：
```bash
cd backend
```

2. 创建并激活虚拟环境（推荐）：
```bash
python -m venv venv
source venv/bin/activate  # Linux/Mac
# 或
venv\Scripts\activate     # Windows
```

3. 安装Python依赖：
```bash
pip install -r requirements.txt
```

4. 启动Flask服务器：
```bash
python app.py
```

后端将在 http://localhost:5000 运行

### 前端设置

1. 进入前端目录（新开终端）：
```bash
cd frontend
```

2. 安装Node.js依赖：
```bash
npm install
```

3. 启动React开发服务器：
```bash
npm start
```

前端将在 http://localhost:3000 运行

## API接口

### POST /api/upload
上传并解析PDB文件

**请求**：multipart/form-data，包含PDB文件

**响应**：
```json
{
  "success": true,
  "atoms": [
    {
      "name": "CA",
      "element": "C",
      "x": 1.23,
      "y": 4.56,
      "z": 7.89,
      "residue_id": 1,
      "residue_name": "ALA"
    }
  ],
  "residues": [
    {
      "id": 1,
      "name": "ALA",
      "chain": "A",
      "hydrophobicity": 1.8,
      "charge": 0
    }
  ],
  "filename": "protein.pdb"
}
```

### POST /api/analyze
分析蛋白质数据并计算统计信息

**请求**：
```json
{
  "atoms": [...],
  "residues": [...]
}
```

**响应**：
```json
{
  "success": true,
  "analysis": {
    "hydrophobicity": {
      "min": -4.5,
      "max": 4.5,
      "avg": 0.23,
      "values": [1.8, -3.5, ...]
    },
    "electrostatic": {
      "min": -1.0,
      "max": 1.0,
      "avg": 0.05,
      "values": [0, 1.0, ...]
    },
    "total_atoms": 1234,
    "total_residues": 150
  }
}
```

## 使用说明

1. **上传PDB文件**：
   - 点击"Select PDB File"按钮选择PDB文件
   - 点击"Upload & Analyze"开始处理

2. **3D视图操作**：
   - 左键拖动：旋转模型
   - 滚轮：缩放
   - 右键拖动：平移
   - 点击原子：高亮选中残基

3. **切换着色模式**：
   - Element：按化学元素着色
   - Hydrophobicity：按疏水性着色
   - Charge：按静电势能着色

4. **热力图**：
   - 显示每个残基的疏水性或电荷分布
   - 悬停或点击热力图单元格可在3D视图中高亮对应残基

## 技术栈

**前端**：
- React 18
- Three.js (3D渲染)
- Axios (HTTP客户端)
- OrbitControls (交互控制)

**后端**：
- Flask (Web框架)
- Biopython (生物信息学分析)
- NumPy (数值计算)
- Flask-CORS (跨域支持)

## 注意事项

- 确保后端和前端同时运行
- 仅支持标准PDB格式文件
- 大文件可能需要较长的处理时间
- 建议使用现代浏览器（Chrome、Firefox、Safari）以获得最佳性能

## 许可证

MIT License
