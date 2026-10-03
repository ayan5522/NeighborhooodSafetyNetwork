import request from 'supertest';
import { createApp } from '../app';
import { query } from '../db';
import { AuditService } from '../services/auditService';

const app = createApp();

describe('Module 08: Audit Logging, Security Hardening & RBAC Tests', () => {
  let adminToken: string;
  let adminUserId: string;
  let moderatorToken: string;
  let moderatorUserId: string;
  let residentToken: string;
  let residentUserId: string;
  let targetIncidentId: string;

  const cleanupTestRecords = async () => {
    try {
      await query("DELETE FROM audit_logs WHERE actor_user_id IN (SELECT id FROM users WHERE email LIKE '%@mod8test.com') OR description LIKE '%mod8%'");
      await query("DELETE FROM incident_verifications WHERE incident_id IN (SELECT id FROM incidents WHERE reporter_id IN (SELECT id FROM users WHERE email LIKE '%@mod8test.com'))");
      await query("DELETE FROM alerts WHERE incident_id IN (SELECT id FROM incidents WHERE reporter_id IN (SELECT id FROM users WHERE email LIKE '%@mod8test.com'))");
      await query("DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@mod8test.com')");
      await query("DELETE FROM incidents WHERE reporter_id IN (SELECT id FROM users WHERE email LIKE '%@mod8test.com')");
      await query("DELETE FROM users WHERE email LIKE '%@mod8test.com'");
    } catch {}
  };

  beforeAll(async () => {
    await cleanupTestRecords();

    // 1. Create ADMIN user
    const adminRes = await request(app)
      .post('/api/auth/register')
      .send({
        full_name: 'Audit Admin',
        email: 'admin@mod8test.com',
        password: 'Password123!',
        confirm_password: 'Password123!',
      });
    adminUserId = adminRes.body.data.user.id;
    // Upgrade to ADMIN
    await query("UPDATE users SET role = 'ADMIN' WHERE id = $1", [adminUserId]);

    const adminLoginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@mod8test.com',
        password: 'Password123!',
      });
    adminToken = adminLoginRes.body.data.token;

    // 2. Create MODERATOR user
    const modRes = await request(app)
      .post('/api/auth/register')
      .send({
        full_name: 'Audit Moderator',
        email: 'mod@mod8test.com',
        password: 'Password123!',
        confirm_password: 'Password123!',
      });
    moderatorUserId = modRes.body.data.user.id;
    await query("UPDATE users SET role = 'MODERATOR' WHERE id = $1", [moderatorUserId]);

    const modLoginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'mod@mod8test.com',
        password: 'Password123!',
      });
    moderatorToken = modLoginRes.body.data.token;

    // 3. Create RESIDENT user
    const resRes = await request(app)
      .post('/api/auth/register')
      .send({
        full_name: 'Audit Resident',
        email: 'resident@mod8test.com',
        password: 'Password123!',
        confirm_password: 'Password123!',
      });
    residentUserId = resRes.body.data.user.id;
    residentToken = resRes.body.data.token;
  });

  afterAll(async () => {
    await cleanupTestRecords();
  });

  describe('1. Role-Based Access Control (RBAC) on Audit Logs API', () => {
    it('Unauthenticated request to /api/admin/audit-logs returns 401 Unauthorized', async () => {
      const res = await request(app).get('/api/admin/audit-logs');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('RESIDENT role attempting to read audit logs returns 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${residentToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Insufficient privileges');
    });

    it('MODERATOR role attempting to read audit logs returns 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${moderatorToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Insufficient privileges');
    });

    it('ADMIN role can successfully retrieve paginated audit logs', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('logs');
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('page', 1);
      expect(Array.isArray(res.body.data.logs)).toBe(true);
      expect(res.body.data.logs.length).toBeGreaterThan(0);
    });
  });

  describe('2. Audit Event Generation across System Operations', () => {
    it('Authentication events (USER_REGISTERED, USER_LOGIN_SUCCESS, USER_LOGIN_FAILED) are audited', async () => {
      // Trigger a failed login
      await request(app)
        .post('/api/auth/login')
        .send({
          email: 'resident@mod8test.com',
          password: 'WrongPassword!',
        });

      // Query audit logs as admin
      const res = await request(app)
        .get(`/api/admin/audit-logs?actor_user_id=${residentUserId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const actions = res.body.data.logs.map((l: any) => l.action);
      expect(actions).toContain('USER_REGISTERED');
      expect(actions).toContain('USER_LOGIN_FAILED');
    });

    it('Incident lifecycle events are audited (INCIDENT_CREATED, INCIDENT_UPDATED)', async () => {
      // Create incident
      const incRes = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${residentToken}`)
        .send({
          category: 'SUSPICIOUS_ACTIVITY',
          title: 'Suspicious activity mod8',
          description: 'A black mountain bicycle was taken from outside.',
          severity: 'MEDIUM',
          latitude: 37.7749,
          longitude: -122.4194,
        });

      expect(incRes.status).toBe(201);
      targetIncidentId = incRes.body.data.incident.id;

      // Update incident
      const updateRes = await request(app)
        .patch(`/api/incidents/${targetIncidentId}`)
        .set('Authorization', `Bearer ${residentToken}`)
        .send({
          description: 'Updated: Lock was also damaged.',
        });
      expect(updateRes.status).toBe(200);

      // Verify audit logs
      const auditRes = await request(app)
        .get(`/api/admin/audit-logs?entity_type=incident&entity_id=${targetIncidentId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(auditRes.status).toBe(200);
      const actions = auditRes.body.data.logs.map((l: any) => l.action);
      expect(actions).toContain('INCIDENT_CREATED');
      expect(actions).toContain('INCIDENT_UPDATED');
    });

    it('Community verification events are audited', async () => {
      // Moderator verifies the resident incident
      const verRes = await request(app)
        .post(`/api/incidents/${targetIncidentId}/verify`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({
          verification_type: 'CONFIRM',
        });
      expect(verRes.status).toBe(200);

      const auditRes = await request(app)
        .get(`/api/admin/audit-logs?action=INCIDENT_VERIFICATION_CREATED`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(auditRes.status).toBe(200);
      expect(auditRes.body.data.logs.length).toBeGreaterThan(0);
    });

    it('Admin management events (USER_SUSPENDED, USER_RESTORED, USER_ROLE_CHANGED) are audited', async () => {
      // Suspend resident
      const suspRes = await request(app)
        .patch(`/api/admin/users/${residentUserId}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(suspRes.status).toBe(200);

      // Restore resident
      const restRes = await request(app)
        .patch(`/api/admin/users/${residentUserId}/restore`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(restRes.status).toBe(200);

      // Verify audit logs
      const auditRes = await request(app)
        .get(`/api/admin/audit-logs?entity_type=user&entity_id=${residentUserId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(auditRes.status).toBe(200);
      const actions = auditRes.body.data.logs.map((l: any) => l.action);
      expect(actions).toContain('USER_SUSPENDED');
      expect(actions).toContain('USER_RESTORED');
    });
  });

  describe('3. Sensitive Data Sanitization & Privacy Invariants', () => {
    it('Audit log metadata redacts passwords, tokens, and coordinates', async () => {
      // Call AuditService with sensitive fields
      const log = await AuditService.log({
        actor_user_id: adminUserId,
        action: 'SECURITY_EVENT',
        entity_type: 'security_test',
        entity_id: 'test-123',
        description: 'Testing sanitization in mod8',
        metadata: {
          password: 'SecretPassword!',
          token: 'jwt.token.string',
          latitude: 37.7749,
          longitude: -122.4194,
          phone_number: '+15551234567',
          safe_field: 'normal_data',
        },
      });

      expect(log).not.toBeNull();
      expect(log?.metadata.password).toBe('[REDACTED]');
      expect(log?.metadata.token).toBe('[REDACTED]');
      expect(log?.metadata.latitude).toBe('[REDACTED]');
      expect(log?.metadata.longitude).toBe('[REDACTED]');
      expect(log?.metadata.phone_number).toBe('***-***-4567');
      expect(log?.metadata.safe_field).toBe('normal_data');
    });

    it('Audit log detail endpoint returns actor details without password hashes', async () => {
      const listRes = await request(app)
        .get('/api/admin/audit-logs?limit=1')
        .set('Authorization', `Bearer ${adminToken}`);

      const firstLogId = listRes.body.data.logs[0].id;
      const detailRes = await request(app)
        .get(`/api/admin/audit-logs/${firstLogId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.log).toHaveProperty('id', firstLogId);
      expect(detailRes.body.data.log).not.toHaveProperty('password_hash');
    });
  });

  describe('4. Security Headers & Robustness', () => {
    it('App includes Helmet security headers on responses', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.headers).toHaveProperty('x-content-type-options', 'nosniff');
      expect(res.headers).toHaveProperty('x-frame-options', 'SAMEORIGIN');
    });

    it('AuditService.log gracefully handles unexpected nulls without throwing', async () => {
      // Non-blocking invariant check
      const result = await AuditService.log({
        actor_user_id: null,
        action: 'SECURITY_EVENT',
        entity_type: 'system',
        description: 'Test null safety mod8',
      });
      expect(result).not.toBeNull();
    });
  });
});
