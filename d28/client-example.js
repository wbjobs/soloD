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

const notificationClient = new routingProto.NotificationService(
  'localhost:50053',
  grpc.credentials.createInsecure()
);

console.log('=== 测试订单服务 ===');

orderClient.createDeliveryPoint({
  order_id: 'ORDER_001',
  location: { latitude: 39.9042, longitude: 116.4074 },
  address: '北京市朝阳区xxx路1号',
  sequence: 1
}, (error, response) => {
  if (error) {
    console.error('创建送货点错误:', error.message);
  } else {
    console.log('创建送货点成功:', response);
  }
});

setTimeout(() => {
  orderClient.getDeliveryPoints({ order_id: 'ORDER_001' }, (error, response) => {
    if (error) {
      console.error('获取送货点错误:', error.message);
    } else {
      console.log('获取送货点列表:', response);
    }
  });
}, 1000);

console.log('\n=== 测试通知服务 - 订阅司机位置 ===');

const stream = notificationClient.subscribeDriverLocation({
  driver_id: 'DRIVER_001',
  order_id: 'ORDER_001'
});

stream.on('data', (update) => {
  console.log('收到司机位置更新:', update);
});

stream.on('error', (error) => {
  console.error('流错误:', error.message);
});

setTimeout(() => {
  console.log('\n=== 测试发布司机位置 ===');
  notificationClient.publishDriverLocation({
    driver_id: 'DRIVER_001',
    location: { latitude: 39.9142, longitude: 116.4174 },
    heading: 90,
    timestamp: Date.now()
  }, (error, response) => {
    if (error) {
      console.error('发布位置错误:', error.message);
    } else {
      console.log('发布位置成功:', response);
    }
  });
}, 2000);

setTimeout(() => {
  console.log('\n=== 测试完成 ===');
  stream.cancel();
}, 4000);
