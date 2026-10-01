import { Pool, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config';

export const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.name,
  user: config.db.user,
  password: config.db.password,
  max: config.db.max,
  idleTimeoutMillis: config.db.idleTimeoutMillis,
  connectionTimeoutMillis: config.db.connectionTimeoutMillis,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

export const query = async <T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> => {
  return await pool.query<T>(text, params);
};

export interface DatabaseHealth {
  connected: boolean;
  database: string;
  user: string;
  postgisVersion?: string;
  latencyMs?: number;
  error?: string;
}

export const checkDatabaseHealth = async (): Promise<DatabaseHealth> => {
  const start = Date.now();
  try {
    const dbRes = await pool.query('SELECT current_database() AS db, current_user AS usr');
    const postgisRes = await pool.query('SELECT PostGIS_Version() AS version');
    const latencyMs = Date.now() - start;

    return {
      connected: true,
      database: dbRes.rows[0].db,
      user: dbRes.rows[0].usr,
      postgisVersion: postgisRes.rows[0].version,
      latencyMs,
    };
  } catch (error: any) {
    return {
      connected: false,
      database: config.db.name,
      user: config.db.user,
      error: error.message || 'Database connection error',
    };
  }
};

export const closePool = async (): Promise<void> => {
  await pool.end();
};
