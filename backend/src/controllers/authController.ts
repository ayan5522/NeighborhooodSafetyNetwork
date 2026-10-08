import { Request, Response } from 'express';
import { query } from '../db';
import { AuditService } from '../services/auditService';
import { emailService } from '../services/emailService';
import { config } from '../config';
import {
  hashPassword,
  comparePassword,
  generateJwt,
  normalizeEmail,
  validateEmail,
  validatePasswordPolicy,
  generateOtp,
  hashOtp,
  verifyOtpHash,
  generateResetToken,
  hashResetToken,
} from '../utils/crypto';

/**
 * FLOW A: Register new user
 * Sets account_status = 'PENDING', email_verified = false
 * Generates secure 6-digit OTP and sends to real email
 */
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
      message: 'Email is already registered.',
    });
    return;
  }

  const passwordHash = await hashPassword(password);

  // Security Rule: Public registration always creates RESIDENT
  // Account starts as PENDING with email_verified = false until OTP is verified
  const userRole = 'RESIDENT';
  const accountStatus = 'PENDING';

  const insertRes = await query(
    `INSERT INTO users (full_name, email, password_hash, role, account_status, email_verified)
     VALUES ($1, $2, $3, $4, $5, false)
     RETURNING id, full_name, email, role, account_status, email_verified, created_at, updated_at`,
    [full_name.trim(), normalizedEmail, passwordHash, userRole, accountStatus]
  );

  const newUser = insertRes.rows[0];

  // Generate secure 6-digit OTP
  const rawOtp = generateOtp();
  const hashedOtp = hashOtp(rawOtp);
  const expiryMinutes = config.otp.expiryMinutes || 5;
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  // Store hashed OTP
  await query(
    `INSERT INTO email_verification_otps (user_id, email, otp_hash, purpose, expires_at, attempt_count, max_attempts, last_sent_at)
     VALUES ($1, $2, $3, 'REGISTRATION_VERIFICATION', $4, 0, $5, CURRENT_TIMESTAMP)`,
    [newUser.id, normalizedEmail, hashedOtp, expiresAt, config.otp.maxAttempts || 5]
  );

  // Send real email delivery via SMTP
  const emailSent = await emailService.sendRegistrationOtp(
    normalizedEmail,
    newUser.full_name,
    rawOtp
  );

  if (!emailSent) {
    // If email could not be sent, rollback registration to maintain clean state
    await query('DELETE FROM users WHERE id = $1', [newUser.id]);
    res.status(500).json({
      success: false,
      message: 'Unable to send verification email. Please try again.',
    });
    return;
  }

  AuditService.log({
    actor_user_id: newUser.id,
    action: 'USER_REGISTERED',
    entity_type: 'user',
    entity_id: newUser.id,
    description: `User registered pending verification: ${newUser.email}`,
    metadata: { full_name: newUser.full_name, email: newUser.email, role: newUser.role },
    req,
  });

  AuditService.log({
    actor_user_id: newUser.id,
    action: 'EMAIL_VERIFICATION_REQUESTED',
    entity_type: 'user',
    entity_id: newUser.id,
    description: `Verification OTP sent to: ${newUser.email}`,
    metadata: { email: newUser.email },
    req,
  });

  res.status(201).json({
    success: true,
    message: 'Registration successful. Please verify your email with the OTP sent.',
    data: {
      message: 'Verification code sent to your registered email.',
      email: normalizedEmail,
      user: {
        id: newUser.id,
        full_name: newUser.full_name,
        email: newUser.email,
        role: newUser.role,
        account_status: newUser.account_status,
        email_verified: newUser.email_verified,
        created_at: newUser.created_at,
        updated_at: newUser.updated_at,
      },
    },
  });
};

/**
 * FLOW A: Verify registration OTP and automatically log in
 * Sets email_verified = true, account_status = 'ACTIVE'
 * Generates and returns JWT token for immediate auto-login
 */
