const pool = require('../config/database');

const createTables = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS pois (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(100) NOT NULL,
        x FLOAT NOT NULL,
        y FLOAT NOT NULL,
        z FLOAT DEFAULT 0,
        address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS roads (
        id SERIAL PRIMARY KEY,
        start_poi_id INTEGER REFERENCES pois(id),
        end_poi_id INTEGER REFERENCES pois(id),
        distance FLOAT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS heatmap_data (
        id SERIAL PRIMARY KEY,
        x FLOAT NOT NULL,
        y FLOAT NOT NULL,
        intensity FLOAT NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_heatmap_timestamp ON heatmap_data(timestamp)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_pois_type ON pois(type)');

    await client.query('COMMIT');
    console.log('Database tables created successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating tables:', err);
    throw err;
  } finally {
    client.release();
  }
};

createTables()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
