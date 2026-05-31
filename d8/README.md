# 流体力学模拟可视化平台

基于格子玻尔兹曼方法 (Lattice Boltzmann Method, LBM) 的实时流体力学模拟可视化平台。

## 功能特性

### 后端功能
- ✅ 基于 D2Q9 格子玻尔兹曼模型的流体模拟
- ✅ 可配置的模拟参数：网格尺寸、粘度、入口速度
- ✅ 模拟结果数据存储和查询接口
- ✅ RESTful API 设计

### 前端功能
- ✅ 实时模拟可视化
- ✅ 速度场、压力场、涡量场展示
- ✅ 速度矢量叠加显示
- ✅ 模拟参数实时调整
- ✅ 模拟结果保存与回放
- ✅ 模拟对比功能
- ✅ 响应式界面设计

## 技术栈

### 后端
- **Python 3.8+** - 编程语言
- **FastAPI** - Web 框架
- **NumPy** - 数值计算
- **Uvicorn** - ASGI 服务器

### 前端
- **React 18** - UI 框架
- **React Router** - 路由管理
- **Axios** - HTTP 客户端
- **HTML5 Canvas** - 可视化渲染

## 项目结构

```
.
├── backend/                    # 后端目录
│   ├── app/
│   │   ├── lbm_simulator.py   # LBM 核心算法
│   │   ├── data_storage.py    # 数据存储模块
│   │   └── main.py            # FastAPI 主程序
│   ├── data/                  # 数据存储目录
│   └── requirements.txt       # Python 依赖
├── frontend/                   # 前端目录
│   ├── public/                # 静态资源
│   ├── src/
│   │   ├── components/        # React 组件
│   │   ├── pages/             # 页面组件
│   │   ├── services/          # API 服务
│   │   └── utils/             # 工具函数
│   └── package.json           # Node.js 依赖
└── README.md
```

## 安装与运行

### 后端安装

1. 进入后端目录：
```bash
cd backend
```

2. 创建虚拟环境（推荐）：
```bash
python -m venv venv
# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate
```

3. 安装依赖：
```bash
pip install -r requirements.txt
```

4. 运行后端服务器：
```bash
cd app
python main.py
```

后端服务器将在 `http://localhost:8000` 启动。

API 文档地址：`http://localhost:8000/docs`

### 前端安装

1. 进入前端目录：
```bash
cd frontend
```

2. 安装依赖：
```bash
npm install
```

3. 运行开发服务器：
```bash
npm start
```

前端将在 `http://localhost:3000` 启动。

## 算法说明

### 格子玻尔兹曼方法 (LBM)

LBM 是一种基于介观尺度的流体模拟方法，通过模拟粒子分布函数的演化来求解流体力学问题。

#### D2Q9 模型
本项目使用 D2Q9（二维 9 速度）模型：

- 9 个离散速度方向：
  ```
  6  2  5
   \ | /
  3--0--1
   / | \
  7  4  8
  ```

- 权重系数：
  - 中心格点 (0): 4/9
  - 轴方向格点 (1-4): 1/9
  - 对角线格点 (5-8): 1/36

#### 主要物理量
1. **密度 ρ**：所有方向粒子分布函数之和
2. **速度 u**：密度加权平均速度
3. **压力 p**：通过状态方程 p = c_s² * ρ 计算，其中 c_s = 1/√3

#### 碰撞与流动
1. **碰撞步骤**：使用 BGK 近似向平衡分布函数松弛
   ```
   f_i(x, t + Δt) = f_i(x, t) - (f_i(x, t) - f_i^eq(x, t)) / τ
   ```
   其中 τ 为松弛时间，与粘度 ν 的关系：τ = 3ν + 0.5

2. **流动步骤**：粒子向各方向流动
   ```
   f_i(x + e_i, t + Δt) = f_i(x, t + Δt)
   ```

#### 边界条件
- **入口边界**：使用 Zou-He 边界条件施加速度
- **出口边界**：零梯度边界条件
- **障碍物**：反弹边界条件 (bounce-back)

## API 接口

### 模拟相关
- `POST /api/simulations` - 创建新模拟
- `GET /api/simulations/{sim_id}` - 获取模拟信息
- `GET /api/simulations/{sim_id}/state` - 获取模拟当前状态
- `POST /api/simulations/{sim_id}/step` - 执行模拟步骤
- `POST /api/simulations/{sim_id}/reset` - 重置模拟
- `POST /api/simulations/{sim_id}/parameters` - 更新参数
- `POST /api/simulations/{sim_id}/save` - 保存模拟结果

### 存储相关
- `GET /api/saved` - 获取所有保存的模拟
- `GET /api/saved/{saved_id}` - 加载保存的模拟
- `DELETE /api/saved/{saved_id}` - 删除保存的模拟

### 算法信息
- `GET /api/algorithms/lbm` - 获取 LBM 算法信息

## 使用说明

### 实时模拟
1. 在参数面板配置网格大小、粘度、入口速度
2. 点击「创建新模拟」或「应用参数」
3. 点击「开始」按钮启动实时模拟
4. 使用控制面板调整步长、场类型等显示选项
5. 点击「保存模拟」可保存当前模拟的所有帧

### 回放与对比
1. 在左侧列表选择已保存的模拟
2. 使用播放控件进行回放
3. 可拖动滑块定位到任意帧
4. 勾选「启用对比模式」可选择第二个模拟进行对比

## 常见问题

**Q: 模拟运行卡顿怎么办？**
A: 尝试减小网格尺寸或增大步长。

**Q: 模拟结果不稳定怎么办？**
A: 检查粘度设置，粘度不宜过小。入口速度也应保持在合理范围（0.01-0.3）。

**Q: 保存的模拟文件在哪里？**
A: 保存在 `backend/data/simulations/` 目录下，使用 Python pickle 格式。

## 许可证

MIT License
