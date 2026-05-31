require('dotenv').config();
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const client = new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'postgres'
});

async function initDatabase() {
  try {
    await client.connect();
    console.log('Connected to PostgreSQL');

    await client.query(`DROP DATABASE IF EXISTS ${process.env.DB_NAME}`);
    await client.query(`CREATE DATABASE ${process.env.DB_NAME}`);
    console.log(`Database ${process.env.DB_NAME} created`);
    await client.end();

    const dbClient = new Client({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });
    await dbClient.connect();
    console.log('Connected to new database');

    await createPublicSchema(dbClient);
    await createTenantSchema(dbClient, 'tenant1');
    await createTenantSchema(dbClient, 'tenant2');
    await insertTestData(dbClient);

    await dbClient.end();
    console.log('Database initialization complete!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

async function createPublicSchema(dbClient) {
  await dbClient.query(`
    CREATE SCHEMA IF NOT EXISTS public;
    
    CREATE TABLE IF NOT EXISTS public.tenants (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      schema_name VARCHAR(50) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('Public schema and tenants table created');
}

async function createTenantSchema(dbClient, schemaName) {
  await dbClient.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
  
  await dbClient.query(`
    CREATE TABLE IF NOT EXISTS ${schemaName}.users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      full_name VARCHAR(100),
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ${schemaName}.roles (
      id SERIAL PRIMARY KEY,
      name VARCHAR(50) UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ${schemaName}.permissions (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL,
      code VARCHAR(50) UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ${schemaName}.user_roles (
      user_id INTEGER REFERENCES ${schemaName}.users(id) ON DELETE CASCADE,
      role_id INTEGER REFERENCES ${schemaName}.roles(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS ${schemaName}.role_permissions (
      role_id INTEGER REFERENCES ${schemaName}.roles(id) ON DELETE CASCADE,
      permission_id INTEGER REFERENCES ${schemaName}.permissions(id) ON DELETE CASCADE,
      PRIMARY KEY (role_id, permission_id)
    );

    CREATE TABLE IF NOT EXISTS ${schemaName}.operation_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES ${schemaName}.users(id) ON DELETE SET NULL,
      username VARCHAR(50),
      tenant_id INTEGER,
      action_type VARCHAR(50) NOT NULL,
      description TEXT,
      ip_address VARCHAR(50),
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log(`Schema ${schemaName} created with RBAC tables`);
}

async function insertTestData(dbClient) {
  await dbClient.query(`
    INSERT INTO public.tenants (name, schema_name) VALUES
    ('Test Company 1', 'tenant1'),
    ('Test Company 2', 'tenant2')
  `);

  const hashedPassword = await bcrypt.hash('123456', 10);

  for (const schema of ['tenant1', 'tenant2']) {
    await dbClient.query(`
      INSERT INTO ${schema}.permissions (name, code, description) VALUES
      ('用户管理', 'user:manage', '用户管理权限'),
      ('用户查看', 'user:view', '查看用户列表'),
      ('用户创建', 'user:create', '创建用户'),
      ('用户编辑', 'user:edit', '编辑用户'),
      ('用户删除', 'user:delete', '删除用户'),
      ('角色管理', 'role:manage', '角色管理权限'),
      ('角色查看', 'role:view', '查看角色列表'),
      ('角色创建', 'role:create', '创建角色'),
      ('角色编辑', 'role:edit', '编辑角色'),
      ('角色删除', 'role:delete', '删除角色'),
      ('权限管理', 'permission:manage', '权限管理权限'),
      ('权限查看', 'permission:view', '查看权限列表'),
      ('分配权限', 'permission:assign', '给角色分配权限'),
      ('分配角色', 'role:assign', '给用户分配角色'),
      ('日志查看', 'log:view', '查看操作日志');

      INSERT INTO ${schema}.roles (name, description) VALUES
      ('超级管理员', '拥有系统所有权限'),
      ('管理员', '拥有大部分管理权限'),
      ('普通用户', '普通用户权限');

      INSERT INTO ${schema}.users (username, email, password, full_name) VALUES
      ('admin', 'admin@${schema}.com', '${hashedPassword}', '系统管理员'),
      ('user1', 'user1@${schema}.com', '${hashedPassword}', '普通用户1');

      INSERT INTO ${schema}.user_roles (user_id, role_id) VALUES
      (1, 1),
      (2, 3);

      INSERT INTO ${schema}.role_permissions (role_id, permission_id)
      SELECT 1, id FROM ${schema}.permissions;
    `);
    console.log(`Test data inserted for ${schema}`);
  }
}

initDatabase();
