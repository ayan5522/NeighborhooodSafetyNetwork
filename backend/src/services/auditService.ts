import { query } from '../db';

export const AUDIT_ACTIONS = [
  'USER_REGISTERED',
  'USER_LOGIN_SUCCESS',
  'USER_LOGIN_FAILED',
  'USER_LOGOUT',
  'EMAIL_VERIFICATION_REQUESTED',
  'EMAIL_VERIFICATION_SUCCESS',
  'EMAIL_VERIFICATION_FAILED',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_RESET_OTP_VERIFIED',
  'PASSWORD_RESET_COMPLETED',
  'PROFILE_UPDATED',
  'LOCATION_UPDATED',
  'INCIDENT_CREATED',
  'INCIDENT_UPDATED',
  'INCIDENT_CANCELLED',
  'INCIDENT_RESOLVED',
  'INCIDENT_VERIFICATION_CREATED',
  'INCIDENT_VERIFICATION_UPDATED',
  'ALERT_CREATED',
  'ALERT_READ',
  'ALERT_RESOLVED',
  'ALERT_EXPIRED',
  'SOS_CREATED',
  'SOS_RESOLVED',
  'NOTIFICATION_READ',
  'NOTIFICATIONS_MARKED_READ',
  'INCIDENT_REPORTED',
  'MODERATION_REVIEWED',
  'MODERATION_DISMISSED',
  'MODERATION_ACTION_TAKEN',
  'USER_SUSPENDED',
  'USER_RESTORED',
  'USER_ROLE_CHANGED',
  'ADMIN_LOGIN',
  'ADMIN_ACTION',
  'SECURITY_EVENT',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditLogRecord {
  id: string;
  actor_user_id: string | null;
  action: AuditAction;
  entity_type: string;
  entity_id: string | null;
  description: string;
  metadata: Record<string, any>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  actor_name?: string | null;
  actor_email?: string | null;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'passwordhash',
  'token',
  'jwt',
  'auth_token',
  'reset_token',
  'resettoken',
  'reset_token_hash',
  'token_hash',
  'otp',
  'otp_hash',
  'otphash',
  'otp_code',
  'otpcode',
  'secret',
  'secret_key',
  'smtp_password',
  'db_password',
  'latitude',
  'longitude',
]);

/**
 * Recursively removes sensitive fields from metadata to ensure zero credential/location leaks in audit trails.
 */
export const sanitizeMetadata = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitizeMetadata);
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      sanitized[key] = '[REDACTED]';
    } else if (lowerKey === 'phone_number' || lowerKey === 'phone') {
      // Mask phone numbers to preserve last 4 digits only
      if (typeof value === 'string' && value.length > 4) {
        sanitized[key] = `***-***-${value.slice(-4)}`;
      } else {
        sanitized[key] = '[REDACTED]';
      }
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeMetadata(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

export class AuditService {
  /**
   * Central non-blocking audit logging method.
   * Guarantees error-free execution for caller flow.
   */
  public static async log(params: {
    actor_user_id?: string | null;
    action: AuditAction;
    entity_type: string;
    entity_id?: string | null;
    description: string;
    metadata?: Record<string, any>;
    ip_address?: string | null;
    user_agent?: string | null;
    req?: any;
  }): Promise<AuditLogRecord | null> {
    try {
      const sanitizedMeta = sanitizeMetadata(params.metadata || {});

      const clientIp =
        params.ip_address ||
        (params.req
          ? params.req.ip ||
            params.req.headers?.['x-forwarded-for'] ||
            params.req.socket?.remoteAddress ||
            null
          : null);

      const clientUa =
        params.user_agent ||
        (params.req ? params.req.headers?.['user-agent'] || null : null);

      const insertSql = `
        INSERT INTO audit_logs (
          actor_user_id,
          action,
          entity_type,
          entity_id,
          description,
          metadata,
          ip_address,
          user_agent,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
        RETURNING *;
      `;

      const res = await query<AuditLogRecord>(insertSql, [
        params.actor_user_id || null,
        params.action,
        params.entity_type,
        params.entity_id || null,
        params.description,
        JSON.stringify(sanitizedMeta),
        clientIp ? String(clientIp).slice(0, 100) : null,
        clientUa ? String(clientUa).slice(0, 500) : null,
      ]);

      return res.rows[0];
    } catch (err) {
      console.error('[AuditService] Failed to record audit log:', err);
      return null;
    }
  }

  /**
   * Fetch paginated audit logs for administrators with safe actor details.
   */
  public static async getAuditLogs(options: {
    actor_user_id?: string;
    action?: string;
    entity_type?: string;
    entity_id?: string;
    from_date?: string;
    to_date?: string;
    page: number;
    limit: number;
  }): Promise<{ logs: AuditLogRecord[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (options.actor_user_id) {
      conditions.push(`al.actor_user_id = $${paramIdx++}`);
      params.push(options.actor_user_id);
    }

    if (options.action) {
      conditions.push(`al.action = $${paramIdx++}`);
      params.push(options.action);
    }

    if (options.entity_type) {
      conditions.push(`al.entity_type = $${paramIdx++}`);
      params.push(options.entity_type);
    }

    if (options.entity_id) {
      conditions.push(`al.entity_id = $${paramIdx++}`);
      params.push(options.entity_id);
    }

    if (options.from_date) {
      conditions.push(`al.created_at >= $${paramIdx++}`);
      params.push(options.from_date);
    }

    if (options.to_date) {
      conditions.push(`al.created_at <= $${paramIdx++}`);
      params.push(options.to_date);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*)::text as count FROM audit_logs al ${whereClause};`;
    const countRes = await query<{ count: string }>(countSql, params);
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    const dataSql = `
      SELECT 
        al.id,
        al.actor_user_id,
        al.action,
        al.entity_type,
        al.entity_id,
        al.description,
        al.metadata,
        al.ip_address,
        al.user_agent,
        al.created_at,
        u.full_name as actor_name,
        u.email as actor_email
      FROM audit_logs al
      LEFT JOIN users u ON al.actor_user_id = u.id
      ${whereClause}
      ORDER BY al.created_at DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++};
    `;
    params.push(limit, offset);

    const logRes = await query<AuditLogRecord>(dataSql, params);

    return {
      logs: logRes.rows,
      total,
      page,
      limit,
    };
  }

  /**
   * Fetch single audit log detail by ID (Admin only).
   */
  public static async getAuditLogById(id: string): Promise<AuditLogRecord | null> {
    const dataSql = `
      SELECT 
        al.id,
        al.actor_user_id,
        al.action,
        al.entity_type,
        al.entity_id,
        al.description,
        al.metadata,
        al.ip_address,
        al.user_agent,
        al.created_at,
        u.full_name as actor_name,
        u.email as actor_email
      FROM audit_logs al
      LEFT JOIN users u ON al.actor_user_id = u.id
      WHERE al.id = $1;
    `;
    const res = await query<AuditLogRecord>(dataSql, [id]);
    return res.rows[0] || null;
  }
}
