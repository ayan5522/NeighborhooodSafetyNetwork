import { Request, Response } from 'express';
import { VerificationService } from '../services/verificationService';
import { IncidentService } from '../services/incidentService';
import { AuditService } from '../services/auditService';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const verifyIncident = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
    return;
  }

  const { id } = req.params;
  if (!UUID_REGEX.test(id)) {
    res.status(400).json({
      success: false,
      message: 'Invalid incident ID format',
    });
    return;
  }

  const { verification_type } = req.body;
  if (!verification_type) {
    res.status(400).json({
      success: false,
      message: 'verification_type is required (CONFIRM or DISPUTE)',
    });
    return;
  }

  try {
    const result = await VerificationService.submitVerification(
      id,
      req.user.id,
      verification_type
    );

    if (!result.success) {
      if (result.code === 'NOT_FOUND') {
        res.status(404).json({
          success: false,
          message: result.message,
        });
        return;
      }
      if (result.code === 'FORBIDDEN_SELF_VERIFY') {
        res.status(403).json({
          success: false,
          message: result.message,
        });
        return;
      }
      if (result.code === 'INCIDENT_CLOSED' || result.code === 'INVALID_TYPE') {
        res.status(400).json({
          success: false,
          message: result.message,
        });
        return;
      }
      res.status(400).json({
        success: false,
        message: result.message,
      });
      return;
    }

    AuditService.log({
      actor_user_id: req.user.id,
      action: 'INCIDENT_VERIFICATION_CREATED',
      entity_type: 'incident',
      entity_id: id,
      description: `User verified incident (${verification_type})`,
      metadata: { incident_id: id, verification_type },
      req,
    });

    res.status(200).json({
      success: true,
      data: result.summary,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to submit verification',
    });
  }
};

export const getIncidentVerifications = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
    return;
  }

  const { id } = req.params;
  if (!UUID_REGEX.test(id)) {
    res.status(400).json({
      success: false,
      message: 'Invalid incident ID format',
    });
    return;
  }

  try {
    const incident = await IncidentService.getIncidentById(id);
    if (!incident) {
      res.status(404).json({
        success: false,
        message: 'Incident not found',
      });
      return;
    }

    const summary = await VerificationService.getVerificationSummary(id, req.user.id);
    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve verification summary',
    });
  }
};
