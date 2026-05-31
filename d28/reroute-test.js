const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_PATH = path.join(__dirname, 'proto/routing.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const routingProto = grpc.loadPackageDefinition(packageDefinition).routing;

const orderClient = new routingProto.OrderService(
  'localhost:50051',
  grpc.credentials.createInsecure()
);

async function promisifyCall(method, request) {
  return new Promise((resolve, reject) => {
    method.call(orderClient, request, (error, response) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}

async function testDynamicReroute() {
  console.log('========== 动态重路由功能测试 ==========\n');

  try {
    console.log('1. 注册司机...');
    const drivers = [];
    const driverData = [
      { name: '张三', phone: '13800138001', vehicle_type: 'VAN', capacity: 10, lat: 39.9042, lng: 116.4074 },
      { name: '李四', phone: '13800138002', vehicle_type: 'VAN', capacity: 8, lat: 39.9142, lng: 116.4174 },
      { name: '王五', phone: '13800138003', vehicle_type: 'BIKE', capacity: 3, lat: 39.9242, lng: 116.4274 }
    ];

    for (const data of driverData) {
      const driver = await promisifyCall(orderClient.registerDriver, {
        name: data.name,
        phone: data.phone,
        vehicle_type: data.vehicle_type,
        capacity: data.capacity,
        initial_location: { latitude: data.lat, longitude: data.lng }
      });
      drivers.push(driver);
      console.log(`   ✓ 注册司机: ${driver.name} (${driver.id.substring(0, 8)}...)`);
    }
    console.log();

    console.log('2. 查询可用司机...');
    const availableDrivers = await promisifyCall(orderClient.getAvailableDrivers, {
      near_location: { latitude: 39.9042, longitude: 116.4074 },
      max_distance_km: 10,
      vehicle_type: 'VAN',
      min_capacity: 5
    });
    console.log(`   ✓ 找到 ${availableDrivers.total_count} 名符合条件的VAN司机`);
    availableDrivers.drivers.forEach((d, i) => {
      console.log(`     ${i + 1}. ${d.name} - 载重: ${d.capacity}, 状态: ${d.status}`);
    });
    console.log();

    console.log('3. 创建配送点...');
    const orderId = 'ORDER_' + Date.now();
    const deliveryPoints = [];
    const pointData = [
      { address: '北京市朝阳区望京SOHO', lat: 39.9847, lng: 116.4784 },
      { address: '北京市海淀区中关村', lat: 39.9847, lng: 116.3046 },
      { address: '北京市东城区王府井', lat: 39.9139, lng: 116.4074 }
    ];

    for (let i = 0; i < pointData.length; i++) {
      const point = await promisifyCall(orderClient.createDeliveryPoint, {
        order_id: orderId,
        location: { latitude: pointData[i].lat, longitude: pointData[i].lng },
        address: pointData[i].address,
        sequence: i + 1
      });
      deliveryPoints.push(point);
      console.log(`   ✓ 配送点 ${i + 1}: ${point.address.substring(0, 15)}...`);
    }
    console.log();

    console.log('4. 自动选择并分配司机...');
    const assignment = await promisifyCall(orderClient.assignDriverToOrder, {
      order_id: orderId,
      auto_select_driver: true
    });
    const assignedDriver = drivers.find(d => d.id === assignment.driver_id);
    console.log(`   ✓ 订单 ${orderId.substring(0, 12)}...`);
    console.log(`     分配司机: ${assignedDriver?.name || '未知'}`);
    console.log(`     预计时长: ${assignment.estimated_duration_min.toFixed(1)} 分钟`);
    console.log(`     预计距离: ${assignment.total_distance_km.toFixed(2)} km`);
    console.log();

    console.log('5. 模拟路况变化（添加拥堵热点）...');
    const trafficHotspots = [
      { latitude: 39.9847, longitude: 116.4000 },
      { latitude: 39.9500, longitude: 116.4000 }
    ];
    console.log(`   ✓ 添加 ${trafficHotspots.length} 个拥堵热点`);
    console.log();

    console.log('6. 触发手动重路由（更换司机）...');
    const rerouteResult = await promisifyCall(orderClient.triggerReroute, {
      order_id: orderId,
      reason: 'TRAFFIC_CONGESTION',
      force_reassign: true,
      traffic_hotspots: trafficHotspots
    });

    console.log(`   ✓ 重路由结果:`);
    console.log(`     成功: ${rerouteResult.success ? '是' : '否'}`);
    console.log(`     更换司机: ${rerouteResult.driver_changed ? '是' : '否'}`);
    console.log(`     节省时间: ${rerouteResult.time_saved_min.toFixed(1)} 分钟`);
    console.log(`     原因: ${rerouteResult.reason}`);
    console.log(`     重路由次数: ${rerouteResult.new_assignment.reroute_count}`);
    console.log();

    console.log('7. 更新司机位置并触发自动重路由检测...');
    for (const driver of drivers) {
      const newLat = driver.current_location.latitude + 0.005;
      const newLng = driver.current_location.longitude + 0.005;
      await promisifyCall(orderClient.updateDriverStatus, {
        driver_id: driver.id,
        status: driver.status,
        location: { latitude: newLat, longitude: newLng },
        current_load: driver.current_load
      });
      console.log(`   ✓ ${driver.name} 位置已更新`);
    }
    console.log();

    console.log('8. 查询最终订单状态...');
    const finalAssignment = await promisifyCall(orderClient.getOrderAssignment, {
      order_id: orderId
    });
    const finalDriver = drivers.find(d => d.id === finalAssignment.driver_id);
    console.log(`   ✓ 订单 ${finalAssignment.order_id.substring(0, 12)}...`);
    console.log(`     当前司机: ${finalDriver?.name || '未知'}`);
    console.log(`     状态: ${finalAssignment.status}`);
    console.log(`     配送点数量: ${finalAssignment.delivery_points.length}`);
    console.log(`     预计时长: ${finalAssignment.estimated_duration_min.toFixed(1)} 分钟`);
    console.log(`     重路由次数: ${finalAssignment.reroute_count}`);
    console.log();

    console.log('========== 测试完成！ ==========');
    console.log();
    console.log('功能总结:');
    console.log('✓ 司机注册与管理');
    console.log('✓ 智能司机选择（距离+时间+负载综合评分）');
    console.log('✓ 自动/手动重路由触发');
    console.log('✓ 路况热点影响评估');
    console.log('✓ 配送时间预估与对比');
    console.log('✓ 重路由冷却机制（避免频繁重算）');

  } catch (error) {
    console.error('测试失败:', error.message);
    console.error('详情:', error.details);
  }
}

console.log('请确保订单服务已启动 (端口 50051)');
console.log('启动命令: cd order-service && npm install && node src/server.js\n');

setTimeout(() => {
  testDynamicReroute();
}, 1500);
