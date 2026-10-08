import { query } from '../db';
import { config } from '../config';
import { IncidentRecord } from './incidentService';
import {
  ALERT_PRIORITY_RULES,
  AlertPriority,
  AlertStatus,
} from '../config/alertConfig';
import { NotificationService } from './notificationService';
import { AuditService } from './auditService';

export interface AlertIncidentSummary {
  id: string;
  category: string;
  title: string;
  description: string;
  severity: string;
  latitude: number;
  longitude: number;
  status: string;
  created_at: string;
}

export interface AlertRecord {
  id: string;
  incident_id: string;
  recipient_user_id: string;
  priority: AlertPriority;
  status: AlertStatus;
  created_at: string;
  expires_at: string;
  read_at: string | null;
  incident?: AlertIncidentSummary;
}

export class AlertService {
  /**
   * Normalizes expired active alerts across the system.
   * If current time >= expires_at, status transitions to 'EXPIRED'.
   */
  public static async normalizeExpiredAlerts(): Promise<void> {
    const sql = `
      UPDATE alerts
      SET status = 'EXPIRED'
      WHERE status = 'ACTIVE'
        AND expires_at <= NOW();
    `;
    await query(sql);
  }

  /**
   * Generate targeted emergency alerts for an incident using PostGIS.
   *
   * Eligibility Criteria:
   * 1. Radius: Determined by centralized ALERT_PRIORITY_RULES based on incident severity.
   * 2. Recipient must NOT be the incident reporter.
   * 3. Location must be fresh (updated within config.location.maxAgeMinutes).
   * 4. User account must be 'ACTIVE' (suspended users excluded).
   * 5. Duplicate Prevention: uq_alerts_incident_recipient prevents duplicate records.
   */
  public static async generateAlertsForIncident(incident: IncidentRecord): Promise<number> {
    const rule = ALERT_PRIORITY_RULES[incident.severity] || ALERT_PRIORITY_RULES.MEDIUM;
    const maxAgeMinutes = config.location.maxAgeMinutes;

    // Single efficient PostGIS spatial query + batch insertion
    const sql = `
      INSERT INTO alerts (incident_id, recipient_user_id, priority, status, expires_at)
      SELECT
        $1,
        ul.user_id,
        $2,
        'ACTIVE',
        NOW() + ($3 || ' hours')::interval
      FROM user_locations ul
      JOIN users u ON ul.user_id = u.id
      WHERE ul.user_id != $4
        AND u.account_status = 'ACTIVE'
        AND ul.updated_at >= NOW() - ($5 || ' minutes')::interval
        AND ST_DWithin(
          ul.location,
          ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography,
          $8
        )
      ON CONFLICT (incident_id, recipient_user_id) DO NOTHING
      RETURNING id, recipient_user_id;
    `;

    const res = await query(sql, [
      incident.id,
      rule.priority,
      rule.expiryHours,
      incident.reporter_id,
      maxAgeMinutes,
      incident.longitude,
      incident.latitude,
      rule.radiusMeters,
    ]);

    // Module 06: Generate persistent notification and emit real-time event for each recipient
    for (const alert of res.rows) {
      try {
        await NotificationService.createNotification({
          user_id: alert.recipient_user_id,
          type: 'ALERT_CREATED',
          title: 'Safety alert nearby',
          message: `A ${incident.severity} severity ${incident.category.toLowerCase().replace(/_/g, ' ')} was reported near you.`,
          incident_id: incident.id,
          alert_id: alert.id,
        });
      } catch (notifErr) {
        console.warn('Non-blocking notification generation warning:', notifErr);
      }
    }

    if (res.rows.length > 0) {
      AuditService.log({
        actor_user_id: incident.reporter_id,
        action: 'ALERT_CREATED',
        entity_type: 'incident',
        entity_id: incident.id,
        description: `Dispatched ${res.rows.length} alerts for incident: ${incident.title}`,
        metadata: {
          incident_id: incident.id,
          count: res.rows.length,
          priority: rule.priority,
          severity: incident.severity,
        },
      });
    }

    return res.rows.length;
  }

