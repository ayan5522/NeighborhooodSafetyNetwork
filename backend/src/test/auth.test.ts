import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app';
import { pool, closePool, query } from '../db';
import { config } from '../config';

describe('Module 01: User & Authentication Management Tests', () => {
  const app = createApp();

  const testUser = {
    full_name: 'Test Resident',
    email: 'resident.test@neighborhood.org',
    password: 'SecurePassword123!',
    confirm_password: 'SecurePassword123!',
  };

  let authToken: string;
  let userId: string;
  let resetOtp: string;
  let resetToken: string;

  beforeAll(async () => {
    // Clean test data
    await query('DELETE FROM password_resets WHERE email LIKE \'%@neighborhood.org\'');
    await query('DELETE FROM users WHERE email LIKE \'%@neighborhood.org\'');
  });

  afterAll(async () => {
    await query('DELETE FROM password_resets WHERE email LIKE \'%@neighborhood.org\'');
    await query('DELETE FROM users WHERE email LIKE \'%@neighborhood.org\'');
    await closePool();
  });

  // 1. Register valid user
  it('1. Register valid user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(testUser.email.toLowerCase());
    expect(res.body.data.user.role).toBe('RESIDENT');
    expect(res.body.data.user.account_status).toBe('ACTIVE');
    expect(res.body.data.user.password_hash).toBeUndefined();
    expect(res.body.data.token).toBeDefined();

    authToken = res.body.data.token;
    userId = res.body.data.user.id;
  });

  // 2. Register duplicate email
  it('2. Register duplicate email (case-insensitive)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        ...testUser,
        email: testUser.email.toUpperCase(),
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  // 3. Register invalid email
  it('3. Register invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        ...testUser,
        email: 'invalid-email-format',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // 4. Register missing name
  it('4. Register missing name', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'noname@neighborhood.org',
        password: 'SecurePassword123!',
        confirm_password: 'SecurePassword123!',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // 5. Register weak password
  it('5. Register weak password (< 8 chars)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        full_name: 'Weak Pwd',
        email: 'weak@neighborhood.org',
        password: 'short',
        confirm_password: 'short',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // 6. Register mismatched confirmation
  it('6. Register mismatched confirmation', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        full_name: 'Mismatch Pwd',
        email: 'mismatch@neighborhood.org',
        password: 'SecurePassword123!',
        confirm_password: 'DifferentPassword123!',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // 7. Attempt registration with role ADMIN
  it('7. Attempt registration with role ADMIN', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        full_name: 'Fake Admin',
        email: 'fakeadmin@neighborhood.org',
        password: 'SecurePassword123!',
        confirm_password: 'SecurePassword123!',
        role: 'ADMIN',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('RESIDENT');
  });

  // 8. Attempt registration with role MODERATOR
  it('8. Attempt registration with role MODERATOR', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        full_name: 'Fake Mod',
        email: 'fakemod@neighborhood.org',
        password: 'SecurePassword123!',
        confirm_password: 'SecurePassword123!',
        role: 'MODERATOR',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('RESIDENT');
  });

  // 9. Confirm registration always creates RESIDENT
  it('9. Confirm registration always creates RESIDENT in DB', async () => {
    const dbCheck = await query(
      'SELECT role FROM users WHERE email = $1',
      ['fakeadmin@neighborhood.org']
    );
    expect(dbCheck.rows[0].role).toBe('RESIDENT');
  });

  // 10. Login valid credentials
  it('10. Login valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe(testUser.email.toLowerCase());
  });

  // 11. Login wrong password
  it('11. Login wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: 'IncorrectPassword999!',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Invalid email or password');
  });

  // 12. Login nonexistent account
  it('12. Login nonexistent account', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'doesnotexist@neighborhood.org',
        password: 'AnyPassword123!',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Invalid email or password');
  });

  // 13. Login suspended account
  it('13. Login suspended account', async () => {
    // Suspend testUser
    await query("UPDATE users SET account_status = 'SUSPENDED' WHERE id = $1", [userId]);

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password,
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Account is suspended');

    // Restore to ACTIVE
    await query("UPDATE users SET account_status = 'ACTIVE' WHERE id = $1", [userId]);
  });

  // 14. Missing JWT
  it('14. Missing JWT', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // 15. Invalid JWT
  it('15. Invalid JWT', async () => {
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', 'Bearer invalid.token.value');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // 16. Expired JWT
  it('16. Expired JWT', async () => {
    const expiredToken = jwt.sign(
      { user_id: userId, role: 'RESIDENT' },
      config.jwt.secret,
      { expiresIn: '-1s' as any }
    );

    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Token has expired');
  });

  // 17. GET /api/users/me
  it('17. GET /api/users/me returns safe user profile', async () => {
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.id).toBe(userId);
    expect(res.body.data.user.email).toBe(testUser.email.toLowerCase());
    expect(res.body.data.user.role).toBe('RESIDENT');
    expect(res.body.data.user.password_hash).toBeUndefined();
  });

  // 18. PATCH /api/users/me
  it('18. PATCH /api/users/me updates full_name', async () => {
    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ full_name: 'Updated Resident Name' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.full_name).toBe('Updated Resident Name');
  });

  // 19. Attempt role modification by resident
  it('19. Attempt role modification by resident', async () => {
    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ full_name: 'Resident Self', role: 'ADMIN' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('RESIDENT');

    const dbCheck = await query('SELECT role FROM users WHERE id = $1', [userId]);
    expect(dbCheck.rows[0].role).toBe('RESIDENT');
  });

  // 20. Attempt status modification by resident
  it('20. Attempt status modification by resident', async () => {
    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ account_status: 'SUSPENDED' });

    const dbCheck = await query('SELECT account_status FROM users WHERE id = $1', [userId]);
    expect(dbCheck.rows[0].account_status).toBe('ACTIVE');
  });

  // 21. Logout
  it('21. Logout', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Logged out successfully');
  });

  // 22. Forgot password registered account
  it('22. Forgot password registered account generates OTP', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: testUser.email });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.dev_otp).toBeDefined();

    resetOtp = res.body.data.dev_otp;
  });

  // 23. Forgot password nonexistent account
  it('23. Forgot password nonexistent account returns explicit error', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nonexistent.user@neighborhood.org' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("User doesn't exist in the system.");
  });

  // 24. OTP invalid
  it('24. OTP invalid', async () => {
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({
        email: testUser.email,
        otp: '000000',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Invalid OTP code');
  });

  // 25. OTP expired
  it('25. OTP expired', async () => {
    // Set expiry in past
    await query(
      "UPDATE password_resets SET otp_expires_at = NOW() - INTERVAL '1 hour' WHERE email = $1",
      [testUser.email.toLowerCase()]
    );

    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({
        email: testUser.email,
        otp: resetOtp,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('OTP has expired');

    // Re-generate fresh OTP for remaining tests
    const freshRes = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: testUser.email });
    resetOtp = freshRes.body.data.dev_otp;
  });

  // 26. OTP reuse (tested after valid OTP)
  // 27. Valid OTP generates reset credential
  it('27. Valid OTP generates reset credential', async () => {
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({
        email: testUser.email,
        otp: resetOtp,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.reset_token).toBeDefined();

    resetToken = res.body.data.reset_token;
  });

  // 26. OTP reuse
  it('26. OTP reuse is blocked', async () => {
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({
        email: testUser.email,
        otp: resetOtp,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // 28. Missing reset token
  it('28. Missing reset token', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({
        new_password: 'BrandNewPassword123!',
        confirm_new_password: 'BrandNewPassword123!',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Reset token is required');
  });

  // 29. Invalid reset token
  it('29. Invalid reset token', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({
        reset_token: 'invalid_reset_token_hex',
        new_password: 'BrandNewPassword123!',
        confirm_new_password: 'BrandNewPassword123!',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid reset token');
  });

  // 30. Expired reset token
  it('30. Expired reset token', async () => {
    await query(
      "UPDATE password_resets SET token_expires_at = NOW() - INTERVAL '1 hour' WHERE reset_token = $1",
      [resetToken]
    );

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({
        reset_token: resetToken,
        new_password: 'BrandNewPassword123!',
        confirm_new_password: 'BrandNewPassword123!',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Reset token has expired');

    // Restore token validity for subsequent tests
    await query(
      "UPDATE password_resets SET token_expires_at = NOW() + INTERVAL '15 minutes' WHERE reset_token = $1",
      [resetToken]
    );
  });

  // 32. Successful password reset
  it('32. Successful password reset', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({
        reset_token: resetToken,
        new_password: 'BrandNewPassword123!',
        confirm_new_password: 'BrandNewPassword123!',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('Password reset successful');
  });

  // 31. Used reset token
  it('31. Used reset token cannot be reused', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({
        reset_token: resetToken,
        new_password: 'AnotherPassword123!',
        confirm_new_password: 'AnotherPassword123!',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Reset token has already been used');
  });

  // 33. Login with new password
  it('33. Login with new password succeeds', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: 'BrandNewPassword123!',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
  });

  // 34. Old password no longer works
  it('34. Old password no longer works', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password, // old password
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Invalid email or password');
  });
});
