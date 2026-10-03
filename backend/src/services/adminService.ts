import { query } from '../db';
import { NotificationService } from './notificationService';

export interface DashboardStats {
  users?: {
    total: number;
    active: number;
    suspended: number;
  };
  incidents: {
    total: number;
    pending: number;
    active: number;
    resolved: number;
    cancelled: number;
  };
  alerts: {
    active: number;
  };
  verification: {
    confirmations: number;
    disputes: number;
  };
  reports: {
    pending: number;
    reviewed: number;
    dismissed: number;
    action_taken: number;
  };
}

export interface UserSummary {
  id: string;
  full_name: string;
  email: string;
  role: 'RESIDENT' | 'MODERATOR' | 'ADMIN';
  account_status: 'ACTIVE' | 'SUSPENDED';
  created_at: string;
  updated_at: string;
}

export class AdminService {
  /**
   * Fetch real database-backed dashboard statistics.
   * If role is ADMIN, includes user account metrics.
   * If role is MODERATOR, returns incident, verification, and moderation metrics.
   */
  static async getDashboardStats(userRole: string): Promise<DashboardStats> {
    // 1. Incidents breakdown
    const incidentRes = await query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text as count
       FROM incidents
       GROUP BY status`
    );

    let incPending = 0;
    let incActive = 0;
    let incResolved = 0;
    let incCancelled = 0;
    let incTotal = 0;

    incidentRes.rows.forEach((row) => {
      const cnt = parseInt(row.count, 10);
      incTotal += cnt;
      if (row.status === 'PENDING') incPending = cnt;
      else if (row.status === 'ACTIVE') incActive = cnt;
      else if (row.status === 'RESOLVED') incResolved = cnt;
      else if (row.status === 'CANCELLED') incCancelled = cnt;
    });

    // 2. Active alerts (active and not expired)
    const alertRes = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count
       FROM alerts
       WHERE status = 'ACTIVE' AND expires_at > CURRENT_TIMESTAMP`
    );
    const activeAlerts = parseInt(alertRes.rows[0]?.count || '0', 10);

    // 3. Community verifications breakdown
    const verifRes = await query<{ verification_type: string; count: string }>(
      `SELECT verification_type, COUNT(*)::text as count
       FROM incident_verifications
       GROUP BY verification_type`
    );

    let confirmations = 0;
    let disputes = 0;
    verifRes.rows.forEach((row) => {
      const cnt = parseInt(row.count, 10);
      if (row.verification_type === 'CONFIRM') confirmations = cnt;
      else if (row.verification_type === 'DISPUTE') disputes = cnt;
    });