  /**
   * Synchronizes active, non-expired emergency alerts for a user based on their latest location.
   * Evaluates all active incidents in PostgreSQL using PostGIS spatial queries.
   * If eligible incidents exist that do not yet have an alert for this user:
   * 1. Inserts the alert with status 'ACTIVE' (deduplicated by uq_alerts_incident_recipient).
   * 2. Inserts a corresponding persistent notification in notifications table.
   * 3. Emits 'notification:new' event via Socket.IO to user:<userId>.
   *
   * Guaranteed:
   * - No duplicates (ON CONFLICT (incident_id, recipient_user_id) DO NOTHING)
   * - Ignores expired, resolved, or cancelled incidents
   * - Ignores users with stale location (> maxAgeMinutes) or suspended accounts
   * - Reporter never receives alert for own incident
   */
  public static async syncAlertsForUser(userId: string): Promise<number> {
    await this.normalizeExpiredAlerts();

    const maxAgeMinutes = config.location.maxAgeMinutes;

    const sql = `
      INSERT INTO alerts (incident_id, recipient_user_id, priority, status, expires_at)
      SELECT
        i.id,
        ul.user_id,
        CASE i.severity
          WHEN 'CRITICAL' THEN 'URGENT'::varchar(20)
          WHEN 'HIGH' THEN 'HIGH'::varchar(20)
          WHEN 'LOW' THEN 'LOW'::varchar(20)
          ELSE 'NORMAL'::varchar(20)
        END,
        'ACTIVE',
        i.created_at + (
          CASE i.severity
            WHEN 'CRITICAL' THEN INTERVAL '1 hour'
            WHEN 'HIGH' THEN INTERVAL '3 hours'
            ELSE INTERVAL '6 hours'
          END
        )
      FROM user_locations ul
      JOIN users u ON ul.user_id = u.id
      CROSS JOIN incidents i
      WHERE ul.user_id = $1
        AND u.account_status = 'ACTIVE'
        AND ul.updated_at >= NOW() - ($2 || ' minutes')::interval
        AND i.reporter_id != ul.user_id
        AND i.status IN ('PENDING', 'ACTIVE')
        AND (
          i.created_at + (
            CASE i.severity
              WHEN 'CRITICAL' THEN INTERVAL '1 hour'
              WHEN 'HIGH' THEN INTERVAL '3 hours'
              ELSE INTERVAL '6 hours'
            END
          ) > NOW()
        )
        AND ST_DWithin(
          ul.location,
          i.location,
          CASE i.severity
            WHEN 'CRITICAL' THEN 5000
            WHEN 'HIGH' THEN 3000
            WHEN 'LOW' THEN 1000
            ELSE 2000
          END
        )
      ON CONFLICT (incident_id, recipient_user_id) DO NOTHING
      RETURNING id, incident_id, recipient_user_id;
    `;

    const res = await query(sql, [userId, maxAgeMinutes]);

    if (res.rows.length === 0) {
      return 0;
    }

    const incidentIds = res.rows.map((r: any) => r.incident_id);
    const incRes = await query(
      `SELECT id, title, category, severity FROM incidents WHERE id = ANY($1)`,
      [incidentIds]
    );
    const incMap = new Map(incRes.rows.map((inc: any) => [inc.id, inc]));

    for (const alert of res.rows) {
      const inc = incMap.get(alert.incident_id);
      if (inc) {
        try {
          await NotificationService.createNotification({
            user_id: alert.recipient_user_id,
            type: 'ALERT_CREATED',
            title: 'Safety alert nearby',
            message: `A ${inc.severity} severity ${inc.category.toLowerCase().replace(/_/g, ' ')} was reported near you.`,
            incident_id: inc.id,
            alert_id: alert.id,
          });
        } catch (notifErr) {
          console.warn('Non-blocking notification generation warning in syncAlertsForUser:', notifErr);
        }
      }
    }

    return res.rows.length;
  }

  /**
   * Retrieve alerts targeted to the authenticated recipient.
   * Returns privacy-safe incident information without revealing reporter's private details.
   */
  public static async getUserAlerts(userId: string): Promise<AlertRecord[]> {
    await this.normalizeExpiredAlerts();

    const sql = `
      SELECT
        a.id,
        a.incident_id,
        a.recipient_user_id,
        a.priority,
        a.status,
        a.created_at,
        a.expires_at,
        a.read_at,
        i.category AS incident_category,
        i.title AS incident_title,
        i.description AS incident_description,
        i.severity AS incident_severity,
        i.latitude AS incident_latitude,
        i.longitude AS incident_longitude,
        i.status AS incident_status,
        i.created_at AS incident_created_at
      FROM alerts a
      JOIN incidents i ON a.incident_id = i.id
      WHERE a.recipient_user_id = $1
      ORDER BY a.created_at DESC;
    `;

    const res = await query(sql, [userId]);

    return res.rows.map((row) => ({
      id: row.id,
      incident_id: row.incident_id,
      recipient_user_id: row.recipient_user_id,
      priority: row.priority,
      status: row.status,
      created_at: row.created_at,
      expires_at: row.expires_at,
      read_at: row.read_at,
      incident: {
        id: row.incident_id,
        category: row.incident_category,
        title: row.incident_title,
        description: row.incident_description,
        severity: row.incident_severity,
        latitude: parseFloat(row.incident_latitude),
        longitude: parseFloat(row.incident_longitude),
        status: row.incident_status,
        created_at: row.incident_created_at,
      },
    }));
  }

