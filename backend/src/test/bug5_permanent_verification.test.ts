import request from 'supertest';
import { createApp } from '../app';
import { closePool, query } from '../db';
import { hashPassword, generateJwt } from '../utils/crypto';

describe('Bug 5 — Permanent Community Verification Votes', () => {
  const app = createApp();

  let reporterId: string;
  let reporterToken: string;
  let user1Id: string;
  let user1Token: string;
  let user2Id: string;
  let user2Token: string;
  let user3Id: string;
  let user3Token: string;
  let incidentId: string;

  beforeAll(async () => {
    await query("DELETE FROM incident_verifications WHERE incident_id IN (SELECT id FROM incidents WHERE reporter_id IN (SELECT id FROM users WHERE email LIKE '%@bug5test.org'))");
    await query("DELETE FROM incidents WHERE reporter_id IN (SELECT id FROM users WHERE email LIKE '%@bug5test.org')");
    await query("DELETE FROM users WHERE email LIKE '%@bug5test.org'");

    const pwd = await hashPassword('Bug5SecretPass123!');

    // Reporter
    const rRes = await query(
      `INSERT INTO users (full_name, email, password_hash, role, account_status)
       VALUES ('Reporter User', 'reporter@bug5test.org', $1, 'RESIDENT', 'ACTIVE') RETURNING id`,
      [pwd]
    );
    reporterId = rRes.rows[0].id;
    reporterToken = generateJwt({ user_id: reporterId, role: 'RESIDENT' });

    // User 1
    const u1Res = await query(
      `INSERT INTO users (full_name, email, password_hash, role, account_status)
       VALUES ('User One', 'user1@bug5test.org', $1, 'RESIDENT', 'ACTIVE') RETURNING id`,
      [pwd]
    );
    user1Id = u1Res.rows[0].id;
    user1Token = generateJwt({ user_id: user1Id, role: 'RESIDENT' });

    // User 2
    const u2Res = await query(
      `INSERT INTO users (full_name, email, password_hash, role, account_status)
       VALUES ('User Two', 'user2@bug5test.org', $1, 'RESIDENT', 'ACTIVE') RETURNING id`,
      [pwd]
    );
    user2Id = u2Res.rows[0].id;
    user2Token = generateJwt({ user_id: user2Id, role: 'RESIDENT' });

    // User 3
    const u3Res = await query(
      `INSERT INTO users (full_name, email, password_hash, role, account_status)
       VALUES ('User Three', 'user3@bug5test.org', $1, 'RESIDENT', 'ACTIVE') RETURNING id`,
      [pwd]
    );
    user3Id = u3Res.rows[0].id;
    user3Token = generateJwt({ user_id: user3Id, role: 'RESIDENT' });

    // Incident
    const incRes = await query(
      `INSERT INTO incidents (reporter_id, category, title, description, severity, status, latitude, longitude, location)
       VALUES ($1, 'FIRE', 'Bug 5 Test Incident', 'Test description', 'HIGH', 'ACTIVE', 12.9716, 77.5946, ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326)::geography)
       RETURNING id`,
      [reporterId]
    );
    incidentId = incRes.rows[0].id;
  });

  afterAll(async () => {
    await query("DELETE FROM incident_verifications WHERE incident_id IN (SELECT id FROM incidents WHERE reporter_id IN (SELECT id FROM users WHERE email LIKE '%@bug5test.org'))");
    await query("DELETE FROM incidents WHERE reporter_id IN (SELECT id FROM users WHERE email LIKE '%@bug5test.org')");
    await query("DELETE FROM users WHERE email LIKE '%@bug5test.org'");
    await closePool();
  });

  it('1. Initial state has 0 verifications and UNVERIFIED status', async () => {
    const res = await request(app)
      .get(`/api/incidents/${incidentId}/verifications`)
      .set('Authorization', `Bearer ${user1Token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.confirm_count).toBe(0);
    expect(res.body.data.dispute_count).toBe(0);
    expect(res.body.data.status).toBe('UNVERIFIED');
    expect(res.body.data.my_verification).toBeNull();
  });

  it('2. User 1 successfully submits initial CONFIRM vote', async () => {
    const res = await request(app)
      .post(`/api/incidents/${incidentId}/verify`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ verification_type: 'CONFIRM' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.confirm_count).toBe(1);
    expect(res.body.data.dispute_count).toBe(0);
    expect(res.body.data.status).toBe('COMMUNITY_CONFIRMED');
    expect(res.body.data.my_verification).toBe('CONFIRM');

    // DB verify
    const dbRes = await query(
      'SELECT * FROM incident_verifications WHERE incident_id = $1 AND user_id = $2',
      [incidentId, user1Id]
    );
    expect(dbRes.rows.length).toBe(1);
    expect(dbRes.rows[0].verification_type).toBe('CONFIRM');
  });

  it('3. User 1 attempting to change vote from CONFIRM to DISPUTE is rejected with 400', async () => {
    const res = await request(app)
      .post(`/api/incidents/${incidentId}/verify`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ verification_type: 'DISPUTE' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('VOTE_ALREADY_CAST');
    expect(res.body.message).toContain('Community verification votes are permanent and cannot be changed');

    // DB verify: still CONFIRM, count still 1
    const dbRes = await query(
      'SELECT * FROM incident_verifications WHERE incident_id = $1 AND user_id = $2',
      [incidentId, user1Id]
    );
    expect(dbRes.rows.length).toBe(1);
    expect(dbRes.rows[0].verification_type).toBe('CONFIRM');
  });

  it('4. User 1 submitting the same CONFIRM vote again does not create duplicate record', async () => {
    const res = await request(app)
      .post(`/api/incidents/${incidentId}/verify`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ verification_type: 'CONFIRM' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.confirm_count).toBe(1);
    expect(res.body.data.dispute_count).toBe(0);
    expect(res.body.data.my_verification).toBe('CONFIRM');

    // DB verify: exactly 1 record exists
    const dbRes = await query(
      'SELECT * FROM incident_verifications WHERE incident_id = $1 AND user_id = $2',
      [incidentId, user1Id]
    );
    expect(dbRes.rows.length).toBe(1);
  });

  it('5. User 2 successfully submits initial DISPUTE vote', async () => {
    const res = await request(app)
      .post(`/api/incidents/${incidentId}/verify`)
      .set('Authorization', `Bearer ${user2Token}`)
      .send({ verification_type: 'DISPUTE' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.confirm_count).toBe(1);
    expect(res.body.data.dispute_count).toBe(1);
    expect(res.body.data.status).toBe('UNVERIFIED');
    expect(res.body.data.my_verification).toBe('DISPUTE');
  });

  it('6. User 2 attempting to change vote from DISPUTE to CONFIRM is rejected with 400', async () => {
    const res = await request(app)
      .post(`/api/incidents/${incidentId}/verify`)
      .set('Authorization', `Bearer ${user2Token}`)
      .send({ verification_type: 'CONFIRM' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('VOTE_ALREADY_CAST');
    expect(res.body.message).toContain('Community verification votes are permanent and cannot be changed');

    // DB verify: still DISPUTE
    const dbRes = await query(
      'SELECT * FROM incident_verifications WHERE incident_id = $1 AND user_id = $2',
      [incidentId, user2Id]
    );
    expect(dbRes.rows.length).toBe(1);
    expect(dbRes.rows[0].verification_type).toBe('DISPUTE');
  });

  it('7. User 3 submits DISPUTE, tipping status to COMMUNITY_DISPUTED', async () => {
    const res = await request(app)
      .post(`/api/incidents/${incidentId}/verify`)
      .set('Authorization', `Bearer ${user3Token}`)
      .send({ verification_type: 'DISPUTE' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.confirm_count).toBe(1);
    expect(res.body.data.dispute_count).toBe(2);
    expect(res.body.data.status).toBe('COMMUNITY_DISPUTED');
    expect(res.body.data.my_verification).toBe('DISPUTE');
  });

  it('8. Reporter cannot verify own incident', async () => {
    const res = await request(app)
      .post(`/api/incidents/${incidentId}/verify`)
      .set('Authorization', `Bearer ${reporterToken}`)
      .send({ verification_type: 'CONFIRM' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('9. Total verification records in DB equals exactly 3 with no duplicates', async () => {
    const totalRes = await query(
      'SELECT COUNT(*)::int AS count FROM incident_verifications WHERE incident_id = $1',
      [incidentId]
    );
    expect(totalRes.rows[0].count).toBe(3);
  });
});
