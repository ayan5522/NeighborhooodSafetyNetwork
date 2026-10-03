import { Router } from 'express';
import {
  getDashboard,
  getUsers,
  suspendUser,
  restoreUser,
  changeUserRole,
} from '../controllers/adminController';
import { authenticateJwt, requireRole } from '../middleware/authMiddleware';

const router = Router();

// Dashboard accessible to both MODERATOR and ADMIN
router.get('/dashboard', authenticateJwt, requireRole('MODERATOR', 'ADMIN'), getDashboard);

// User management endpoints strictly restricted to ADMIN
router.get('/users', authenticateJwt, requireRole('ADMIN'), getUsers);
router.patch('/users/:id/suspend', authenticateJwt, requireRole('ADMIN'), suspendUser);
router.patch('/users/:id/restore', authenticateJwt, requireRole('ADMIN'), restoreUser);
router.patch('/users/:id/role', authenticateJwt, requireRole('ADMIN'), changeUserRole);

export default router;