export const verifyEmailOtp = async (req: Request, res: Response): Promise<void> => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    res.status(400).json({
      success: false,
      message: 'Email and verification code are required',
    });
    return;
  }

  const normalizedEmail = normalizeEmail(email);

  const userRes = await query(
    'SELECT id, full_name, email, role, account_status, email_verified, created_at, updated_at FROM users WHERE LOWER(TRIM(email)) = $1',
    [normalizedEmail]
  );

  if (userRes.rows.length === 0) {
    res.status(404).json({
      success: false,
      message: 'User not found',
    });
    return;
  }

  const user = userRes.rows[0];

  if (user.email_verified) {
    res.status(400).json({
      success: false,
      message: 'Email is already verified',
    });
    return;
  }

  if (user.account_status === 'SUSPENDED') {
    res.status(403).json({
      success: false,
      message: 'Account is suspended. Please contact support.',
    });
    return;
  }

  // Find latest active registration OTP
  const otpRes = await query(
    `SELECT id, otp_hash, expires_at, attempt_count, max_attempts
     FROM email_verification_otps
     WHERE user_id = $1 AND purpose = 'REGISTRATION_VERIFICATION' AND used_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [user.id]
  );

  if (otpRes.rows.length === 0) {
    res.status(400).json({
      success: false,
      message: 'Invalid or expired verification code.',
    });
    return;
  }

  const otpRecord = otpRes.rows[0];

  // Check attempt limit
  if (otpRecord.attempt_count >= otpRecord.max_attempts) {
    await query(
      'UPDATE email_verification_otps SET used_at = CURRENT_TIMESTAMP WHERE id = $1',
      [otpRecord.id]
    );
    res.status(400).json({
      success: false,
      message: 'Too many incorrect attempts. Please request a new code.',
    });
    return;
  }

  // Check expiry
  if (new Date() > new Date(otpRecord.expires_at)) {
    await query(
      'UPDATE email_verification_otps SET used_at = CURRENT_TIMESTAMP WHERE id = $1',
      [otpRecord.id]
    );
    res.status(400).json({
      success: false,
      message: 'Verification code has expired. Please request a new code.',
    });
    return;
  }

  // Verify OTP hash
  const isValid = verifyOtpHash(otp.toString().trim(), otpRecord.otp_hash);

  if (!isValid) {
    const updatedAttempts = otpRecord.attempt_count + 1;
    await query(
      'UPDATE email_verification_otps SET attempt_count = $1 WHERE id = $2',
      [updatedAttempts, otpRecord.id]
    );

    AuditService.log({
      actor_user_id: user.id,
      action: 'EMAIL_VERIFICATION_FAILED',
      entity_type: 'user',
      entity_id: user.id,
      description: `Failed email verification attempt for: ${user.email}`,
      metadata: { email: user.email, attempt: updatedAttempts },
      req,
    });

    if (updatedAttempts >= otpRecord.max_attempts) {
      await query(
        'UPDATE email_verification_otps SET used_at = CURRENT_TIMESTAMP WHERE id = $1',
        [otpRecord.id]
      );
      res.status(400).json({
        success: false,
        message: 'Too many incorrect attempts. Please request a new code.',
      });
      return;
    }

    res.status(400).json({
      success: false,
      message: 'Invalid or incorrect verification code.',
    });
    return;
  }

  // OTP verified: mark used and activate user account
  await query(
    'UPDATE email_verification_otps SET used_at = CURRENT_TIMESTAMP WHERE id = $1',
    [otpRecord.id]
  );

  const updatedUserRes = await query(
    `UPDATE users
     SET email_verified = true, account_status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING id, full_name, email, role, account_status, email_verified, created_at, updated_at`,
    [user.id]
  );

  const activeUser = updatedUserRes.rows[0];

  // Automatic Login: Generate JWT for immediate app access
  const token = generateJwt({
    user_id: activeUser.id,
    role: activeUser.role,
  });

  AuditService.log({
    actor_user_id: activeUser.id,
    action: 'EMAIL_VERIFICATION_SUCCESS',
    entity_type: 'user',
    entity_id: activeUser.id,
    description: `Email successfully verified for: ${activeUser.email}`,
    metadata: { email: activeUser.email },
    req,
  });

  res.status(200).json({
    success: true,
    data: {
      message: 'Email verified successfully.',
      user: {
        id: activeUser.id,
        full_name: activeUser.full_name,
        email: activeUser.email,
        role: activeUser.role,
        account_status: activeUser.account_status,
        email_verified: activeUser.email_verified,
        created_at: activeUser.created_at,
        updated_at: activeUser.updated_at,
      },
      token,
    },
  });
};

/**
 * FLOW A: Resend registration OTP
 * Enforces 60-second cooldown rate limit and invalidates previous OTP
 */
export const resendVerificationOtp = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;

  if (!email) {
    res.status(400).json({
      success: false,
      message: 'Email is required',
    });
    return;
  }

  const normalizedEmail = normalizeEmail(email);

  const userRes = await query(
    'SELECT id, full_name, email, email_verified, account_status FROM users WHERE LOWER(TRIM(email)) = $1',
    [normalizedEmail]
  );

  if (userRes.rows.length === 0) {
    res.status(404).json({
      success: false,
      message: 'User not found',
    });
    return;
  }

  const user = userRes.rows[0];

  if (user.email_verified) {
    res.status(400).json({
      success: false,
      message: 'Email is already verified',
    });
    return;
  }

  if (user.account_status === 'SUSPENDED') {
    res.status(403).json({
      success: false,
      message: 'Account is suspended.',
    });
    return;
  }

  // Check resend cooldown
  const latestOtpRes = await query(
    `SELECT last_sent_at
     FROM email_verification_otps
     WHERE user_id = $1 AND purpose = 'REGISTRATION_VERIFICATION'
     ORDER BY created_at DESC
     LIMIT 1`,
    [user.id]
  );

  const cooldownSeconds = config.otp.resendCooldownSeconds || 60;
  if (latestOtpRes.rows.length > 0) {
    const lastSent = new Date(latestOtpRes.rows[0].last_sent_at).getTime();
    const elapsedSeconds = Math.floor((Date.now() - lastSent) / 1000);
    if (elapsedSeconds < cooldownSeconds) {
      const remainingSeconds = cooldownSeconds - elapsedSeconds;
      res.status(429).json({
        success: false,
        message: `Please wait ${remainingSeconds} seconds before requesting a new code.`,
        data: { cooldown_seconds: remainingSeconds },
      });
      return;
    }
  }

  // Invalidate any previous unused registration OTPs
  await query(
    `UPDATE email_verification_otps
     SET used_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND purpose = 'REGISTRATION_VERIFICATION' AND used_at IS NULL`,
    [user.id]
  );

  // Generate new secure 6-digit OTP
  const rawOtp = generateOtp();
  const hashedOtp = hashOtp(rawOtp);
  const expiryMinutes = config.otp.expiryMinutes || 5;
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  await query(
    `INSERT INTO email_verification_otps (user_id, email, otp_hash, purpose, expires_at, attempt_count, max_attempts, last_sent_at)
     VALUES ($1, $2, $3, 'REGISTRATION_VERIFICATION', $4, 0, $5, CURRENT_TIMESTAMP)`,
    [user.id, normalizedEmail, hashedOtp, expiresAt, config.otp.maxAttempts || 5]
  );

  const emailSent = await emailService.sendRegistrationOtp(
    normalizedEmail,
    user.full_name,
    rawOtp
  );

  if (!emailSent) {
    res.status(500).json({
      success: false,
      message: 'Unable to send verification email. Please try again.',
    });
    return;
  }

  AuditService.log({
    actor_user_id: user.id,
    action: 'EMAIL_VERIFICATION_REQUESTED',
    entity_type: 'user',
    entity_id: user.id,
    description: `Registration OTP resent to: ${user.email}`,
    metadata: { email: user.email },
    req,
  });

  res.status(200).json({
    success: true,
    data: {
      message: 'A new verification code has been sent to your registered email.',
    },
  });
};

/**
 * Standard Login
 * Enforces email verification and suspension checks
 */
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
    'SELECT id, full_name, email, password_hash, role, account_status, email_verified, created_at, updated_at FROM users WHERE LOWER(TRIM(email)) = $1',
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

  // Enforce email verification check
  if (!user.email_verified || user.account_status === 'PENDING') {
    AuditService.log({
      actor_user_id: user.id,
      action: 'USER_LOGIN_FAILED',
      entity_type: 'auth',
      entity_id: user.id,
      description: `Login attempted on unverified account: ${user.email}`,
      metadata: { email: user.email, reason: 'Email not verified' },
      req,
    });
    res.status(403).json({
      success: false,
      message: 'Please verify your email before logging in.',
      data: {
        email_verified: false,
        email: user.email,
      },
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
        email_verified: user.email_verified,
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

/**
 * FLOW B: Forgot Password
 * If user does not exist: EXACT message "User doesn't exist in the system." (no OTP, no reset token)
 * If user exists: generates and emails password-reset OTP
 */
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;

  if (!email || typeof email !== 'string' || !email.includes('@') || !email.includes('.')) {
    res.status(400).json({
      success: false,
      message: 'A valid email address is required',
    });
    return;
  }

  const normalizedEmail = normalizeEmail(email);

  // Check account existence - mandatory strict behavior
  const userRes = await query(
    'SELECT id, full_name, email FROM users WHERE LOWER(TRIM(email)) = $1',
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

  // Check resend cooldown
  const latestOtpRes = await query(
    `SELECT last_sent_at
     FROM email_verification_otps
     WHERE user_id = $1 AND purpose = 'PASSWORD_RESET'
     ORDER BY created_at DESC
     LIMIT 1`,
    [user.id]
  );

  const cooldownSeconds = config.otp.resendCooldownSeconds || 60;
  if (latestOtpRes.rows.length > 0 && latestOtpRes.rows[0].last_sent_at) {
    const lastSent = new Date(latestOtpRes.rows[0].last_sent_at).getTime();
    const elapsedSeconds = Math.floor((Date.now() - lastSent) / 1000);
    if (elapsedSeconds < cooldownSeconds) {
      const remainingSeconds = cooldownSeconds - elapsedSeconds;
      res.status(429).json({
        success: false,
        message: `Please wait ${remainingSeconds} seconds before requesting a new code.`,
        data: { cooldown_seconds: remainingSeconds },
      });
      return;
    }
  }

  // Invalidate any previous unused password reset OTPs
  await query(
    `UPDATE email_verification_otps
     SET used_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND purpose = 'PASSWORD_RESET' AND used_at IS NULL`,
    [user.id]
  );

  // Invalidate any previous password_resets rows
  await query(
    'UPDATE password_resets SET used = true WHERE user_id = $1 AND used = false',
    [user.id]
  );

  const rawOtp = generateOtp();
  const hashedOtp = hashOtp(rawOtp);
  const expiryMinutes = config.otp.expiryMinutes || 5;
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  await query(
    `INSERT INTO email_verification_otps (user_id, email, otp_hash, purpose, expires_at, attempt_count, max_attempts, last_sent_at)
     VALUES ($1, $2, $3, 'PASSWORD_RESET', $4, 0, $5, CURRENT_TIMESTAMP)`,
    [user.id, normalizedEmail, hashedOtp, expiresAt, config.otp.maxAttempts || 5]
  );

  const emailSent = await emailService.sendPasswordResetOtp(
    normalizedEmail,
    user.full_name,
    rawOtp
  );

  if (!emailSent) {
    res.status(500).json({
      success: false,
      message: 'Unable to send password reset email. Please try again.',
    });
    return;
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
    data: {
      message: 'Password reset code sent to your registered email.',
    },
  });
};

/**
 * FLOW B: Verify Password Reset OTP
 * Only after correct OTP verification, generates and returns secure reset token
 */
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

  const userRes = await query(
    'SELECT id, email FROM users WHERE LOWER(TRIM(email)) = $1',
    [normalizedEmail]
  );

  if (userRes.rows.length === 0) {
    res.status(400).json({
      success: false,
      message: 'Invalid or expired OTP',
    });
    return;
  }

  const user = userRes.rows[0];

  // Query latest active PASSWORD_RESET OTP
  const otpRes = await query(
    `SELECT id, otp_hash, expires_at, attempt_count, max_attempts
     FROM email_verification_otps
     WHERE user_id = $1 AND purpose = 'PASSWORD_RESET' AND used_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [user.id]
  );

  if (otpRes.rows.length === 0) {
    res.status(400).json({
      success: false,
      message: 'Invalid or expired OTP',
    });
    return;
  }

  const otpRecord = otpRes.rows[0];

  // Check attempt limit
  if (otpRecord.attempt_count >= otpRecord.max_attempts) {
    await query(
      'UPDATE email_verification_otps SET used_at = CURRENT_TIMESTAMP WHERE id = $1',
      [otpRecord.id]
    );
    res.status(400).json({
      success: false,
      message: 'Too many failed attempts. Please request a new OTP.',
    });
    return;
  }

  // Check expiry
  if (new Date() > new Date(otpRecord.expires_at)) {
    await query(
      'UPDATE email_verification_otps SET used_at = CURRENT_TIMESTAMP WHERE id = $1',
      [otpRecord.id]
    );
    res.status(400).json({
      success: false,
      message: 'OTP has expired',
    });
    return;
  }

  // Verify OTP hash
  const isValid = verifyOtpHash(otp.toString().trim(), otpRecord.otp_hash);

  if (!isValid) {
    const updatedAttempts = otpRecord.attempt_count + 1;
    await query(
      'UPDATE email_verification_otps SET attempt_count = $1 WHERE id = $2',
      [updatedAttempts, otpRecord.id]
    );

    if (updatedAttempts >= otpRecord.max_attempts) {
      await query(
        'UPDATE email_verification_otps SET used_at = CURRENT_TIMESTAMP WHERE id = $1',
        [otpRecord.id]
      );
      res.status(400).json({
        success: false,
        message: 'Too many failed attempts. Please request a new OTP.',
      });
      return;
    }

    res.status(400).json({
      success: false,
      message: 'Invalid OTP code',
    });
    return;
  }

  // OTP verified: mark used
  await query(
    'UPDATE email_verification_otps SET used_at = CURRENT_TIMESTAMP WHERE id = $1',
    [otpRecord.id]
  );

  // Invalidate any other active reset tokens for this user
  await query(
    'UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND used_at IS NULL',
    [user.id]
  );

  // Generate cryptographic single-use reset token
  const rawResetToken = generateResetToken();
  const tokenHash = hashResetToken(rawResetToken);
  const tokenExpiresAt = new Date(Date.now() + (config.otp.resetTokenExpiryMinutes || 15) * 60 * 1000);

  await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, tokenHash, tokenExpiresAt]
  );

  // Backward compatibility row in password_resets
  await query(
    `INSERT INTO password_resets (user_id, email, otp_code, otp_expires_at, otp_verified, reset_token, token_expires_at)
     VALUES ($1, $2, 'VERIFIED', CURRENT_TIMESTAMP, true, $3, $4)`,
    [user.id, normalizedEmail, rawResetToken, tokenExpiresAt]
  );

  AuditService.log({
    actor_user_id: user.id,
    action: 'PASSWORD_RESET_OTP_VERIFIED',
    entity_type: 'user',
    entity_id: user.id,
    description: `Password reset OTP successfully verified for: ${user.email}`,
    metadata: { email: user.email },
    req,
  });

  res.status(200).json({
    success: true,
    data: {
      message: 'OTP verified successfully',
      reset_token: rawResetToken,
    },
  });
};

