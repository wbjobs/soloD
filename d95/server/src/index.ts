import express from 'express';
import cors from 'cors';
import analyzeRoutes from './routes/analyze';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
  exposedHeaders: ['Content-Type', 'Transfer-Encoding', 'X-Session-Id'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/analyze', analyzeRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'security-report-api'
  });
});

app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`安全报告分析服务已启动`);
  console.log(`========================================`);
  console.log(`服务地址: http://localhost:${PORT}`);
  console.log(`健康检查: http://localhost:${PORT}/api/health`);
  console.log(`分析接口: http://localhost:${PORT}/api/analyze`);
  console.log(`========================================`);
});
