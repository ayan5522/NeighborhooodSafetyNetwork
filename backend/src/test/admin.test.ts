import request from 'supertest';
import { createApp } from '../app';
import { query } from '../db';
import { generateJwt, hashPassword } from '../utils/crypto';

describe('Module 07: Admin & Moderation Tests', () => {
  const app = createApp();

  let adminId: string;
  let adminToken: string;

  let moderatorId: string;
  let moderatorToken: string;

  let residentAId: string;
  let residentAToken: string;

  let residentBId: string;
  let residentBToken: string;

  let incidentAId: string;

  beforeAll(async () => {
    const pwdHash = await hashPassword('SecurePass123!');

    // 1. Create ADMIN user
    const adminRes = await query(
      `INSERT INTO users (full_name, email, password_hash, role, account_status)
       VALUES ('System Admin', 'admin@safetytest.org', $1, 'ADMIN', 'ACTIVE')
       RETURNING id`,
      [pwdHash]
    );
    adminId = adminRes.rows[0].id;
    adminToken = generateJwt({ user_id: adminId, role: 'ADMIN' });

    // 2. Create MODERATOR user
    const modRes = await query(
      `INSERT INTO users (full_name, email, password_hash, role, account_status)
       VALUES ('Safety Moderator', 'moderator@safetytest.org', $1, 'MODERATOR', 'ACTIVE')
       RETURNING id`,
      [pwdHash]
    );
    moderatorId = modRes.rows[0].id;
    moderatorToken = generateJwt({ user_id: moderatorId, role: 'MODERATOR' });

    // 3. Create RESIDENT A (Incident Author)
    const resARes = await query(
      `INSERT INTO users (full_name, email, password_hash, role, account_status)
       VALUES ('Resident Alice', 'alice@safetytest.org', $1, 'RESIDENT', 'ACTIVE')
       RETURNING id`,
      [pwdHash]
    );
    residentAId = resARes.rows[0].id;
    residentAToken = generateJwt({ user_id: residentAId, role: 'RESIDENT' });

    // 4. Create RESIDENT B (Flagging Neighbor)
    const resBRes = await query(
      `INSERT INTO users (full_name, email, password_hash, role, account_status)
       VALUES ('Resident Bob', 'bob@safetytest.org', $1, 'RESIDENT', 'ACTIVE')
       RETURNING id`,
      [pwdHash]
    );
    residentBId = resBRes.rows[0].id;
    residentBToken = generateJwt({ user_id: residentBId, role: 'RESIDENT' });

    // 5. Create an incident authored by Resident A
    const incRes = await query(
      `INSERT INTO incidents (
        reporter_id, category, title, description, severity, status,
        latitude, longitude, location
      ) VALUES (
        $1, 'ROAD_HAZARD', 'Hazardous deep pothole',
        'Large road pothole causing vehicle damage near junction',
        'HIGH', 'ACTIVE',
        12.9716, 77.5946, ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326)::geography
      ) RETURNING id`,
      [residentAId]
    );
    incidentAId = incRes.rows[0].id;

    // 6. Create an active alert for Incident A
    await query(
      `INSERT INTO alerts (
        incident_id, recipient_user_id, priority, status, expires_at
      ) VALUES (
        $1, $2, 'HIGH', 'ACTIVE', CURRENT_TIMESTAMP + INTERVAL '2 hours'
      )`,
      [incidentAId, residentBId]
    );
  });

  afterAll(async () => {
    // Clean up test data
    await query('DELETE FROM incident_reports WHERE incident_id = $1', [incidentAId]);
    await query('DELETE FROM notifications WHERE user_id IN ($1, $2, $3, $4)', [
      adminId,
      moderatorId,
      residentAId,
      residentBId,
    ]);
    await query('DELETE FROM alerts WHERE incident_id = $1', [incidentAId]);
    await query('DELETE FROM incidents WHERE id = $1', [incidentAId]);
    await query('DELETE FROM users WHERE id IN ($1, $2, $3, $4)', [
      adminId,
      moderatorId,
      residentAId,
      residentBId,
    ]);
  });

  describe('1. Role-Based Access Control (RBAC) Enforcement', () => {
    it('Unauthenticated request to admin dashboard returns 401', async () => {
      const res = await request(app).get('/api/admin/dashboard');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('RESIDENT role accessing admin dashboard returns 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${residentAToken}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Insufficient privileges');
    });

    it('RESIDENT role accessing moderation queue returns 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/moderation/reports')
        .set('Authorization', `Bearer ${residentAToken}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('MODERATOR role can access admin dashboard with moderation stats', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${moderatorToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.incidents).toBeDefined();
      expect(res.body.data.reports).toBeDefined();
      // MODERATOR should NOT receive user account management statistics
      expect(res.body.data.users).toBeUndefined();
    });

    it('MODERATOR role accessing user management returns 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${moderatorToken}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('ADMIN role can access both dashboard and user management', async () => {
      const dashRes = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(dashRes.status).toBe(200);
      expect(dashRes.body.data.users).toBeDefined();
      expect(dashRes.body.data.users.total).toBeGreaterThanOrEqual(4);

      const usersRes = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(usersRes.status).toBe(200);
      expect(usersRes.body.data.users.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('2. User Management (Admin Only)', () => {
    it('Search and filter users by query and role', async () => {
      const res = await request(app)
        .get('/api/admin/users?search=alice&role=RESIDENT')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.users.length).toBe(1);
      expect(res.body.data.users[0].email).toBe('alice@safetytest.org');
      // Crucial Security check: password_hash must NEVER be returned
      expect(res.body.data.users[0].password_hash).toBeUndefined();
    });

    it('Pagination limits are respected', async () => {
      const res = await request(app)
        .get('/api/admin/users?page=1&limit=2')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.users.length).toBe(2);
      expect(res.body.data.page).toBe(1);
      expect(res.body.data.limit).toBe(2);
    });

    it('Admin cannot self-suspend account (self-protection)', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${adminId}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('cannot suspend their own account');
    });

    it('Admin suspends Resident B, rendering their token immediately invalid', async () => {
      const suspendRes = await request(app)
        .patch(`/api/admin/users/${residentBId}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(suspendRes.status).toBe(200);
      expect(suspendRes.body.success).toBe(true);
      expect(suspendRes.body.data.user.account_status).toBe('SUSPENDED');

      // Now Resident B tries to make an authenticated request
      const accessRes = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${residentBToken}`);

      expect(accessRes.status).toBe(401);
      expect(accessRes.body.message).toContain('Account is suspended');
    });

    it('Admin restores Resident B to ACTIVE status', async () => {
      const restoreRes = await request(app)
        .patch(`/api/admin/users/${residentBId}/restore`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(restoreRes.status).toBe(200);
      expect(restoreRes.body.success).toBe(true);
      expect(restoreRes.body.data.user.account_status).toBe('ACTIVE');

      // Now Resident B can make authenticated requests again
      const accessRes = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${residentBToken}`);

      expect(accessRes.status).toBe(200);
      expect(accessRes.body.data.user.id).toBe(residentBId);
    });

    it('Admin changes Resident B role from RESIDENT to MODERATOR', async () => {
      const roleRes = await request(app)
        .patch(`/api/admin/users/${residentBId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'MODERATOR' });

      expect(roleRes.status).toBe(200);
      expect(roleRes.body.data.user.role).toBe('MODERATOR');

      // Immediate role effect: Resident B can now access moderation queue
      const modQueueRes = await request(app)
        .get('/api/moderation/reports')
        .set('Authorization', `Bearer ${residentBToken}`);

      expect(modQueueRes.status).toBe(200);
    });

    it('Reverting Resident B back to RESIDENT revokes moderation privileges', async () => {
      const roleRes = await request(app)
        .patch(`/api/admin/users/${residentBId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'RESIDENT' });

      expect(roleRes.status).toBe(200);
      expect(roleRes.body.data.user.role).toBe('RESIDENT');

      // Subsequent access to moderation queue is forbidden
      const modQueueRes = await request(app)
        .get('/api/moderation/reports')
        .set('Authorization', `Bearer ${residentBToken}`);

      expect(modQueueRes.status).toBe(403);
    });

    it('Demoting the last active administrator is prohibited', async () => {
      const roleRes = await request(app)
        .patch(`/api/admin/users/${adminId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'RESIDENT' });

      expect(roleRes.status).toBe(400);
      expect(roleRes.body.message).toContain('Cannot demote the last active administrator');
    });
  });

  describe('3. Community Incident Reporting / Flagging', () => {
    it('Reporting an incident with an invalid reason returns 400', async () => {
      const res = await request(app)
        .post(`/api/incidents/${incidentAId}/report`)
        .set('Authorization', `Bearer ${residentBToken}`)
        .send({
          reason: 'INVALID_REASON_STRING',
          description: 'Testing invalid reason',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('Reporting a nonexistent incident returns 404', async () => {
      const res = await request(app)
        .post('/api/incidents/a0000000-0000-0000-0000-000000000000/report')
        .set('Authorization', `Bearer ${residentBToken}`)
        .send({
          reason: 'FALSE_INFORMATION',
          description: 'Incident does not exist',
        });

      expect(res.status).toBe(404);
    });

    it('Incident author cannot flag their own incident (returns 403)', async () => {
      const res = await request(app)
        .post(`/api/incidents/${incidentAId}/report`)
        .set('Authorization', `Bearer ${residentAToken}`)
        .send({
          reason: 'MISLEADING',
          description: 'I want to flag my own report',
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Incident reporters cannot flag their own incidents');
    });

    let createdReportId: string;

    it('Neighbor successfully reports an incident (status PENDING)', async () => {
      const res = await request(app)
        .post(`/api/incidents/${incidentAId}/report`)
        .set('Authorization', `Bearer ${residentBToken}`)
        .send({
          reason: 'MISLEADING',
          description: 'The pothole is not on this street, location seems slightly off',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.report.status).toBe('PENDING');
      expect(res.body.data.report.reason).toBe('MISLEADING');
      createdReportId = res.body.data.report.id;
    });

    it('Duplicate report on the same incident by same user returns 409 Conflict', async () => {
      const res = await request(app)
        .post(`/api/incidents/${incidentAId}/report`)
        .set('Authorization', `Bearer ${residentBToken}`)
        .send({
          reason: 'SPAM',
          description: 'Trying to flag again',
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('already submitted a moderation report');
    });

    it('Moderation Queue displays the pending report', async () => {
      const res = await request(app)
        .get('/api/moderation/reports?status=PENDING')
        .set('Authorization', `Bearer ${moderatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.reports.length).toBeGreaterThanOrEqual(1);
      const reportItem = res.body.data.reports.find((r: any) => r.id === createdReportId);
      expect(reportItem).toBeDefined();
      expect(reportItem.incident_title).toBe('Hazardous deep pothole');
      expect(reportItem.reason).toBe('MISLEADING');
    });

    it('Moderation Report Details returns incident metadata without exposing sensitive info', async () => {
      const res = await request(app)
        .get(`/api/moderation/reports/${createdReportId}`)
        .set('Authorization', `Bearer ${moderatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.report.id).toBe(createdReportId);
      expect(res.body.data.incident.title).toBe('Hazardous deep pothole');
      expect(res.body.data.verification).toBeDefined();
      expect(res.body.data.active_alerts_count).toBeGreaterThanOrEqual(1);
    });

    it('Moderator marks report as REVIEWED', async () => {
      const res = await request(app)
        .patch(`/api/moderation/reports/${createdReportId}/review`)
        .set('Authorization', `Bearer ${moderatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.report.status).toBe('REVIEWED');
      expect(res.body.data.report.reviewed_by).toBe(moderatorId);
      expect(res.body.data.report.reviewed_at).toBeDefined();
    });

    it('Moderator dismisses report (status DISMISSED)', async () => {
      const res = await request(app)
        .patch(`/api/moderation/reports/${createdReportId}/dismiss`)
        .set('Authorization', `Bearer ${moderatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.report.status).toBe('DISMISSED');
    });

    it('Moderator takes action RESOLVE_INCIDENT in transaction, resolving incident and active alerts', async () => {
      const res = await request(app)
        .patch(`/api/moderation/reports/${createdReportId}/action`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({
          action: 'RESOLVE_INCIDENT',
          notes: 'Issue addressed by road safety crew',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.report.status).toBe('ACTION_TAKEN');

      // Verify incident is now RESOLVED in DB
      const incCheck = await query('SELECT status FROM incidents WHERE id = $1', [incidentAId]);
      expect(incCheck.rows[0].status).toBe('RESOLVED');

      // Verify active alerts are marked RESOLVED
      const alertCheck = await query('SELECT status FROM alerts WHERE incident_id = $1', [
        incidentAId,
      ]);
      expect(alertCheck.rows[0].status).toBe('RESOLVED');

      // Verify notification sent to incident owner (Resident A) without disclosing moderator identity
      const notifRes = await query(
        `SELECT type, title, message 
         FROM notifications 
         WHERE user_id = $1 AND incident_id = $2 
         ORDER BY created_at DESC LIMIT 1`,
        [residentAId, incidentAId]
      );
      expect(notifRes.rows.length).toBe(1);
      expect(notifRes.rows[0].type).toBe('SYSTEM');
      expect(notifRes.rows[0].title).toBe('Incident Moderation Notice');
      expect(notifRes.rows[0].message).not.toContain('Safety Moderator');
      expect(notifRes.rows[0].message).not.toContain(moderatorId);
    });
  });
});
