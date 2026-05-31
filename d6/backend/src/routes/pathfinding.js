const express = require('express');
const router = express.Router();
const pool = require('../config/database');

class PriorityQueue {
  constructor() {
    this.items = [];
  }

  enqueue(element, priority) {
    const queueElement = { element, priority };
    let added = false;
    for (let i = 0; i < this.items.length; i++) {
      if (queueElement.priority < this.items[i].priority) {
        this.items.splice(i, 0, queueElement);
        added = true;
        break;
      }
    }
    if (!added) {
      this.items.push(queueElement);
    }
  }

  dequeue() {
    return this.items.shift();
  }

  isEmpty() {
    return this.items.length === 0;
  }
}

async function buildGraph() {
  const poisResult = await pool.query('SELECT id, x, y, z FROM pois');
  const roadsResult = await pool.query('SELECT start_poi_id, end_poi_id, distance FROM roads');

  const nodes = new Map();
  poisResult.rows.forEach(poi => {
    nodes.set(poi.id, { x: poi.x, y: poi.y, z: poi.z });
  });

  const adjacency = new Map();
  nodes.forEach((_, id) => {
    adjacency.set(id, []);
  });

  roadsResult.rows.forEach(road => {
    adjacency.get(road.start_poi_id).push({
      node: road.end_poi_id,
      distance: road.distance
    });
    adjacency.get(road.end_poi_id).push({
      node: road.start_poi_id,
      distance: road.distance
    });
  });

  return { nodes, adjacency };
}

function dijkstra(adjacency, startId, endId, weightType = 'shortest') {
  const distances = new Map();
  const previous = new Map();
  const pq = new PriorityQueue();

  const weights = {
    shortest: (neighbor) => neighbor.distance,
    fastest: (neighbor) => neighbor.distance * (neighbor.isMainRoad ? 0.8 : 1.2),
    scenic: (neighbor) => neighbor.distance * (neighbor.isScenic ? 0.7 : 1.3)
  };

  const weightFn = weights[weightType] || weights.shortest;

  adjacency.forEach((_, id) => {
    distances.set(id, id === startId ? 0 : Infinity);
    previous.set(id, null);
  });

  pq.enqueue(startId, 0);

  while (!pq.isEmpty()) {
    const current = pq.dequeue();
    const currentId = current.element;

    if (currentId === endId) break;

    const neighbors = adjacency.get(currentId);
    for (const neighbor of neighbors) {
      const cost = weightFn(neighbor);
      const alt = distances.get(currentId) + cost;
      if (alt < distances.get(neighbor.node)) {
        distances.set(neighbor.node, alt);
        previous.set(neighbor.node, currentId);
        pq.enqueue(neighbor.node, alt);
      }
    }
  }

  const path = [];
  let current = endId;
  while (current !== null) {
    path.unshift(current);
    current = previous.get(current);
  }

  return {
    path,
    distance: distances.get(endId),
    found: path[0] === startId
  };
}

router.post('/find', async (req, res) => {
  try {
    const { startId, endId, weightType = 'shortest' } = req.body;

    if (!startId || !endId) {
      return res.status(400).json({ error: 'startId and endId are required' });
    }

    const { nodes, adjacency } = await buildGraph();
    const result = dijkstra(adjacency, parseInt(startId), parseInt(endId), weightType);

    if (!result.found) {
      return res.status(404).json({ error: 'Path not found' });
    }

    const pathWithCoordinates = result.path.map(id => ({
      id,
      ...nodes.get(id)
    }));

    const timeMultiplier = { shortest: 1, fastest: 0.8, scenic: 1.5 };

    res.json({
      path: pathWithCoordinates,
      distance: result.distance,
      estimatedTime: Math.round(result.distance * timeMultiplier[weightType] / 10),
      weightType
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/roads', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.id, r.distance,
             p1.x as start_x, p1.y as start_y, p1.z as start_z,
             p2.x as end_x, p2.y as end_y, p2.z as end_z
      FROM roads r
      JOIN pois p1 ON r.start_poi_id = p1.id
      JOIN pois p2 ON r.end_poi_id = p2.id
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
