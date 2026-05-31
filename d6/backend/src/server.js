const express = require('express');
const cors = require('cors');
require('dotenv').config();

const poisRoutes = require('./routes/pois');
const pathfindingRoutes = require('./routes/pathfinding');
const heatmapRoutes = require('./routes/heatmap');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/pois', poisRoutes);
app.use('/api/pathfinding', pathfindingRoutes);
app.use('/api/heatmap', heatmapRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '3D City API is running' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
