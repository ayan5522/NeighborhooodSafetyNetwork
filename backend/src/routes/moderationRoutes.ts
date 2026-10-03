import { Router } from 'express';
import {
  getReports,
  getReportById,
  reviewReport,
  dismissReport,
  takeAction,
} from '../controllers/moderationController';
import { authenticateJwt, requireRole } from '../middleware/authMiddleware';

const router = Router();

// All moderation queue routes restricted to MODERATOR and ADMIN
router.use(authenticateJwt);
router.use(requireRole('MODERATOR', 'ADMIN'));

router.get('/reports', getReports);
router.get('/reports/:id', getReportById);
router.patch('/reports/:id/review', reviewReport);
router.patch('/reports/:id/dismiss', dismissReport);
router.patch('/reports/:id/action', takeAction);

export default router;
