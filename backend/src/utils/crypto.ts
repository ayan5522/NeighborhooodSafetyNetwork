import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';

const SALT_ROUNDS = 10;

export const normalizeEmail = (email: string): string => {
  return (email || '').trim().toLowerCase();
};

export const validateEmail = (email: string): boolean => {
  const normalized = normalizeEmail(email);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(normalized);
};

export const validatePasswordPolicy = (password: string): { valid: boolean; message?: string } => {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Password is required' };
  }
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }
  return { valid: true };
};

export const hashPassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password, SALT_ROUNDS);
};

export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return await bcrypt.compare(password, hash);
};

export interface TokenPayload {
  user_id: string;
  role: string;
}

export const generateJwt = (payload: TokenPayload): string => {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as any,
  });
};

export const verifyJwt = (token: string): TokenPayload => {
  return jwt.verify(token, config.jwt.secret) as TokenPayload;
};

export const generateOtp = (): string => {
  // Cryptographically secure 6-digit random number
  const num = crypto.randomInt(100000, 999999);
  return num.toString();
};

export const generateResetToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};
