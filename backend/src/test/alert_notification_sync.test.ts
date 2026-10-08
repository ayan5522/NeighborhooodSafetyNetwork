import http from 'http';
import request from 'supertest';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { createApp } from '../app';
import { pool, closePool, query } from '../db';
import { hashPassword, generateJwt } from '../utils/crypto';
import { initSocketServer, setIo } from '../socket';

describe('Emergency Alert & Notification Synchronization Tests', () => {
  const app = createApp();
  let server: http.Server;
  let serverPort: number;

  let userAId: string;
  let userAToken: string;

  let userBId: string;
  let userBToken: string;

  let userCId: string;
  let userCToken: string;

  let clientSocketB: ClientSocketType | null = null;
  let clientSocketC: ClientSocketType | null = null;

  beforeAll((done) => {
    server = http.createServer(app);
    initSocketServer(server);

    server.listen(0, async () => {
      const addr = server.address() as any;
      serverPort = addr.port;

      // Clean prior test data
      await query("DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@synctest.org')");
      await query("DELETE FROM alerts WHERE recipient_user_id IN (SELECT id FROM users WHERE email LIKE '%@synctest.org')");
      await query("DELETE FROM incidents WHERE reporter_id IN (SELECT id FROM users WHERE email LIKE '%@synctest.org')");
      await query("DELETE FROM user_locations WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@synctest.org')");
      await query("DELETE FROM users WHERE email LIKE '%@synctest.org'");

      const pwdHash = await hashPassword('SyncPassword123!');

      // User A (Reporter) - Base: 12.9716, 77.5946
      const uARes = await query(
        `INSERT INTO users (full_name, email, password_hash, role, account_status)
         VALUES ('Reporter User A', 'user.a@synctest.org', $1, 'RESIDENT', 'ACTIVE')
         RETURNING id`,
        [pwdHash]
      );
      userAId = uARes.rows[0].id;
      userAToken = generateJwt({ user_id: userAId, role: 'RESIDENT' });

      // User B (Neighbor - already logged in)
      const uBRes = await query(
        `INSERT INTO users (full_name, email, password_hash, role, account_status)
         VALUES ('Neighbor User B', 'user.b@synctest.org', $1, 'RESIDENT', 'ACTIVE')
         RETURNING id`,
        [pwdHash]
      );
      userBId = uBRes.rows[0].id;
      userBToken = generateJwt({ user_id: userBId, role: 'RESIDENT' });

      // User C (Late-joining user)
      const uCRes = await query(
        `INSERT INTO users (full_name, email, password_hash, role, account_status)
         VALUES ('Late User C', 'user.c@synctest.org', $1, 'RESIDENT', 'ACTIVE')
         RETURNING id`,
        [pwdHash]
      );
      userCId = uCRes.rows[0].id;
      userCToken = generateJwt({ user_id: userCId, role: 'RESIDENT' });

      // User B initial location: 500m away (inside 2000m MEDIUM radius)
      await query(
        `INSERT INTO user_locations (user_id, latitude, longitude, location, accuracy, updated_at)
         VALUES ($1, 12.9750, 77.5946, ST_SetSRID(ST_MakePoint(77.5946, 12.9750), 4326)::geography, 10, CURRENT_TIMESTAMP)`,
        [userBId]
      );

      done();
    });
  });

  afterAll((done) => {
    if (clientSocketB?.connected) clientSocketB.disconnect();
    if (clientSocketC?.connected) clientSocketC.disconnect();
    setIo(null);
    query("DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@synctest.org')")
      .then(() => query("DELETE FROM alerts WHERE recipient_user_id IN (SELECT id FROM users WHERE email LIKE '%@synctest.org')"))
      .then(() => query("DELETE FROM incidents WHERE reporter_id IN (SELECT id FROM users WHERE email LIKE '%@synctest.org')"))
      .then(() => query("DELETE FROM user_locations WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@synctest.org')"))
      .then(() => query("DELETE FROM users WHERE email LIKE '%@synctest.org'"))
      .finally(() => {
        server.close(() => {
          closePool().then(() => done());
        });
      });
  });

  it('1. User A creates Incident #1 -> User B receives Alert & Notification immediately on Socket & REST without Incident #2', async () => {
    // Connect User B socket
    clientSocketB = ClientSocket(`http://localhost:${serverPort}`, {
      auth: { token: userBToken },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve) => {
      clientSocketB!.on('connect', () => resolve());
    });

    const receivedNotifPromise = new Promise<any>((resolve) => {
      clientSocketB!.on('notification:new', (notif: any) => {
        resolve(notif);
      });
    });

    // User A creates Incident #1 (MEDIUM severity -> 2000m radius)
    const incRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        category: 'ROAD_HAZARD',
        title: 'Water Main Break on 5th Ave',
        description: 'Road flooded, avoid the area.',
        severity: 'MEDIUM',
        latitude: 12.9716,
        longitude: 77.5946,
      });

    expect(incRes.status).toBe(201);
    const incidentId = incRes.body.data.incident.id;

    // Verify real-time Socket.IO notification arrived for User B
    const socketNotif: any = await receivedNotifPromise;
    expect(socketNotif.user_id).toBe(userBId);
    expect(socketNotif.type).toBe('ALERT_CREATED');
    expect(socketNotif.incident_id).toBe(incidentId);

    // Verify REST GET /api/alerts shows the alert immediately
    const alertsRes = await request(app)
      .get('/api/alerts')
      .set('Authorization', `Bearer ${userBToken}`);

    expect(alertsRes.status).toBe(200);
    expect(alertsRes.body.data.alerts.length).toBeGreaterThanOrEqual(1);
    const alert = alertsRes.body.data.alerts.find((a: any) => a.incident_id === incidentId);
    expect(alert).toBeDefined();
    expect(alert.status).toBe('ACTIVE');

    // Verify REST GET /api/notifications shows the notification immediately
    const notifsRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${userBToken}`);

    expect(notifsRes.status).toBe(200);
    const notif = notifsRes.body.data.notifications.find((n: any) => n.incident_id === incidentId);
    expect(notif).toBeDefined();
  });

  it('2. User outside radius does not get alert initially, but gets it immediately upon moving into radius', async () => {
    // Set User C location far away (15km)
    await query(
      `INSERT INTO user_locations (user_id, latitude, longitude, location, accuracy, updated_at)
       VALUES ($1, 13.1000, 77.5946, ST_SetSRID(ST_MakePoint(77.5946, 13.1000), 4326)::geography, 10, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET location = EXCLUDED.location, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, updated_at = CURRENT_TIMESTAMP`,
      [userCId]
    );

    // User A creates Incident #2 (LOW severity -> 1000m radius) at 12.9716, 77.5946
    const incRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        category: 'OTHER',
        title: 'Street Lamp Broken',
        description: 'Dark alleyway, exercise caution.',
        severity: 'LOW',
        latitude: 12.9716,
        longitude: 77.5946,
      });

    expect(incRes.status).toBe(201);
    const incident2Id = incRes.body.data.incident.id;

    // Check User C alerts before moving: User C must NOT have alert for Incident #2
    const cAlertsBefore = await request(app)
      .get('/api/alerts')
      .set('Authorization', `Bearer ${userCToken}`);

    const hasAlertBefore = cAlertsBefore.body.data.alerts.some((a: any) => a.incident_id === incident2Id);
    expect(hasAlertBefore).toBe(false);

    // Connect User C socket to listen for real-time update when moving into radius
    clientSocketC = ClientSocket(`http://localhost:${serverPort}`, {
      auth: { token: userCToken },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve) => {
      clientSocketC!.on('connect', () => resolve());
    });

    const cNotifPromise = new Promise<any>((resolve) => {
      clientSocketC!.on('notification:new', (notif: any) => {
        if (notif.incident_id === incident2Id) {
          resolve(notif);
        }
      });
    });

    // User C moves into radius (300m away: 12.9730, 77.5946) via POST /api/location
    const moveRes = await request(app)
      .post('/api/location')
      .set('Authorization', `Bearer ${userCToken}`)
      .send({
        latitude: 12.9730,
        longitude: 77.5946,
        accuracy: 10,
      });

    expect(moveRes.status).toBe(200);

    // Socket notification must be delivered to User C
    const cNotif = await cNotifPromise;
    expect(cNotif.user_id).toBe(userCId);
    expect(cNotif.incident_id).toBe(incident2Id);

    // REST GET /api/alerts must now include the alert for User C
    const cAlertsAfter = await request(app)
      .get('/api/alerts')
      .set('Authorization', `Bearer ${userCToken}`);

    const hasAlertAfter = cAlertsAfter.body.data.alerts.some((a: any) => a.incident_id === incident2Id);
    expect(hasAlertAfter).toBe(true);
  });

  it('3. User C logging in later receives all existing active eligible alerts upon initial location sync', async () => {
    // Create a new user D who was not logged in when previous incidents were created
    const pwdHash = await hashPassword('UserDPassword123!');
    const uDRes = await query(
      `INSERT INTO users (full_name, email, password_hash, role, account_status)
       VALUES ('Late User D', 'user.d@synctest.org', $1, 'RESIDENT', 'ACTIVE')
       RETURNING id`,
      [pwdHash]
    );
    const userDId = uDRes.rows[0].id;
    const userDToken = generateJwt({ user_id: userDId, role: 'RESIDENT' });

    // User D syncs location inside the neighborhood
    await request(app)
      .post('/api/location')
      .set('Authorization', `Bearer ${userDToken}`)
      .send({
        latitude: 12.9725,
        longitude: 77.5946,
        accuracy: 10,
      });

    // User D calls GET /api/alerts - must see active incidents immediately
    const dAlerts = await request(app)
      .get('/api/alerts')
      .set('Authorization', `Bearer ${userDToken}`);

    expect(dAlerts.status).toBe(200);
    expect(dAlerts.body.data.alerts.length).toBeGreaterThanOrEqual(1);

    // User D calls GET /api/notifications - must see notifications
    const dNotifs = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${userDToken}`);

    expect(dNotifs.status).toBe(200);
    expect(dNotifs.body.data.notifications.length).toBeGreaterThanOrEqual(1);
  });

  it('4. Duplicate prevention: repeated location updates and API calls never duplicate alerts or notifications', async () => {
    // Call POST /api/location multiple times for User B
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/location')
        .set('Authorization', `Bearer ${userBToken}`)
        .send({
          latitude: 12.9750,
          longitude: 77.5946,
          accuracy: 10,
        });
    }

    // Call GET /api/alerts multiple times
    for (let i = 0; i < 3; i++) {
      await request(app)
        .get('/api/alerts')
        .set('Authorization', `Bearer ${userBToken}`);
    }

    // Verify in database: exactly ONE alert per incident for User B
    const alertsInDb = await query(
      `SELECT incident_id, COUNT(*) as cnt FROM alerts WHERE recipient_user_id = $1 GROUP BY incident_id`,
      [userBId]
    );

    for (const row of alertsInDb.rows) {
      expect(parseInt(row.cnt, 10)).toBe(1);
    }

    // Verify in database: exactly ONE notification per alert for User B
    const notifsInDb = await query(
      `SELECT alert_id, type, COUNT(*) as cnt FROM notifications WHERE user_id = $1 AND alert_id IS NOT NULL GROUP BY alert_id, type`,
      [userBId]
    );

    for (const row of notifsInDb.rows) {
      expect(parseInt(row.cnt, 10)).toBe(1);
    }
  });

  it('5. Resolved or cancelled incidents do not generate active alerts', async () => {
    // User A creates an incident and resolves it
    const incRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        category: 'FIRE',
        title: 'Trash Fire Extinguished',
        description: 'Fire department has cleared the scene.',
        severity: 'HIGH',
        latitude: 12.9716,
        longitude: 77.5946,
      });

    const incId = incRes.body.data.incident.id;

    // Resolve the incident
    await query(`UPDATE incidents SET status = 'RESOLVED' WHERE id = $1`, [incId]);

    // Create a new user E nearby
    const pwdHash = await hashPassword('UserEPassword123!');
    const uERes = await query(
      `INSERT INTO users (full_name, email, password_hash, role, account_status)
       VALUES ('New User E', 'user.e@synctest.org', $1, 'RESIDENT', 'ACTIVE')
       RETURNING id`,
      [pwdHash]
    );
    const userEId = uERes.rows[0].id;
    const userEToken = generateJwt({ user_id: userEId, role: 'RESIDENT' });

    // User E syncs location
    await request(app)
      .post('/api/location')
      .set('Authorization', `Bearer ${userEToken}`)
      .send({
        latitude: 12.9720,
        longitude: 77.5946,
        accuracy: 10,
      });

    // Check User E alerts: MUST NOT contain an ACTIVE alert for the resolved incident
    const eAlerts = await request(app)
      .get('/api/alerts')
      .set('Authorization', `Bearer ${userEToken}`);

    const resolvedAlert = eAlerts.body.data.alerts.find((a: any) => a.incident_id === incId && a.status === 'ACTIVE');
    expect(resolvedAlert).toBeUndefined();
  });

  it('6. Map incident query continues to return active nearby incidents without regression', async () => {
    const mapRes = await request(app)
      .get('/api/incidents/nearby?latitude=12.9716&longitude=77.5946&radius=5000')
      .set('Authorization', `Bearer ${userBToken}`);

    expect(mapRes.status).toBe(200);
    expect(mapRes.body.success).toBe(true);
    expect(mapRes.body.data.incidents.length).toBeGreaterThanOrEqual(1);
  });
});
