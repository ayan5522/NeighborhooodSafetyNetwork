import { Router } from 'express';
import { getCurrentUser, updateProfile } from '../controllers/userController';
import { authenticateJwt } from '../middleware/authMiddleware';

const router = Router();

router.get('/me', authenticateJwt, getCurrentUser);
router.patch('/me', authenticateJwt, updateProfile);

export default router;
