const express = require('express');
const Pipeline = require('../models/Pipeline');
const Valve = require('../models/Valve');
const { performBurstAnalysis } = require('../services/burstAnalysis');

module.exports = function(cache) {
  const router = express.Router();

  function getCacheKey(prefix, params) {
    return `${prefix}:${JSON.stringify(params)}`;
  }

  function invalidateSpatialCache() {
    const keys = cache.keys();
    keys.forEach(key => {
      if (key.startsWith('nearby:') || key.startsWith('intersects:')) {
        cache.del(key);
      }
    });
  }

  router.get('/', async (req, res) => {
    try {
      const { limit = 100, page = 1 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const limitNum = Math.min(parseInt(limit), 500);
      
      const pipelines = await Pipeline.find()
        .skip(skip)
        .limit(limitNum)
        .lean();
      
      const total = await Pipeline.countDocuments();
      
      res.json({
        data: pipelines,
        pagination: {
          page: parseInt(page),
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const pipeline = await Pipeline.findById(req.params.id).lean();
      if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });
      res.json(pipeline);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/', async (req, res) => {
    try {
      const pipeline = new Pipeline(req.body);
      await pipeline.save();
      invalidateSpatialCache();
      res.status(201).json(pipeline);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      const pipeline = await Pipeline.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });
      invalidateSpatialCache();
      res.json(pipeline);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const pipeline = await Pipeline.findByIdAndDelete(req.params.id);
      if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });
      invalidateSpatialCache();
      res.json({ message: 'Pipeline deleted successfully' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/spatial/nearby', async (req, res) => {
    try {
      const { 
        longitude, 
        latitude, 
        maxDistance = 50,
        type,
        status = 'active',
        limit = 100,
        page = 1,
        useCache = 'true'
      } = req.query;
      
      if (!longitude || !latitude) {
        return res.status(400).json({ error: 'Longitude and latitude are required' });
      }

      const cacheParams = { longitude, latitude, maxDistance, type, status, limit, page };
      const cacheKey = getCacheKey('nearby', cacheParams);
      
      if (useCache === 'true') {
        const cached = cache.get(cacheKey);
        if (cached) {
          return res.json({
            ...cached,
            cached: true
          });
        }
      }

      const query = {
        coordinates: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [parseFloat(longitude), parseFloat(latitude)]
            },
            $maxDistance: parseInt(maxDistance)
          }
        }
      };

      if (type) {
        query.type = type;
      }
      
      if (status) {
        query.status = status;
      }

      const projection = {
        name: 1,
        type: 1,
        material: 1,
        diameter: 1,
        depth: 1,
        installationDate: 1,
        status: 1,
        'coordinates.type': 1,
        'coordinates.coordinates': 1
      };

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const limitNum = Math.min(parseInt(limit), 200);

      const pipelines = await Pipeline.find(query, projection)
        .hint({ coordinates: '2dsphere', type: 1, status: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean();

      const total = await Pipeline.countDocuments(query)
        .hint({ coordinates: '2dsphere', type: 1, status: 1 });

      const result = {
        data: pipelines,
        pagination: {
          page: parseInt(page),
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      };

      if (useCache === 'true') {
        cache.set(cacheKey, result);
      }

      res.json({
        ...result,
        cached: false
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/spatial/intersects', async (req, res) => {
    try {
      const { 
        longitude, 
        latitude, 
        depth = 10,
        status = 'active',
        useCache = 'true'
      } = req.query;
      
      if (!longitude || !latitude) {
        return res.status(400).json({ error: 'Longitude and latitude are required' });
      }

      const cacheParams = { longitude, latitude, depth, status };
      const cacheKey = getCacheKey('intersects', cacheParams);
      
      if (useCache === 'true') {
        const cached = cache.get(cacheKey);
        if (cached) {
          return res.json({
            data: cached,
            cached: true
          });
        }
      }

      const query = {
        coordinates: {
          $geoIntersects: {
            $geometry: {
              type: 'Point',
              coordinates: [parseFloat(longitude), parseFloat(latitude)]
            }
          }
        },
        depth: { $lte: parseFloat(depth) }
      };

      if (status) {
        query.status = status;
      }

      const projection = {
        name: 1,
        type: 1,
        material: 1,
        diameter: 1,
        depth: 1,
        installationDate: 1,
        status: 1,
        'coordinates.type': 1,
        'coordinates.coordinates': 1
      };

      const pipelines = await Pipeline.find(query, projection)
        .hint({ coordinates: '2dsphere', depth: 1 })
        .limit(50)
        .lean();

      if (useCache === 'true' && pipelines.length > 0) {
        cache.set(cacheKey, pipelines);
      }

      res.json({
        data: pipelines,
        cached: false
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/burst-analysis', async (req, res) => {
    try {
      const { longitude, latitude, radius = 500 } = req.body;
      
      if (!longitude || !latitude) {
        return res.status(400).json({ 
          success: false,
          error: '经度和纬度是必需参数' 
        });
      }

      const result = await performBurstAnalysis(longitude, latitude, radius);
      res.json(result);
    } catch (err) {
      console.error('爆管分析错误:', err);
      res.status(500).json({ 
        success: false,
        error: err.message 
      });
    }
  });

  router.get('/valves', async (req, res) => {
    try {
      const { limit = 100, page = 1, status } = req.query;
      const query = {};
      if (status) query.status = status;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const limitNum = Math.min(parseInt(limit), 500);
      
      const valves = await Valve.find(query)
        .skip(skip)
        .limit(limitNum)
        .lean();
      
      const total = await Valve.countDocuments(query);
      
      res.json({
        data: valves,
        pagination: {
          page: parseInt(page),
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/valves/nearby', async (req, res) => {
    try {
      const { longitude, latitude, maxDistance = 500, limit = 50 } = req.query;
      
      if (!longitude || !latitude) {
        return res.status(400).json({ error: '经度和纬度是必需参数' });
      }

      const valves = await Valve.find({
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [parseFloat(longitude), parseFloat(latitude)]
            },
            $maxDistance: parseInt(maxDistance)
          }
        }
      })
        .limit(parseInt(limit))
        .lean();

      res.json({ data: valves });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/valves', async (req, res) => {
    try {
      const valve = new Valve(req.body);
      await valve.save();
      res.status(201).json(valve);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
};
