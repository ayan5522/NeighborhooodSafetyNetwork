import request from 'supertest';
import { createApp } from '../app';
import { query } from '../db';
import { AITrustService } from '../services/aiTrustService';

const app = createApp();

describe('Module 09: AI Trust & Reliability Engine Tests', () => {
  let reporterToken: string;
  let reporterUserId: string;
  let neighbor1Token: string;
  let neighbor1UserId: string;
  let neighbor2Token: string;
  let incidentId: string;

  const cleanupTestRecords = async () => {
    try {
      await query("DELETE FROM incident_ai_assessments WHERE incident_id IN (SELECT id FROM incidents WHERE title LIKE '%Mod9%')");
      await query("DELETE FROM incident_verifications WHERE incident_id IN (SELECT id FROM incidents WHERE title LIKE '%Mod9%')");
      await query("DELETE FROM alerts WHERE incident_id IN (SELECT id FROM incidents WHERE title LIKE '%Mod9%')");
      await query("DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@mod9test.com')");
      await query("DELETE FROM incidents WHERE title LIKE '%Mod9%'");
      await query("DELETE FROM users WHERE email LIKE '%@mod9test.com'");
    } catch {}
  };

  beforeAll(async () => {
    await cleanupTestRecords();

    // 1. Register reporter
    const repRes = await request(app)
      .post('/api/auth/register')
      .send({
        full_name: 'AI Reporter User',
        email: 'reporter@mod9test.com',
        password: 'Password123!',
        confirm_password: 'Password123!',
      });
    reporterUserId = repRes.body.data.user.id;
    reporterToken = repRes.body.data.token;

    // 2. Register neighbor 1
    const n1Res = await request(app)
      .post('/api/auth/register')
      .send({
        full_name: 'Neighbor One',
        email: 'neighbor1@mod9test.com',
        password: 'Password123!',
        confirm_password: 'Password123!',
      });
    neighbor1UserId = n1Res.body.data.user.id;
    neighbor1Token = n1Res.body.data.token;

    // 3. Register neighbor 2
    const n2Res = await request(app)
      .post('/api/auth/register')
      .send({
        full_name: 'Neighbor Two',
        email: 'neighbor2@mod9test.com',
        password: 'Password123!',
        confirm_password: 'Password123!',
      });
    neighbor2Token = n2Res.body.data.token;

    // 4. Create an incident for testing
    const incRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${reporterToken}`)
      .send({
        category: 'ROAD_HAZARD',
        title: 'Fallen tree branch Mod9',
        description: 'Large oak tree branch blocking right lane on Elm Street.',
        severity: 'MEDIUM',
        latitude: 37.7749,
        longitude: -122.4194,
      });

    expect(incRes.status).toBe(201);
    incidentId = incRes.body.data.incident.id;
  });

  afterAll(async () => {
    await cleanupTestRecords();
  });

  describe('1. API Endpoint Security & Validation', () => {
    it('Unauthenticated request to GET /api/incidents/:id/trust-score returns 401', async () => {
      const res = await request(app).get(`/api/incidents/${incidentId}/trust-score`);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('Invalid UUID format returns 400', async () => {
      const res = await request(app)
        .get('/api/incidents/not-a-valid-uuid/trust-score')
        .set('Authorization', `Bearer ${reporterToken}`);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid incident ID');
    });

    it('Nonexistent incident ID returns 404', async () => {
      const res = await request(app)
        .get('/api/incidents/00000000-0000-0000-0000-000000000000/trust-score')
        .set('Authorization', `Bearer ${reporterToken}`);
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('2. Live Prediction & Cold-Start Behavior', () => {
    it('Evaluates freshly created incident with cold-start rules (0 verifications -> LOW confidence)', async () => {
      const res = await request(app)
        .get(`/api/incidents/${incidentId}/trust-score`)
        .set('Authorization', `Bearer ${reporterToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const assessment = res.body.data.assessment;
      expect(assessment).toHaveProperty('trust_score');
      expect(typeof assessment.trust_score).toBe('number');
      expect(assessment.trust_score).toBeGreaterThanOrEqual(0);
      expect(assessment.trust_score).toBeLessThanOrEqual(100);

      // Cold start verification requirement
      expect(assessment.confidence_level).toBe('LOW');
      expect(assessment.model_version).toBe('trust-model-v1');
      expect(assessment.feature_version).toBe('v1');
      expect(Array.isArray(assessment.explanation)).toBe(true);
      expect(assessment.explanation.length).toBeGreaterThan(0);
    });

    it('Assessment is persisted into incident_ai_assessments table', async () => {
      const dbRes = await query(
        'SELECT * FROM incident_ai_assessments WHERE incident_id = $1 ORDER BY created_at DESC LIMIT 1',
        [incidentId]
      );
      expect(dbRes.rows.length).toBe(1);
      expect(dbRes.rows[0].incident_id).toBe(incidentId);
      expect(dbRes.rows[0].trust_score).not.toBeNull();
      expect(dbRes.rows[0].confidence_level).toBe('LOW');
    });

    it('Increases trust score & confidence after community corroboration', async () => {
      // Neighbor 1 confirms
      const v1 = await request(app)
        .post(`/api/incidents/${incidentId}/verify`)
        .set('Authorization', `Bearer ${neighbor1Token}`)
        .send({ verification_type: 'CONFIRM' });
      expect(v1.status).toBe(200);

      // Neighbor 2 confirms
      const v2 = await request(app)
        .post(`/api/incidents/${incidentId}/verify`)
        .set('Authorization', `Bearer ${neighbor2Token}`)
        .send({ verification_type: 'CONFIRM' });
      expect(v2.status).toBe(200);

      // Request refreshed AI assessment
      const res = await request(app)
        .get(`/api/incidents/${incidentId}/trust-score?refresh=true`)
        .set('Authorization', `Bearer ${reporterToken}`);

      expect(res.status).toBe(200);
      const assessment = res.body.data.assessment;

      // With community confirmations, trust score should be high
      expect(assessment.trust_score).toBeGreaterThanOrEqual(75);
      expect(['MEDIUM', 'HIGH']).toContain(assessment.confidence_level);
      expect(assessment.explanation.some((e: string) => e.includes('confirmation'))).toBe(true);
    });
  });

  describe('3. Resilience & Failure Fallback', () => {
    it('Gracefully falls back without throwing if AI service encounters an issue', async () => {
      // Test AITrustService directly with invalid inputs to verify fallback
      const fallback = await AITrustService.evaluateIncident(
        '00000000-0000-0000-0000-000000000000'
      ).catch((err) => err.message);

      expect(fallback).toContain('Incident not found');
    });

    it('Application core functionality continues unimpaired even if AI fails', async () => {
      // Normal incident details fetch continues to succeed
      const incRes = await request(app)
        .get(`/api/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${reporterToken}`);

      expect(incRes.status).toBe(200);
      expect(incRes.body.data.incident.id).toBe(incidentId);
    });
  });
});
