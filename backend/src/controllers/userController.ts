import { Request, Response } from 'express';
import { query } from '../db';
import { AuditService } from '../services/auditService';

export const getCurrentUser = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
    return;
  }

  const userRes = await query(
    'SELECT id, full_name, email, role, account_status, created_at, updated_at FROM users WHERE id = $1',
    [req.user.id]
  );

  if (userRes.rows.length === 0) {
    res.status(404).json({
      success: false,
      message: 'User not found',
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: {
      user: userRes.rows[0],
    },
  });
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
    return;
  }

  const { full_name } = req.body;

  if (!full_name || typeof full_name !== 'string' || full_name.trim().length === 0) {
    res.status(400).json({
      success: false,
      message: 'Full name is required and cannot be empty',
    });
    return;
  }

  // Security Rule: Users can only update their own full_name. Role and status changes are prohibited.
  const updateRes = await query(
    `UPDATE users
     SET full_name = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING id, full_name, email, role, account_status, created_at, updated_at`,
    [full_name.trim(), req.user.id]
  );

  if (updateRes.rows.length === 0) {
    res.status(404).json({
      success: false,
      message: 'User not found',
    });
    return;
  }

  AuditService.log({
    actor_user_id: req.user.id,
    action: 'PROFILE_UPDATED',
    entity_type: 'user',
    entity_id: req.user.id,
    description: `User profile updated: ${full_name.trim()}`,
    metadata: { full_name: full_name.trim() },
    req,
  });

  res.status(200).json({
    success: true,
    data: {
      user: updateRes.rows[0],
    },
  });
};
