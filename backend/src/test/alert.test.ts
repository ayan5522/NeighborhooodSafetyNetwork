import request from 'supertest';
import { createApp } from '../app';
import { pool, closePool, query } from '../db';
import { hashPassword, generateJwt } from '../utils/crypto';
import { AlertService } from '../services/alertService';

describe('Module 04: Emergency Alert & Response Tests', () => {
  const app = createApp();

  // Test users
  let userAId: string; // Reporter
  let userAToken: string;

  let userBId: string; // Nearby (0.5km away)
  let userBToken: string;

  let userCId: string; // Nearby (1.5km away)
  let userCToken: string;

  let userDId: string; // Far away (10km away)
  let userDToken: string;

  let userStaleId: string; // Stale location (>60m)
  let userStaleToken: string;

  let userSuspendedId: string; // Suspended user nearby
  let userSuspendedToken: string;

  let testIncidentId: string;
  let userBAlertId: string;

  beforeAll(async () => {
    // Clean test data
    await query("DELETE FROM alerts WHERE recipient_user_id IN (SELECT id FROM users WHERE email LIKE '%@alerttest.org')");
    await query("DELETE FROM sos_events WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@alerttest.org')");
    await query("DELETE FROM emergency_contacts WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@alerttest.org')");
    await query("DELETE FROM incidents WHERE reporter_id IN (SELECT id FROM users WHERE email LIKE '%@alerttest.org')");
    await query("DELETE FROM user_locations WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@alerttest.org')");
    await query("DELETE FROM users WHERE email LIKE '%@alerttest.org'");

    const pwdHash = await hashPassword('TestPassword123!');

    // Helper to create user
    const createUser = async (name: string, email: string, status: string = 'ACTIVE') => {
      const res = await query(
        `INSERT INTO users (full_name, email, password_hash, role, account_status)
         VALUES ($1, $2, $3, 'RESIDENT', $4)
         RETURNING id`,
        [name, email, pwdHash, status]
      );
      return res.rows[0].id;
    };

    // User A (Reporter): Lat 12.9716, Lng 77.5946
    userAId = await createUser('User Alpha', 'user.a@alerttest.org');
    userAToken = generateJwt({ user_id: userAId, role: 'RESIDENT' });
    await query(
      `INSERT INTO user_locations (user_id, location, latitude, longitude, updated_at)
       VALUES ($1, ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326)::geography, 12.9716, 77.5946, CURRENT_TIMESTAMP)`,
      [userAId]
    );

    // User B (Nearby, ~500m): Lat 12.9750, Lng 77.5946
    userBId = await createUser('User Beta', 'user.b@alerttest.org');
    userBToken = generateJwt({ user_id: userBId, role: 'RESIDENT' });
    await query(
      `INSERT INTO user_locations (user_id, location, latitude, longitude, updated_at)
       VALUES ($1, ST_SetSRID(ST_MakePoint(77.5946, 12.9750), 4326)::geography, 12.9750, 77.5946, CURRENT_TIMESTAMP)`,
      [userBId]
    );

    // User C (Nearby, ~1.5km): Lat 12.9850, Lng 77.5946
    userCId = await createUser('User Charlie', 'user.c@alerttest.org');
    userCToken = generateJwt({ user_id: userCId, role: 'RESIDENT' });
    await query(
      `INSERT INTO user_locations (user_id, location, latitude, longitude, updated_at)
       VALUES ($1, ST_SetSRID(ST_MakePoint(77.5946, 12.9850), 4326)::geography, 12.9850, 77.5946, CURRENT_TIMESTAMP)`,
      [userCId]
    );

    // User D (Far away, ~15km): Lat 13.1000, Lng 77.5946
    userDId = await createUser('User Delta', 'user.d@alerttest.org');
    userDToken = generateJwt({ user_id: userDId, role: 'RESIDENT' });
    await query(
      `INSERT INTO user_locations (user_id, location, latitude, longitude, updated_at)
       VALUES ($1, ST_SetSRID(ST_MakePoint(77.5946, 13.1000), 4326)::geography, 13.1000, 77.5946, CURRENT_TIMESTAMP)`,
      [userDId]
    );

    // User Stale (Nearby ~500m, but location updated 2 hours ago)
    userStaleId = await createUser('User Stale', 'user.stale@alerttest.org');
    userStaleToken = generateJwt({ user_id: userStaleId, role: 'RESIDENT' });
    await query(
      `INSERT INTO user_locations (user_id, location, latitude, longitude, updated_at)
       VALUES ($1, ST_SetSRID(ST_MakePoint(77.5946, 12.9750), 4326)::geography, 12.9750, 77.5946, NOW() - INTERVAL '120 minutes')`,
      [userStaleId]
    );

    // User Suspended (Nearby ~500m, but account suspended)
    userSuspendedId = await createUser('User Suspended', 'user.suspended@alerttest.org', 'SUSPENDED');
    userSuspendedToken = generateJwt({ user_id: userSuspendedId, role: 'RESIDENT' });
    await query(
      `INSERT INTO user_locations (user_id, location, latitude, longitude, updated_at)
       VALUES ($1, ST_SetSRID(ST_MakePoint(77.5946, 12.9750), 4326)::geography, 12.9750, 77.5946, CURRENT_TIMESTAMP)`,
      [userSuspendedId]
    );
  });

  afterAll(async () => {
    await query("DELETE FROM alerts WHERE recipient_user_id IN (SELECT id FROM users WHERE email LIKE '%@alerttest.org')");
    await query("DELETE FROM sos_events WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@alerttest.org')");
    await query("DELETE FROM emergency_contacts WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@alerttest.org')");
    await query("DELETE FROM incidents WHERE reporter_id IN (SELECT id FROM users WHERE email LIKE '%@alerttest.org')");
    await query("DELETE FROM user_locations WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@alerttest.org')");
    await query("DELETE FROM users WHERE email LIKE '%@alerttest.org'");
    await closePool();
  });

  // 1. Alert generation on incident creation
  it('1. Generates targeted emergency alerts upon incident creation (PostGIS radius)', async () => {
    // User A creates HIGH incident (3km radius)
    const res = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        title: 'Major Fire Breakout',
        description: 'Building fire on commercial street',
        category: 'FIRE',
        severity: 'HIGH',
        latitude: 12.9716,
        longitude: 77.5946,
      });

    expect(res.status).toBe(201);
    testIncidentId = res.body.data.incident.id;

    // Check alerts in database
    const alertsRes = await query(
      `SELECT * FROM alerts WHERE incident_id = $1`,
      [testIncidentId]
    );

    const recipientIds = alertsRes.rows.map((r: any) => r.recipient_user_id);

    // User B (~0.5km) & User C (~1.5km) must receive alert
    expect(recipientIds).toContain(userBId);
    expect(recipientIds).toContain(userCId);

    // User D (~15km outside 3km radius) must NOT receive alert
    expect(recipientIds).not.toContain(userDId);

    // User A (Reporter) must NOT receive alert (Requirement 14 / 70)
    expect(recipientIds).not.toContain(userAId);

    // User Stale (>60min stale location) must NOT receive alert (Requirement 13 / 71)
    expect(recipientIds).not.toContain(userStaleId);

    // User Suspended must NOT receive alert (Requirement 15)
    expect(recipientIds).not.toContain(userSuspendedId);

    // Check priority and status
    const bAlert = alertsRes.rows.find((r: any) => r.recipient_user_id === userBId);
    expect(bAlert.priority).toBe('HIGH');
    expect(bAlert.status).toBe('ACTIVE');
    expect(bAlert.read_at).toBeNull();
    userBAlertId = bAlert.id;
  });

  // 2. Duplicate alert prevention
  it('2. Prevents duplicate alert records for the same incident and recipient', async () => {
    const incRes = await query(`SELECT * FROM incidents WHERE id = $1`, [testIncidentId]);
    const incident = incRes.rows[0];

    // Trigger alert generation again for the same incident
    const count = await AlertService.generateAlertsForIncident(incident);
    expect(count).toBe(0); // 0 new alerts generated due to ON CONFLICT DO NOTHING

    // Verify total count in DB didn't duplicate
    const totalAlerts = await query(
      `SELECT COUNT(*) FROM alerts WHERE incident_id = $1 AND recipient_user_id = $2`,
      [testIncidentId, userBId]
    );
    expect(parseInt(totalAlerts.rows[0].count, 10)).toBe(1);
  });

  // 3. User alerts feed
  it('3. GET /api/alerts returns only alerts for authenticated user, newest first', async () => {
    const res = await request(app)
      .get('/api/alerts')
      .set('Authorization', `Bearer ${userBToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.alerts)).toBe(true);
    expect(res.body.data.alerts.length).toBeGreaterThanOrEqual(1);

    const first = res.body.data.alerts[0];
    expect(first.recipient_user_id).toBe(userBId);
    expect(first.incident.title).toBe('Major Fire Breakout');
    expect(first.incident.category).toBe('FIRE');
    expect(first.incident.severity).toBe('HIGH');
    // Privacy: no reporter email/phone
    expect(first.incident.reporter_email).toBeUndefined();
    expect(first.incident.reporter_phone).toBeUndefined();
  });

  // 4. Unread count API
  it('4. GET /api/alerts/unread-count returns accurate count of active unread alerts', async () => {
    const res = await request(app)
      .get('/api/alerts/unread-count')
      .set('Authorization', `Bearer ${userBToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.count).toBeGreaterThanOrEqual(1);
  });

  // 5. Alert detail API and IDOR protection
  it('5. GET /api/alerts/:id enforces IDOR protection', async () => {
    // User B accesses their own alert -> 200
    const ownRes = await request(app)
      .get(`/api/alerts/${userBAlertId}`)
      .set('Authorization', `Bearer ${userBToken}`);

    expect(ownRes.status).toBe(200);
    expect(ownRes.body.data.alert.id).toBe(userBAlertId);

    // User C attempts to access User B's alert -> 403 Forbidden
    const forbiddenRes = await request(app)
      .get(`/api/alerts/${userBAlertId}`)
      .set('Authorization', `Bearer ${userCToken}`);

    expect(forbiddenRes.status).toBe(403);
    expect(forbiddenRes.body.success).toBe(false);
  });

  // 6. Mark alert read API and IDOR
  it('6. PATCH /api/alerts/:id/read marks alert as read with IDOR protection', async () => {
    // User C attempts to mark User B's alert as read -> 403
    const forbiddenRes = await request(app)
      .patch(`/api/alerts/${userBAlertId}/read`)
      .set('Authorization', `Bearer ${userCToken}`);

    expect(forbiddenRes.status).toBe(403);

    // User B marks their alert as read -> 200
    const res = await request(app)
      .patch(`/api/alerts/${userBAlertId}/read`)
      .set('Authorization', `Bearer ${userBToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.alert.read_at).not.toBeNull();

    // Verify unread count decreases
    const unreadRes = await request(app)
      .get('/api/alerts/unread-count')
      .set('Authorization', `Bearer ${userBToken}`);

    expect(unreadRes.body.data.count).toBe(0);
  });

  // 7. Alert expiration handling
  it('7. Normalizes expired alerts when expires_at <= NOW()', async () => {
    // Artificially expire user C's alert
    await query(
      `UPDATE alerts SET expires_at = NOW() - INTERVAL '10 minutes' WHERE recipient_user_id = $1`,
      [userCId]
    );

    // Fetch user C alerts -> status should be normalized to EXPIRED
    const res = await request(app)
      .get('/api/alerts')
      .set('Authorization', `Bearer ${userCToken}`);

    expect(res.status).toBe(200);
    const expiredAlert = res.body.data.alerts.find((a: any) => a.recipient_user_id === userCId);
    expect(expiredAlert.status).toBe('EXPIRED');

    // Unread count must not count expired alerts
    const unreadRes = await request(app)
      .get('/api/alerts/unread-count')
      .set('Authorization', `Bearer ${userCToken}`);
    expect(unreadRes.body.data.count).toBe(0);
  });

  // 8. Incident cancellation resolves active alerts
  it('8. Cancelling an incident marks related active alerts as RESOLVED', async () => {
    // Create new incident
    const incRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        title: 'Road Closure at Gate 2',
        description: 'Gate 2 blocked temporarily',
        category: 'ROAD_HAZARD',
        severity: 'MEDIUM',
        latitude: 12.9716,
        longitude: 77.5946,
      });

    const newIncId = incRes.body.data.incident.id;

    // Check alert was created for User B
    const alertsBefore = await query(
      `SELECT * FROM alerts WHERE incident_id = $1 AND recipient_user_id = $2`,
      [newIncId, userBId]
    );
    expect(alertsBefore.rows.length).toBe(1);
    expect(alertsBefore.rows[0].status).toBe('ACTIVE');

    // Cancel incident
    const cancelRes = await request(app)
      .patch(`/api/incidents/${newIncId}/cancel`)
      .set('Authorization', `Bearer ${userAToken}`);
    expect(cancelRes.status).toBe(200);

    // Verify alert is now RESOLVED
    const alertsAfter = await query(
      `SELECT * FROM alerts WHERE incident_id = $1 AND recipient_user_id = $2`,
      [newIncId, userBId]
    );
    expect(alertsAfter.rows[0].status).toBe('RESOLVED');
  });

  // 9. Emergency Contacts APIs
  it('9. Emergency Contact CRUD with primary flag and IDOR protection', async () => {
    // User A creates primary contact
    const createRes1 = await request(app)
      .post('/api/emergency-contacts')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        contact_name: 'Dr. Jane Doe',
        phone_number: '+919876543210',
        is_primary: true,
      });

    expect(createRes1.status).toBe(201);
    expect(createRes1.body.data.contact.contact_name).toBe('Dr. Jane Doe');
    expect(createRes1.body.data.contact.is_primary).toBe(true);
    const contact1Id = createRes1.body.data.contact.id;

    // User A creates second contact, also primary -> demotes first contact
    const createRes2 = await request(app)
      .post('/api/emergency-contacts')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        contact_name: 'John Brother',
        phone_number: '9876501234',
        is_primary: true,
      });

    expect(createRes2.status).toBe(201);
    expect(createRes2.body.data.contact.is_primary).toBe(true);
    const contact2Id = createRes2.body.data.contact.id;

    // Verify User A contacts list
    const listRes = await request(app)
      .get('/api/emergency-contacts')
      .set('Authorization', `Bearer ${userAToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.contacts.length).toBe(2);
    const primary = listRes.body.data.contacts.find((c: any) => c.is_primary);
    expect(primary.id).toBe(contact2Id);

    // IDOR test: User B attempts to delete User A contact -> 403
    const forbiddenDelete = await request(app)
      .delete(`/api/emergency-contacts/${contact1Id}`)
      .set('Authorization', `Bearer ${userBToken}`);

    expect(forbiddenDelete.status).toBe(403);

    // User A deletes contact2 (the primary) -> contact1 promoted to primary
    const deleteRes = await request(app)
      .delete(`/api/emergency-contacts/${contact2Id}`)
      .set('Authorization', `Bearer ${userAToken}`);

    expect(deleteRes.status).toBe(200);

    const afterDelete = await request(app)
      .get('/api/emergency-contacts')
      .set('Authorization', `Bearer ${userAToken}`);

    expect(afterDelete.body.data.contacts.length).toBe(1);
    expect(afterDelete.body.data.contacts[0].id).toBe(contact1Id);
    expect(afterDelete.body.data.contacts[0].is_primary).toBe(true);
  });

  // 10. Personal SOS APIs
  it('10. Personal SOS flow with duplicate active prevention and IDOR protection', async () => {
    // User A creates SOS
    const sosRes = await request(app)
      .post('/api/sos')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        latitude: 12.9716,
        longitude: 77.5946,
      });

    expect(sosRes.status).toBe(201);
    expect(sosRes.body.data.sos.status).toBe('ACTIVE');
    expect(sosRes.body.data.is_existing).toBe(false);
    const sosId = sosRes.body.data.sos.id;

    // Requirement 43: Calling SOS again while active returns existing active SOS without creating duplicate
    const duplicateRes = await request(app)
      .post('/api/sos')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        latitude: 12.9716,
        longitude: 77.5946,
      });

    expect(duplicateRes.status).toBe(201);
    expect(duplicateRes.body.data.sos.id).toBe(sosId);
    expect(duplicateRes.body.data.is_existing).toBe(true);

    // User A gets their SOS events
    const mySos = await request(app)
      .get('/api/sos/my')
      .set('Authorization', `Bearer ${userAToken}`);

    expect(mySos.status).toBe(200);
    expect(mySos.body.data.sos_events.length).toBe(1);

    // IDOR test: User B tries to resolve User A SOS -> 403
    const forbiddenResolve = await request(app)
      .patch(`/api/sos/${sosId}/resolve`)
      .set('Authorization', `Bearer ${userBToken}`);

    expect(forbiddenResolve.status).toBe(403);

    // User A resolves own SOS -> 200
    const resolveRes = await request(app)
      .patch(`/api/sos/${sosId}/resolve`)
      .set('Authorization', `Bearer ${userAToken}`);

    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.data.sos.status).toBe('RESOLVED');
    expect(resolveRes.body.data.sos.resolved_at).not.toBeNull();
  });
});
