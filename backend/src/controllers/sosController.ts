import { Request, Response } from 'express';
import { SOSService } from '../services/sosService';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const createSOS = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
    return;
  }

  const { latitude, longitude } = req.body;
  const lat = typeof latitude === 'number' ? latitude : parseFloat(latitude);
  const lng = typeof longitude === 'number' ? longitude : parseFloat(longitude);

  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({
      success: false,
      message: 'Valid latitude and longitude are required to trigger SOS',
    });
    return;
  }

  try {
    const result = await SOSService.createSOS(req.user.id, lat, lng);
    res.status(201).json({
      success: true,
      data: {
        sos: result.sos,
        is_existing: result.isExisting,
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to trigger SOS',
    });
  }
};

export const getMySOS = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
    return;
  }

  try {
    const sosEvents = await SOSService.getMySOS(req.user.id);
    res.status(200).json({
      success: true,
      data: {
        sos_events: sosEvents,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve SOS events',
    });
  }
};

export const resolveSOS = async (req: Request, res: Response): Promise<void> => {
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
      message: 'Invalid SOS ID format',
    });
    return;
  }

  try {
    const result = await SOSService.resolveSOS(id, req.user.id);
    if (result === 'NOT_FOUND') {
      res.status(404).json({
        success: false,
        message: 'SOS event not found',
      });
      return;
    }

    if (result === 'FORBIDDEN') {
      res.status(403).json({
        success: false,
        message: 'You are not authorized to resolve this SOS event',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        sos: result,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to resolve SOS event',
    });
  }
};
