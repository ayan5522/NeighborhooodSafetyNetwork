import { Request, Response } from 'express';
import { LocationService } from '../services/locationService';
import { AuditService } from '../services/auditService';

export const updateLocation = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
    return;
  }

  const { latitude, longitude, accuracy } = req.body;

  const validation = LocationService.validateCoordinates(latitude, longitude, accuracy);
  if (!validation.valid) {
    res.status(400).json({
      success: false,
      message: validation.message,
    });
    return;
  }

  try {
    const result = await LocationService.upsertUserLocation(
      req.user.id,
      latitude,
      longitude,
      accuracy ?? null
    );

    AuditService.log({
      actor_user_id: req.user.id,
      action: 'LOCATION_UPDATED',
      entity_type: 'location',
      entity_id: req.user.id,
      description: 'User updated geographical location',
      metadata: { accuracy: accuracy ?? null },
      req,
    });

    res.status(200).json({
      success: true,
      data: {
        updated: true,
        updated_at: result.updated_at,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to update location',
    });
  }
};

export const getCurrentLocation = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
    return;
  }

  try {
    const location = await LocationService.getUserLocation(req.user.id);
    if (!location) {
      res.status(404).json({
        success: false,
        message: 'No location recorded for this user',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        location,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve location',
    });
  }
};

export const getNearbyUsers = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
    return;
  }

  const radiusValidation = LocationService.validateRadius(req.query.radius);
  if (!radiusValidation.valid) {
    res.status(400).json({
      success: false,
      message: radiusValidation.message,
    });
    return;
  }

  try {
    const nearby = await LocationService.findNearbyUsers(
      req.user.id,
      radiusValidation.radius
    );

    res.status(200).json({
      success: true,
      data: nearby,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to query nearby users',
    });
  }
};

export const getNeighborhood = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
    return;
  }

  try {
    const result = await LocationService.getNeighborhood(req.user.id);
    if (!result) {
      res.status(404).json({
        success: false,
        message: 'No location recorded to determine neighborhood',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to determine neighborhood',
    });
  }
};
