import request from 'supertest';
import { createApp } from '../app';
import { pool, closePool } from '../db';

describe('Module 00: Foundation & Health Integration Tests', () => {
  const app = createApp();

  afterAll(async () => {
    await closePool();
  });

  it('GET /api/health returns 200 with PostGIS and valid DB identity', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.project).toBe('NeighborhoodSafetyNetwork');
    expect(res.body.database.connected).toBe(true);
    expect(res.body.database.name).toBe('neighborhood_safety_db');
    expect(res.body.database.user).toBe('nsn_app_user');
    expect(res.body.database.postgisVersion).toBeDefined();
    expect(typeof res.body.database.postgisVersion).toBe('string');
  });

  it('GET / returns API welcome message', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Neighborhood Safety');
    expect(res.body.status).toBe('active');
  });

  it('GET /unknown-route returns 404', async () => {
    const res = await request(app).get('/unknown-route');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Cannot GET /unknown-route');
  });

  it('Ensures users table exists and PostGIS geometry functions', async () => {
    const usersTableCheck = await pool.query(
      "SELECT to_regclass('public.users') AS exists"
    );
    expect(usersTableCheck.rows[0].exists).not.toBeNull();

    const postgisPointCheck = await pool.query(
      'SELECT ST_AsText(ST_MakePoint(77.5946, 12.9716)) AS point'
    );
    expect(postgisPointCheck.rows[0].point).toBe('POINT(77.5946 12.9716)');
  });
});
