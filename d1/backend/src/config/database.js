require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

async function getTenantSchema(tenantId) {
  const result = await pool.query(
    'SELECT schema_name FROM public.tenants WHERE id = $1',
    [tenantId]
  );
  return result.rows[0]?.schema_name;
}

module.exports = { pool, getTenantSchema };
