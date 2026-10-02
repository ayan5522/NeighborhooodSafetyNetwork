import { Router } from 'express';
import {
  getNotifications,
  getUnreadCount,
  getNotificationById,
  markAsRead,
  markAllAsRead,
} from '../controllers/notificationController';
import { authenticateJwt } from '../middleware/authMiddleware';

const router = Router();

// Module 06: Real-time Communication & Notifications Routes
router.get('/', authenticateJwt, getNotifications);
router.get('/unread-count', authenticateJwt, getUnreadCount);
router.patch('/read-all', authenticateJwt, markAllAsRead);
router.get('/:id', authenticateJwt, getNotificationById);
router.patch('/:id/read', authenticateJwt, markAsRead);

export default router;
