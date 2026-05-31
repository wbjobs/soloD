const pool = require('../config/database');

const seedData = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const pois = [
      { name: '火车站', type: 'transport', x: 0, y: 0, z: 0, address: '市中心' },
      { name: '购物中心', type: 'commercial', x: 200, y: 100, z: 0, address: '商业区' },
      { name: '市政府', type: 'government', x: -150, y: 200, z: 0, address: '行政中心' },
      { name: '人民医院', type: 'hospital', x: 100, y: -150, z: 0, address: '医疗区' },
      { name: '大学城', type: 'education', x: -200, y: -100, z: 0, address: '教育区' },
      { name: '中央公园', type: 'park', x: 50, y: 150, z: 0, address: '绿化区' },
      { name: '体育馆', type: 'sports', x: -100, y: -200, z: 0, address: '体育中心' },
      { name: '科技园区', type: 'business', x: 250, y: -50, z: 0, address: '高新区' },
      { name: '博物馆', type: 'culture', x: -50, y: 50, z: 0, address: '文化区' },
      { name: '酒店', type: 'hotel', x: 150, y: 200, z: 0, address: '商业区' },
      { name: '地铁站A', type: 'transport', x: 100, y: 50, z: 0, address: '地铁1号线' },
      { name: '地铁站B', type: 'transport', x: -100, y: 100, z: 0, address: '地铁2号线' },
    ];

    const poiIds = [];
    for (const poi of pois) {
      const result = await client.query(
        'INSERT INTO pois (name, type, x, y, z, address) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [poi.name, poi.type, poi.x, poi.y, poi.z, poi.address]
      );
      poiIds.push(result.rows[0].id);
    }

    const roads = [
      [0, 1], [0, 2], [0, 3], [0, 4], [0, 8],
      [1, 5], [1, 9], [1, 10],
      [2, 5], [2, 11],
      [3, 6], [3, 10],
      [4, 6], [4, 11],
      [5, 8], [5, 9],
      [6, 7],
      [7, 10],
      [8, 11],
      [10, 11],
    ];

    for (const [startIdx, endIdx] of roads) {
      const startPoi = pois[startIdx];
      const endPoi = pois[endIdx];
      const distance = Math.sqrt(
        Math.pow(endPoi.x - startPoi.x, 2) + 
        Math.pow(endPoi.y - startPoi.y, 2)
      );
      await client.query(
        'INSERT INTO roads (start_poi_id, end_poi_id, distance) VALUES ($1, $2, $3)',
        [poiIds[startIdx], poiIds[endIdx], distance]
      );
    }

    const baseTime = new Date();
    for (let hour = 0; hour < 24; hour++) {
      for (let i = 0; i < 50; i++) {
        const x = (Math.random() - 0.5) * 600;
        const y = (Math.random() - 0.5) * 600;
        const intensity = Math.random() * Math.sin((hour - 8) * Math.PI / 12) * 0.5 + 0.5;
        const timestamp = new Date(baseTime.getTime() + hour * 3600000);
        
        await client.query(
          'INSERT INTO heatmap_data (x, y, intensity, timestamp) VALUES ($1, $2, $3, $4)',
          [x, y, Math.max(0.1, intensity), timestamp]
        );
      }
    }

    await client.query('COMMIT');
    console.log('Test data seeded successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error seeding data:', err);
    throw err;
  } finally {
    client.release();
  }
};

seedData()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
