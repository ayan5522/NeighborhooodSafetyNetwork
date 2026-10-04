import request from 'supertest';
import { createApp } from '../app';
import { query } from '../db';
import { AITrustService } from '../services/aiTrustService';

const app = createApp();

describe('Module 10: Complete End-to-End System Integration & Regression Suite', () => {
  // Controlled user test accounts
  let userAToken: string;
  let userAId: string; // Resident (Reporter)
  let userBToken: string;
  let userBId: string; // Resident (Neighbor 1)
  let userCToken: string;
  let userCId: string; // Resident (Neighbor 2)
  let userDToken: string;
  let userDId: string; // Resident (Neighbor 3 / Flagger)
  let modToken: string;
  let modId: string;   // Moderator
  let adminToken: string;
  let adminId: string; // Admin

  let incidentId: string;
  let moderationReportId: string;
  let emergencyContactId: string;
  let userBNotificationId: string;

  const cleanupAllModule10Data = async () => {
    try {
      const userSubquery = "SELECT id FROM users WHERE email LIKE '%@mod10.test'";
      await query(`DELETE FROM audit_logs WHERE actor_user_id IN (${userSubquery}) OR description LIKE '%mod10%'`);
      await query(`DELETE FROM incident_ai_assessments WHERE incident_id IN (SELECT id FROM incidents WHERE reporter_id IN (${userSubquery}) OR title LIKE '%Mod10%')`);
      await query(`DELETE FROM incident_reports WHERE reporter_user_id IN (${userSubquery}) OR reviewed_by IN (${userSubquery}) OR incident_id IN (SELECT id FROM incidents WHERE reporter_id IN (${userSubquery}) OR title LIKE '%Mod10%')`);
      await query(`DELETE FROM incident_verifications WHERE user_id IN (${userSubquery}) OR incident_id IN (SELECT id FROM incidents WHERE reporter_id IN (${userSubquery}) OR title LIKE '%Mod10%')`);
      await query(`DELETE FROM alerts WHERE recipient_user_id IN (${userSubquery}) OR incident_id IN (SELECT id FROM incidents WHERE reporter_id IN (${userSubquery}) OR title LIKE '%Mod10%')`);
      await query(`DELETE FROM notifications WHERE user_id IN (${userSubquery})`);
      await query(`DELETE FROM sos_events WHERE user_id IN (${userSubquery})`);
      await query(`DELETE FROM emergency_contacts WHERE user_id IN (${userSubquery})`);
      await query(`DELETE FROM user_locations WHERE user_id IN (${userSubquery})`);
      await query(`DELETE FROM password_resets WHERE user_id IN (${userSubquery}) OR email LIKE '%@mod10.test'`);
      await query(`DELETE FROM incidents WHERE reporter_id IN (${userSubquery}) OR title LIKE '%Mod10%'`);
      await query(`DELETE FROM users WHERE email LIKE '%@mod10.test'`);
    } catch (err) {
      console.error('Cleanup error:', err);
    }


  };


  beforeAll(async () => {
    await cleanupAllModule10Data();
  });

  afterAll(async () => {
    await cleanupAllModule10Data();
  });

  // =========================================================================
  // 1. AUTHENTICATION & SESSION MANAGEMENT REGRESSION
  // =========================================================================
  describe('1. Authentication & Session Management', () => {
    it('Step 1: User A registers successfully with hashed password and sanitized response', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          full_name: 'Resident Alice A',
          email: 'usera@mod10.test',
          password: 'Password123!',
          confirm_password: 'Password123!',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('usera@mod10.test');
      expect(res.body.data.user.role).toBe('RESIDENT');
      expect(res.body.data.user.account_status).toBe('ACTIVE');
      expect(res.body.data.user.password).toBeUndefined();
      expect(res.body.data.user.password_hash).toBeUndefined();
      expect(res.body.data.token).toBeDefined();

      userAId = res.body.data.user.id;
      userAToken = res.body.data.token;
    });

    it('Rejects duplicate email registration with 409', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          full_name: 'Alice Duplicate',
          email: 'usera@mod10.test',
          password: 'Password123!',
          confirm_password: 'Password123!',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('Step 2: User A logs in and receives a valid JWT session', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'usera@mod10.test',
          password: 'Password123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      userAToken = res.body.data.token;
    });

    it('Creates User B, C, D (Residents), Moderator, and Admin test accounts', async () => {
      // User B (Resident)
      const bRes = await request(app).post('/api/auth/register').send({
        full_name: 'Resident Bob B',
        email: 'userb@mod10.test',
        password: 'Password123!',
        confirm_password: 'Password123!',
      });
      userBId = bRes.body.data.user.id;
      userBToken = bRes.body.data.token;

      // User C (Resident)
      const cRes = await request(app).post('/api/auth/register').send({
        full_name: 'Resident Charlie C',
        email: 'userc@mod10.test',
        password: 'Password123!',
        confirm_password: 'Password123!',
      });
      userCId = cRes.body.data.user.id;
      userCToken = cRes.body.data.token;

      // User D (Resident)
      const dRes = await request(app).post('/api/auth/register').send({
        full_name: 'Resident Diana D',
        email: 'userd@mod10.test',
        password: 'Password123!',
        confirm_password: 'Password123!',
      });
      userDId = dRes.body.data.user.id;
      userDToken = dRes.body.data.token;

      // Moderator
      const modRes = await request(app).post('/api/auth/register').send({
        full_name: 'Moderator Mark',
        email: 'mod@mod10.test',
        password: 'Password123!',
        confirm_password: 'Password123!',
      });
      modId = modRes.body.data.user.id;
      await query("UPDATE users SET role = 'MODERATOR' WHERE id = $1", [modId]);
      const modLogin = await request(app).post('/api/auth/login').send({
        email: 'mod@mod10.test',
        password: 'Password123!',
      });
      modToken = modLogin.body.data.token;

      // Admin
      const adminRes = await request(app).post('/api/auth/register').send({
        full_name: 'Admin Arthur',
        email: 'admin@mod10.test',
        password: 'Password123!',
        confirm_password: 'Password123!',
      });
      adminId = adminRes.body.data.user.id;
      await query("UPDATE users SET role = 'ADMIN' WHERE id = $1", [adminId]);
      const adminLogin = await request(app).post('/api/auth/login').send({
        email: 'admin@mod10.test',
        password: 'Password123!',
      });
      adminToken = adminLogin.body.data.token;

      expect(userBToken).toBeDefined();
      expect(userCToken).toBeDefined();
      expect(userDToken).toBeDefined();
      expect(modToken).toBeDefined();
      expect(adminToken).toBeDefined();
    });

    it('Forgot Password: Non-existing user returns exact error message', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent_user_9999@mod10.test' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("User doesn't exist in the system.");
    });

    it('Forgot Password -> OTP verification -> Reset password end-to-end', async () => {
      // 1. Request forgot password for User A
      const reqRes = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'usera@mod10.test' });
      expect(reqRes.status).toBe(200);
      expect(reqRes.body.success).toBe(true);

      // Fetch OTP from database
      const dbRes = await query(
        'SELECT otp_code FROM password_resets WHERE email = $1 AND used = false ORDER BY created_at DESC LIMIT 1',
        ['usera@mod10.test']
      );
      const otp = dbRes.rows[0].otp_code;

      // 2. Reject incorrect OTP
      const badOtpRes = await request(app)
        .post('/api/auth/verify-otp')
        .send({ email: 'usera@mod10.test', otp: '000000' });
      expect(badOtpRes.status).toBe(400);

      // 3. Verify correct OTP -> receives reset_token
      const verifyRes = await request(app)
        .post('/api/auth/verify-otp')
        .send({ email: 'usera@mod10.test', otp: otp });
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.reset_token).toBeDefined();
      const resetToken = verifyRes.body.data.reset_token;

      // 4. Change password using reset_token
      const resetRes = await request(app)
        .post('/api/auth/reset-password')
        .send({
          reset_token: resetToken,
          new_password: 'NewPassword123!',
          confirm_new_password: 'NewPassword123!',
        });
      expect(resetRes.status).toBe(200);

      // 5. Old reset token cannot be reused
      const reuseRes = await request(app)
        .post('/api/auth/reset-password')
        .send({
          reset_token: resetToken,
          new_password: 'AnotherPassword123!',
          confirm_new_password: 'AnotherPassword123!',
        });
      expect(reuseRes.status).toBe(400);


      // 6. Log back in with new password
      const reLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'usera@mod10.test', password: 'NewPassword123!' });
      expect(reLogin.status).toBe(200);
      userAToken = reLogin.body.data.token;
    });
  });

  // =========================================================================
  // 2. LOCATION & GEOSPATIAL TARGETING REGRESSION
  // =========================================================================
  describe('2. Location & Geospatial Targeting', () => {
    it('Step 3: User A and neighbors update their coordinates in database', async () => {
      // User A (Epicenter: 18.5204, 73.8567 - Pune)
      const aLoc = await request(app)
        .post('/api/location/update')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ latitude: 18.5204, longitude: 73.8567, accuracy: 10 });
      expect(aLoc.status).toBe(200);

      // User B (approx 400m away: 18.5230, 73.8580)
      const bLoc = await request(app)
        .post('/api/location/update')
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ latitude: 18.5230, longitude: 73.8580, accuracy: 12 });
      expect(bLoc.status).toBe(200);

      // User C (approx 700m away: 18.5250, 73.8600)
      const cLoc = await request(app)
        .post('/api/location/update')
        .set('Authorization', `Bearer ${userCToken}`)
        .send({ latitude: 18.5250, longitude: 73.8600, accuracy: 15 });
      expect(cLoc.status).toBe(200);

      // User D (approx 1200m away: 18.5300, 73.8650)
      const dLoc = await request(app)
        .post('/api/location/update')
        .set('Authorization', `Bearer ${userDToken}`)
        .send({ latitude: 18.5300, longitude: 73.8650, accuracy: 10 });
      expect(dLoc.status).toBe(200);
    });

    it('Step 4: Location privacy check - User A cannot inspect User B exact private coordinates', async () => {
      const nearbyRes = await request(app)
        .get('/api/location/nearby?radius=2000')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(nearbyRes.status).toBe(200);
      expect(nearbyRes.body.success).toBe(true);
      // Verify no exact coordinates of other users are leaked in public nearby list
      if (nearbyRes.body.data.nearby_users && nearbyRes.body.data.nearby_users.length > 0) {
        for (const u of nearbyRes.body.data.nearby_users) {
          expect(u.exact_latitude).toBeUndefined();
          expect(u.exact_longitude).toBeUndefined();
        }
      }
    });

    it('Rejects invalid latitude/longitude with 400', async () => {
      const res = await request(app)
        .post('/api/location/update')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ latitude: 95.0, longitude: 73.8567 });

      expect(res.status).toBe(400);
    });

  });

  // =========================================================================
  // 3. INCIDENT REPORTING & CRITICAL VISIBILITY TEST
  // =========================================================================
  describe('3. Incident Reporting & Visibility Invariant', () => {
    it('Step 5 & 6: User A creates an ACCIDENT incident', async () => {
      const res = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          title: 'Mod10 Multi-vehicle collision on Main Ave',
          description: 'Two cars collided blocking the right lane. Emergency assistance notified.',
          category: 'ACCIDENT',
          severity: 'HIGH',
          latitude: 18.5204,
          longitude: 73.8567,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.incident.id).toBeDefined();
      expect(res.body.data.incident.status).toBe('PENDING');
      expect(res.body.data.incident.reporter_id).toBe(userAId);

      incidentId = res.body.data.incident.id;
    });

    it('Step 7 & 8: Target alerts generated for nearby neighbors B, C, D (reporter excluded)', async () => {
      const alertsRes = await query(
        'SELECT * FROM alerts WHERE incident_id = $1 ORDER BY created_at ASC',
        [incidentId]
      );

      expect(alertsRes.rows.length).toBeGreaterThanOrEqual(1);
      // Ensure reporter User A is excluded from target user list
      const targetUserIds = alertsRes.rows.map((r: any) => r.recipient_user_id);
      expect(targetUserIds).not.toContain(userAId);
    });


    it('Step 9 & 10: Notification stored in database and retrievable by User B', async () => {
      const notifRes = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${userBToken}`);

      expect(notifRes.status).toBe(200);
      expect(notifRes.body.success).toBe(true);
      expect(notifRes.body.data.notifications.length).toBeGreaterThanOrEqual(1);

      const targetNotif = notifRes.body.data.notifications.find(
        (n: any) => n.incident_id === incidentId || n.title?.includes('Mod10')
      );
      expect(targetNotif).toBeDefined();
      userBNotificationId = targetNotif.id;
    });

    it('Step 11: Critical Invariant: User B can immediately see Incident 1 without a second incident being created', async () => {
      const nearbyIncidents = await request(app)
        .get('/api/incidents/nearby?latitude=18.5230&longitude=73.8580&radius=5000')
        .set('Authorization', `Bearer ${userBToken}`);

      expect(nearbyIncidents.status).toBe(200);
      expect(nearbyIncidents.body.success).toBe(true);

      const found = nearbyIncidents.body.data.incidents.find((i: any) => i.id === incidentId);
      expect(found).toBeDefined();
      expect(found.title).toContain('Mod10');

      // User B also opens direct details
      const directRes = await request(app)
        .get(`/api/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${userBToken}`);

      expect(directRes.status).toBe(200);
      expect(directRes.body.data.incident.id).toBe(incidentId);
    });
  });

  // =========================================================================
  // 4. COMMUNITY VERIFICATION (CONSENSUS BUILDING)
  // =========================================================================
  describe('4. Community Verification', () => {
    it('Reporter User A cannot verify own incident (403)', async () => {
      const res = await request(app)
        .post(`/api/incidents/${incidentId}/verify`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ verification_type: 'CONFIRM' });

      expect(res.status).toBe(403);
    });

    it('Step 12: User B confirms incident', async () => {
      const res = await request(app)
        .post(`/api/incidents/${incidentId}/verify`)
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ verification_type: 'CONFIRM' });

      expect(res.status).toBe(200);
      expect(res.body.data.confirm_count).toBe(1);
      expect(res.body.data.dispute_count).toBe(0);
      expect(res.body.data.status).toBe('COMMUNITY_CONFIRMED');
    });

    it('Step 13: User C confirms incident', async () => {
      const res = await request(app)
        .post(`/api/incidents/${incidentId}/verify`)
        .set('Authorization', `Bearer ${userCToken}`)
        .send({ verification_type: 'CONFIRM' });

      expect(res.status).toBe(200);
      expect(res.body.data.confirm_count).toBe(2);
      expect(res.body.data.dispute_count).toBe(0);
      expect(res.body.data.status).toBe('COMMUNITY_CONFIRMED');
    });

    it('Step 14: User D disputes incident (2 confirms, 1 dispute)', async () => {
      const res = await request(app)
        .post(`/api/incidents/${incidentId}/verify`)
        .set('Authorization', `Bearer ${userDToken}`)
        .send({ verification_type: 'DISPUTE' });

      expect(res.status).toBe(200);
      expect(res.body.data.confirm_count).toBe(2);
      expect(res.body.data.dispute_count).toBe(1);
      expect(res.body.data.status).toBe('COMMUNITY_CONFIRMED');
    });

    it('Submitting duplicate verification is idempotent without duplicate rows', async () => {
      const res = await request(app)
        .post(`/api/incidents/${incidentId}/verify`)
        .set('Authorization', `Bearer ${userDToken}`)
        .send({ verification_type: 'DISPUTE' });

      expect(res.status).toBe(200);
      expect(res.body.data.dispute_count).toBe(1);
    });

  });

  // =========================================================================
  // 5. AI TRUST & RELIABILITY ENGINE INTEGRATION
  // =========================================================================
  describe('5. AI Trust & Reliability Engine', () => {
    it('Step 15 & 16: AI calculates reliability based on live PostgreSQL features', async () => {
      const res = await request(app)
        .get(`/api/incidents/${incidentId}/trust-score?refresh=true`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const assessment = res.body.data.assessment;
      expect(assessment).toBeDefined();
      expect(assessment.incident_id).toBe(incidentId);
      expect(typeof assessment.trust_score).toBe('number');
      expect(assessment.trust_score).toBeGreaterThanOrEqual(0);
      expect(assessment.trust_score).toBeLessThanOrEqual(100);
      expect(['LOW', 'MEDIUM', 'HIGH']).toContain(assessment.confidence_level);
      expect(Array.isArray(assessment.explanation)).toBe(true);
      expect(assessment.explanation.length).toBeGreaterThan(0);
      expect(assessment.model_version).toBe('trust-model-v1');
    });

    it('AI assessment is securely persisted in incident_ai_assessments table', async () => {
      const dbRes = await query(
        'SELECT * FROM incident_ai_assessments WHERE incident_id = $1',
        [incidentId]
      );

      expect(dbRes.rows.length).toBe(1);
      expect(Number(dbRes.rows[0].trust_score)).toBeGreaterThanOrEqual(0);
    });

    it('AI security: Client cannot inject fake trust score directly via API', async () => {
      const res = await request(app)
        .patch(`/api/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          trust_score: 99.9,
          confidence_level: 'HIGH',
        } as any);

      // Endpoint ignores unallowed fields
      const checkRes = await query(
        'SELECT trust_score FROM incident_ai_assessments WHERE incident_id = $1',
        [incidentId]
      );
      // DB score remains intact from ML calculation, not 99.9
      if (checkRes.rows.length > 0) {
        expect(Number(checkRes.rows[0].trust_score)).not.toBe(99.9);
      }
    });

  });

  // =========================================================================
  // 6. COMMUNITY MODERATION WORKFLOW
  // =========================================================================
  describe('6. Community Moderation Workflow', () => {
    it('Step 17: User D reports/flags the incident for moderation', async () => {
      const res = await request(app)
        .post(`/api/incidents/${incidentId}/report`)
        .set('Authorization', `Bearer ${userDToken}`)
        .send({
          reason: 'FALSE_INFORMATION',
          description: 'Vehicles already cleared from the street.',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.report.id).toBeDefined();
      expect(res.body.data.report.status).toBe('PENDING');

      moderationReportId = res.body.data.report.id;
    });

    it('Step 18: Moderator reviews report in moderation queue', async () => {
      // 1. Moderator lists pending reports
      const queueRes = await request(app)
        .get('/api/moderation/reports')
        .set('Authorization', `Bearer ${modToken}`);

      expect(queueRes.status).toBe(200);
      expect(queueRes.body.success).toBe(true);

      const foundReport = queueRes.body.data.reports.find((r: any) => r.id === moderationReportId);
      expect(foundReport).toBeDefined();

      // 2. Moderator views report detail with AI signals
      const detailRes = await request(app)
        .get(`/api/moderation/reports/${moderationReportId}`)
        .set('Authorization', `Bearer ${modToken}`);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.report.id).toBe(moderationReportId);
      expect(detailRes.body.data.incident.id).toBe(incidentId);

      // 3. Moderator marks as REVIEWED
      const reviewRes = await request(app)
        .patch(`/api/moderation/reports/${moderationReportId}/review`)
        .set('Authorization', `Bearer ${modToken}`);

      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.data.report.status).toBe('REVIEWED');
    });

    it('Step 19: Moderator takes action (RESOLVE_INCIDENT) which resolves incident and alerts', async () => {
      const actionRes = await request(app)
        .patch(`/api/moderation/reports/${moderationReportId}/action`)
        .set('Authorization', `Bearer ${modToken}`)
        .send({
          action: 'RESOLVE_INCIDENT',
          notes: 'Resolved by moderator following community update.',
        });

      expect(actionRes.status).toBe(200);
      expect(actionRes.body.data.report.status).toBe('ACTION_TAKEN');

      // Check incident status in database
      const incDb = await query('SELECT status FROM incidents WHERE id = $1', [incidentId]);
      expect(incDb.rows[0].status).toBe('RESOLVED');
    });

    it('Resident cannot access moderation queue (403)', async () => {
      const res = await request(app)
        .get('/api/moderation/reports')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(403);
    });

    it('Moderator cannot access user management endpoints (403)', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${modToken}`);

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 7. ADMIN DASHBOARD & USER MANAGEMENT
  // =========================================================================
  describe('7. Admin Dashboard & User Management', () => {
    it('Step 20: Admin accesses dashboard with live database stats', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const stats = res.body.data;
      expect(stats.users.total).toBeGreaterThanOrEqual(5);
      expect(stats.incidents.total).toBeGreaterThanOrEqual(1);
      expect(stats.incidents.resolved).toBeGreaterThanOrEqual(1);
      expect(stats.reports).toBeDefined();
    });

    it('Admin suspends User D and token is immediately invalidated', async () => {
      const suspRes = await request(app)
        .patch(`/api/admin/users/${userDId}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Repeated false reports' });

      expect(suspRes.status).toBe(200);
      expect(suspRes.body.data.user.account_status).toBe('SUSPENDED');

      // User D tries an authenticated action -> rejected with 401/403
      const blockedAction = await request(app)
        .get('/api/incidents/my')
        .set('Authorization', `Bearer ${userDToken}`);

      expect([401, 403]).toContain(blockedAction.status);

      // Restore User D
      const restoreRes = await request(app)
        .patch(`/api/admin/users/${userDId}/restore`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Appeal accepted' });

      expect(restoreRes.status).toBe(200);
      expect(restoreRes.body.data.user.account_status).toBe('ACTIVE');
    });

    it('Admin self-protection: Admin cannot self-suspend account', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${adminId}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Self suspend test' });

      expect(res.status).toBe(400);
      expect(res.body.message.toLowerCase()).toContain('own');
    });
  });

  // =========================================================================
  // 8. IDOR & ACCESS CONTROL INTEGRITY
  // =========================================================================
  describe('8. IDOR & Cross-User Security Boundaries', () => {
    it('Step 22: User B cannot modify User A incident (403)', async () => {
      const res = await request(app)
        .patch(`/api/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ title: 'Hacked Title By Neighbor B' });

      expect(res.status).toBe(403);
    });

    it('User B cannot cancel User A incident (403)', async () => {
      const res = await request(app)
        .patch(`/api/incidents/${incidentId}/cancel`)
        .set('Authorization', `Bearer ${userBToken}`);

      expect(res.status).toBe(403);
    });

    it('User A cannot mark User B notification as read (403 / 404)', async () => {
      if (userBNotificationId) {
        const res = await request(app)
          .patch(`/api/notifications/${userBNotificationId}/read`)
          .set('Authorization', `Bearer ${userAToken}`);

        expect([403, 404]).toContain(res.status);
      }
    });
  });

  // =========================================================================
  // 9. EMERGENCY CONTACTS & SOS INTEGRATION
  // =========================================================================
  describe('9. Emergency Contacts & SOS', () => {
    it('User A manages emergency contacts (CRUD)', async () => {
      // 1. Create primary contact
      const createRes = await request(app)
        .post('/api/emergency-contacts')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          contact_name: 'Doctor Jane Doe',
          phone_number: '+919876543210',
          relationship: 'FAMILY',
          is_primary: true,
        });

      expect(createRes.status).toBe(201);
      emergencyContactId = createRes.body.data.contact.id;

      // 2. User B cannot access User A contact (403/404)
      const idorRes = await request(app)
        .delete(`/api/emergency-contacts/${emergencyContactId}`)
        .set('Authorization', `Bearer ${userBToken}`);

      expect([403, 404]).toContain(idorRes.status);
    });

    it('User A triggers and resolves personal SOS', async () => {
      // 1. Create SOS
      const sosRes = await request(app)
        .post('/api/sos')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          latitude: 18.5204,
          longitude: 73.8567,
          message: 'Mod10 Test Personal Medical Alert',
        });

      expect(sosRes.status).toBe(201);
      const sosId = sosRes.body.data.sos.id;

      // 2. Resolve SOS
      const resolveRes = await request(app)
        .patch(`/api/sos/${sosId}/resolve`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(resolveRes.status).toBe(200);
      expect(resolveRes.body.data.sos.status).toBe('RESOLVED');
    });
  });


  // =========================================================================
  // 10. AUDIT LOGGING & COMPLIANCE
  // =========================================================================
  describe('10. Audit Logging & Compliance', () => {
    it('Step 21: Audit logs contain recorded actions from the entire user journey', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs?limit=50')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const logs = res.body.data.logs;
      const actions = logs.map((l: any) => l.action);

      // Verify key actions occurred in the log stream
      expect(actions).toContain('INCIDENT_CREATED');
      expect(actions).toContain('USER_REGISTERED');
      expect(actions).toContain('MODERATION_ACTION_TAKEN');
    });

    it('Audit log privacy check: passwords, tokens, and OTPs are never stored in metadata', async () => {
      const checkRes = await query(
        "SELECT metadata FROM audit_logs WHERE description LIKE '%mod10%' OR actor_user_id = $1",
        [userAId]
      );

      for (const row of checkRes.rows) {
        const metaStr = JSON.stringify(row.metadata || {});
        expect(metaStr).not.toContain('Password123!');
        expect(metaStr).not.toContain('NewPassword123!');
        expect(metaStr).not.toMatch(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/); // No JWT regex match
      }
    });

    it('Resident cannot access audit logs (403)', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(403);
    });

    it('Moderator cannot access audit logs (403)', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${modToken}`);

      expect(res.status).toBe(403);
    });
  });
});
