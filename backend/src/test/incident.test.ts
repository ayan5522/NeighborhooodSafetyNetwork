import request from 'supertest';
import { createApp } from '../app';
import { pool, closePool, query } from '../db';
import { hashPassword, generateJwt } from '../utils/crypto';

describe('Module 03: Incident Reporting Tests', () => {
  const app = createApp();

  let userAId: string;
  let userAToken: string;
  let userBId: string;
  let userBToken: string;
  let testIncidentId: string;

  beforeAll(async () => {
    // Clean test data
    await query("DELETE FROM incidents WHERE reporter_id IN (SELECT id FROM users WHERE email LIKE '%@incidenttest.org')");
    await query("DELETE FROM users WHERE email LIKE '%@incidenttest.org'");

    const pwdHash = await hashPassword('TestPassword123!');

    // User A
    const userARes = await query(
      `INSERT INTO users (full_name, email, password_hash, role, account_status)
       VALUES ('Incident Reporter A', 'user.a@incidenttest.org', $1, 'RESIDENT', 'ACTIVE')
       RETURNING id`,
      [pwdHash]
    );
    userAId = userARes.rows[0].id;
    userAToken = generateJwt({ user_id: userAId, role: 'RESIDENT' });

    // User B
    const userBRes = await query(
      `INSERT INTO users (full_name, email, password_hash, role, account_status)
       VALUES ('Incident Reporter B', 'user.b@incidenttest.org', $1, 'RESIDENT', 'ACTIVE')
       RETURNING id`,
      [pwdHash]
    );
    userBId = userBRes.rows[0].id;
    userBToken = generateJwt({ user_id: userBId, role: 'RESIDENT' });
  });

  afterAll(async () => {
    await query("DELETE FROM incidents WHERE reporter_id IN (SELECT id FROM users WHERE email LIKE '%@incidenttest.org')");
    await query("DELETE FROM users WHERE email LIKE '%@incidenttest.org'");
    await closePool();
  });

  // 1. Unauthenticated creation -> 401
  it('1. Unauthenticated incident creation returns 401', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .send({
        title: 'Water Leak',
        description: 'Broken water pipe near main street',
        category: 'INFRASTRUCTURE_ISSUE',
        severity: 'MEDIUM',
        latitude: 12.9716,
        longitude: 77.5946,
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // 2. Authenticated creation succeeds with defaults
  it('2. Authenticated incident creation returns 201 with PENDING status and ignores spoofed reporter_id', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        reporter_id: '00000000-0000-0000-0000-000000000000', // Spoof attempt
        title: 'Road Blockage on 5th Cross',
        description: 'Fallen tree blocking both lanes',
        category: 'ROAD_HAZARD',
        severity: 'HIGH',
        latitude: 12.9716,
        longitude: 77.5946,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.incident).toBeDefined();
    expect(res.body.data.incident.id).toBeDefined();
    expect(res.body.data.incident.reporter_id).toBe(userAId); // Spoof ignored!
    expect(res.body.data.incident.status).toBe('PENDING');
    expect(res.body.data.incident.title).toBe('Road Blockage on 5th Cross');
    expect(res.body.data.incident.category).toBe('ROAD_HAZARD');
    expect(res.body.data.incident.severity).toBe('HIGH');
    expect(parseFloat(res.body.data.incident.latitude)).toBeCloseTo(12.9716);
    expect(parseFloat(res.body.data.incident.longitude)).toBeCloseTo(77.5946);

    testIncidentId = res.body.data.incident.id;
  });

  // 3. Validation errors
  it('3. Rejects invalid category, missing fields, or out of range coordinates with 400', async () => {
    // Missing title
    let res = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        description: 'Fallen tree',
        category: 'ROAD_HAZARD',
        severity: 'HIGH',
        latitude: 12.9716,
        longitude: 77.5946,
      });
    expect(res.status).toBe(400);

    // Invalid category
    res = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        title: 'Test',
        description: 'Test description',
        category: 'INVALID_CATEGORY',
        severity: 'HIGH',
        latitude: 12.9716,
        longitude: 77.5946,
      });
    expect(res.status).toBe(400);

    // Invalid latitude out of range
    res = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        title: 'Test',
        description: 'Test description',
        category: 'ROAD_HAZARD',
        severity: 'HIGH',
        latitude: 95.0,
        longitude: 77.5946,
      });
    expect(res.status).toBe(400);
  });

  // 4. Multipart image upload
  it('4. Successfully uploads an incident with an image file', async () => {
    const dummyImageBuffer = Buffer.from('fake-png-content');

    const res = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${userAToken}`)
      .field('title', 'Accident at junction')
      .field('description', 'Minor scooter collision, no injuries')
      .field('category', 'ACCIDENT')
      .field('severity', 'LOW')
      .field('latitude', '12.9720')
      .field('longitude', '77.5950')
      .attach('image', dummyImageBuffer, 'collision.png');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.incident.image_url).toBeDefined();
    expect(res.body.data.incident.image_url).toContain('/uploads/incidents/');
  });

  // 5. Fetch user's own incidents
  it('5. GET /api/incidents/my returns only user A reports', async () => {
    const res = await request(app)
      .get('/api/incidents/my')
      .set('Authorization', `Bearer ${userAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.incidents)).toBe(true);
    expect(res.body.data.incidents.length).toBeGreaterThanOrEqual(2);
    for (const inc of res.body.data.incidents) {
      expect(inc.reporter_id).toBe(userAId);
    }
  });

  // 6. Fetch incident by ID
  it('6. GET /api/incidents/:id returns incident details including reporter name', async () => {
    const res = await request(app)
      .get(`/api/incidents/${testIncidentId}`)
      .set('Authorization', `Bearer ${userAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.incident.id).toBe(testIncidentId);
    expect(res.body.data.incident.reporter_name).toBe('Incident Reporter A');
  });

  // 7. Update own incident
  it('7. PATCH /api/incidents/:id updates allowed fields for the owner', async () => {
    const res = await request(app)
      .patch(`/api/incidents/${testIncidentId}`)
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        title: 'Road Blockage - Cleared partially',
        description: 'One lane cleared, authorities arriving',
        severity: 'MEDIUM',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.incident.title).toBe('Road Blockage - Cleared partially');
    expect(res.body.data.incident.severity).toBe('MEDIUM');
  });

  // 8. Update forbidden for other users
  it('8. PATCH /api/incidents/:id returns 403 when User B tries to update User A incident', async () => {
    const res = await request(app)
      .patch(`/api/incidents/${testIncidentId}`)
      .set('Authorization', `Bearer ${userBToken}`)
      .send({
        title: 'Malicious title overwrite',
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // 9. Cancel forbidden for other users
  it('9. PATCH /api/incidents/:id/cancel returns 403 when User B tries to cancel User A incident', async () => {
    const res = await request(app)
      .patch(`/api/incidents/${testIncidentId}/cancel`)
      .set('Authorization', `Bearer ${userBToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // 10. PostGIS Nearby incidents query within radius
  it('10. GET /api/incidents/nearby finds incident within radius and calculates distance_meters', async () => {
    // Incident is at 12.9716, 77.5946. Query near 12.9718, 77.5948 (~30 meters away) with 500m radius
    const res = await request(app)
      .get('/api/incidents/nearby')
      .query({
        latitude: 12.9718,
        longitude: 77.5948,
        radius: 500,
      })
      .set('Authorization', `Bearer ${userBToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const found = res.body.data.incidents.find((inc: any) => inc.id === testIncidentId);
    expect(found).toBeDefined();
    expect(found.distance_meters).toBeDefined();
    expect(found.distance_meters).toBeLessThan(100);
  });

  // 11. PostGIS Nearby query excludes incidents far away
  it('11. GET /api/incidents/nearby excludes incidents far away', async () => {
    // Query location 100km away (e.g. 13.5, 78.5) with radius 1000m
    const res = await request(app)
      .get('/api/incidents/nearby')
      .query({
        latitude: 13.5000,
        longitude: 78.5000,
        radius: 1000,
      })
      .set('Authorization', `Bearer ${userBToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const found = res.body.data.incidents.find((inc: any) => inc.id === testIncidentId);
    expect(found).toBeUndefined();
  });

  // 12. CRITICAL INVARIANT: Newly logged-in User B immediately sees existing incident created by User A
  it('12. Invariant: Newly logged-in user can immediately see existing incidents created earlier', async () => {
    // Fresh login for user B
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user.b@incidenttest.org',
        password: 'TestPassword123!',
      });
    expect(loginRes.status).toBe(200);
    const freshToken = loginRes.body.data.token;

    // Immediately fetch nearby incidents
    const nearbyRes = await request(app)
      .get('/api/incidents/nearby')
      .query({
        latitude: 12.9716,
        longitude: 77.5946,
        radius: 2000,
      })
      .set('Authorization', `Bearer ${freshToken}`);

    expect(nearbyRes.status).toBe(200);
    const incidentIds = nearbyRes.body.data.incidents.map((i: any) => i.id);
    expect(incidentIds).toContain(testIncidentId);
  });

  // 13. Cancel own incident
  it('13. PATCH /api/incidents/:id/cancel marks own incident status as CANCELLED', async () => {
    const res = await request(app)
      .patch(`/api/incidents/${testIncidentId}/cancel`)
      .set('Authorization', `Bearer ${userAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.incident.status).toBe('CANCELLED');

    // Confirm cancel on re-fetch
    const detailRes = await request(app)
      .get(`/api/incidents/${testIncidentId}`)
      .set('Authorization', `Bearer ${userAToken}`);
    expect(detailRes.body.data.incident.status).toBe('CANCELLED');
  });

  // 14. Cannot cancel an already cancelled incident
  it('14. Cannot cancel an already cancelled incident', async () => {
    const res = await request(app)
      .patch(`/api/incidents/${testIncidentId}/cancel`)
      .set('Authorization', `Bearer ${userAToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
