import rateLimit from 'express-rate-limit';

/**
 * General rate limiter for standard API routes.
 * 1000 requests per 15-minute window per IP.
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes.',
  },
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Strict rate limiter for authentication / sensitive routes.
 * (login, registration, password reset, OTP verification)
 * 30 requests per 15-minute window per IP.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again after 15 minutes.',
  },
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Rate limiter for incident creation and emergency SOS requests to prevent spam / DoS.
 * 30 submissions per 5-minute window per IP.
 */
export const reportLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many submissions created. Please wait a few minutes before trying again.',
  },
  skip: () => process.env.NODE_ENV === 'test',
});
