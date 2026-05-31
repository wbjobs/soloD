const express = require('express');
const router = express.Router();
const pool = require('../config/database');

router.get('/', async (req, res) => {
  try {
    const { startTime, endTime, granularity = 'hour' } = req.query;

    let query = `
      SELECT x, y, AVG(intensity) as intensity,
             DATE_TRUNC($1, timestamp) as time_bucket
      FROM heatmap_data
    `;
    const params = [granularity];

    if (startTime && endTime) {
      query += ' WHERE timestamp BETWEEN $2 AND $3';
      params.push(startTime, endTime);
    }

    query += ' GROUP BY x, y, time_bucket ORDER BY time_bucket';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/current', async (req, res) => {
  try {
    const { hour = new Date().getHours() } = req.query;

    const result = await pool.query(`
      SELECT x, y, AVG(intensity) as intensity
      FROM heatmap_data
      WHERE EXTRACT(HOUR FROM timestamp) = $1
      GROUP BY x, y
    `, [hour]);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/timeline', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT DATE_TRUNC('hour', timestamp) as hour
      FROM heatmap_data
      ORDER BY hour
    `);

    res.json(result.rows.map(row => row.hour));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
