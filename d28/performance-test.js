const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const WebSocket = require('ws');

const PROTO_PATH = path.join(__dirname, 'proto/routing.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const routingProto = grpc.loadPackageDefinition(packageDefinition).routing;

const mapClient = new routingProto.MapService(
  'localhost:50052',
  grpc.credentials.createInsecure()
);

const notificationClient = new routingProto.NotificationService(
  'localhost:50053',
  grpc.credentials.createInsecure()
);

async function testMapServicePerformance() {
  console.log('\n=== 地图服务性能测试 ===\n');
  
  const testWaypoints = [
    { latitude: 39.9042, longitude: 116.4074 },
    { latitude: 39.9142, longitude: 116.4174 },
    { latitude: 39.9242, longitude: 116.4274 }
  ];
  
  const results = [];
  
  for (let i = 0; i < 10; i++) {
    const startTime = Date.now();
    await new Promise((resolve) => {
      mapClient.calculateRoute({ waypoints: testWaypoints }, (error, response) => {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        if (error) {
          console.log(`请求 ${i + 1}: 错误 - ${error.message}`);
        } else {
          console.log(`请求 ${i + 1}: ${duration}ms, 坐标点: ${response.coordinates.length}, 降级: ${response.is_fallback || false}`);
          results.push({ duration, is_fallback: response.is_fallback });
        }
        resolve();
      });
    });
    
    await new Promise(r => setTimeout(r, 200));
  }
  
  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  const fallbackCount = results.filter(r => r.is_fallback).length;
  
  console.log(`\n平均响应时间: ${avgDuration.toFixed(2)}ms`);
  console.log(`降级响应数: ${fallbackCount}/${results.length}`);
  console.log(`超时控制: 3000ms (超时自动降级)`);
  console.log(`熔断机制: 5次失败后熔断, 30秒后恢复`);
}

async function testNotificationServicePerformance() {
  console.log('\n=== 通知服务性能测试 ===\n');
  
  const wsConnections = [];
  const wsLatencies = [];
  
  for (let i = 0; i < 5; i++) {
    const ws = new WebSocket('ws://localhost:8080');
    wsConnections.push(ws);
    
    ws.on('message', (data) => {
      const receiveTime = Date.now();
      const update = JSON.parse(data);
      const latency = receiveTime - update.timestamp;
      wsLatencies.push(latency);
      console.log(`WebSocket 接收延迟: ${latency}ms`);
    });
    
    await new Promise((resolve) => ws.on('open', resolve));
    console.log(`WebSocket 连接 ${i + 1} 已建立`);
  }
  
  await new Promise(r => setTimeout(r, 500));
  
  const publishResults = [];
  
  for (let i = 0; i < 20; i++) {
    const startTime = Date.now();
    await new Promise((resolve) => {
      notificationClient.publishDriverLocation({
        driver_id: 'DRIVER_TEST',
        location: { latitude: 39.9042 + i * 0.001, longitude: 116.4074 + i * 0.001 },
        heading: 90,
        timestamp: Date.now()
      }, (error, response) => {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        if (error) {
          console.log(`推送 ${i + 1}: 错误 - ${error.message}`);
        } else {
          console.log(`推送 ${i + 1}: ${duration}ms, WebSocket客户端: ${response.websocket_clients}, 节流: ${response.throttled || false}`);
          publishResults.push({ 
            duration, 
            latency_ms: response.latency_ms,
            throttled: response.throttled 
          });
        }
        resolve();
      });
    });
    
    await new Promise(r => setTimeout(r, 100));
  }
  
  await new Promise(r => setTimeout(r, 1000));
  
  const avgPublishDuration = publishResults.reduce((sum, r) => sum + r.duration, 0) / publishResults.length;
  const throttledCount = publishResults.filter(r => r.throttled).length;
  
  console.log(`\n推送平均耗时: ${avgPublishDuration.toFixed(2)}ms`);
  console.log(`节流次数: ${throttledCount}/${publishResults.length} (节流阈值: 500ms)`);
  
  if (wsLatencies.length > 0) {
    const avgWsLatency = wsLatencies.reduce((sum, l) => sum + l, 0) / wsLatencies.length;
    console.log(`WebSocket平均延迟: ${avgWsLatency.toFixed(2)}ms`);
    console.log(`最大延迟: ${Math.max(...wsLatencies)}ms`);
    console.log(`最小延迟: ${Math.min(...wsLatencies)}ms`);
  }
  
  console.log(`\n优化措施:`);
  console.log(`- 批量推送: 每批50个客户端并发推送`);
  console.log(`- 节流控制: 同一司机500ms内只推送一次`);
  console.log(`- 异步推送: gRPC流使用setImmediate异步处理`);
  
  wsConnections.forEach(ws => ws.close());
}

async function main() {
  console.log('========== 性能优化验证测试 ==========');
  
  try {
    await testMapServicePerformance();
  } catch (e) {
    console.log('地图服务测试失败 (服务未启动?):', e.message);
  }
  
  try {
    await testNotificationServicePerformance();
  } catch (e) {
    console.log('通知服务测试失败 (服务未启动?):', e.message);
  }
  
  console.log('\n========== 测试完成 ==========');
}

main();
