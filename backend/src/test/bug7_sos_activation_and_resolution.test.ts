import request from 'supertest';
import { createApp } from '../app';
import { closePool, query } from '../db';
import { hashPassword, generateJwt } from '../utils/crypto';

describe('Bug 7 — Emergency & SOS Activation and Resolution Tests', () => {
  const app = createApp();

  let userAId: string;
  let userAToken: string;
  let userBId: string;
  let userBToken: string;

  beforeAll(async () => {
    await query("DELETE FROM sos_events WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@sostest.org')");
    await query("DELETE FROM users WHERE email LIKE '%@sostest.org'");

    const pwd = await hashPassword('SosTestPass123!');

    // Create User A
    const uARes = await query(
      `INSERT INTO users (full_name, email, password_hash, role, account_status)
       VALUES ('User A', 'usera@sostest.org', $1, 'RESIDENT', 'ACTIVE') RETURNING id`,
      [pwd]
    );
    userAId = uARes.rows[0].id;
    userAToken = generateJwt({ user_id: userAId, role: 'RESIDENT' });

    // Create User B
    const uBRes = await query(
      `INSERT INTO users (full_name, email, password_hash, role, account_status)
       VALUES ('User B', 'userb@sostest.org', $1, 'RESIDENT', 'ACTIVE') RETURNING id`,
      [pwd]
    );
    userBId = uBRes.rows[0].id;
    userBToken = generateJwt({ user_id: userBId, role: 'RESIDENT' });
  });

  afterAll(async () => {
    await query("DELETE FROM sos_events WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@sostest.org')");
    await query("DELETE FROM users WHERE email LIKE '%@sostest.org'");
    await closePool();
  });

  // Test 1: Activate SOS with valid authentication and location
  it('Test 1: User A activates SOS with valid coordinates -> creates ACTIVE record in DB', async () => {
    const res = await request(app)
      .post('/api/sos')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        latitude: 12.9716,
        longitude: 77.5946,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sos).toBeDefined();
    expect(res.body.data.sos.status).toBe('ACTIVE');
    expect(res.body.data.sos.user_id).toBe(userAId);
    expect(res.body.data.sos.latitude).toBe(12.9716);
    expect(res.body.data.sos.longitude).toBe(77.5946);
    expect(res.body.data.is_existing).toBe(false);

    // Verify database record
    const dbRes = await query(
      `SELECT * FROM sos_events WHERE id = $1`,
      [res.body.data.sos.id]
    );
    expect(dbRes.rows.length).toBe(1);
    expect(dbRes.rows[0].status).toBe('ACTIVE');
    expect(dbRes.rows[0].resolved_at).toBeNull();
  });

  // Test 2: Active SOS restoration (session / navigation recovery)
  it('Test 2: GET /api/sos/my returns active SOS event upon navigation or reload', async () => {
    const res = await request(app)
      .get('/api/sos/my')
      .set('Authorization', `Bearer ${userAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sos_events.length).toBeGreaterThanOrEqual(1);

    const active = res.body.data.sos_events.find((e: any) => e.status === 'ACTIVE');
    expect(active).toBeDefined();
    expect(active.user_id).toBe(userAId);
  });

  // Test 3: Duplicate activation prevention
  it('Test 3: Rapid repeated activation returns existing active SOS without creating duplicate DB rows', async () => {
    const initialCount = await query(
      `SELECT COUNT(*)::int AS count FROM sos_events WHERE user_id = $1`,
      [userAId]
    );

    const res = await request(app)
      .post('/api/sos')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        latitude: 12.9716,
        longitude: 77.5946,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.is_existing).toBe(true);
    expect(res.body.data.sos.status).toBe('ACTIVE');

    const afterCount = await query(
      `SELECT COUNT(*)::int AS count FROM sos_events WHERE user_id = $1`,
      [userAId]
    );
    expect(afterCount.rows[0].count).toBe(initialCount.rows[0].count);
  });

  // Test 4: Coordinate validation
  it('Test 4: SOS activation with invalid coordinates returns 400', async () => {
    const invalidLat = await request(app)
      .post('/api/sos')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        latitude: 95.0, // Invalid latitude
        longitude: 77.5946,
      });

    expect(invalidLat.status).toBe(400);
    expect(invalidLat.body.success).toBe(false);

    const missingCoords = await request(app)
      .post('/api/sos')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({});

    expect(missingCoords.status).toBe(400);
    expect(missingCoords.body.success).toBe(false);
  });

  // Test 5: IDOR protection - User B cannot resolve User A's SOS
  it('Test 5: User B attempting to resolve User A SOS is rejected with 403 Forbidden', async () => {
    const activeRes = await query(
      `SELECT id FROM sos_events WHERE user_id = $1 AND status = 'ACTIVE' LIMIT 1`,
      [userAId]
    );
    const sosId = activeRes.rows[0].id;

    const res = await request(app)
      .patch(`/api/sos/${sosId}/resolve`)
      .set('Authorization', `Bearer ${userBToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('not authorized');

    // Confirm it remains ACTIVE in DB
    const dbCheck = await query(`SELECT status FROM sos_events WHERE id = $1`, [sosId]);
    expect(dbCheck.rows[0].status).toBe('ACTIVE');
  });

  // Test 6: Resolving nonexistent SOS returns 404
  it('Test 6: Resolving nonexistent SOS returns 404 Not Found', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .patch(`/api/sos/${fakeId}/resolve`)
      .set('Authorization', `Bearer ${userAToken}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  // Test 7: User A resolves own SOS
  it('Test 7: User A resolves own SOS -> status becomes RESOLVED and resolved_at is set', async () => {
    const activeRes = await query(
      `SELECT id FROM sos_events WHERE user_id = $1 AND status = 'ACTIVE' LIMIT 1`,
      [userAId]
    );
    const sosId = activeRes.rows[0].id;

    const res = await request(app)
      .patch(`/api/sos/${sosId}/resolve`)
      .set('Authorization', `Bearer ${userAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sos.status).toBe('RESOLVED');
    expect(res.body.data.sos.resolved_at).not.toBeNull();

    // Verify in database
    const dbCheck = await query(
      `SELECT status, resolved_at FROM sos_events WHERE id = $1`,
      [sosId]
    );
    expect(dbCheck.rows[0].status).toBe('RESOLVED');
    expect(dbCheck.rows[0].resolved_at).not.toBeNull();
  });

  // Test 8: Idempotent resolution does not alter status or duplicate records
  it('Test 8: Resolving already-resolved SOS returns resolved record without corrupting timestamp', async () => {
    const resolvedRes = await query(
      `SELECT id, resolved_at FROM sos_events WHERE user_id = $1 AND status = 'RESOLVED' LIMIT 1`,
      [userAId]
    );
    const sosId = resolvedRes.rows[0].id;
    const originalResolvedAt = resolvedRes.rows[0].resolved_at;

    const res = await request(app)
      .patch(`/api/sos/${sosId}/resolve`)
      .set('Authorization', `Bearer ${userAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.sos.status).toBe('RESOLVED');

    const dbCheck = await query(
      `SELECT status, resolved_at FROM sos_events WHERE id = $1`,
      [sosId]
    );
    expect(dbCheck.rows[0].status).toBe('RESOLVED');
    expect(new Date(dbCheck.rows[0].resolved_at).getTime()).toBe(new Date(originalResolvedAt).getTime());
  });

  // Test 9: Unauthenticated requests return 401
  it('Test 9: Unauthenticated create and resolve return 401 Unauthorized', async () => {
    const createRes = await request(app)
      .post('/api/sos')
      .send({ latitude: 12.9716, longitude: 77.5946 });
    expect(createRes.status).toBe(401);

    const resolveRes = await request(app)
      .patch('/api/sos/00000000-0000-0000-0000-000000000000/resolve');
    expect(resolveRes.status).toBe(401);
  });
});
