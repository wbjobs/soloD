const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

app.use(bodyParser.json());

app.post('/alarm', (req, res) => {
  const { alarm, temperature, timestamp } = req.body;
  console.log('='.repeat(50));
  console.log('⚠️  收到高温告警!');
  console.log(`时间: ${timestamp}`);
  console.log(`温度: ${temperature}°C`);
  console.log(`告警: ${alarm}`);
  console.log('='.repeat(50));
  res.json({ status: 'success', message: '告警已接收' });
});

app.listen(PORT, () => {
  console.log(`告警服务器运行在 http://localhost:${PORT}`);
  console.log(`告警接收端点: POST http://localhost:${PORT}/alarm`);
});
