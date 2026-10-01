import fs from 'fs';
import path from 'path';
import { pool } from './index';

export const runMigrations = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    console.log('Running non-destructive database migrations...');
    await client.query('BEGIN');

    // Ensure schema_migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const migrationsDir = path.resolve(__dirname, '../../../database/migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.warn(`Migrations directory not found at ${migrationsDir}`);
      await client.query('COMMIT');
      return;
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    const { rows: appliedRows } = await client.query(
      'SELECT name FROM schema_migrations'
    );
    const appliedSet = new Set(appliedRows.map((r: { name: string }) => r.name));

    for (const file of files) {
      if (!appliedSet.has(file)) {
        console.log(`Applying migration: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (name) VALUES ($1)',
          [file]
        );
        console.log(`Successfully applied: ${file}`);
      } else {
        console.log(`Already applied: ${file}`);
      }
    }

    await client.query('COMMIT');
    console.log('All database migrations completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed, rolled back transaction:', err);
    throw err;
  } finally {
    client.release();
  }
};

// Allow direct execution
if (require.main === module) {
  runMigrations()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Fatal migration error:', err);
      await pool.end();
      process.exit(1);
    });
}
