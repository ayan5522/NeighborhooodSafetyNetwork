import { Request, Response } from 'express';
import { AITrustService } from '../services/aiTrustService';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getIncidentTrustScore = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  const { id } = req.params;
  if (!UUID_REGEX.test(id)) {
    res.status(400).json({ success: false, message: 'Invalid incident ID format' });
    return;
  }

  const forceRefresh = req.query.refresh === 'true';

  try {
    const assessment = await AITrustService.evaluateIncident(id, forceRefresh);
    res.status(200).json({
      success: true,
      data: {
        assessment,
      },
    });
  } catch (error: any) {
    if (error.message?.includes('Incident not found')) {
      res.status(404).json({ success: false, message: 'Incident not found' });
      return;
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to evaluate incident trust score',
    });
  }
};
