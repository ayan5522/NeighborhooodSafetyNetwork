import request from 'supertest';
import { createApp } from '../app';
import { pool, closePool, query } from '../db';
import { hashPassword, generateJwt } from '../utils/crypto';
import { VerificationService } from '../services/verificationService';

describe('Module 05: Community Verification Tests', () => {
  const app = createApp();

  let reporterId: string;
  let reporterToken: string;
  let neighborAId: string;
  let neighborAToken: string;
  let neighborBId: string;
  let neighborBToken: string;
  let neighborCId: string;
  let neighborCToken: string;

  let activeIncidentId: string;
  let cancelledIncidentId: string;
  let resolvedIncidentId: string;

  beforeAll(async () => {
    // Clean prior test data
    await query("DELETE FROM incident_verifications WHERE incident_id IN (SELECT id FROM incidents WHERE reporter_id IN (SELECT id FROM users WHERE email LIKE '%@verifytest.org'))");
    await query("DELETE FROM incidents WHERE reporter_id IN (SELECT id FROM users WHERE email LIKE '%@verifytest.org')");
    await query("DELETE FROM users WHERE email LIKE '%@verifytest.org'");

    const pwdHash = await hashPassword('VerifyPassword123!');

    // Create reporter
    const repRes = await query(
      `INSERT INTO users (full_name, email, password_hash, role, account_status)
       VALUES ('Reporter User', 'reporter@verifytest.org', $1, 'RESIDENT', 'ACTIVE')
       RETURNING id`,
      [pwdHash]
    );
    reporterId = repRes.rows[0].id;
    reporterToken = generateJwt({ user_id: reporterId, role: 'RESIDENT' });

    // Create neighbor A
    const nARes = await query(
      `INSERT INTO users (full_name, email, password_hash, role, account_status)
       VALUES ('Neighbor A', 'neighbor.a@verifytest.org', $1, 'RESIDENT', 'ACTIVE')
       RETURNING id`,
      [pwdHash]
    );
    neighborAId = nARes.rows[0].id;
    neighborAToken = generateJwt({ user_id: neighborAId, role: 'RESIDENT' });

    // Create neighbor B
    const nBRes = await query(
      `INSERT INTO users (full_name, email, password_hash, role, account_status)
       VALUES ('Neighbor B', 'neighbor.b@verifytest.org', $1, 'RESIDENT', 'ACTIVE')
       RETURNING id`,
      [pwdHash]
    );
    neighborBId = nBRes.rows[0].id;
    neighborBToken = generateJwt({ user_id: neighborBId, role: 'RESIDENT' });

    // Create neighbor C
    const nCRes = await query(
      `INSERT INTO users (full_name, email, password_hash, role, account_status)
       VALUES ('Neighbor C', 'neighbor.c@verifytest.org', $1, 'RESIDENT', 'ACTIVE')
       RETURNING id`,
      [pwdHash]
    );
    neighborCId = nCRes.rows[0].id;
    neighborCToken = generateJwt({ user_id: neighborCId, role: 'RESIDENT' });

    // Create active test incident
    const incRes = await query(
      `INSERT INTO incidents (reporter_id, category, title, description, severity, status, latitude, longitude, location)
       VALUES ($1, 'FIRE', 'Small brush fire', 'Smoke seen near park bench', 'MEDIUM', 'ACTIVE', 12.9716, 77.5946, ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326)::geography)
       RETURNING id`,
      [reporterId]
    );
    activeIncidentId = incRes.rows[0].id;

    // Create cancelled test incident
    const canRes = await query(
      `INSERT INTO incidents (reporter_id, category, title, description, severity, status, latitude, longitude, location)
       VALUES ($1, 'OTHER', 'False Alarm', 'Mistaken smoke', 'LOW', 'CANCELLED', 12.9716, 77.5946, ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326)::geography)
       RETURNING id`,
      [reporterId]
    );
    cancelledIncidentId = canRes.rows[0].id;

    // Create resolved test incident
    const resRes = await query(
      `INSERT INTO incidents (reporter_id, category, title, description, severity, status, latitude, longitude, location)
       VALUES ($1, 'ROAD_HAZARD', 'Cleared Pothole', 'Fixed by city', 'LOW', 'RESOLVED', 12.9716, 77.5946, ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326)::geography)
       RETURNING id`,
      [reporterId]
    );
    resolvedIncidentId = resRes.rows[0].id;
  });

  afterAll(async () => {
    await query("DELETE FROM incident_verifications WHERE incident_id IN (SELECT id FROM incidents WHERE reporter_id IN (SELECT id FROM users WHERE email LIKE '%@verifytest.org'))");
    await query("DELETE FROM incidents WHERE reporter_id IN (SELECT id FROM users WHERE email LIKE '%@verifytest.org')");
    await query("DELETE FROM users WHERE email LIKE '%@verifytest.org'");
    await closePool();
  });

  // 1. Unauthenticated verification returns 401
  it('1. Unauthenticated POST /api/incidents/:id/verify returns 401', async () => {
    const res = await request(app)
      .post(`/api/incidents/${activeIncidentId}/verify`)
      .send({ verification_type: 'CONFIRM' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // 2. Unauthenticated GET verifications returns 401
  it('2. Unauthenticated GET /api/incidents/:id/verifications returns 401', async () => {
    const res = await request(app)
      .get(`/api/incidents/${activeIncidentId}/verifications`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // 3. Verification on non-existent incident returns 404
  it('3. Verification on nonexistent incident returns 404', async () => {
    const nonExistentUuid = 'a0000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .post(`/api/incidents/${nonExistentUuid}/verify`)
      .set('Authorization', `Bearer ${neighborAToken}`)
      .send({ verification_type: 'CONFIRM' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  // 4. Invalid UUID format returns 400
  it('4. Invalid incident UUID format returns 400', async () => {
    const res = await request(app)
      .post('/api/incidents/not-a-valid-uuid/verify')
      .set('Authorization', `Bearer ${neighborAToken}`)
      .send({ verification_type: 'CONFIRM' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Invalid incident ID format');
  });

  // 5. Invalid verification type returns 400
  it('5. Invalid verification type returns 400', async () => {
    const res = await request(app)
      .post(`/api/incidents/${activeIncidentId}/verify`)
      .set('Authorization', `Bearer ${neighborAToken}`)
      .send({ verification_type: 'UPVOTE' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // 6. Reporter cannot verify own incident -> 403 Forbidden
  it('6. Reporter cannot verify own incident (returns 403)', async () => {
    const res = await request(app)
      .post(`/api/incidents/${activeIncidentId}/verify`)
      .set('Authorization', `Bearer ${reporterToken}`)
      .send({ verification_type: 'CONFIRM' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('You cannot verify your own report');
  });

  // 7. Initial status for new incident is UNVERIFIED with 0 counts
  it('7. Initial status for new incident is UNVERIFIED with 0 counts', async () => {
    const res = await request(app)
      .get(`/api/incidents/${activeIncidentId}/verifications`)
      .set('Authorization', `Bearer ${neighborAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.confirm_count).toBe(0);
    expect(res.body.data.dispute_count).toBe(0);
    expect(res.body.data.status).toBe('UNVERIFIED');
    expect(res.body.data.my_verification).toBeNull();
  });

  // 8. Neighbor A submits CONFIRM -> status becomes COMMUNITY_CONFIRMED
  it('8. Neighbor A submits CONFIRM -> status becomes COMMUNITY_CONFIRMED', async () => {
    const res = await request(app)
      .post(`/api/incidents/${activeIncidentId}/verify`)
      .set('Authorization', `Bearer ${neighborAToken}`)
      .send({ verification_type: 'CONFIRM' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.confirm_count).toBe(1);
    expect(res.body.data.dispute_count).toBe(0);
    expect(res.body.data.status).toBe('COMMUNITY_CONFIRMED');
    expect(res.body.data.my_verification).toBe('CONFIRM');
  });

  // 9. Neighbor B submits DISPUTE -> tie (1 confirm, 1 dispute) -> status becomes UNVERIFIED
  it('9. Neighbor B submits DISPUTE -> tie (1 confirm, 1 dispute) -> status becomes UNVERIFIED', async () => {
    const res = await request(app)
      .post(`/api/incidents/${activeIncidentId}/verify`)
      .set('Authorization', `Bearer ${neighborBToken}`)
      .send({ verification_type: 'DISPUTE' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.confirm_count).toBe(1);
    expect(res.body.data.dispute_count).toBe(1);
    expect(res.body.data.status).toBe('UNVERIFIED');
    expect(res.body.data.my_verification).toBe('DISPUTE');
  });

  // 10. Neighbor C submits DISPUTE -> 1 confirm, 2 dispute -> status becomes COMMUNITY_DISPUTED
  it('10. Neighbor C submits DISPUTE -> status becomes COMMUNITY_DISPUTED', async () => {
    const res = await request(app)
      .post(`/api/incidents/${activeIncidentId}/verify`)
      .set('Authorization', `Bearer ${neighborCToken}`)
      .send({ verification_type: 'DISPUTE' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.confirm_count).toBe(1);
    expect(res.body.data.dispute_count).toBe(2);
    expect(res.body.data.status).toBe('COMMUNITY_DISPUTED');
    expect(res.body.data.my_verification).toBe('DISPUTE');
  });

  // 11. Neighbor A switches from CONFIRM to DISPUTE -> counts update cleanly (0 confirm, 3 dispute)
  it('11. Neighbor A changes vote from CONFIRM to DISPUTE without duplicate rows', async () => {
    const res = await request(app)
      .post(`/api/incidents/${activeIncidentId}/verify`)
      .set('Authorization', `Bearer ${neighborAToken}`)
      .send({ verification_type: 'DISPUTE' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.confirm_count).toBe(0);
    expect(res.body.data.dispute_count).toBe(3);
    expect(res.body.data.status).toBe('COMMUNITY_DISPUTED');
    expect(res.body.data.my_verification).toBe('DISPUTE');

    // Invariant: Verify DB has exactly 3 records, and Neighbor A has only 1 record
    const dbCheck = await query(
      'SELECT COUNT(*)::int AS count FROM incident_verifications WHERE incident_id = $1',
      [activeIncidentId]
    );
    expect(dbCheck.rows[0].count).toBe(3);

    const neighborACheck = await query(
      'SELECT COUNT(*)::int AS count FROM incident_verifications WHERE incident_id = $1 AND user_id = $2',
      [activeIncidentId, neighborAId]
    );
    expect(neighborACheck.rows[0].count).toBe(1);
  });

  // 12. Idempotent re-submission of same verification does not duplicate
  it('12. Re-submitting identical verification is idempotent and does not error', async () => {
    const res = await request(app)
      .post(`/api/incidents/${activeIncidentId}/verify`)
      .set('Authorization', `Bearer ${neighborAToken}`)
      .send({ verification_type: 'DISPUTE' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.confirm_count).toBe(0);
    expect(res.body.data.dispute_count).toBe(3);
  });

  // 13. Closed incidents cannot be verified (CANCELLED / RESOLVED)
  it('13. Verification blocked on CANCELLED or RESOLVED incidents with 400', async () => {
    // Cancelled incident
    const cancelRes = await request(app)
      .post(`/api/incidents/${cancelledIncidentId}/verify`)
      .set('Authorization', `Bearer ${neighborAToken}`)
      .send({ verification_type: 'CONFIRM' });

    expect(cancelRes.status).toBe(400);
    expect(cancelRes.body.message).toContain('Cannot verify an incident that is cancelled');

    // Resolved incident
    const resRes = await request(app)
      .post(`/api/incidents/${resolvedIncidentId}/verify`)
      .set('Authorization', `Bearer ${neighborAToken}`)
      .send({ verification_type: 'CONFIRM' });

    expect(resRes.status).toBe(400);
    expect(resRes.body.message).toContain('Cannot verify an incident that is resolved');
  });

  // 14. Verification does NOT modify incidents.status
  it('14. Verification NEVER modifies the incident status column in incidents table', async () => {
    const incidentCheck = await query(
      'SELECT status FROM incidents WHERE id = $1',
      [activeIncidentId]
    );
    // Should remain ACTIVE, not overwritten by COMMUNITY_DISPUTED
    expect(incidentCheck.rows[0].status).toBe('ACTIVE');
  });

  // 15. GET /api/incidents/:id includes verification summary
  it('15. GET /api/incidents/:id includes nested verification summary with user state', async () => {
    const res = await request(app)
      .get(`/api/incidents/${activeIncidentId}`)
      .set('Authorization', `Bearer ${neighborAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.incident.verification).toBeDefined();
    expect(res.body.data.incident.verification.confirm_count).toBe(0);
    expect(res.body.data.incident.verification.dispute_count).toBe(3);
    expect(res.body.data.incident.verification.status).toBe('COMMUNITY_DISPUTED');
    expect(res.body.data.incident.verification.my_verification).toBe('DISPUTE');
  });

  // 16. PRIVACY TEST: Verification summary exposes NO user IDs or names of other verifiers
  it('16. PRIVACY TEST: Verifier identities are completely hidden from API responses', async () => {
    const res = await request(app)
      .get(`/api/incidents/${activeIncidentId}/verifications`)
      .set('Authorization', `Bearer ${neighborBToken}`);

    expect(res.status).toBe(200);
    const data = res.body.data;
    // Data only has aggregate counts and user's own status
    expect(data.confirm_count).toBeDefined();
    expect(data.dispute_count).toBeDefined();
    expect(data.status).toBeDefined();
    expect(data.my_verification).toBe('DISPUTE');

    // Must NOT contain verifier lists or personal identifiers
    expect(data.verifiers).toBeUndefined();
    expect(data.users).toBeUndefined();
    expect(data.user_ids).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain(neighborAId);
    expect(JSON.stringify(data)).not.toContain(neighborCId);
  });

  // 17. Unit status calculation edge cases
  it('17. VerificationService.calculateStatus correctly handles edge cases', () => {
    expect(VerificationService.calculateStatus(0, 0)).toBe('UNVERIFIED');
    expect(VerificationService.calculateStatus(5, 5)).toBe('UNVERIFIED');
    expect(VerificationService.calculateStatus(10, 2)).toBe('COMMUNITY_CONFIRMED');
    expect(VerificationService.calculateStatus(1, 4)).toBe('COMMUNITY_DISPUTED');
  });
});
