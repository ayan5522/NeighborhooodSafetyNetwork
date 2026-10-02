import { Router } from 'express';
import {
  getEmergencyContacts,
  createEmergencyContact,
  deleteEmergencyContact,
} from '../controllers/emergencyContactController';
import { authenticateJwt } from '../middleware/authMiddleware';

const router = Router();

router.get('/', authenticateJwt, getEmergencyContacts);
router.post('/', authenticateJwt, createEmergencyContact);
router.delete('/:id', authenticateJwt, deleteEmergencyContact);

export default router;
