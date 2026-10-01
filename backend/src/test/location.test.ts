import request from 'supertest';
import { createApp } from '../app';
import { pool, closePool, query } from '../db';
import { hashPassword, generateJwt } from '../utils/crypto';

describe('Module 02: Location & Neighborhood Management Tests', () => {
  const app = createApp();

  let userAId: string;
  let userAToken: string;
  let userBId: string;
  let userBToken: string;

  beforeAll(async () => {
    // Clean test data
    await query("DELETE FROM user_locations WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@locationtest.org')");
    await query("DELETE FROM users WHERE email LIKE '%@locationtest.org'");

    // Create User A
    const pwdHash = await hashPassword('TestPassword123!');
    const userARes = await query(
      `INSERT INTO users (full_name, email, password_hash, role, account_status)
       VALUES ('User Alpha', 'user.alpha@locationtest.org', $1, 'RESIDENT', 'ACTIVE')
       RETURNING id`,
      [pwdHash]
    );
    userAId = userARes.rows[0].id;
    userAToken = generateJwt({ user_id: userAId, role: 'RESIDENT' });

    // Create User B
    const userBRes = await query(
      `INSERT INTO users (full_name, email, password_hash, role, account_status)
       VALUES ('User Beta', 'user.beta@locationtest.org', $1, 'RESIDENT', 'ACTIVE')
       RETURNING id`,
      [pwdHash]
    );
    userBId = userBRes.rows[0].id;
    userBToken = generateJwt({ user_id: userBId, role: 'RESIDENT' });
  });

  afterAll(async () => {
    await query("DELETE FROM user_locations WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@locationtest.org')");
    await query("DELETE FROM users WHERE email LIKE '%@locationtest.org'");
    await closePool();
  });

  // 1. Unauthenticated location update -> 401
  it('1. Unauthenticated location update returns 401', async () => {
    const res = await request(app)
      .post('/api/location/update')
      .send({ latitude: 12.9716, longitude: 77.5946 });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // 2. Authenticated location update -> success
  it('2. Authenticated location update succeeds', async () => {
    const res = await request(app)
      .post('/api/location/update')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        latitude: 12.9716,
        longitude: 77.5946,
        accuracy: 12.5,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.updated).toBe(true);
    expect(res.body.data.updated_at).toBeDefined();
  });

  // 3. Invalid latitude -> 400
  it('3. Invalid latitude (> 90) is rejected with 400', async () => {
    const res = await request(app)
      .post('/api/location/update')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        latitude: 95.0,
        longitude: 77.5946,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Latitude must be between -90 and 90');
  });

  // 4. Invalid longitude -> 400
  it('4. Invalid longitude (> 180) is rejected with 400', async () => {
    const res = await request(app)
      .post('/api/location/update')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        latitude: 12.9716,
        longitude: 195.0,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Longitude must be between -180 and 180');
  });

  // 5. Invalid accuracy -> 400
  it('5. Invalid accuracy (negative) is rejected with 400', async () => {
    const res = await request(app)
      .post('/api/location/update')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        latitude: 12.9716,
        longitude: 77.5946,
        accuracy: -5,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Accuracy must be a non-negative number');
  });

  // 6. Correct PostGIS point created
  it('6. Correct PostGIS geography Point is stored in database', async () => {
    const dbRes = await query(
      'SELECT ST_AsText(location::geometry) AS point, latitude, longitude, accuracy FROM user_locations WHERE user_id = $1',
      [userAId]
    );

    expect(dbRes.rows.length).toBe(1);
    // ST_MakePoint takes (longitude, latitude) -> POINT(77.5946 12.9716)
    expect(dbRes.rows[0].point).toBe('POINT(77.5946 12.9716)');
    expect(dbRes.rows[0].latitude).toBe(12.9716);
    expect(dbRes.rows[0].longitude).toBe(77.5946);
    expect(dbRes.rows[0].accuracy).toBe(12.5);
  });

  // 7. Existing location is updated instead of duplicated (UPSERT)
  it('7. Existing location is updated instead of duplicated', async () => {
    const res = await request(app)
      .post('/api/location/update')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        latitude: 12.9720,
        longitude: 77.5950,
        accuracy: 8.0,
      });

    expect(res.status).toBe(200);

    const countRes = await query(
      'SELECT COUNT(*) AS total FROM user_locations WHERE user_id = $1',
      [userAId]
    );
    expect(parseInt(countRes.rows[0].total, 10)).toBe(1);

    const valRes = await query(
      'SELECT latitude, longitude FROM user_locations WHERE user_id = $1',
      [userAId]
    );
    expect(valRes.rows[0].latitude).toBe(12.9720);
    expect(valRes.rows[0].longitude).toBe(77.5950);
  });

  // 8. GET current location returns own location
  it('8. GET /api/location/current returns authenticated user location', async () => {
    const res = await request(app)
      .get('/api/location/current')
      .set('Authorization', `Bearer ${userAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.location.latitude).toBe(12.9720);
    expect(res.body.data.location.longitude).toBe(77.5950);
    expect(res.body.data.location.accuracy).toBe(8.0);
  });

  // 9. User cannot access another user's current location via query parameters
  it('9. User cannot access another user location via query params', async () => {
    // User B calls /api/location/current?user_id=userAId
    // The endpoint must ignore client parameter and only return User B's own location (or 404 if not set)
    const res = await request(app)
      .get(`/api/location/current?user_id=${userAId}`)
      .set('Authorization', `Bearer ${userBToken}`);

    // Since user B has not set a location yet, it must return 404
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  // 10. Nearby query requires authentication
  it('10. Nearby query without JWT returns 401', async () => {
    const res = await request(app).get('/api/location/nearby?radius=1000');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // 11. Radius validation works
  it('11. Radius validation accepts valid parameter within bounds', async () => {
    // Set location for User B nearby User A (~300 meters away)
    await request(app)
      .post('/api/location/update')
      .set('Authorization', `Bearer ${userBToken}`)
      .send({
        latitude: 12.9730,
        longitude: 77.5960,
        accuracy: 10,
      });

    const res = await request(app)
      .get('/api/location/nearby?radius=1500')
      .set('Authorization', `Bearer ${userAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.radius_meters).toBe(1500);
  });

  // 12. Excessive radius rejected
  it('12. Excessive radius (> 10000m) is rejected with 400', async () => {
    const res = await request(app)
      .get('/api/location/nearby?radius=50000')
      .set('Authorization', `Bearer ${userAToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Radius must be between 100 and 10000 meters');
  });

  // 13. PostGIS nearby query works
  it('13. PostGIS nearby query correctly finds User B within radius', async () => {
    const res = await request(app)
      .get('/api/location/nearby?radius=2000')
      .set('Authorization', `Bearer ${userAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.nearby_user_count).toBeGreaterThanOrEqual(1);
    expect(res.body.data.nearby_users.length).toBeGreaterThanOrEqual(1);

    const firstUser = res.body.data.nearby_users[0];
    expect(firstUser.distance_meters).toBeGreaterThan(0);
    expect(firstUser.distance_meters).toBeLessThan(2000);
  });

  // 14. Stale location handling works
  it('14. Stale location (> 60 minutes) is excluded from nearby query', async () => {
    // Age User B's location by 2 hours
    await query(
      "UPDATE user_locations SET updated_at = NOW() - INTERVAL '2 hours' WHERE user_id = $1",
      [userBId]
    );

    const res = await request(app)
      .get('/api/location/nearby?radius=2000')
      .set('Authorization', `Bearer ${userAToken}`);

    expect(res.status).toBe(200);
    // User B should now be excluded because their location is stale
    expect(res.body.data.nearby_user_count).toBe(0);

    // Restore User B's updated_at
    await query(
      'UPDATE user_locations SET updated_at = CURRENT_TIMESTAMP WHERE user_id = $1',
      [userBId]
    );
  });

  // 15. Neighborhood endpoint works
  it('15. GET /api/location/neighborhood returns area details or graceful null', async () => {
    const res = await request(app)
      .get('/api/location/neighborhood')
      .set('Authorization', `Bearer ${userAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
  });

  // 16. PRIVACY TEST (Section 46): User B CANNOT retrieve User A exact coordinates
  it('16. PRIVACY TEST: User B cannot retrieve User A exact coordinates via nearby API', async () => {
    const res = await request(app)
      .get('/api/location/nearby?radius=2000')
      .set('Authorization', `Bearer ${userBToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Validate that no response field reveals User A's latitude, longitude, email, or full name
    res.body.data.nearby_users.forEach((u: any) => {
      expect(u.latitude).toBeUndefined();
      expect(u.longitude).toBeUndefined();
      expect(u.email).toBeUndefined();
      expect(u.full_name).toBeUndefined();
      expect(u.exact_coordinates).toBeUndefined();
    });

    // Validate that GET /api/users/me does NOT leak precise location
    const meRes = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${userAToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.location).toBeUndefined();
    expect(meRes.body.data.user.latitude).toBeUndefined();
    expect(meRes.body.data.user.longitude).toBeUndefined();
  });
});
