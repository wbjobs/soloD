require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

const pipelineRoutes = require('./routes/pipelines')(cache);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Powered-By', 'Pipeline-API');
  next();
});

mongoose.connect(process.env.MONGODB_URI, {
  maxPoolSize: 50,
  minPoolSize: 5,
  maxIdleTimeMS: 30000,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4
})
  .then(() => {
    console.log('Connected to MongoDB');
    mongoose.connection.db.command({ ping: 1 }).then(() => {
      console.log('MongoDB connection verified');
    });
  })
  .catch(err => console.error('MongoDB connection error:', err));

mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to DB');
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected');
});

app.use('/api/pipelines', pipelineRoutes);

app.delete('/api/cache/clear', (req, res) => {
  cache.flushAll();
  const keys = cache.keys();
  res.json({ 
    message: 'Cache cleared successfully',
    remainingKeys: keys.length
  });
});

app.get('/api/cache/stats', (req, res) => {
  const stats = cache.getStats();
  const keys = cache.keys();
  res.json({
    stats,
    keys: keys.slice(0, 50),
    totalKeys: keys.length
  });
});

app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({
    status: 'ok',
    database: dbStatus,
    timestamp: new Date().toISOString()
  });
});

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