/**
 * FLOW B: Reset Password with verified reset token
 * Updates user password in PostgreSQL and invalidates reset token
 */
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  const { reset_token, new_password, confirm_password, confirm_new_password } = req.body;
  const effectiveConfirmPassword = confirm_password || confirm_new_password;

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

  if (new_password !== effectiveConfirmPassword) {
    res.status(400).json({
      success: false,
      message: 'Passwords do not match',
    });
    return;
  }

  // Lookup reset token by hash
  const tokenHash = hashResetToken(reset_token);
  const tokenRes = await query(
    `SELECT id, user_id, expires_at, used_at
     FROM password_reset_tokens
     WHERE token_hash = $1`,
    [tokenHash]
  );

  let userId: string;
  let tokenId: string;

  if (tokenRes.rows.length > 0) {
    const record = tokenRes.rows[0];
    if (record.used_at !== null) {
      res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token',
      });
      return;
    }
    if (new Date() > new Date(record.expires_at)) {
      res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token',
      });
      return;
    }
    userId = record.user_id;
    tokenId = record.id;
  } else {
    // Fallback check on legacy password_resets table
    const legacyRes = await query(
      `SELECT id, user_id, token_expires_at, used, otp_verified
       FROM password_resets
       WHERE reset_token = $1`,
      [reset_token]
    );

    if (legacyRes.rows.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token',
      });
      return;
    }

    const legacyRecord = legacyRes.rows[0];
    if (legacyRecord.used) {
      res.status(400).json({
        success: false,
        message: 'Reset token has already been used',
      });
      return;
    }
    if (!legacyRecord.otp_verified) {
      res.status(400).json({
        success: false,
        message: 'OTP verification required before reset',
      });
      return;
    }
    if (new Date() > new Date(legacyRecord.token_expires_at)) {
      res.status(400).json({
        success: false,
        message: 'Reset token has expired',
      });
      return;
    }

    userId = legacyRecord.user_id;
    tokenId = legacyRecord.id;
  }

  // Hash new password using bcrypt
  const passwordHash = await hashPassword(new_password);

  // Update password in users table
  await query(
    `UPDATE users
     SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [passwordHash, userId]
  );

  // Invalidate reset token
  await query(
    'UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE token_hash = $1',
    [tokenHash]
  );
  await query(
    'UPDATE password_resets SET used = true WHERE reset_token = $1',
    [reset_token]
  );

  // Invalidate any other active reset tokens or reset OTPs for this user
  await query(
    `UPDATE email_verification_otps
     SET used_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND purpose = 'PASSWORD_RESET' AND used_at IS NULL`,
    [userId]
  );

  AuditService.log({
    actor_user_id: userId,
    action: 'PASSWORD_RESET_COMPLETED',
    entity_type: 'user',
    entity_id: userId,
    description: 'Password reset successfully completed',
    metadata: {},
    req,
  });

  res.status(200).json({
    success: true,
    message: 'Password reset successful. You can now login with your new password.',
  });
};
