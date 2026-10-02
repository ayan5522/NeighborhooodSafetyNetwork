import { Router } from 'express';
import {
  createSOS,
  getMySOS,
  resolveSOS,
} from '../controllers/sosController';
import { authenticateJwt } from '../middleware/authMiddleware';

const router = Router();

router.post('/', authenticateJwt, createSOS);
router.get('/my', authenticateJwt, getMySOS);
router.patch('/:id/resolve', authenticateJwt, resolveSOS);

export default router;
