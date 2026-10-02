import { query } from '../db';
import { emitToUser } from '../socket';

export const VALID_NOTIFICATION_TYPES = [
  'INCIDENT_NEARBY',
  'ALERT_CREATED',
  'ALERT_UPDATED',
  'ALERT_RESOLVED',
  'SOS_NOTIFICATION',
  'COMMUNITY_VERIFICATION',
  'SYSTEM',
] as const;

export type NotificationType = typeof VALID_NOTIFICATION_TYPES[number];

export interface NotificationRecord {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  incident_id: string | null;
  alert_id: string | null;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
}

export class NotificationService {
  /**
   * Persists a notification to PostgreSQL first, then emits Socket.IO event to the user's room.
   */
  public static async createNotification(data: {
    user_id: string;
    type: NotificationType;
    title: string;
    message: string;
    incident_id?: string | null;
    alert_id?: string | null;
  }): Promise<NotificationRecord> {
    const { user_id, type, title, message, incident_id = null, alert_id = null } = data;

    if (!VALID_NOTIFICATION_TYPES.includes(type)) {
      throw new Error(`Invalid notification type: ${type}`);
    }

    // Duplicate prevention for alert-linked notifications
    if (alert_id) {
      const existingSql = `
        SELECT id, user_id, type, title, message, incident_id, alert_id, is_read, created_at, read_at
        FROM notifications
        WHERE user_id = $1 AND alert_id = $2 AND type = $3;
      `;
      const existingRes = await query(existingSql, [user_id, alert_id, type]);
      if (existingRes.rows.length > 0) {
        return existingRes.rows[0];
      }
    }

    // Step 1: Database persistence happens FIRST (mandatory architectural invariant)
    const insertSql = `
      INSERT INTO notifications (user_id, type, title, message, incident_id, alert_id, is_read, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, FALSE, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, alert_id, type) WHERE alert_id IS NOT NULL DO NOTHING
      RETURNING id, user_id, type, title, message, incident_id, alert_id, is_read, created_at, read_at;
    `;

    const res = await query(insertSql, [
      user_id,
      type,
      title,
      message,
      incident_id,
      alert_id,
    ]);

    let notification: NotificationRecord;
    if (res.rows.length > 0) {
      notification = res.rows[0];
    } else {
      // Handled conflict: retrieve existing
      const fetchSql = `
        SELECT id, user_id, type, title, message, incident_id, alert_id, is_read, created_at, read_at
        FROM notifications
        WHERE user_id = $1 AND alert_id = $2 AND type = $3;
      `;
      const fetchRes = await query(fetchSql, [user_id, alert_id, type]);
      notification = fetchRes.rows[0];
    }

    // Step 2: Confirm successful persistence, THEN emit Socket.IO event
    try {
      emitToUser(user_id, 'notification:new', notification);
    } catch (socketErr) {
      console.warn('Non-fatal socket emission warning:', socketErr);
    }

    return notification;
  }

  /**
   * Retrieves list of notifications belonging exclusively to the authenticated user.
   */
  public static async getUserNotifications(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{
    notifications: NotificationRecord[];
    total: number;
    page: number;
    limit: number;
  }> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const offset = (safePage - 1) * safeLimit;

    const listSql = `
      SELECT id, user_id, type, title, message, incident_id, alert_id, is_read, created_at, read_at
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3;
    `;

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM notifications
      WHERE user_id = $1;
    `;

    const [listRes, countRes] = await Promise.all([
      query(listSql, [userId, safeLimit, offset]),
      query(countSql, [userId]),
    ]);

    return {
      notifications: listRes.rows,
      total: countRes.rows[0]?.total || 0,
      page: safePage,
      limit: safeLimit,
    };
  }

  /**
   * Counts unread notifications for the user using PostgreSQL aggregation.
   */
  public static async getUnreadCount(userId: string): Promise<number> {
    const countSql = `
      SELECT COUNT(*)::int AS count
      FROM notifications
      WHERE user_id = $1 AND is_read = FALSE;
    `;
    const res = await query(countSql, [userId]);
    return res.rows[0]?.count || 0;
  }

  /**
   * Fetches single notification by ID with strict ownership validation (IDOR protection).
   */
  public static async getNotificationById(
    notificationId: string,
    userId: string
  ): Promise<NotificationRecord | null | 'FORBIDDEN'> {
    const sql = `
      SELECT id, user_id, type, title, message, incident_id, alert_id, is_read, created_at, read_at
      FROM notifications
      WHERE id = $1;
    `;
    const res = await query(sql, [notificationId]);
    if (res.rows.length === 0) {
      return null;
    }

    const notification = res.rows[0] as NotificationRecord;
    if (notification.user_id !== userId) {
      return 'FORBIDDEN';
    }

    return notification;
  }

  /**
   * Marks a notification as read with strict ownership validation.
   * Operation is idempotent.
   */
  public static async markAsRead(
    notificationId: string,
    userId: string
  ): Promise<NotificationRecord | null | 'FORBIDDEN'> {
    const existing = await this.getNotificationById(notificationId, userId);
    if (!existing || existing === 'FORBIDDEN') {
      return existing;
    }

    if (existing.is_read) {
      return existing;
    }

    const updateSql = `
      UPDATE notifications
      SET is_read = TRUE,
          read_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING id, user_id, type, title, message, incident_id, alert_id, is_read, created_at, read_at;
    `;
    const res = await query(updateSql, [notificationId, userId]);
    return res.rows[0];
  }

  /**
   * Marks all unread notifications as read for the authenticated user.
   */
  public static async markAllAsRead(userId: string): Promise<{ updatedCount: number }> {
    const sql = `
      WITH updated AS (
        UPDATE notifications
        SET is_read = TRUE,
            read_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND is_read = FALSE
        RETURNING id
      )
      SELECT COUNT(*)::int AS count FROM updated;
    `;
    const res = await query(sql, [userId]);
    return {
      updatedCount: res.rows[0]?.count || 0,
    };
  }
}
