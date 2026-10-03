import { Request, Response } from 'express';
import { AuditService } from '../services/auditService';

export const getAuditLogs = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  const {
    actor_user_id,
    action,
    entity_type,
    entity_id,
    from_date,
    to_date,
    page,
    limit,
  } = req.query;

  try {
    const result = await AuditService.getAuditLogs({
      actor_user_id: typeof actor_user_id === 'string' ? actor_user_id : undefined,
      action: typeof action === 'string' ? action : undefined,
      entity_type: typeof entity_type === 'string' ? entity_type : undefined,
      entity_id: typeof entity_id === 'string' ? entity_id : undefined,
      from_date: typeof from_date === 'string' ? from_date : undefined,
      to_date: typeof to_date === 'string' ? to_date : undefined,
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
      message: error.message || 'Failed to retrieve audit logs',
    });
  }
};

export const getAuditLogById = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  const id = req.params.id;

  try {
    const log = await AuditService.getAuditLogById(id);
    if (!log) {
      res.status(404).json({
        success: false,
        message: 'Audit log record not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: { log },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve audit log details',
    });
  }
};
