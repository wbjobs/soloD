require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const connectDB = require('./config/db');

const projectRoutes = require('./routes/projects');
const pageRoutes = require('./routes/pages');
const componentRoutes = require('./routes/components');
const renderRoutes = require('./routes/render');
const customComponentRoutes = require('./routes/custom-components');
const pageVersionRoutes = require('./routes/page-versions');
const userRoutes = require('./routes/users');
const permissionRoutes = require('./routes/permissions');

const app = express();

connectDB();

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api/projects', projectRoutes);
app.use('/api/pages', pageRoutes);
app.use('/api/components', componentRoutes);
app.use('/api/render', renderRoutes);
app.use('/api/custom-components', customComponentRoutes);
app.use('/api/page-versions', pageVersionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/permissions', permissionRoutes);

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: '低代码平台后端服务运行正常' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
});