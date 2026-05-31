// 模拟测试统计数据验证逻辑
class MockWebRTCManager {
  constructor() {
    this.validStatsHistory = {
      packetLoss: [],
      rtt: [],
      bytesSent: [],
      bytesReceived: []
    };
    this.MAX_HISTORY_SIZE = 3;
    this.WEIGHTS = [0.5, 0.3, 0.2];
  }

  isValidNumber(value) {
    return typeof value === 'number' && !isNaN(value) && isFinite(value);
  }

  calculateWeightedAverage(history) {
    if (history.length === 0) return 0;
    
    let sum = 0;
    let weightSum = 0;
    const availableWeights = this.WEIGHTS.slice(0, history.length);
    
    for (let i = 0; i < history.length; i++) {
      sum += history[i] * availableWeights[i];
      weightSum += availableWeights[i];
    }
    
    return weightSum > 0 ? sum / weightSum : 0;
  }

  addToHistory(field, value) {
    const history = this.validStatsHistory[field];
    history.unshift(value);
    if (history.length > this.MAX_HISTORY_SIZE) {
      history.pop();
    }
  }

  getValidValue(field, currentValue, fieldName) {
    if (this.isValidNumber(currentValue)) {
      this.addToHistory(field, currentValue);
      return currentValue;
    } else {
      const fallbackValue = this.calculateWeightedAverage(this.validStatsHistory[field]);
      console.log(`[Test] ${fieldName} 值异常: ${currentValue}, 使用历史加权平均值作为降级方案: ${fallbackValue}`);
      return fallbackValue;
    }
  }
}

// 测试用例
function runTests() {
  console.log('=== 开始统计数据验证测试 ===\n');
  
  const manager = new MockWebRTCManager();

  console.log('测试1: 正常值应该直接通过并存储到历史记录');
  let result = manager.getValidValue('packetLoss', 0.01, '丢包率');
  console.assert(result === 0.01, `期望 0.01, 实际 ${result}`);
  console.assert(manager.validStatsHistory.packetLoss.length === 1, '历史记录应该有1条');
  console.log('✓ 测试1通过\n');

  console.log('测试2: NaN值应该使用历史加权平均值');
  result = manager.getValidValue('packetLoss', NaN, '丢包率');
  console.assert(result === 0.01, `期望 0.01, 实际 ${result}`);
  console.log('✓ 测试2通过\n');

  console.log('测试3: 添加更多历史记录');
  manager.getValidValue('packetLoss', 0.02, '丢包率');
  manager.getValidValue('packetLoss', 0.03, '丢包率');
  console.assert(manager.validStatsHistory.packetLoss.length === 3, '历史记录应该有3条');
  console.log('✓ 测试3通过\n');

  console.log('测试4: 验证加权平均计算 (权重: 0.5, 0.3, 0.2)');
  result = manager.getValidValue('packetLoss', NaN, '丢包率');
  const expected = 0.03 * 0.5 + 0.02 * 0.3 + 0.01 * 0.2;
  console.log(`  期望值: ${expected}, 实际值: ${result}`);
  console.assert(Math.abs(result - expected) < 0.0001, `加权平均计算不正确`);
  console.log('✓ 测试4通过\n');

  console.log('测试5: 验证RTT的有效性检查');
  result = manager.getValidValue('rtt', 100, 'RTT');
  console.assert(result === 100, `期望 100, 实际 ${result}`);
  result = manager.getValidValue('rtt', NaN, 'RTT');
  console.assert(result === 100, `期望 100, 实际 ${result}`);
  console.log('✓ 测试5通过\n');

  console.log('测试6: 验证undefined值处理');
  result = manager.getValidValue('rtt', undefined, 'RTT');
  console.assert(manager.isValidNumber(result), '结果应该是有效的数字');
  console.log('✓ 测试6通过\n');

  console.log('测试7: 验证Infinity值处理');
  result = manager.getValidValue('rtt', Infinity, 'RTT');
  console.assert(manager.isValidNumber(result), '结果应该是有效的数字');
  console.log('✓ 测试7通过\n');

  console.log('测试8: 验证空历史记录时的降级（返回0）');
  const newManager = new MockWebRTCManager();
  result = newManager.getValidValue('bytesSent', NaN, '发送字节数');
  console.assert(result === 0, `期望 0, 实际 ${result}`);
  console.log('✓ 测试8通过\n');

  console.log('=== 所有测试通过! ===');
}

runTests();
