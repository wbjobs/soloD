const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const ModbusRTU = require('modbus-serial');
const cors = require('cors');
const { InfluxDB, Point, HttpError } = require('@influxdata/influxdb-client');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const modbusClient = new ModbusRTU();

const MODBUS_CONFIG = {
  host: '127.0.0.1',
  port: 502,
  unitId: 1,
  pollInterval: 1000,
  connectTimeout: 3000,
  readTimeout: 2000
};

const INFLUXDB_CONFIG = {
  url: 'http://localhost:8086',
  token: 'my-super-secret-auth-token',
  org: 'my-org',
  bucket: 'modbus-monitor',
  enabled: true
};

let isConnected = false;
let pollTimeout = null;
let isReading = false;
let influxDBReady = false;

let influxWriteApi = null;
let influxQueryApi = null;

function initInfluxDB() {
  if (!INFLUXDB_CONFIG.enabled) {
    console.log('InfluxDB 已禁用');
    return;
  }
  
  try {
    const influxDB = new InfluxDB({
      url: INFLUXDB_CONFIG.url,
      token: INFLUXDB_CONFIG.token
    });
    
    influxWriteApi = influxDB.getWriteApi(INFLUXDB_CONFIG.org, INFLUXDB_CONFIG.bucket);
    influxWriteApi.useDefaultTags({ source: 'modbus-monitor' });
    
    influxQueryApi = influxDB.getQueryApi(INFLUXDB_CONFIG.org);
    
    influxDBReady = true;
    console.log('InfluxDB 初始化成功');
  } catch (err) {
    console.error('InfluxDB 初始化失败:', err.message);
    influxDBReady = false;
  }
}

async function writeToInfluxDB(data) {
  if (!INFLUXDB_CONFIG.enabled || !influxDBReady || !influxWriteApi) {
    return;
  }
  
  try {
    const point = new Point('sensor_data')
      .timestamp(new Date(data.timestamp))
      .floatField('temperature', data.temperature)
      .floatField('pressure', data.pressure);
    
    influxWriteApi.writePoint(point);
    await influxWriteApi.flush();
  } catch (err) {
    if (err instanceof HttpError && err.statusCode === 404) {
      console.warn('InfluxDB 数据库/组织不存在，数据将被缓存');
    } else {
      console.error('写入InfluxDB失败:', err.message);
    }
  }
}

async function queryHistoryData(startTime, endTime) {
  if (!INFLUXDB_CONFIG.enabled || !influxDBReady || !influxQueryApi) {
    return [];
  }
  
  try {
    const query = `
      from(bucket: "${INFLUXDB_CONFIG.bucket}")
        |> range(start: ${startTime}, stop: ${endTime})
        |> filter(fn: (r) => r._measurement == "sensor_data")
        |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
        |> sort(columns: ["_time"])
    `;
    
    const result = await influxQueryApi.collectRows(query);
    return result.map(row => ({
      timestamp: row._time,
      temperature: row.temperature || null,
      pressure: row.pressure || null
    }));
  } catch (err) {
    console.error('查询InfluxDB失败:', err.message);
    return [];
  }
}

function withTimeout(promise, timeoutMs, operationName) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`${operationName}超时 (${timeoutMs}ms)`));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        reject(err);
      });
  });
}

function connectModbus() {
  return new Promise((resolve, reject) => {
    modbusClient.connectTCP(MODBUS_CONFIG.host, { port: MODBUS_CONFIG.port }, (err) => {
      if (err) {
        console.error('Modbus连接失败:', err.message);
        isConnected = false;
        reject(err);
      } else {
        modbusClient.setID(MODBUS_CONFIG.unitId);
        modbusClient.setTimeout(MODBUS_CONFIG.readTimeout);
        isConnected = true;
        console.log('Modbus TCP连接成功');
        resolve();
      }
    });
  });
}

async function safeConnectModbus() {
  try {
    await withTimeout(
      connectModbus(),
      MODBUS_CONFIG.connectTimeout,
      'Modbus连接'
    );
    return true;
  } catch (err) {
    console.error('Modbus连接超时或失败:', err.message);
    isConnected = false;
    return false;
  }
}

async function readRegisters() {
  if (isReading) {
    console.log('跳过轮询: 上一次读取尚未完成');
    return null;
  }

  isReading = true;

  try {
    if (!isConnected) {
      const connected = await safeConnectModbus();
      if (!connected) {
        return null;
      }
    }

    const tempResult = await withTimeout(
      modbusClient.readHoldingRegisters(0, 2),
      MODBUS_CONFIG.readTimeout,
      '读取温度寄存器'
    );

    const pressureResult = await withTimeout(
      modbusClient.readHoldingRegisters(2, 2),
      MODBUS_CONFIG.readTimeout,
      '读取压力寄存器'
    );

    const temperature = tempResult.data[0] / 10.0;
    const pressure = pressureResult.data[0] / 100.0;

    return {
      temperature,
      pressure,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error('读取寄存器失败:', err.message);
    isConnected = false;
    return null;
  } finally {
    isReading = false;
  }
}

function broadcastData(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(data));
      } catch (err) {
        console.error('WebSocket发送失败:', err.message);
      }
    }
  });
}

