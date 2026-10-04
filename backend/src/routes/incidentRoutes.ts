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
import { reportIncident } from '../controllers/moderationController';
import { getIncidentTrustScore } from '../controllers/aiTrustController';
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

// Module 07: Community Incident Report / Moderation Flag route
router.post('/:id/report', authenticateJwt, reportIncident);

// Module 09: AI Trust & Reliability Assessment route
router.get('/:id/trust-score', authenticateJwt, getIncidentTrustScore);
router.get('/:id/reliability', authenticateJwt, getIncidentTrustScore);

export default router;

