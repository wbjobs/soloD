const ModbusRTU = require('modbus-serial');

const SLAVE_CONFIG = {
  minDelay: 50,
  maxDelay: 200,
  simulateTimeout: false,
  timeoutChance: 0.1
};

let requestCount = 0;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function simulateNetworkDelay() {
  requestCount++;
  
  if (SLAVE_CONFIG.simulateTimeout && Math.random() < SLAVE_CONFIG.timeoutChance) {
    console.log(`[模拟超时] 请求 #${requestCount} 将不响应以模拟网络故障`);
    await sleep(10000);
    return;
  }
  
  const delay = Math.random() * (SLAVE_CONFIG.maxDelay - SLAVE_CONFIG.minDelay) + SLAVE_CONFIG.minDelay;
  await sleep(delay);
}

const vector = {
  getInputRegister: async function(addr, unitID) {
    await simulateNetworkDelay();
    return getSimulatedData(addr);
  },
  getHoldingRegister: async function(addr, unitID) {
    await simulateNetworkDelay();
    return getSimulatedData(addr);
  },
  getCoil: function(addr, unitID) {
    return false;
  },
  getDiscreteInput: function(addr, unitID) {
    return false;
  },
  setRegister: function(addr, value, unitID) {
    console.log(`设置寄存器 ${addr}: ${value}`);
    return true;
  },
  setCoil: function(addr, value, unitID) {
    return true;
  }
};

function getSimulatedData(addr) {
  const baseTemp = 250;
  const basePressure = 10000;
  
  const tempVariation = Math.sin(Date.now() / 5000) * 20;
  const pressureVariation = Math.cos(Date.now() / 7000) * 500;

  switch(addr) {
    case 0:
      return Math.round(baseTemp + tempVariation);
    case 2:
      return Math.round(basePressure + pressureVariation);
    default:
      return 0;
  }
}

const serverTCP = new ModbusRTU.ServerTCP(vector, { 
  host: '0.0.0.0', 
  port: 502, 
  debug: false,
  unitID: 1
});

serverTCP.on('initialized', function() {
  console.log('Modbus TCP从机已启动，监听端口 502');
  console.log('模拟寄存器地址:');
  console.log('  0 - 温度 (x10)');
  console.log('  2 - 压力 (x100)');
  console.log('');
  console.log('网络模拟配置:');
  console.log(`  - 响应延迟范围: ${SLAVE_CONFIG.minDelay}ms ~ ${SLAVE_CONFIG.maxDelay}ms`);
  console.log(`  - 超时模拟: ${SLAVE_CONFIG.simulateTimeout ? '已开启' : '已关闭'}`);
  if (SLAVE_CONFIG.simulateTimeout) {
    console.log(`  - 超时概率: ${SLAVE_CONFIG.timeoutChance * 100}%`);
  }
});

serverTCP.on('error', function(err) {
  console.error('从机错误:', err.message);
});
