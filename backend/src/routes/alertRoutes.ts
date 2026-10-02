import { Router } from 'express';
import {
  getAlerts,
  getUnreadAlertCount,
  getAlertById,
  markAlertRead,
} from '../controllers/alertController';
import { authenticateJwt } from '../middleware/authMiddleware';

const router = Router();

router.get('/', authenticateJwt, getAlerts);
router.get('/unread-count', authenticateJwt, getUnreadAlertCount);
router.get('/:id', authenticateJwt, getAlertById);
router.patch('/:id/read', authenticateJwt, markAlertRead);

export default router;
