const mongoose = require('mongoose');
const Pipeline = require('./models/Pipeline');
require('dotenv').config();

const samplePipelines = [
  {
    name: '给水管线A1',
    type: 'water',
    material: 'PE',
    diameter: 300,
    installationDate: new Date('2018-05-15'),
    depth: 2.5,
    coordinates: {
      type: 'LineString',
      coordinates: [
        [116.395, 39.907],
        [116.396, 39.9075],
        [116.397, 39.908],
        [116.398, 39.9085],
        [116.399, 39.909]
      ]
    },
    maintenanceRecords: [
      {
        date: new Date('2020-03-10'),
        description: '例行检查，无异常',
        technician: '张三',
        cost: 500
      },
      {
        date: new Date('2022-08-22'),
        description: '更换阀门',
        technician: '李四',
        cost: 2800
      }
    ],
    status: 'active'
  },
  {
    name: '排水管线B2',
    type: 'sewage',
    material: '混凝土',
    diameter: 800,
    installationDate: new Date('2015-11-20'),
    depth: 4.2,
    coordinates: {
      type: 'LineString',
      coordinates: [
        [116.396, 39.906],
        [116.397, 39.907],
        [116.398, 39.908],
        [116.399, 39.909],
        [116.400, 39.910]
      ]
    },
    maintenanceRecords: [
      {
        date: new Date('2021-06-15'),
        description: '管道清淤',
        technician: '王五',
        cost: 3500
      }
    ],
    status: 'active'
  },
  {
    name: '燃气管线C3',
    type: 'gas',
    material: '钢管',
    diameter: 200,
    installationDate: new Date('2019-02-28'),
    depth: 1.8,
    coordinates: {
      type: 'LineString',
      coordinates: [
        [116.394, 39.909],
        [116.395, 39.9085],
        [116.396, 39.908],
        [116.397, 39.9075],
        [116.398, 39.907]
      ]
    },
    maintenanceRecords: [],
    status: 'active'
  },
  {
    name: '电力管线D4',
    type: 'electric',
    material: 'PVC',
    diameter: 150,
    installationDate: new Date('2020-07-10'),
    depth: 1.2,
    coordinates: {
      type: 'LineString',
      coordinates: [
        [116.397, 39.906],
        [116.3975, 39.907],
        [116.398, 39.908],
        [116.3985, 39.909]
      ]
    },
    maintenanceRecords: [],
    status: 'active'
  },
  {
    name: '通信管线E5',
    type: 'telecom',
    material: 'HDPE',
    diameter: 100,
    installationDate: new Date('2021-04-05'),
    depth: 0.8,
    coordinates: {
      type: 'LineString',
      coordinates: [
        [116.395, 39.908],
        [116.396, 39.9085],
        [116.397, 39.909],
        [116.398, 39.9095]
      ]
    },
    maintenanceRecords: [],
    status: 'active'
  }
];

async function initData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    await Pipeline.deleteMany({});
    console.log('Cleared existing data');

    const result = await Pipeline.insertMany(samplePipelines);
    console.log(`Inserted ${result.length} sample pipelines`);

    console.log('Data initialization completed!');
    process.exit(0);
  } catch (error) {
    console.error('Error initializing data:', error);
    process.exit(1);
  }
}

initData();
