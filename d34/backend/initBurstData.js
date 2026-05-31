const mongoose = require('mongoose');
const Pipeline = require('./models/Pipeline');
const Valve = require('./models/Valve');
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
    maintenanceRecords: [],
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
    maintenanceRecords: [],
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

const sampleValves = [
  {
    name: '阀门V-001',
    type: 'gate',
    status: 'open',
    diameter: 300,
    location: {
      type: 'Point',
      coordinates: [116.3955, 39.9072]
    },
    connectedPipelines: [],
    installationDate: new Date('2018-05-15')
  },
  {
    name: '阀门V-002',
    type: 'gate',
    status: 'open',
    diameter: 300,
    location: {
      type: 'Point',
      coordinates: [116.3965, 39.9078]
    },
    connectedPipelines: [],
    installationDate: new Date('2018-05-15')
  },
  {
    name: '阀门V-003',
    type: 'butterfly',
    status: 'open',
    diameter: 200,
    location: {
      type: 'Point',
      coordinates: [116.3975, 39.9082]
    },
    connectedPipelines: [],
    installationDate: new Date('2019-03-20')
  },
  {
    name: '阀门V-004',
    type: 'gate',
    status: 'open',
    diameter: 300,
    location: {
      type: 'Point',
      coordinates: [116.3982, 39.9087]
    },
    connectedPipelines: [],
    installationDate: new Date('2018-05-15')
  },
  {
    name: '阀门V-005',
    type: 'ball',
    status: 'open',
    diameter: 150,
    location: {
      type: 'Point',
      coordinates: [116.3968, 39.9065]
    },
    connectedPipelines: [],
    installationDate: new Date('2020-08-01')
  },
  {
    name: '阀门V-006',
    type: 'gate',
    status: 'open',
    diameter: 200,
    location: {
      type: 'Point',
      coordinates: [116.3978, 39.9073]
    },
    connectedPipelines: [],
    installationDate: new Date('2019-03-20')
  }
];

async function initBurstData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    await Pipeline.deleteMany({});
    await Valve.deleteMany({});
    console.log('Cleared existing data');

    const insertedPipelines = await Pipeline.insertMany(samplePipelines);
    console.log(`Inserted ${insertedPipelines.length} sample pipelines`);

    const pipelineIds = insertedPipelines.map(p => p._id);
    sampleValves[0].connectedPipelines = [pipelineIds[0]];
    sampleValves[1].connectedPipelines = [pipelineIds[0]];
    sampleValves[2].connectedPipelines = [pipelineIds[0], pipelineIds[2]];
    sampleValves[3].connectedPipelines = [pipelineIds[2]];
    sampleValves[4].connectedPipelines = [pipelineIds[1]];
    sampleValves[5].connectedPipelines = [pipelineIds[3], pipelineIds[4]];

    const insertedValves = await Valve.insertMany(sampleValves);
    console.log(`Inserted ${insertedValves.length} sample valves`);

    console.log('\nData initialization completed!');
    console.log('Sample data created around: 116.3975, 39.9086 (Beijing)');
    process.exit(0);
  } catch (error) {
    console.error('Error initializing data:', error);
    process.exit(1);
  }
}

initBurstData();
