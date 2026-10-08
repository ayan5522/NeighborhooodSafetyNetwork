import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const FORBIDDEN_IDENTITIES = ['rosp_db', 'rosp_user', 'rosp_postgres'];

const dbName = process.env.DB_NAME || 'neighborhood_safety_db';
const dbUser = process.env.DB_USER || 'nsn_app_user';

// Enforce project identity boundaries: Old ROSP identities are strictly forbidden
if (
  FORBIDDEN_IDENTITIES.includes(dbName.toLowerCase()) ||
  FORBIDDEN_IDENTITIES.includes(dbUser.toLowerCase())
) {
  throw new Error(
    `Security Violation: Connection to deprecated or forbidden database/user '${dbName}/${dbUser}' is rejected. Must use neighborhood_safety_db / nsn_app_user.`
  );
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: dbName,
    user: dbUser,
    password: process.env.DB_PASSWORD || 'nsn_password_2026',
    max: parseInt(process.env.DB_POOL_MAX || '20', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'nsn_super_secret_jwt_key_2026_change_in_production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
  location: {
    maxAgeMinutes: parseInt(process.env.LOCATION_MAX_AGE_MINUTES || '60', 10),
    minRadiusMeters: 100,
    maxRadiusMeters: 10000,
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || 'Neighborhood Safety Network <noreply@neighborhoodsafety.org>',
  },
  otp: {
    expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES || '5', 10),
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10),
    resendCooldownSeconds: parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || '60', 10),
    resetTokenExpiryMinutes: parseInt(process.env.RESET_TOKEN_EXPIRY_MINUTES || '15', 10),
  },
};
