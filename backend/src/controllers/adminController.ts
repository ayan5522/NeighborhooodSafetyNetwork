import { Request, Response } from 'express';
import { AdminService } from '../services/adminService';

export const getDashboard = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  try {
    const stats = await AdminService.getDashboardStats(req.user.role);
    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch dashboard metrics',
    });
  }
};

export const getUsers = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  const { search, role, status, page, limit } = req.query;

  try {
    const result = await AdminService.getUsers({
      search: typeof search === 'string' ? search : undefined,
      role: typeof role === 'string' ? role : undefined,
      account_status: typeof status === 'string' ? status : undefined,
      page: parseInt(page as string, 10) || 1,
      limit: parseInt(limit as string, 10) || 20,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve users',
    });
  }
};

export const suspendUser = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  const targetUserId = req.params.id;

  try {
    const result = await AdminService.suspendUser(req.user.id, targetUserId);
    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.message,
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: result.message,
      data: { user: result.user },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to suspend user',
    });
  }
};

export const restoreUser = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  const targetUserId = req.params.id;

  try {
    const result = await AdminService.restoreUser(req.user.id, targetUserId);
    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.message,
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: result.message,
      data: { user: result.user },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to restore user',
    });
  }
};

export const changeUserRole = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  const targetUserId = req.params.id;
  const { role } = req.body;

  if (!role || typeof role !== 'string') {
    res.status(400).json({
      success: false,
      message: 'Role is required and must be a valid string',
    });
    return;
  }

  try {
    const result = await AdminService.changeUserRole(req.user.id, targetUserId, role);
    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.message,
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: result.message,
      data: { user: result.user },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to change user role',
    });
  }
};