  /**
   * Retrieve a specific alert with IDOR protection.
   */
  public static async getAlertById(
    alertId: string,
    userId: string
  ): Promise<AlertRecord | 'FORBIDDEN' | 'NOT_FOUND'> {
    await this.normalizeExpiredAlerts();

    const sql = `
      SELECT
        a.id,
        a.incident_id,
        a.recipient_user_id,
        a.priority,
        a.status,
        a.created_at,
        a.expires_at,
        a.read_at,
        i.category AS incident_category,
        i.title AS incident_title,
        i.description AS incident_description,
        i.severity AS incident_severity,
        i.latitude AS incident_latitude,
        i.longitude AS incident_longitude,
        i.status AS incident_status,
        i.created_at AS incident_created_at
      FROM alerts a
      JOIN incidents i ON a.incident_id = i.id
      WHERE a.id = $1;
    `;

    const res = await query(sql, [alertId]);
    if (res.rows.length === 0) {
      return 'NOT_FOUND';
    }

    const row = res.rows[0];
    if (row.recipient_user_id !== userId) {
      return 'FORBIDDEN';
    }

    return {
      id: row.id,
      incident_id: row.incident_id,
      recipient_user_id: row.recipient_user_id,
      priority: row.priority,
      status: row.status,
      created_at: row.created_at,
      expires_at: row.expires_at,
      read_at: row.read_at,
      incident: {
        id: row.incident_id,
        category: row.incident_category,
        title: row.incident_title,
        description: row.incident_description,
        severity: row.incident_severity,
        latitude: parseFloat(row.incident_latitude),
        longitude: parseFloat(row.incident_longitude),
        status: row.incident_status,
        created_at: row.incident_created_at,
      },
    };
  }

  /**
   * Mark an alert as read by the recipient.
   */
  public static async markAlertRead(
    alertId: string,
    userId: string
  ): Promise<AlertRecord | 'FORBIDDEN' | 'NOT_FOUND'> {
    const existing = await this.getAlertById(alertId, userId);
    if (existing === 'NOT_FOUND' || existing === 'FORBIDDEN') {
      return existing;
    }

    if (!existing.read_at) {
      const sql = `
        UPDATE alerts
        SET read_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING read_at;
      `;
      const res = await query(sql, [alertId]);
      existing.read_at = res.rows[0]?.read_at;
    }

    return existing;
  }

  /**
   * Retrieve unread actionable alert count for the user.
   * Actionable alerts: read_at IS NULL AND status = 'ACTIVE' AND expires_at > NOW().
   */
  public static async getUnreadCount(userId: string): Promise<number> {
    await this.normalizeExpiredAlerts();

    const sql = `
      SELECT COUNT(*) AS count
      FROM alerts
      WHERE recipient_user_id = $1
        AND read_at IS NULL
        AND status = 'ACTIVE'
        AND expires_at > NOW();
    `;

    const res = await query(sql, [userId]);
    return parseInt(res.rows[0].count, 10);
  }

  /**
   * Resolve active alerts associated with a resolved incident.
   */
  public static async resolveAlertsForIncident(incidentId: string): Promise<number> {
    const sql = `
      UPDATE alerts
      SET status = 'RESOLVED'
      WHERE incident_id = $1
        AND status = 'ACTIVE'
      RETURNING id, recipient_user_id;
    `;
    const res = await query(sql, [incidentId]);

    for (const alert of res.rows) {
      try {
        await NotificationService.createNotification({
          user_id: alert.recipient_user_id,
          type: 'ALERT_RESOLVED',
          title: 'Alert Resolved',
          message: 'An earlier safety alert in your neighborhood has been resolved.',
          incident_id: incidentId,
          alert_id: alert.id,
        });
      } catch (err) {
        console.warn('Non-blocking alert resolution notification warning:', err);
      }
    }

    if (res.rowCount && res.rowCount > 0) {
      AuditService.log({
        actor_user_id: null,
        action: 'ALERT_RESOLVED',
        entity_type: 'incident',
        entity_id: incidentId,
        description: `Resolved ${res.rowCount} alerts for incident ${incidentId}`,
        metadata: { incident_id: incidentId, count: res.rowCount },
      });
    }

    return res.rowCount || 0;
  }
}
