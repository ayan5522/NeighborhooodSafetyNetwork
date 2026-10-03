import { Request, Response } from 'express';
import { query } from '../db';
import { AuditService } from '../services/auditService';
import {
  hashPassword,
  comparePassword,
  generateJwt,
  normalizeEmail,
  validateEmail,
  validatePasswordPolicy,
  generateOtp,
  generateResetToken,
} from '../utils/crypto';

export const register = async (req: Request, res: Response): Promise<void> => {
  const { full_name, email, password, confirm_password } = req.body;

  if (!full_name || typeof full_name !== 'string' || full_name.trim().length === 0) {
    res.status(400).json({
      success: false,
      message: 'Full name is required',
    });
    return;
  }

  if (!email || !validateEmail(email)) {
    res.status(400).json({
      success: false,
      message: 'A valid email address is required',
    });
    return;
  }

  const normalizedEmail = normalizeEmail(email);

  const passwordValidation = validatePasswordPolicy(password);
  if (!passwordValidation.valid) {
    res.status(400).json({
      success: false,
      message: passwordValidation.message,
    });
    return;
  }

  if (password !== confirm_password) {
    res.status(400).json({
      success: false,
      message: 'Passwords do not match',
    });
    return;
  }

  // Check duplicate email
  const existingUser = await query(
    'SELECT id FROM users WHERE LOWER(TRIM(email)) = $1',
    [normalizedEmail]
  );

  if (existingUser.rows.length > 0) {
    res.status(409).json({
      success: false,
      message: 'An account with this email already exists',
    });
    return;
  }

  const passwordHash = await hashPassword(password);

  // Security Rule: Public registration always creates RESIDENT, never ADMIN or MODERATOR
  const userRole = 'RESIDENT';
  const accountStatus = 'ACTIVE';

  const insertRes = await query(
    `INSERT INTO users (full_name, email, password_hash, role, account_status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, full_name, email, role, account_status, created_at, updated_at`,
    [full_name.trim(), normalizedEmail, passwordHash, userRole, accountStatus]
  );

  const newUser = insertRes.rows[0];
  const token = generateJwt({
    user_id: newUser.id,
    role: newUser.role,
  });

  AuditService.log({
    actor_user_id: newUser.id,
    action: 'USER_REGISTERED',
    entity_type: 'user',
    entity_id: newUser.id,
    description: `User registered: ${newUser.email}`,
    metadata: { full_name: newUser.full_name, email: newUser.email, role: newUser.role },
    req,
  });

  res.status(201).json({
    success: true,
    data: {
      user: {
        id: newUser.id,
        full_name: newUser.full_name,
        email: newUser.email,
        role: newUser.role,
        account_status: newUser.account_status,
        created_at: newUser.created_at,
        updated_at: newUser.updated_at,
      },
      token,
    },
  });
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({
      success: false,
      message: 'Email and password are required',
    });
    return;
  }

  const normalizedEmail = normalizeEmail(email);

  const userRes = await query(
    'SELECT id, full_name, email, password_hash, role, account_status, created_at, updated_at FROM users WHERE LOWER(TRIM(email)) = $1',
    [normalizedEmail]
  );

  if (userRes.rows.length === 0) {
    AuditService.log({
      actor_user_id: null,
      action: 'USER_LOGIN_FAILED',
      entity_type: 'auth',
      entity_id: null,
      description: `Failed login attempt for unknown user: ${normalizedEmail}`,
      metadata: { email: normalizedEmail, reason: 'User not found' },
      req,
    });
    res.status(401).json({
      success: false,
      message: 'Invalid email or password',
    });
    return;
  }

  const user = userRes.rows[0];

  // Enforce account status check
  if (user.account_status === 'SUSPENDED') {
    AuditService.log({
      actor_user_id: user.id,
      action: 'USER_LOGIN_FAILED',
      entity_type: 'auth',
      entity_id: user.id,
      description: `Login attempt on suspended account: ${user.email}`,
      metadata: { email: user.email, reason: 'Account suspended' },
      req,
    });
    res.status(403).json({
      success: false,
      message: 'Account is suspended. Please contact support.',
    });
    return;
  }

  const passwordMatch = await comparePassword(password, user.password_hash);
  if (!passwordMatch) {
    AuditService.log({
      actor_user_id: user.id,
      action: 'USER_LOGIN_FAILED',
      entity_type: 'auth',
      entity_id: user.id,
      description: `Failed password attempt for user: ${user.email}`,
      metadata: { email: user.email, reason: 'Invalid password' },
      req,
    });
    res.status(401).json({
      success: false,
      message: 'Invalid email or password',
    });
    return;
  }

  const token = generateJwt({
    user_id: user.id,
    role: user.role,
  });

  AuditService.log({
    actor_user_id: user.id,
    action: 'USER_LOGIN_SUCCESS',
    entity_type: 'auth',
    entity_id: user.id,
    description: `User successfully logged in: ${user.email}`,
    metadata: { email: user.email, role: user.role },
    req,
  });

  res.status(200).json({
    success: true,
    data: {
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        account_status: user.account_status,
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
      token,
    },
  });
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  AuditService.log({
    actor_user_id: req.user?.id || null,
    action: 'USER_LOGOUT',
    entity_type: 'auth',
    entity_id: req.user?.id || null,
    description: 'User logged out',
    metadata: {},
    req,
  });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;

  if (!email) {
    res.status(400).json({
      success: false,
      message: 'Email is required',
    });
    return;
  }

  const normalizedEmail = normalizeEmail(email);

  // Check account existence - mandatory check
  const userRes = await query(
    'SELECT id, email FROM users WHERE LOWER(TRIM(email)) = $1',
    [normalizedEmail]
  );

  if (userRes.rows.length === 0) {
    res.status(404).json({
      success: false,
      message: "User doesn't exist in the system.",
    });
    return;
  }

  const user = userRes.rows[0];
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

  // Invalidate any previous unused OTP requests for this user
  await query(
    'UPDATE password_resets SET used = true WHERE user_id = $1 AND used = false',
    [user.id]
  );

  await query(
    `INSERT INTO password_resets (user_id, email, otp_code, otp_expires_at)
     VALUES ($1, $2, $3, $4)`,
    [user.id, normalizedEmail, otp, expiresAt]
  );

  // In development/test mode, expose OTP in header/dev-payload for testing while never logging in production
  const responseData: any = {
    message: 'Password reset OTP has been sent.',
  };

  if (process.env.NODE_ENV !== 'production') {
    responseData.dev_otp = otp;
  }

  AuditService.log({
    actor_user_id: user.id,
    action: 'PASSWORD_RESET_REQUESTED',
    entity_type: 'user',
    entity_id: user.id,
    description: `Password reset OTP requested for: ${normalizedEmail}`,
    metadata: { email: normalizedEmail },
    req,
  });

  res.status(200).json({
    success: true,
    data: responseData,
  });
};

