const Pipeline = require('../models/Pipeline');
const Valve = require('../models/Valve');

function calculateDistance(point1, point2) {
  const [lon1, lat1] = point1;
  const [lon2, lat2] = point2;
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function pointToLineDistance(point, lineStart, lineEnd) {
  const [px, py] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;

  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) param = dot / lenSq;

  let xx, yy;

  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = px - xx;
  const dy = py - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

async function findBurstPipeline(burstPoint, maxDistance = 10) {
  const pipelines = await Pipeline.find({
    coordinates: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: burstPoint
        },
        $maxDistance: maxDistance
      }
    }
  }).lean();

  let closestPipeline = null;
  let minDistance = Infinity;

  for (const pipeline of pipelines) {
    const coords = pipeline.coordinates.coordinates;
    for (let i = 0; i < coords.length - 1; i++) {
      const distance = pointToLineDistance(burstPoint, coords[i], coords[i + 1]);
      if (distance < minDistance) {
        minDistance = distance;
        closestPipeline = pipeline;
      }
    }
  }

  return { pipeline: closestPipeline, distance: minDistance };
}

function calculateAffectedArea(burstPoint, pipelines, radius = 500) {
  const affectedPipelines = [];
  const affectedArea = {
    type: 'Polygon',
    coordinates: [[]]
  };

  const [lon, lat] = burstPoint;
  const points = 32;
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const r = radius / 111000;
    affectedArea.coordinates[0].push([
      lon + r * Math.cos(angle),
      lat + r * Math.sin(angle)
    ]);
  }

  for (const pipeline of pipelines) {
    const coords = pipeline.coordinates.coordinates;
    let isAffected = false;
    
    for (const coord of coords) {
      if (calculateDistance(burstPoint, coord) <= radius) {
        isAffected = true;
        break;
      }
    }

    if (isAffected) {
      affectedPipelines.push(pipeline);
    }
  }

  return { affectedPipelines, affectedArea, radius };
}

async function findValveClosureScheme(burstPoint, affectedPipelines, maxValveDistance = 300) {
  const valves = await Valve.find({
    status: 'open',
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: burstPoint
        },
        $maxDistance: maxValveDistance
      }
    }
  }).lean();

  const valvesToClose = [];
  const affectedIds = new Set(affectedPipelines.map(p => p._id.toString()));

  for (const valve of valves) {
    const valveDistance = calculateDistance(
      burstPoint,
      valve.location.coordinates
    );

    let connectedToAffected = false;
    if (valve.connectedPipelines) {
      for (const pipeId of valve.connectedPipelines) {
        if (affectedIds.has(pipeId.toString())) {
          connectedToAffected = true;
          break;
        }
      }
    }

    if (connectedToAffected || valveDistance < maxValveDistance) {
      valvesToClose.push({
        ...valve,
        distance: valveDistance,
        priority: valveDistance < 100 ? 'high' : valveDistance < 200 ? 'medium' : 'low'
      });
    }
  }

  valvesToClose.sort((a, b) => a.distance - b.distance);

  return {
    valvesToClose: valvesToClose.slice(0, 10),
    totalValves: valvesToClose.length,
    estimatedIsolationTime: valvesToClose.length * 5
  };
}

function estimateImpact(affectedPipelines, burstPoint) {
  let totalLength = 0;
  let affectedCustomers = 0;
  let waterLossRate = 0;

  for (const pipeline of affectedPipelines) {
    const coords = pipeline.coordinates.coordinates;
    let pipeLength = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      pipeLength += calculateDistance(coords[i], coords[i + 1]);
    }
    totalLength += pipeLength;

    if (pipeline.type === 'water') {
      waterLossRate += (pipeline.diameter || 200) * 0.1;
    }
  }

  affectedCustomers = Math.floor(totalLength * 0.5);

  return {
    affectedPipelineCount: affectedPipelines.length,
    totalAffectedLength: Math.round(totalLength),
    estimatedAffectedCustomers: affectedCustomers,
    estimatedWaterLossRate: Math.round(waterLossRate),
    severity: totalLength > 1000 ? 'critical' : totalLength > 500 ? 'high' : 'medium'
  };
}

async function performBurstAnalysis(longitude, latitude, radius = 500) {
  const burstPoint = [longitude, latitude];

  const { pipeline, distance } = await findBurstPipeline(burstPoint, 20);

  if (!pipeline) {
    return {
      success: false,
      message: '未在爆管点附近找到管道',
      burstPoint: { type: 'Point', coordinates: burstPoint }
    };
  }

  const nearbyPipelines = await Pipeline.find({
    coordinates: {
      $near: {
        $geometry: { type: 'Point', coordinates: burstPoint },
        $maxDistance: radius
      }
    },
    type: pipeline.type
  }).lean();

  const { affectedPipelines, affectedArea } = calculateAffectedArea(
    burstPoint,
    nearbyPipelines,
    radius
  );

  const valveScheme = await findValveClosureScheme(burstPoint, affectedPipelines, radius * 0.6);

  const impact = estimateImpact(affectedPipelines, burstPoint);

  const recommendations = [
    '立即通知应急响应团队',
    '派遣人员现场确认爆管情况',
    '按照优先级关闭相关阀门',
    '通知受影响区域的用户',
    '准备抢修设备和材料',
    '安排水质检测'
  ];

  return {
    success: true,
    burstPoint: { type: 'Point', coordinates: burstPoint },
    burstPipeline: pipeline,
    burstAccuracy: distance,
    affectedArea,
    affectedPipelines,
    valveClosureScheme: valveScheme,
    impact,
    recommendations,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  performBurstAnalysis,
  calculateDistance,
  findBurstPipeline
};
