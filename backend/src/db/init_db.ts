import { Client } from 'pg';
import { runMigrations } from './migrate';
import { checkDatabaseHealth } from './index';

async function initDatabase(): Promise<void> {
  console.log('--- Initializing Windows PostgreSQL Database ---');

  const superuserPassword = process.env.DB_PASSWORD || 'nsn_password_2026';
  const superClient = new Client({
    host: 'localhost',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: superuserPassword,
  });

  try {
    console.log('Connecting as postgres superuser...');
    await superClient.connect();
    console.log('Connected to default postgres database.');

    // 1. Create nsn_app_user if not exists
    const userCheck = await superClient.query(
      "SELECT 1 FROM pg_roles WHERE rolname = 'nsn_app_user'"
    );
    if (userCheck.rowCount === 0) {
      console.log("Creating user 'nsn_app_user'...");
      await superClient.query(
        "CREATE USER nsn_app_user WITH PASSWORD 'nsn_password_2026' SUPERUSER CREATEDB CREATEROLE;"
      );
      console.log("User 'nsn_app_user' created successfully.");
    } else {
      console.log("User 'nsn_app_user' already exists. Updating password and privileges...");
      await superClient.query(
        "ALTER USER nsn_app_user WITH PASSWORD 'nsn_password_2026' SUPERUSER CREATEDB CREATEROLE;"
      );
    }

    // 2. Create database neighborhood_safety_db if not exists
    const dbCheck = await superClient.query(
      "SELECT 1 FROM pg_database WHERE datname = 'neighborhood_safety_db'"
    );
    if (dbCheck.rowCount === 0) {
      console.log("Creating database 'neighborhood_safety_db'...");
      await superClient.query(
        "CREATE DATABASE neighborhood_safety_db OWNER nsn_app_user;"
      );
      console.log("Database 'neighborhood_safety_db' created successfully.");
    } else {
      console.log("Database 'neighborhood_safety_db' already exists.");
    }

    await superClient.end();
  } catch (err: any) {
    console.error('Superuser initialization note:', err.message);
    try {
      await superClient.end();
    } catch (_) {}
  }

  // 3. Connect to neighborhood_safety_db as superuser/app user to enable postgis
  const appClient = new Client({
    host: 'localhost',
    port: 5432,
    database: 'neighborhood_safety_db',
    user: 'postgres',
    password: superuserPassword,
  });

  try {
    await appClient.connect();
    console.log('Enabling PostGIS extension in neighborhood_safety_db...');
    await appClient.query('CREATE EXTENSION IF NOT EXISTS postgis;');
    await appClient.query('GRANT ALL ON SCHEMA public TO nsn_app_user;');
    console.log('PostGIS enabled and permissions granted.');
    await appClient.end();
  } catch (err: any) {
    console.log('PostGIS / grant step notice:', err.message);
    try {
      await appClient.end();
    } catch (_) {}
  }

  // 4. Run all migrations using our existing migration runner
  console.log('Applying all database migrations...');
  await runMigrations();

  // 5. Verify database health
  console.log('Verifying database health...');
  const health = await checkDatabaseHealth();
  console.log('Database Health Check Result:', JSON.stringify(health, null, 2));

  if (health.connected) {
    console.log('SUCCESS: PostgreSQL is fully configured on Windows and ready for use!');
  } else {
    console.error('Database check reported issue:', health.error);
    process.exit(1);
  }
}

initDatabase().catch((err) => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