export const verifyOtp = async (req: Request, res: Response): Promise<void> => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    res.status(400).json({
      success: false,
      message: 'Email and OTP code are required',
    });
    return;
  }

  const normalizedEmail = normalizeEmail(email);

  const resetRes = await query(
    `SELECT id, user_id, otp_code, otp_expires_at, otp_verified, attempts
     FROM password_resets
     WHERE LOWER(TRIM(email)) = $1 AND used = false AND otp_verified = false
     ORDER BY created_at DESC
     LIMIT 1`,
    [normalizedEmail]
  );

  if (resetRes.rows.length === 0) {
    res.status(400).json({
      success: false,
      message: 'Invalid or expired OTP',
    });
    return;
  }

  const record = resetRes.rows[0];

  // Check max attempts
  if (record.attempts >= 5) {
    await query('UPDATE password_resets SET used = true WHERE id = $1', [record.id]);
    res.status(400).json({
      success: false,
      message: 'Too many failed attempts. Please request a new OTP.',
    });
    return;
  }

  // Check expiry
  if (new Date() > new Date(record.otp_expires_at)) {
    await query('UPDATE password_resets SET used = true WHERE id = $1', [record.id]);
    res.status(400).json({
      success: false,
      message: 'OTP has expired',
    });
    return;
  }

  // Verify code
  if (record.otp_code !== otp.toString().trim()) {
    await query(
      'UPDATE password_resets SET attempts = attempts + 1 WHERE id = $1',
      [record.id]
    );
    res.status(400).json({
      success: false,
      message: 'Invalid OTP code',
    });
    return;
  }

  // Generate secure reset token
  const resetToken = generateResetToken();
  const tokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await query(
    `UPDATE password_resets
     SET otp_verified = true, reset_token = $1, token_expires_at = $2
     WHERE id = $3`,
    [resetToken, tokenExpiresAt, record.id]
  );

  res.status(200).json({
    success: true,
    data: {
      message: 'OTP verified successfully',
      reset_token: resetToken,
    },
  });
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  const { reset_token, new_password, confirm_new_password } = req.body;

  if (!reset_token) {
    res.status(400).json({
      success: false,
      message: 'Reset token is required',
    });
    return;
  }

  const passwordValidation = validatePasswordPolicy(new_password);
  if (!passwordValidation.valid) {
    res.status(400).json({
      success: false,
      message: passwordValidation.message,
    });
    return;
  }

  if (new_password !== confirm_new_password) {
    res.status(400).json({
      success: false,
      message: 'Passwords do not match',
    });
    return;
  }

  const resetRes = await query(
    `SELECT id, user_id, token_expires_at, used, otp_verified
     FROM password_resets
     WHERE reset_token = $1`,
    [reset_token]
  );

  if (resetRes.rows.length === 0) {
    res.status(400).json({
      success: false,
      message: 'Invalid reset token',
    });
    return;
  }

  const record = resetRes.rows[0];

  if (record.used) {
    res.status(400).json({
      success: false,
      message: 'Reset token has already been used',
    });
    return;
  }

  if (!record.otp_verified) {
    res.status(400).json({
      success: false,
      message: 'OTP verification required before reset',
    });
    return;
  }

  if (new Date() > new Date(record.token_expires_at)) {
    res.status(400).json({
      success: false,
      message: 'Reset token has expired',
    });
    return;
  }

  // Hash new password and update user
  const passwordHash = await hashPassword(new_password);

  await query(
    `UPDATE users
     SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [passwordHash, record.user_id]
  );

  // Invalidate reset token
  await query(
    'UPDATE password_resets SET used = true WHERE id = $1',
    [record.id]
  );

  AuditService.log({
    actor_user_id: record.user_id,
    action: 'PASSWORD_RESET_COMPLETED',
    entity_type: 'user',
    entity_id: record.user_id,
    description: 'Password reset successfully completed',
    metadata: {},
    req,
  });

  res.status(200).json({
    success: true,
    message: 'Password reset successful. You can now login with your new password.',
  });
};
