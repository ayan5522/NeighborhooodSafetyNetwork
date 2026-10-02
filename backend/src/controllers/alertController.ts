import { Request, Response } from 'express';
import { AlertService } from '../services/alertService';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getAlerts = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
    return;
  }

  try {
    const alerts = await AlertService.getUserAlerts(req.user.id);
    res.status(200).json({
      success: true,
      data: {
        alerts,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve alerts',
    });
  }
};

export const getUnreadAlertCount = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
    return;
  }

  try {
    const count = await AlertService.getUnreadCount(req.user.id);
    res.status(200).json({
      success: true,
      data: {
        count,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve unread count',
    });
  }
};

export const getAlertById = async (req: Request, res: Response): Promise<void> => {
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
      message: 'Invalid alert ID format',
    });
    return;
  }

  try {
    const alert = await AlertService.getAlertById(id, req.user.id);
    if (alert === 'NOT_FOUND') {
      res.status(404).json({
        success: false,
        message: 'Alert not found',
      });
      return;
    }

    if (alert === 'FORBIDDEN') {
      res.status(403).json({
        success: false,
        message: 'You are not authorized to view this alert',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        alert,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve alert',
    });
  }
};

export const markAlertRead = async (req: Request, res: Response): Promise<void> => {
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
      message: 'Invalid alert ID format',
    });
    return;
  }

  try {
    const alert = await AlertService.markAlertRead(id, req.user.id);
    if (alert === 'NOT_FOUND') {
      res.status(404).json({
        success: false,
        message: 'Alert not found',
      });
      return;
    }

    if (alert === 'FORBIDDEN') {
      res.status(403).json({
        success: false,
        message: 'You are not authorized to modify this alert',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        alert,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to mark alert as read',
    });
  }
};
