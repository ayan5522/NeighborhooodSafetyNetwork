import request from 'supertest';
import { createApp } from '../app';
import { query, closePool } from '../db';
import { hashOtp, verifyOtpHash, hashResetToken } from '../utils/crypto';

describe('Email Verification OTP & Secure Forgot Password E2E Test Suite', () => {
  const app = createApp();

  const testUserA = {
    full_name: 'Test Resident A',
    email: 'resident.flowa@neighborhood.org',
    password: 'InitialPassword123!',
    confirm_password: 'InitialPassword123!',
  };

  const testUserB = {
    full_name: 'Test Resident B',
    email: 'resident.flowb@neighborhood.org',
    password: 'OriginalPassword123!',
    confirm_password: 'OriginalPassword123!',
  };

  beforeAll(async () => {
    // Clean test data before running
    await query("DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@neighborhood.org')");
    await query("DELETE FROM email_verification_otps WHERE email LIKE '%@neighborhood.org'");
    await query("DELETE FROM users WHERE email LIKE '%@neighborhood.org'");
  });

  afterAll(async () => {
    // Clean test data after running
    await query("DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@neighborhood.org')");
    await query("DELETE FROM email_verification_otps WHERE email LIKE '%@neighborhood.org'");
    await query("DELETE FROM users WHERE email LIKE '%@neighborhood.org'");
    await closePool();
  });

  // =========================================================================
  // FLOW A: User Registration & Email Verification OTP
  // =========================================================================
  describe('Flow A: Registration & Email Verification OTP', () => {
    let registrationOtpCode: string;
    let verifiedJwtToken: string;

    it('A1. Register with valid details creates PENDING user and stores hashed OTP without leaking plain OTP', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(testUserA);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(testUserA.email.toLowerCase());
      // Must NOT return JWT token before verification
      expect(res.body.data.token).toBeUndefined();
      // Must NOT return plain OTP
      expect(res.body.data.dev_otp).toBeUndefined();
      expect(res.body.data.otp).toBeUndefined();

      // Verify database state
      const userRes = await query('SELECT * FROM users WHERE email = $1', [testUserA.email.toLowerCase()]);
      expect(userRes.rows.length).toBe(1);
      const user = userRes.rows[0];
      expect(user.email_verified).toBe(false);
      expect(user.account_status).toBe('PENDING');

      // Verify OTP table
      const otpRes = await query(
        "SELECT * FROM email_verification_otps WHERE email = $1 AND purpose = 'REGISTRATION_VERIFICATION'",
        [testUserA.email.toLowerCase()]
      );
      expect(otpRes.rows.length).toBe(1);
      const otpRecord = otpRes.rows[0];
      expect(otpRecord.otp_hash).toBeDefined();
      expect(otpRecord.otp_hash.length).toBe(64); // SHA-256 hex length
      expect(otpRecord.used_at).toBeNull();
      expect(otpRecord.attempt_count).toBe(0);

      // Find the generated OTP by matching hashes (for test verification purposes)
      for (let i = 100000; i <= 999999; i++) {
        if (hashOtp(String(i)) === otpRecord.otp_hash) {
          registrationOtpCode = String(i);
          break;
        }
      }
      expect(registrationOtpCode).toBeDefined();
      expect(registrationOtpCode.length).toBe(6);
    });

    it('A2. Duplicate registration with same email (case-insensitive) is rejected', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          ...testUserA,
          email: testUserA.email.toUpperCase(),
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Email is already registered');
    });

    it('A3. Registration with invalid email format is rejected with 400', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          ...testUserA,
          email: 'invalid-email-format',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('A4. Registration with short password (< 8 chars) is rejected with 400', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          full_name: 'Short Pwd',
          email: 'shortpwd@neighborhood.org',
          password: 'short',
          confirm_password: 'short',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('A5. Registration with mismatched passwords is rejected with 400', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          full_name: 'Mismatch',
          email: 'mismatch@neighborhood.org',
          password: 'Password123!',
          confirm_password: 'DifferentPassword123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('A6. Login attempt with unverified user is rejected with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUserA.email,
          password: testUserA.password,
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('verify your email');
      expect(res.body.data?.email_verified).toBe(false);
      expect(res.body.data?.token).toBeUndefined();
    });

    it('A7. Verify email with wrong OTP fails and increments attempt count', async () => {
      const res = await request(app)
        .post('/api/auth/verify-email-otp')
        .send({
          email: testUserA.email,
          otp: '000000',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('incorrect');

      const otpRes = await query(
        "SELECT attempt_count FROM email_verification_otps WHERE email = $1 AND purpose = 'REGISTRATION_VERIFICATION'",
        [testUserA.email.toLowerCase()]
      );
      expect(otpRes.rows[0].attempt_count).toBe(1);
    });

    it('A8. Resend verification OTP within 60s cooldown is rejected with 429', async () => {
      const res = await request(app)
        .post('/api/auth/resend-verification-otp')
        .send({ email: testUserA.email });

      expect(res.status).toBe(429);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Please wait');
    });

    it('A9. Verify email after exceeding max attempts fails', async () => {
      // Artificially set attempt_count to 5
      await query(
        "UPDATE email_verification_otps SET attempt_count = 5 WHERE email = $1 AND purpose = 'REGISTRATION_VERIFICATION'",
        [testUserA.email.toLowerCase()]
      );

      const res = await request(app)
        .post('/api/auth/verify-email-otp')
        .send({
          email: testUserA.email,
          otp: registrationOtpCode,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Too many incorrect attempts');

      // Reset attempt count and used_at back for valid verification test in A10
      await query(
        "UPDATE email_verification_otps SET attempt_count = 0, used_at = NULL WHERE email = $1 AND purpose = 'REGISTRATION_VERIFICATION'",
        [testUserA.email.toLowerCase()]
      );
    });

    it('A10. Verify email with valid OTP activates account and automatically returns JWT session', async () => {
      const res = await request(app)
        .post('/api/auth/verify-email-otp')
        .send({
          email: testUserA.email,
          otp: registrationOtpCode,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.email).toBe(testUserA.email.toLowerCase());
      expect(res.body.data.user.account_status).toBe('ACTIVE');

      verifiedJwtToken = res.body.data.token;

      // Verify DB state
      const userRes = await query('SELECT * FROM users WHERE email = $1', [testUserA.email.toLowerCase()]);
      expect(userRes.rows[0].email_verified).toBe(true);
      expect(userRes.rows[0].account_status).toBe('ACTIVE');

      const otpRes = await query(
        "SELECT used_at FROM email_verification_otps WHERE email = $1 AND purpose = 'REGISTRATION_VERIFICATION'",
        [testUserA.email.toLowerCase()]
      );
      expect(otpRes.rows[0].used_at).not.toBeNull();

      // Test reusing the same OTP fails
      const reuseRes = await request(app)
        .post('/api/auth/verify-email-otp')
        .send({
          email: testUserA.email,
          otp: registrationOtpCode,
        });
      expect(reuseRes.status).toBe(400);

      // Verify login now succeeds
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUserA.email,
          password: testUserA.password,
        });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.token).toBeDefined();
    });
  });

  // =========================================================================
  // FLOW B: Secure Forgot Password & Reset Password
  // =========================================================================
  describe('Flow B: Secure Forgot Password & Reset Password', () => {
    let resetOtpCode: string;
    let validResetToken: string;

    beforeAll(async () => {
      // Register and activate testUserB for Flow B tests
      await request(app).post('/api/auth/register').send(testUserB);

      // Manually activate testUserB
      await query(
        "UPDATE users SET email_verified = true, account_status = 'ACTIVE' WHERE email = $1",
        [testUserB.email.toLowerCase()]
      );
    });

    it('B1. Forgot password for unregistered email returns exact error: "User doesn\'t exist in the system."', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent.resident@neighborhood.org' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("User doesn't exist in the system.");
    });

    it('B2. Forgot password with invalid email format returns 400', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'not-an-email' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('B3. Forgot password for registered email generates OTP without exposing it in response', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: testUserB.email });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data?.dev_otp).toBeUndefined();
      expect(res.body.data?.otp).toBeUndefined();

      // Find generated OTP from database hash
      const otpRes = await query(
        "SELECT * FROM email_verification_otps WHERE email = $1 AND purpose = 'PASSWORD_RESET' ORDER BY created_at DESC LIMIT 1",
        [testUserB.email.toLowerCase()]
      );
      expect(otpRes.rows.length).toBe(1);
      const otpRecord = otpRes.rows[0];

      for (let i = 100000; i <= 999999; i++) {
        if (hashOtp(String(i)) === otpRecord.otp_hash) {
          resetOtpCode = String(i);
          break;
        }
      }
      expect(resetOtpCode).toBeDefined();
      expect(resetOtpCode.length).toBe(6);
    });

    it('B4. Resend password reset OTP within 60s cooldown is rejected with 429', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: testUserB.email });

      expect(res.status).toBe(429);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Please wait');
    });

    it('B5. Verify reset OTP with wrong code fails and increments attempt count', async () => {
      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({
          email: testUserB.email,
          otp: '111111',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid OTP code');

      const otpRes = await query(
        "SELECT attempt_count FROM email_verification_otps WHERE email = $1 AND purpose = 'PASSWORD_RESET' AND used_at IS NULL",
        [testUserB.email.toLowerCase()]
      );
      expect(otpRes.rows[0].attempt_count).toBe(1);
    });

    it('B6. Verify reset OTP with correct code returns reset_token and stores hash in DB', async () => {
      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({
          email: testUserB.email,
          otp: resetOtpCode,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reset_token).toBeDefined();

      validResetToken = res.body.data.reset_token;

      // Verify token hash is stored in password_reset_tokens
      const expectedTokenHash = hashResetToken(validResetToken);
      const tokenDb = await query(
        'SELECT * FROM password_reset_tokens WHERE token_hash = $1',
        [expectedTokenHash]
      );
      expect(tokenDb.rows.length).toBe(1);
      expect(tokenDb.rows[0].used_at).toBeNull();

      // Verify OTP is marked used
      const otpDb = await query(
        "SELECT used_at FROM email_verification_otps WHERE email = $1 AND purpose = 'PASSWORD_RESET'",
        [testUserB.email.toLowerCase()]
      );
      expect(otpDb.rows[0].used_at).not.toBeNull();
    });

    it('B7. Reusing already used reset OTP is rejected', async () => {
      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({
          email: testUserB.email,
          otp: resetOtpCode,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('B8. Reset password with mismatched confirm_password returns 400', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          reset_token: validResetToken,
          new_password: 'NewStrongPassword456!',
          confirm_password: 'DifferentPassword456!',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Passwords do not match');
    });

    it('B9. Reset password with short password (< 8 chars) returns 400', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          reset_token: validResetToken,
          new_password: 'short',
          confirm_password: 'short',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('B10. Reset password with invalid / fake reset_token returns 400', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          reset_token: 'fake-invalid-token-1234567890',
          new_password: 'NewStrongPassword456!',
          confirm_password: 'NewStrongPassword456!',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid or expired reset token');
    });

    it('B11. Reset password with valid token successfully updates password and marks token used', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          reset_token: validResetToken,
          new_password: 'NewStrongPassword456!',
          confirm_password: 'NewStrongPassword456!',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Password reset successful');

      // Verify token is marked as used in DB
      const expectedTokenHash = hashResetToken(validResetToken);
      const tokenDb = await query(
        'SELECT used_at FROM password_reset_tokens WHERE token_hash = $1',
        [expectedTokenHash]
      );
      expect(tokenDb.rows[0].used_at).not.toBeNull();
    });

    it('B12. Reusing already used reset_token is rejected', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          reset_token: validResetToken,
          new_password: 'AnotherPassword789!',
          confirm_password: 'AnotherPassword789!',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid or expired reset token');
    });

    it('B13. Login with old password fails (401), login with new password succeeds (200)', async () => {
      // Old password must fail
      const oldLoginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUserB.email,
          password: testUserB.password,
        });

      expect(oldLoginRes.status).toBe(401);
      expect(oldLoginRes.body.success).toBe(false);

      // New password must succeed
      const newLoginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUserB.email,
          password: 'NewStrongPassword456!',
        });

      expect(newLoginRes.status).toBe(200);
      expect(newLoginRes.body.success).toBe(true);
      expect(newLoginRes.body.data.token).toBeDefined();
      expect(newLoginRes.body.data.user.email).toBe(testUserB.email.toLowerCase());
    });
  });

  // =========================================================================
  // Security & Audit Verification
  // =========================================================================
  describe('Security & Audit Logging', () => {
    it('S1. Verifies audit log records were created for sensitive actions', async () => {
      const auditRes = await query(
        `SELECT action FROM audit_logs WHERE action IN (
           'EMAIL_VERIFICATION_REQUESTED',
           'EMAIL_VERIFICATION_SUCCESS',
           'EMAIL_VERIFICATION_FAILED',
           'PASSWORD_RESET_REQUESTED',
           'PASSWORD_RESET_OTP_VERIFIED',
           'PASSWORD_RESET_COMPLETED'
         )`
      );

      expect(auditRes.rows.length).toBeGreaterThan(0);
      const actions = auditRes.rows.map(r => r.action);
      expect(actions).toContain('EMAIL_VERIFICATION_REQUESTED');
      expect(actions).toContain('EMAIL_VERIFICATION_SUCCESS');
      expect(actions).toContain('PASSWORD_RESET_REQUESTED');
      expect(actions).toContain('PASSWORD_RESET_COMPLETED');
    });
  });
});
