import { Router } from 'express';
import {
  register,
  verifyEmailOtp,
  resendVerificationOtp,
  login,
  logout,
  forgotPassword,
  verifyOtp,
  resetPassword,
} from '../controllers/authController';

const router = Router();

// Registration and Email Verification Flow
router.post('/register', register);
router.post('/verify-email-otp', verifyEmailOtp);
router.post('/resend-verification-otp', resendVerificationOtp);

// Standard Login & Logout
router.post('/login', login);
router.post('/logout', logout);

// Forgot Password & Reset Flow
router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOtp);
router.post('/reset-password', resetPassword);

export default router;
