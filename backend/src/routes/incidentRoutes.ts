import { Router } from 'express';
import {
  createIncident,
  getMyIncidents,
  getNearbyIncidents,
  getIncidentById,
  updateIncident,
  cancelIncident,
} from '../controllers/incidentController';
import {
  verifyIncident,
  getIncidentVerifications,
} from '../controllers/verificationController';
import { authenticateJwt } from '../middleware/authMiddleware';
import { handleUpload } from '../middleware/uploadMiddleware';

const router = Router();

router.post('/', authenticateJwt, handleUpload, createIncident);
router.get('/my', authenticateJwt, getMyIncidents);
router.get('/nearby', authenticateJwt, getNearbyIncidents);
router.get('/:id', authenticateJwt, getIncidentById);
router.patch('/:id', authenticateJwt, updateIncident);
router.patch('/:id/cancel', authenticateJwt, cancelIncident);

// Module 05: Community Verification routes
router.post('/:id/verify', authenticateJwt, verifyIncident);
router.get('/:id/verifications', authenticateJwt, getIncidentVerifications);

export default router;

