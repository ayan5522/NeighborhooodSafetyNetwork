import http from 'http';
import request from 'supertest';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { createApp } from '../app';
import { pool, closePool, query } from '../db';
import { hashPassword, generateJwt } from '../utils/crypto';
import { initSocketServer, setIo } from '../socket';
import { NotificationService } from '../services/notificationService';
import { AlertService } from '../services/alertService';
import { VerificationService } from '../services/verificationService';
import { IncidentService } from '../services/incidentService';

describe('Module 06: Real-Time Communication & Notifications Tests', () => {
  const app = createApp();
  let server: http.Server;
  let serverPort: number;

  let userAId: string;
  let userAToken: string;
  let userBId: string;
  let userBToken: string;

  let clientSocketA: ClientSocketType | null = null;
  let clientSocketB: ClientSocketType | null = null;

  beforeAll((done) => {
    // Start test HTTP server with Socket.IO
    server = http.createServer(app);
    initSocketServer(server);

    server.listen(0, async () => {
      const addr = server.address() as any;
      serverPort = addr.port;

      // Clean prior test data
      await query("DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@notiftest.org')");
      await query("DELETE FROM alerts WHERE recipient_user_id IN (SELECT id FROM users WHERE email LIKE '%@notiftest.org')");
      await query("DELETE FROM incident_verifications WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@notiftest.org')");
      await query("DELETE FROM incidents WHERE reporter_id IN (SELECT id FROM users WHERE email LIKE '%@notiftest.org')");
      await query("DELETE FROM user_locations WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@notiftest.org')");
      await query("DELETE FROM users WHERE email LIKE '%@notiftest.org'");

      const pwdHash = await hashPassword('NotifPassword123!');

      // User A (Reporter)
      const uARes = await query(
        `INSERT INTO users (full_name, email, password_hash, role, account_status)
         VALUES ('Reporter User A', 'user.a@notiftest.org', $1, 'RESIDENT', 'ACTIVE')
         RETURNING id`,
        [pwdHash]
      );
      userAId = uARes.rows[0].id;
      userAToken = generateJwt({ user_id: userAId, role: 'RESIDENT' });

      // User B (Neighbor)
      const uBRes = await query(
        `INSERT INTO users (full_name, email, password_hash, role, account_status)
         VALUES ('Neighbor User B', 'user.b@notiftest.org', $1, 'RESIDENT', 'ACTIVE')
         RETURNING id`,
        [pwdHash]
      );
      userBId = uBRes.rows[0].id;
      userBToken = generateJwt({ user_id: userBId, role: 'RESIDENT' });

      // Set User B location (500 meters from User A incident coordinates 12.9716, 77.5946)
      await query(
        `INSERT INTO user_locations (user_id, latitude, longitude, location, accuracy, updated_at)
         VALUES ($1, 12.9720, 77.5950, ST_SetSRID(ST_MakePoint(77.5950, 12.9720), 4326)::geography, 10, CURRENT_TIMESTAMP)`,
        [userBId]
      );

      done();
    });
  });

  afterAll(async () => {
    if (clientSocketA && clientSocketA.connected) {
      clientSocketA.disconnect();
    }
    if (clientSocketB && clientSocketB.connected) {
      clientSocketB.disconnect();
    }

    setIo(null);

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

    await query("DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@notiftest.org')");
    await query("DELETE FROM alerts WHERE recipient_user_id IN (SELECT id FROM users WHERE email LIKE '%@notiftest.org')");
    await query("DELETE FROM incident_verifications WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@notiftest.org')");
    await query("DELETE FROM incidents WHERE reporter_id IN (SELECT id FROM users WHERE email LIKE '%@notiftest.org')");
    await query("DELETE FROM user_locations WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@notiftest.org')");
    await query("DELETE FROM users WHERE email LIKE '%@notiftest.org'");
    await closePool();
  });

  // 1. Unauthenticated REST calls return 401
  it('1. Unauthenticated calls to notification endpoints return 401', async () => {
    const listRes = await request(app).get('/api/notifications');
    expect(listRes.status).toBe(401);

    const unreadRes = await request(app).get('/api/notifications/unread-count');
    expect(unreadRes.status).toBe(401);

    const readAllRes = await request(app).patch('/api/notifications/read-all');
    expect(readAllRes.status).toBe(401);

    const readOneRes = await request(app).patch('/api/notifications/00000000-0000-0000-0000-000000000000/read');
    expect(readOneRes.status).toBe(401);
  });

  // 2. Socket connection without auth token is rejected
  it('2. Socket.IO connection without JWT is rejected', (done) => {
    const socket = ClientSocket(`http://localhost:${serverPort}`, {
      transports: ['websocket'],
      autoConnect: true,
    });

    socket.on('connect_error', (err) => {
      expect(err.message).toContain('Authentication error');
      socket.disconnect();
      done();
    });

    socket.on('connect', () => {
      socket.disconnect();
      done(new Error('Socket should not have connected without token'));
    });
  });

  // 3. Socket connection with invalid JWT is rejected
  it('3. Socket.IO connection with invalid JWT is rejected', (done) => {
    const socket = ClientSocket(`http://localhost:${serverPort}`, {
      auth: { token: 'invalid_malformed_token' },
      transports: ['websocket'],
      autoConnect: true,
    });

    socket.on('connect_error', (err) => {
      expect(err.message).toContain('Authentication error');
      socket.disconnect();
      done();
    });

    socket.on('connect', () => {
      socket.disconnect();
      done(new Error('Socket should not have connected with invalid token'));
    });
  });

  // 4. Socket connection with valid JWT connects and joins user room
  it('4. Socket.IO connection with valid JWT connects successfully', (done) => {
    clientSocketB = ClientSocket(`http://localhost:${serverPort}`, {
      auth: { token: userBToken },
      transports: ['websocket'],
      autoConnect: true,
    });

    clientSocketB.on('connect', () => {
      expect(clientSocketB?.connected).toBe(true);
      done();
    });

    clientSocketB.on('connect_error', (err) => {
      done(err);
    });
  });

  // 5. Real-time Incident -> Alert -> Notification -> Socket emission flow
  it('5. Incident creation generates alert, persists notification in DB, and emits notification:new to recipient socket', (done) => {
    let notificationReceived = false;

    // Listen on User B socket
    clientSocketB?.once('notification:new', (payload) => {
      notificationReceived = true;
      expect(payload).toBeDefined();
      expect(payload.type).toBe('ALERT_CREATED');
      expect(payload.user_id).toBe(userBId);
      expect(payload.is_read).toBe(false);
      expect(payload.title).toContain('Safety alert');
      expect(payload.incident_id).toBeDefined();
      expect(payload.alert_id).toBeDefined();
    });

    // User A creates incident
    request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        title: 'Road Blockage on Main Road',
        description: 'Fallen tree blocking both lanes',
        category: 'ROAD_HAZARD',
        severity: 'HIGH',
        latitude: 12.9716,
        longitude: 77.5946,
      })
      .then(async (res) => {
        expect(res.status).toBe(201);
        const incidentId = res.body.data.incident.id;

        // Allow a brief moment for socket delivery
        setTimeout(async () => {
          expect(notificationReceived).toBe(true);

          // Verify notification was stored in DB first
          const dbNotifs = await NotificationService.getUserNotifications(userBId);
          expect(dbNotifs.total).toBeGreaterThanOrEqual(1);
          const found = dbNotifs.notifications.find((n) => n.incident_id === incidentId);
          expect(found).toBeDefined();
          expect(found?.type).toBe('ALERT_CREATED');
          expect(found?.is_read).toBe(false);

          done();
        }, 150);
      })
      .catch((err) => done(err));
  });

  // 6. Socket room isolation: User A does not receive User B notifications
  it('6. Socket room isolation: User A does not receive User B notifications', (done) => {
    clientSocketA = ClientSocket(`http://localhost:${serverPort}`, {
      auth: { token: userAToken },
      transports: ['websocket'],
      autoConnect: true,
    });

    clientSocketA.on('connect', () => {
      let userAReceivedEvent = false;

      clientSocketA?.on('notification:new', (payload) => {
        if (payload.user_id === userBId) {
          userAReceivedEvent = true;
        }
      });

      // Directly create notification for User B
      NotificationService.createNotification({
        user_id: userBId,
        type: 'SYSTEM',
        title: 'System Notice for B',
        message: 'This is a private message for B',
      }).then(() => {
        setTimeout(() => {
          expect(userAReceivedEvent).toBe(false);
          done();
        }, 100);
      });
    });
  });

  // 7. Offline user handling: notification persisted in DB, available via REST on reconnect
  it('7. Offline recipient receives persisted notification via REST GET /api/notifications', async () => {
    // Disconnect User B socket to simulate being offline
    if (clientSocketB && clientSocketB.connected) {
      clientSocketB.disconnect();
    }

    // Create incident while User B is offline
    const incRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        title: 'Water Main Break Offline Test',
        description: 'Flooding intersection',
        category: 'FLOOD_WATERLOGGING',
        severity: 'CRITICAL',
        latitude: 12.9716,
        longitude: 77.5946,
      });

    expect(incRes.status).toBe(201);
    const incidentId = incRes.body.data.incident.id;

    // User B calls REST GET /api/notifications
    const listRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${userBToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);

    const offlineNotif = listRes.body.data.notifications.find(
      (n: any) => n.incident_id === incidentId
    );
    expect(offlineNotif).toBeDefined();
    expect(offlineNotif.type).toBe('ALERT_CREATED');
    expect(offlineNotif.is_read).toBe(false);
  });

  // 8. GET /api/notifications/unread-count returns accurate count
  it('8. GET /api/notifications/unread-count returns exact count of unread notifications', async () => {
    const res = await request(app)
      .get('/api/notifications/unread-count')
      .set('Authorization', `Bearer ${userBToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.count).toBe('number');
    expect(res.body.data.count).toBeGreaterThan(0);
  });

  // 9. PATCH /api/notifications/:id/read marks notification as read (idempotent)
  it('9. PATCH /api/notifications/:id/read marks single notification as read with read_at timestamp', async () => {
    const listRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${userBToken}`);

    const unread = listRes.body.data.notifications.find((n: any) => !n.is_read);
    expect(unread).toBeDefined();

    const readRes = await request(app)
      .patch(`/api/notifications/${unread.id}/read`)
      .set('Authorization', `Bearer ${userBToken}`);

    expect(readRes.status).toBe(200);
    expect(readRes.body.success).toBe(true);
    expect(readRes.body.data.notification.is_read).toBe(true);
    expect(readRes.body.data.notification.read_at).not.toBeNull();

    // Idempotent check
    const idempotentRes = await request(app)
      .patch(`/api/notifications/${unread.id}/read`)
      .set('Authorization', `Bearer ${userBToken}`);

    expect(idempotentRes.status).toBe(200);
    expect(idempotentRes.body.data.notification.is_read).toBe(true);
  });

  // 10. Security / IDOR: User A cannot read or mark read User B notification
  it('10. SECURITY / IDOR: User A cannot read or mark User B notification as read (returns 403)', async () => {
    const listRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${userBToken}`);

    const bNotif = listRes.body.data.notifications[0];
    expect(bNotif).toBeDefined();

    // User A tries to GET User B's notification
    const getRes = await request(app)
      .get(`/api/notifications/${bNotif.id}`)
      .set('Authorization', `Bearer ${userAToken}`);

    expect(getRes.status).toBe(403);
    expect(getRes.body.message).toContain('Access denied');

    // User A tries to PATCH User B's notification as read
    const patchRes = await request(app)
      .patch(`/api/notifications/${bNotif.id}/read`)
      .set('Authorization', `Bearer ${userAToken}`);

    expect(patchRes.status).toBe(403);
    expect(patchRes.body.message).toContain('Access denied');
  });

  // 11. PATCH /api/notifications/read-all marks all unread notifications read for the caller
  it('11. PATCH /api/notifications/read-all marks all notifications read for current user', async () => {
    const readAllRes = await request(app)
      .patch('/api/notifications/read-all')
      .set('Authorization', `Bearer ${userBToken}`);

    expect(readAllRes.status).toBe(200);
    expect(readAllRes.body.success).toBe(true);
    expect(readAllRes.body.data.updated_count).toBeDefined();

    // Unread count should now be 0
    const countRes = await request(app)
      .get('/api/notifications/unread-count')
      .set('Authorization', `Bearer ${userBToken}`);

    expect(countRes.status).toBe(200);
    expect(countRes.body.data.count).toBe(0);
  });

  // 12. Alert Resolution generates ALERT_RESOLVED notification
  it('12. Alert resolution triggers ALERT_RESOLVED notification for recipient', async () => {
    // User A creates an incident that generates alert for B
    const incRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        title: 'Minor Street Hazard',
        description: 'Trash on road',
        category: 'ROAD_HAZARD',
        severity: 'MEDIUM',
        latitude: 12.9716,
        longitude: 77.5946,
      });

    const incidentId = incRes.body.data.incident.id;

    // User A cancels the incident (which triggers alert resolution)
    const cancelRes = await request(app)
      .patch(`/api/incidents/${incidentId}/cancel`)
      .set('Authorization', `Bearer ${userAToken}`);

    expect(cancelRes.status).toBe(200);

    // User B should have an ALERT_RESOLVED notification
    const listRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${userBToken}`);

    const resolvedNotif = listRes.body.data.notifications.find(
      (n: any) => n.type === 'ALERT_RESOLVED' && n.incident_id === incidentId
    );
    expect(resolvedNotif).toBeDefined();
    expect(resolvedNotif.title).toContain('Resolved');
  });

  // 13. Community Verification generates COMMUNITY_VERIFICATION notification for reporter
  it('13. Community verification generates COMMUNITY_VERIFICATION notification for reporter without exposing verifier identity', async () => {
    // User A creates incident
    const incRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        title: 'Street Lamp Flicker',
        description: 'Light flickering at crossroad',
        category: 'INFRASTRUCTURE_ISSUE',
        severity: 'LOW',
        latitude: 12.9716,
        longitude: 77.5946,
      });

    const incidentId = incRes.body.data.incident.id;

    // User B verifies it
    const verifyRes = await request(app)
      .post(`/api/incidents/${incidentId}/verify`)
      .set('Authorization', `Bearer ${userBToken}`)
      .send({ verification_type: 'CONFIRM' });

    expect(verifyRes.status).toBe(200);

    // User A should have a COMMUNITY_VERIFICATION notification
    const listRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${userAToken}`);

    const commNotif = listRes.body.data.notifications.find(
      (n: any) => n.type === 'COMMUNITY_VERIFICATION' && n.incident_id === incidentId
    );
    expect(commNotif).toBeDefined();
    expect(commNotif.message).toContain('confirmation');

    // PRIVACY: Verify User B's name and ID are NEVER leaked in notification
    expect(commNotif.message).not.toContain(userBId);
    expect(commNotif.message).not.toContain('Neighbor User B');
  });

  // 14. No public notification creation API is exposed to users
  it('14. No public POST /api/notifications endpoint exists (returns 404)', async () => {
    const postRes = await request(app)
      .post('/api/notifications')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        title: 'Spoofed Notification',
        message: 'Trying to forge a notification',
      });

    expect(postRes.status).toBe(404);
  });

  // 15. Duplicate prevention for alert notifications
  it('15. Repeated alert creation attempts do not duplicate notifications', async () => {
    const dbNotifsInitial = await NotificationService.getUserNotifications(userBId);
    const initialCount = dbNotifsInitial.total;

    // Fetch an existing alert
    const alertRes = await query(
      'SELECT id, incident_id FROM alerts WHERE recipient_user_id = $1 LIMIT 1',
      [userBId]
    );

    if (alertRes.rows.length > 0) {
      const alert = alertRes.rows[0];
      // Attempt duplicate creation
      await NotificationService.createNotification({
        user_id: userBId,
        type: 'ALERT_CREATED',
        title: 'Duplicate Attempt',
        message: 'Duplicate text',
        incident_id: alert.incident_id,
        alert_id: alert.id,
      });

      const dbNotifsAfter = await NotificationService.getUserNotifications(userBId);
      expect(dbNotifsAfter.total).toBe(initialCount);
    }
  });
});
