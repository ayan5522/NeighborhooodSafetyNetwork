import { Request, Response, NextFunction } from 'express';
import { verifyJwt } from '../utils/crypto';
import { query } from '../db';

export interface AuthenticatedUser {
  id: string;
  role: string;
  account_status: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export const authenticateJwt = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      message: 'Authentication token is missing or malformed',
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyJwt(token);

    // Verify account existence and active status in database
    const userRes = await query(
      'SELECT id, role, account_status FROM users WHERE id = $1',
      [decoded.user_id]
    );

    if (userRes.rows.length === 0) {
      res.status(401).json({
        success: false,
        message: 'User no longer exists',
      });
      return;
    }

    const dbUser = userRes.rows[0];

    if (dbUser.account_status !== 'ACTIVE') {
      res.status(401).json({
        success: false,
        message: 'Account is suspended. Please contact support.',
      });
      return;
    }

    req.user = {
      id: dbUser.id,
      role: dbUser.role,
      account_status: dbUser.account_status,
    };

    next();
  } catch (error: any) {
    res.status(401).json({
      success: false,
      message: error.name === 'TokenExpiredError' ? 'Token has expired' : 'Invalid token',
    });
  }
};

export const requireRole = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: 'Forbidden: Insufficient privileges',
      });
      return;
    }

    next();
  };
};