    // 4. Moderation reports breakdown
    const reportRes = await query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text as count
       FROM incident_reports
       GROUP BY status`
    );

    let repPending = 0;
    let repReviewed = 0;
    let repDismissed = 0;
    let repActionTaken = 0;
    reportRes.rows.forEach((row) => {
      const cnt = parseInt(row.count, 10);
      if (row.status === 'PENDING') repPending = cnt;
      else if (row.status === 'REVIEWED') repReviewed = cnt;
      else if (row.status === 'DISMISSED') repDismissed = cnt;
      else if (row.status === 'ACTION_TAKEN') repActionTaken = cnt;
    });

    const stats: DashboardStats = {
      incidents: {
        total: incTotal,
        pending: incPending,
        active: incActive,
        resolved: incResolved,
        cancelled: incCancelled,
      },
      alerts: {
        active: activeAlerts,
      },
      verification: {
        confirmations,
        disputes,
      },
      reports: {
        pending: repPending,
        reviewed: repReviewed,
        dismissed: repDismissed,
        action_taken: repActionTaken,
      },
    };

    // Include user stats for ADMIN role
    if (userRole === 'ADMIN') {
      const userRes = await query<{ account_status: string; count: string }>(
        `SELECT account_status, COUNT(*)::text as count
         FROM users
         GROUP BY account_status`
      );

      let uActive = 0;
      let uSuspended = 0;
      let uTotal = 0;
      userRes.rows.forEach((row) => {
        const cnt = parseInt(row.count, 10);
        uTotal += cnt;
        if (row.account_status === 'ACTIVE') uActive = cnt;
        else if (row.account_status === 'SUSPENDED') uSuspended = cnt;
      });

      stats.users = {
        total: uTotal,
        active: uActive,
        suspended: uSuspended,
      };
    }

    return stats;
  }

  /**
   * Search and filter users with server-side pagination (ADMIN only).
   */
  static async getUsers(options: {
    search?: string;
    role?: string;
    account_status?: string;
    page: number;
    limit: number;
  }): Promise<{ users: UserSummary[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (options.role) {
      conditions.push(`role = $${paramIdx++}`);
      params.push(options.role);
    }

    if (options.account_status) {
      conditions.push(`account_status = $${paramIdx++}`);
      params.push(options.account_status);
    }

    if (options.search && options.search.trim().length > 0) {
      conditions.push(
        `(full_name ILIKE $${paramIdx} OR email ILIKE $${paramIdx})`
      );
      params.push(`%${options.search.trim()}%`);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count query
    const countRes = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM users ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    // Data query (safe non-sensitive fields only)
    const dataQuery = `
      SELECT id, full_name, email, role, account_status, created_at, updated_at
      FROM users
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `;
    params.push(limit, offset);

    const userRes = await query<UserSummary>(dataQuery, params);

    return {
      users: userRes.rows,
      total,
      page,
      limit,
    };
  }

  /**
   * Suspend a user account (ADMIN only).
   * Prevents self-suspension.
   */
  static async suspendUser(
    adminId: string,
    targetUserId: string
  ): Promise<{ success: boolean; message: string; user?: UserSummary }> {
    if (adminId === targetUserId) {
      return {
        success: false,
        message: 'Administrators cannot suspend their own account',
      };
    }

    const checkRes = await query<UserSummary>(
      'SELECT id, full_name, email, role, account_status, created_at, updated_at FROM users WHERE id = $1',
      [targetUserId]
    );

    if (checkRes.rows.length === 0) {
      return {
        success: false,
        message: 'Target user does not exist',
      };
    }

    const updatedRes = await query<UserSummary>(
      `UPDATE users
       SET account_status = 'SUSPENDED', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, full_name, email, role, account_status, created_at, updated_at`,
      [targetUserId]
    );

    const suspendedUser = updatedRes.rows[0];

    // Send notification to the suspended user
    await NotificationService.createNotification({
      user_id: targetUserId,
      type: 'SYSTEM',
      title: 'Account Suspended',
      message: 'Your account has been suspended by an administrator. Please contact support.',
    });

    return {
      success: true,
      message: 'User account suspended successfully',
      user: suspendedUser,
    };
  }

  /**
   * Restore a suspended user account (ADMIN only).
   */
  static async restoreUser(
    adminId: string,
    targetUserId: string
  ): Promise<{ success: boolean; message: string; user?: UserSummary }> {
    const checkRes = await query<UserSummary>(
      'SELECT id, full_name, email, role, account_status, created_at, updated_at FROM users WHERE id = $1',
      [targetUserId]
    );

    if (checkRes.rows.length === 0) {
      return {
        success: false,
        message: 'Target user does not exist',
      };
    }

    const updatedRes = await query<UserSummary>(
      `UPDATE users
       SET account_status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, full_name, email, role, account_status, created_at, updated_at`,
      [targetUserId]
    );

    const restoredUser = updatedRes.rows[0];

    // Send notification to restored user
    await NotificationService.createNotification({
      user_id: targetUserId,
      type: 'SYSTEM',
      title: 'Account Restored',
      message: 'Your account access has been restored to active status.',
    });

    return {
      success: true,
      message: 'User account restored successfully',
      user: restoredUser,
    };
  }

  /**
   * Change user role (ADMIN only).
   * Validates role, prevents removing the last active ADMIN.
   */
  static async changeUserRole(
    adminId: string,
    targetUserId: string,
    newRole: string
  ): Promise<{ success: boolean; message: string; user?: UserSummary }> {
    const allowedRoles = ['RESIDENT', 'MODERATOR', 'ADMIN'];
    if (!allowedRoles.includes(newRole)) {
      return {
        success: false,
        message: `Invalid role specified. Must be one of: ${allowedRoles.join(', ')}`,
      };
    }

    const checkRes = await query<UserSummary>(
      'SELECT id, full_name, email, role, account_status, created_at, updated_at FROM users WHERE id = $1',
      [targetUserId]
    );

    if (checkRes.rows.length === 0) {
      return {
        success: false,
        message: 'Target user does not exist',
      };
    }

    const targetUser = checkRes.rows[0];

    // Self-protection: Prevent demoting the last active administrator
    if (targetUser.role === 'ADMIN' && newRole !== 'ADMIN') {
      const adminCountRes = await query<{ count: string }>(
        `SELECT COUNT(*)::text as count
         FROM users
         WHERE role = 'ADMIN' AND account_status = 'ACTIVE' AND id != $1`,
        [targetUserId]
      );
      const remainingAdmins = parseInt(adminCountRes.rows[0]?.count || '0', 10);
      if (remainingAdmins === 0) {
        return {
          success: false,
          message: 'Cannot demote the last active administrator',
        };
      }
    }

    const updatedRes = await query<UserSummary>(
      `UPDATE users
       SET role = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, full_name, email, role, account_status, created_at, updated_at`,
      [newRole, targetUserId]
    );

    const updatedUser = updatedRes.rows[0];

    // Send notification to user
    await NotificationService.createNotification({
      user_id: targetUserId,
      type: 'SYSTEM',
      title: 'Role Updated',
      message: `Your account role has been updated to ${newRole}.`,
    });

    return {
      success: true,
      message: `User role successfully updated to ${newRole}`,
      user: updatedUser,
    };
  }
}
