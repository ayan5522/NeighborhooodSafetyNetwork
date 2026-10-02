import { Request, Response } from 'express';
import fs from 'fs';
import { IncidentService, IncidentCategory, IncidentSeverity } from '../services/incidentService';
import { LocationService } from '../services/locationService';
import { AlertService } from '../services/alertService';
import { VerificationService } from '../services/verificationService';

export const createIncident = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
    return;
  }

  const { category, title, description, severity, latitude, longitude } = req.body;

  // Validate fields before proceeding
  const lat = typeof latitude === 'number' ? latitude : parseFloat(latitude);
  const lng = typeof longitude === 'number' ? longitude : parseFloat(longitude);

  const validation = IncidentService.validateIncidentData({
    category,
    title,
    description,
    severity,
    latitude: lat,
    longitude: lng,
  });

  if (!validation.valid) {
    // If file was uploaded but validation failed, clean up local file
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
    }
    res.status(400).json({
      success: false,
      message: validation.message,
    });
    return;
  }

  // Construct image URL if file was uploaded
  const imageUrl = req.file ? `/uploads/incidents/${req.file.filename}` : req.body.image_url || null;

  try {
    const incident = await IncidentService.createIncident({
      reporter_id: req.user.id,
      category: category as IncidentCategory,
      title,
      description,
      severity: severity as IncidentSeverity,
      latitude: lat,
      longitude: lng,
      image_url: imageUrl,
    });

    // Requirement 10 & 48: Generate targeted alerts in post-creation step.
    // Core incident remains committed even if alert generation encounters a non-fatal issue.
    try {
      await AlertService.generateAlertsForIncident(incident);
    } catch (alertError) {
      console.error('Non-blocking alert generation warning:', alertError);
    }

    res.status(201).json({
      success: true,
      data: {
        incident,
      },
    });
  } catch (error: any) {
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
    }
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create incident',
    });
  }
};

export const getMyIncidents = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
    return;
  }

  try {
    const incidents = await IncidentService.getMyIncidents(req.user.id);
    res.status(200).json({
      success: true,
      data: {
        incidents,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve incidents',
    });
  }
};

export const getNearbyIncidents = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
    return;
  }

  let lat: number | undefined;
  let lng: number | undefined;

  if (req.query.latitude && req.query.longitude) {
    lat = parseFloat(req.query.latitude as string);
    lng = parseFloat(req.query.longitude as string);
  } else {
    // Fallback to user's saved location in database
    const userLoc = await LocationService.getUserLocation(req.user.id);
    if (userLoc) {
      lat = userLoc.latitude;
      lng = userLoc.longitude;
    }
  }

  if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) {
    res.status(400).json({
      success: false,
      message: 'Latitude and longitude are required to search nearby incidents',
    });
    return;
  }

  const radiusParam = req.query.radius ? parseFloat(req.query.radius as string) : 5000;
  if (isNaN(radiusParam) || radiusParam <= 0 || radiusParam > 20000) {
    res.status(400).json({
      success: false,
      message: 'Radius must be a positive number up to 20,000 meters',
    });
    return;
  }

  try {
    const incidents = await IncidentService.getNearbyIncidents(lat, lng, radiusParam);
    res.status(200).json({
      success: true,
      data: {
        incidents,
        radius_meters: radiusParam,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to search nearby incidents',
    });
  }
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getIncidentById = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
    return;
  }

  if (!UUID_REGEX.test(req.params.id)) {
    res.status(400).json({
      success: false,
      message: 'Invalid incident ID format',
    });
    return;
  }

  try {
    const incident = await IncidentService.getIncidentById(req.params.id);
    if (!incident) {
      res.status(404).json({
        success: false,
        message: 'Incident not found',
      });
      return;
    }

    const verification = await VerificationService.getVerificationSummary(req.params.id, req.user.id);

    res.status(200).json({
      success: true,
      data: {
        incident: {
          ...incident,
          verification,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve incident',
    });
  }
};

export const updateIncident = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
    return;
  }

  if (!UUID_REGEX.test(req.params.id)) {
    res.status(400).json({
      success: false,
      message: 'Invalid incident ID format',
    });
    return;
  }

  try {
    const result = await IncidentService.updateIncident(
      req.params.id,
      req.user.id,
      req.body
    );

    if (result === 'NOT_FOUND') {
      res.status(404).json({
        success: false,
        message: 'Incident not found',
      });
      return;
    }

    if (result === 'FORBIDDEN') {
      res.status(403).json({
        success: false,
        message: 'You are not authorized to update this incident',
      });
      return;
    }

    if (result === 'ALREADY_CANCELLED') {
      res.status(400).json({
        success: false,
        message: 'Cancelled incidents cannot be updated',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        incident: result,
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to update incident',
    });
  }
};

export const cancelIncident = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
    return;
  }

  if (!UUID_REGEX.test(req.params.id)) {
    res.status(400).json({
      success: false,
      message: 'Invalid incident ID format',
    });
    return;
  }

  try {
    const result = await IncidentService.cancelIncident(req.params.id, req.user.id);

    if (result === 'NOT_FOUND') {
      res.status(404).json({
        success: false,
        message: 'Incident not found',
      });
      return;
    }

    if (result === 'FORBIDDEN') {
      res.status(403).json({
        success: false,
        message: 'You are not authorized to cancel this incident',
      });
      return;
    }

    if (result === 'ALREADY_CANCELLED') {
      res.status(400).json({
        success: false,
        message: 'Incident is already cancelled',
      });
      return;
    }

    // Resolve associated alerts
    try {
      await AlertService.resolveAlertsForIncident(req.params.id);
    } catch (err) {
      console.error('Non-blocking alert resolution error:', err);
    }

    res.status(200).json({
      success: true,
      data: {
        incident: result,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to cancel incident',
    });
  }
};
