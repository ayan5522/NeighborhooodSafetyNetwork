import request from 'supertest';
import { createApp } from '../app';
import { pool, closePool, query } from '../db';
import { hashPassword, generateJwt } from '../utils/crypto';
import { AlertService } from '../services/alertService';

describe('BUG 8 — Fix Incident Cancellation and Map Removal Tests', () => {
  const app = createApp();

  let userAId: string;
  let userAToken: string;
  let userBId: string;
  let userBToken: string;

  beforeAll(async () => {
    // Clean up test data
    await query("DELETE FROM incident_verifications WHERE incident_id IN (SELECT id FROM incidents WHERE reporter_id IN (SELECT id FROM users WHERE email LIKE '%@bug8test.org'))");
    await query("DELETE FROM alerts WHERE recipient_user_id IN (SELECT id FROM users WHERE email LIKE '%@bug8test.org')");
    await query("DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@bug8test.org')");
    await query("DELETE FROM user_locations WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@bug8test.org')");
    await query("DELETE FROM incidents WHERE reporter_id IN (SELECT id FROM users WHERE email LIKE '%@bug8test.org')");
    await query("DELETE FROM users WHERE email LIKE '%@bug8test.org'");

    const pwdHash = await hashPassword('TestPassword123!');

    // User A (Reporter)
    const userARes = await query(
      `INSERT INTO users (full_name, email, password_hash, role, account_status, email_verified)
       VALUES ('User A Reporter', 'user.a@bug8test.org', $1, 'RESIDENT', 'ACTIVE', true)
       RETURNING id`,
      [pwdHash]
    );
    userAId = userARes.rows[0].id;
    userAToken = generateJwt({ user_id: userAId, role: 'RESIDENT' });

    // User B (Neighbor)
    const userBRes = await query(
      `INSERT INTO users (full_name, email, password_hash, role, account_status, email_verified)
       VALUES ('User B Neighbor', 'user.b@bug8test.org', $1, 'RESIDENT', 'ACTIVE', true)
       RETURNING id`,
      [pwdHash]
    );
    userBId = userBRes.rows[0].id;
    userBToken = generateJwt({ user_id: userBId, role: 'RESIDENT' });

    // Seed location for User B within 500m of incident
    await query(
      `INSERT INTO user_locations (user_id, latitude, longitude, location, accuracy, updated_at)
       VALUES ($1, 12.9716, 77.5946, ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326)::geography, 10, NOW())`,
      [userBId]
    );
  });

  afterAll(async () => {
    await query("DELETE FROM incident_verifications WHERE incident_id IN (SELECT id FROM incidents WHERE reporter_id IN (SELECT id FROM users WHERE email LIKE '%@bug8test.org'))");
    await query("DELETE FROM alerts WHERE recipient_user_id IN (SELECT id FROM users WHERE email LIKE '%@bug8test.org')");
    await query("DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@bug8test.org')");
    await query("DELETE FROM user_locations WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@bug8test.org')");
    await query("DELETE FROM incidents WHERE reporter_id IN (SELECT id FROM users WHERE email LIKE '%@bug8test.org')");
    await query("DELETE FROM users WHERE email LIKE '%@bug8test.org'");
    await closePool();
  });

  it('1. Create an incident and confirm it appears on the map and generates active alerts', async () => {
    const createRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        title: 'Smoke from building',
        description: 'Possible kitchen fire on 3rd floor',
        category: 'FIRE',
        severity: 'HIGH',
        latitude: 12.9716,
        longitude: 77.5946,
      });

    expect(createRes.status).toBe(201);
    const incident = createRes.body.data.incident;
    expect(incident.status).toBe('PENDING');

    // Confirm it appears in nearby incidents (Map API)
    const mapRes = await request(app)
      .get('/api/incidents/nearby')
      .set('Authorization', `Bearer ${userAToken}`)
      .query({ latitude: 12.9716, longitude: 77.5946, radius: 5000 });

    expect(mapRes.status).toBe(200);
    const found = mapRes.body.data.incidents.find((i: any) => i.id === incident.id);
    expect(found).toBeDefined();

    // Confirm User B received an active alert
    const alertsRes = await request(app)
      .get('/api/alerts')
      .set('Authorization', `Bearer ${userBToken}`);

    expect(alertsRes.status).toBe(200);
    const alertFound = alertsRes.body.data.alerts.find((a: any) => a.incident_id === incident.id);
    expect(alertFound).toBeDefined();
    expect(alertFound.status).toBe('ACTIVE');
  });

  it('2. Unauthorized cancellation by User B is rejected with 403 Forbidden', async () => {
    // Create an incident owned by User A
    const createRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        title: 'Water Leak',
        description: 'Broken pipe',
        category: 'INFRASTRUCTURE_ISSUE',
        severity: 'LOW',
        latitude: 12.9720,
        longitude: 77.5950,
      });

    const incidentId = createRes.body.data.incident.id;

    // User B tries to cancel User A's incident
    const cancelRes = await request(app)
      .patch(`/api/incidents/${incidentId}/cancel`)
      .set('Authorization', `Bearer ${userBToken}`);

    expect(cancelRes.status).toBe(403);
    expect(cancelRes.body.success).toBe(false);

    // Verify DB remains PENDING
    const check = await query('SELECT status FROM incidents WHERE id = $1', [incidentId]);
    expect(check.rows[0].status).toBe('PENDING');
  });

  it('3. User A successfully cancels their incident: DB updated to CANCELLED, active alerts resolved', async () => {
    // Create an incident owned by User A
    const createRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        title: 'Traffic Congestion',
        description: 'Accident cleared quickly',
        category: 'ACCIDENT',
        severity: 'HIGH',
        latitude: 12.9718,
        longitude: 77.5948,
      });

    const incidentId = createRes.body.data.incident.id;

    // Verify User B has an active alert
    const alertsBefore = await request(app)
      .get('/api/alerts')
      .set('Authorization', `Bearer ${userBToken}`);
    const alertBefore = alertsBefore.body.data.alerts.find((a: any) => a.incident_id === incidentId);
    expect(alertBefore).toBeDefined();
    expect(alertBefore.status).toBe('ACTIVE');

    // User A cancels their incident
    const cancelRes = await request(app)
      .patch(`/api/incidents/${incidentId}/cancel`)
      .set('Authorization', `Bearer ${userAToken}`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.success).toBe(true);
    expect(cancelRes.body.data.incident.status).toBe('CANCELLED');

    // Confirm DB status is CANCELLED
    const dbCheck = await query('SELECT status, updated_at FROM incidents WHERE id = $1', [incidentId]);
    expect(dbCheck.rows[0].status).toBe('CANCELLED');

    // Confirm active alerts for this incident were marked RESOLVED
    const alertCheck = await query('SELECT status FROM alerts WHERE incident_id = $1', [incidentId]);
    expect(alertCheck.rows.length).toBeGreaterThan(0);
    expect(alertCheck.rows.every((r: any) => r.status === 'RESOLVED')).toBe(true);
  });

  it('4. Cancelled incident immediately disappears from active nearby map queries and stays absent on refresh', async () => {
    // Create and cancel an incident
    const createRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        title: 'False Alarm Tree Fall',
        description: 'Branch removed',
        category: 'ROAD_HAZARD',
        severity: 'MEDIUM',
        latitude: 12.9715,
        longitude: 77.5945,
      });

    const incidentId = createRes.body.data.incident.id;

    // Verify it is on the map
    const map1 = await request(app)
      .get('/api/incidents/nearby')
      .set('Authorization', `Bearer ${userBToken}`)
      .query({ latitude: 12.9715, longitude: 77.5945, radius: 5000 });
    expect(map1.body.data.incidents.some((i: any) => i.id === incidentId)).toBe(true);

    // Cancel it
    await request(app)
      .patch(`/api/incidents/${incidentId}/cancel`)
      .set('Authorization', `Bearer ${userAToken}`);

    // Immediately query nearby map API
    const map2 = await request(app)
      .get('/api/incidents/nearby')
      .set('Authorization', `Bearer ${userBToken}`)
      .query({ latitude: 12.9715, longitude: 77.5945, radius: 5000 });
    expect(map2.body.data.incidents.some((i: any) => i.id === incidentId)).toBe(false);

    // Simulate reopen/refresh with different parameters
    const mapRefresh = await request(app)
      .get('/api/incidents/nearby')
      .set('Authorization', `Bearer ${userAToken}`)
      .query({ latitude: 12.9715, longitude: 77.5945, radius: 10000 });
    expect(mapRefresh.body.data.incidents.some((i: any) => i.id === incidentId)).toBe(false);
  });

  it('5. Cancelled incident does not appear as an active Emergency Alert and does not count towards unread active alerts', async () => {
    // Check unread count for User B before
    const countBeforeRes = await request(app)
      .get('/api/alerts/unread-count')
      .set('Authorization', `Bearer ${userBToken}`);
    const unreadCountBefore = countBeforeRes.body.data.count;

    // Create high severity incident
    const createRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        title: 'Chemical Spill',
        description: 'Minor drum leak',
        category: 'OTHER',
        severity: 'CRITICAL',
        latitude: 12.9716,
        longitude: 77.5946,
      });

    const incidentId = createRes.body.data.incident.id;

    // User B unread count should have increased
    const countAfterRes = await request(app)
      .get('/api/alerts/unread-count')
      .set('Authorization', `Bearer ${userBToken}`);
    expect(countAfterRes.body.data.count).toBe(unreadCountBefore + 1);

    // User A cancels incident
    await request(app)
      .patch(`/api/incidents/${incidentId}/cancel`)
      .set('Authorization', `Bearer ${userAToken}`);

    // User B unread count should have returned to original value (active count)
    const countAfterCancelRes = await request(app)
      .get('/api/alerts/unread-count')
      .set('Authorization', `Bearer ${userBToken}`);
    expect(countAfterCancelRes.body.data.count).toBe(unreadCountBefore);

    // Confirm no active alert for this incident exists
    const alertsRes = await request(app)
      .get('/api/alerts')
      .set('Authorization', `Bearer ${userBToken}`);
    const incidentAlert = alertsRes.body.data.alerts.find((a: any) => a.incident_id === incidentId);
    expect(incidentAlert).toBeDefined();
    expect(incidentAlert.status).toBe('RESOLVED');
  });

  it('6. Cancelled incident cannot generate new active alerts via sync or generation', async () => {
    // Create and cancel an incident
    const createRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        title: 'Stray Animal',
        description: 'Animal safely caught',
        category: 'OTHER',
        severity: 'MEDIUM',
        latitude: 12.9716,
        longitude: 77.5946,
      });

    const incidentId = createRes.body.data.incident.id;
    await request(app)
      .patch(`/api/incidents/${incidentId}/cancel`)
      .set('Authorization', `Bearer ${userAToken}`);

    const incCheck = await query('SELECT * FROM incidents WHERE id = $1', [incidentId]);
    const cancelledInc = incCheck.rows[0];

    // Attempt direct alert generation on the cancelled incident record
    const genCount = await AlertService.generateAlertsForIncident(cancelledInc);
    expect(genCount).toBe(0);

    // Attempt syncAlertsForUser
    await AlertService.syncAlertsForUser(userBId);

    // Ensure no ACTIVE alerts exist for this cancelled incident
    const alertCount = await query(
      "SELECT COUNT(*) FROM alerts WHERE incident_id = $1 AND status = 'ACTIVE'",
      [incidentId]
    );
    expect(parseInt(alertCount.rows[0].count, 10)).toBe(0);
  });

  it('7. Preserves Community Verification records and data integrity after cancellation', async () => {
    // Create incident
    const createRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        title: 'Pothole on Main Road',
        description: 'Large pothole near intersection',
        category: 'ROAD_HAZARD',
        severity: 'MEDIUM',
        latitude: 12.9716,
        longitude: 77.5946,
      });

    const incidentId = createRes.body.data.incident.id;

    // User B casts a verification vote
    const voteRes = await request(app)
      .post(`/api/incidents/${incidentId}/verify`)
      .set('Authorization', `Bearer ${userBToken}`)
      .send({ verification_type: 'CONFIRM' });

    expect(voteRes.status).toBe(200);

    // Cancel the incident as User A
    const cancelRes = await request(app)
      .patch(`/api/incidents/${incidentId}/cancel`)
      .set('Authorization', `Bearer ${userAToken}`);

    expect(cancelRes.status).toBe(200);

    // Verify verification records remain intact in DB (not deleted!)
    const verifCheck = await query(
      'SELECT verification_type FROM incident_verifications WHERE incident_id = $1 AND user_id = $2',
      [incidentId, userBId]
    );
    expect(verifCheck.rows.length).toBe(1);
    expect(verifCheck.rows[0].verification_type).toBe('CONFIRM');

    // Confirm that new verifications on cancelled incidents are rejected
    const newVoteRes = await request(app)
      .post(`/api/incidents/${incidentId}/verify`)
      .set('Authorization', `Bearer ${userBToken}`)
      .send({ verification_type: 'DISPUTE' });

    expect(newVoteRes.status).toBe(400);
  });

  it('8. Duplicate cancellation returns 400 with Incident is already cancelled', async () => {
    // Create incident
    const createRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        title: 'Street Light Out',
        description: 'Light repaired',
        category: 'INFRASTRUCTURE_ISSUE',
        severity: 'LOW',
        latitude: 12.9716,
        longitude: 77.5946,
      });

    const incidentId = createRes.body.data.incident.id;

    // First cancel succeeds
    const firstCancel = await request(app)
      .patch(`/api/incidents/${incidentId}/cancel`)
      .set('Authorization', `Bearer ${userAToken}`);
    expect(firstCancel.status).toBe(200);

    // Second cancel is rejected
    const secondCancel = await request(app)
      .patch(`/api/incidents/${incidentId}/cancel`)
      .set('Authorization', `Bearer ${userAToken}`);
    expect(secondCancel.status).toBe(400);
    expect(secondCancel.body.message).toBe('Incident is already cancelled');
  });

  it('9. Audit log correctly records INCIDENT_CANCELLED', async () => {
    // Create incident
    const createRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        title: 'Audit Check Incident',
        description: 'Testing audit log creation',
        category: 'OTHER',
        severity: 'LOW',
        latitude: 12.9716,
        longitude: 77.5946,
      });

    const incidentId = createRes.body.data.incident.id;

    // Cancel
    await request(app)
      .patch(`/api/incidents/${incidentId}/cancel`)
      .set('Authorization', `Bearer ${userAToken}`);

    // Check audit logs
    const auditRes = await query(
      "SELECT action, actor_user_id, entity_type, entity_id FROM audit_logs WHERE entity_id = $1 AND action = 'INCIDENT_CANCELLED'",
      [incidentId]
    );

    expect(auditRes.rows.length).toBeGreaterThan(0);
    expect(auditRes.rows[0].actor_user_id).toBe(userAId);
    expect(auditRes.rows[0].action).toBe('INCIDENT_CANCELLED');
    expect(auditRes.rows[0].entity_type).toBe('incident');
  });
});
