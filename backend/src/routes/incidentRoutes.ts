import { Router } from 'express';
import {
  createIncident,
  getMyIncidents,
  getNearbyIncidents,
  getIncidentById,
  updateIncident,
  cancelIncident,
} from '../controllers/incidentController';
import { authenticateJwt } from '../middleware/authMiddleware';
import { handleUpload } from '../middleware/uploadMiddleware';

const router = Router();

router.post('/', authenticateJwt, handleUpload, createIncident);
router.get('/my', authenticateJwt, getMyIncidents);
router.get('/nearby', authenticateJwt, getNearbyIncidents);
router.get('/:id', authenticateJwt, getIncidentById);
router.patch('/:id', authenticateJwt, updateIncident);
router.patch('/:id/cancel', authenticateJwt, cancelIncident);

export default router;