async function pollCycle() {
  const data = await readRegisters();
  if (data) {
    broadcastData(data);
    writeToInfluxDB(data).catch(err => {
      console.error('异步写入InfluxDB失败:', err.message);
    });
  }
  pollTimeout = setTimeout(pollCycle, MODBUS_CONFIG.pollInterval);
}

function startPolling() {
  if (pollTimeout) {
    clearTimeout(pollTimeout);
  }
  pollTimeout = setTimeout(pollCycle, 100);
}

function stopPolling() {
  if (pollTimeout) {
    clearTimeout(pollTimeout);
    pollTimeout = null;
  }
}

app.get('/api/status', (req, res) => {
  res.json({ 
    connected: isConnected,
    reading: isReading,
    influxDBReady: influxDBReady
  });
});

app.get('/api/data', async (req, res) => {
  const timeoutId = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ error: '请求超时', connected: isConnected });
    }
  }, 5000);

  try {
    const data = await readRegisters();
    clearTimeout(timeoutId);
    
    if (data) {
      res.json(data);
    } else {
      res.status(503).json({ 
        error: '暂时无法读取数据',
        connected: isConnected
      });
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: '服务内部错误',
        message: err.message 
      });
    }
  }
});

app.get('/api/history', async (req, res) => {
  const { start, end } = req.query;
  
  if (!start || !end) {
    return res.status(400).json({ error: '缺少start或end参数' });
  }

  try {
    const startTime = new Date(start);
    const endTime = new Date(end);
    
    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      return res.status(400).json({ error: '无效的时间格式' });
    }

    const data = await queryHistoryData(startTime.toISOString(), endTime.toISOString());
    res.json(data);
  } catch (err) {
    console.error('查询历史数据失败:', err.message);
    res.status(500).json({ error: '查询失败', message: err.message });
  }
});

app.get('/api/history/summary', async (req, res) => {
  const { start, end } = req.query;
  
  const defaultEnd = new Date();
  const defaultStart = new Date(defaultEnd.getTime() - 24 * 60 * 60 * 1000);
  
  const startTime = start ? new Date(start) : defaultStart;
  const endTime = end ? new Date(end) : defaultEnd;

  try {
    const data = await queryHistoryData(startTime.toISOString(), endTime.toISOString());
    
    if (data.length === 0) {
      return res.json({
        count: 0,
        avgTemperature: null,
        maxTemperature: null,
        minTemperature: null,
        avgPressure: null,
        maxPressure: null,
        minPressure: null,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString()
      });
    }

    const temps = data.filter(d => d.temperature !== null).map(d => d.temperature);
    const pressures = data.filter(d => d.pressure !== null).map(d => d.pressure);

    res.json({
      count: data.length,
      avgTemperature: temps.length > 0 ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(2) : null,
      maxTemperature: temps.length > 0 ? Math.max(...temps).toFixed(2) : null,
      minTemperature: temps.length > 0 ? Math.min(...temps).toFixed(2) : null,
      avgPressure: pressures.length > 0 ? (pressures.reduce((a, b) => a + b, 0) / pressures.length).toFixed(2) : null,
      maxPressure: pressures.length > 0 ? Math.max(...pressures).toFixed(2) : null,
      minPressure: pressures.length > 0 ? Math.min(...pressures).toFixed(2) : null,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString()
    });
  } catch (err) {
    console.error('查询历史数据摘要失败:', err.message);
    res.status(500).json({ error: '查询失败', message: err.message });
  }
});

wss.on('connection', (ws) => {
  console.log('WebSocket客户端已连接');
  
  ws.on('close', () => {
    console.log('WebSocket客户端已断开');
  });

  ws.on('error', (err) => {
    console.error('WebSocket错误:', err.message);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, async () => {
  console.log(`服务器运行在端口 ${PORT}`);
  console.log(`配置信息: 连接超时=${MODBUS_CONFIG.connectTimeout}ms, 读取超时=${MODBUS_CONFIG.readTimeout}ms, 轮询间隔=${MODBUS_CONFIG.pollInterval}ms`);
  
  initInfluxDB();
  
  try {
    await safeConnectModbus();
    startPolling();
  } catch (err) {
    console.log('初始Modbus连接失败，将在轮询中重试');
    startPolling();
  }
});

process.on('SIGTERM', () => {
  console.log('收到关闭信号，正在清理...');
  stopPolling();
  
  if (influxWriteApi) {
    influxWriteApi.close().catch(() => {});
  }
  
  if (modbusClient.isOpen) {
    modbusClient.close();
  }
  
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});
