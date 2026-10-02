import { Request, Response } from 'express';
import { NotificationService } from '../services/notificationService';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
    return;
  }

  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 20;

  try {
    const result = await NotificationService.getUserNotifications(req.user.id, page, limit);
    res.status(200).json({
      success: true,
      data: {
        notifications: result.notifications,
        total: result.total,
        page: result.page,
        limit: result.limit,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve notifications',
    });
  }
};

export const getUnreadCount = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
    return;
  }

  try {
    const count = await NotificationService.getUnreadCount(req.user.id);
    res.status(200).json({
      success: true,
      data: {
        count,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve unread notification count',
    });
  }
};

export const getNotificationById = async (req: Request, res: Response): Promise<void> => {
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
      message: 'Invalid notification ID format',
    });
    return;
  }

  try {
    const notification = await NotificationService.getNotificationById(id, req.user.id);
    if (!notification) {
      res.status(404).json({
        success: false,
        message: 'Notification not found',
      });
      return;
    }

    if (notification === 'FORBIDDEN') {
      res.status(403).json({
        success: false,
        message: 'Access denied: You do not own this notification',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        notification,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve notification',
    });
  }
};

export const markAsRead = async (req: Request, res: Response): Promise<void> => {
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
      message: 'Invalid notification ID format',
    });
    return;
  }

  try {
    const result = await NotificationService.markAsRead(id, req.user.id);
    if (!result) {
      res.status(404).json({
        success: false,
        message: 'Notification not found',
      });
      return;
    }

    if (result === 'FORBIDDEN') {
      res.status(403).json({
        success: false,
        message: 'Access denied: You do not own this notification',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        notification: result,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to mark notification as read',
    });
  }
};

export const markAllAsRead = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
    return;
  }

  try {
    const result = await NotificationService.markAllAsRead(req.user.id);
    res.status(200).json({
      success: true,
      data: {
        updated_count: result.updatedCount,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to mark all notifications as read',
    });
  }
};
