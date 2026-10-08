import { Router } from 'express';
import {
  updateLocation,
  getCurrentLocation,
  getNearbyUsers,
  getNeighborhood,
} from '../controllers/locationController';
import { authenticateJwt } from '../middleware/authMiddleware';

const router = Router();

router.post('/update', authenticateJwt, updateLocation);
router.post('/', authenticateJwt, updateLocation);
router.get('/current', authenticateJwt, getCurrentLocation);
router.get('/nearby', authenticateJwt, getNearbyUsers);
router.get('/neighborhood', authenticateJwt, getNeighborhood);

export default router;
