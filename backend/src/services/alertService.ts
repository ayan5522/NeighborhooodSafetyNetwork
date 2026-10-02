import { query } from '../db';
import { config } from '../config';
import { IncidentRecord } from './incidentService';
import {
  ALERT_PRIORITY_RULES,
  AlertPriority,
  AlertStatus,
} from '../config/alertConfig';

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
      RETURNING id;
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
        AND status = 'ACTIVE';
    `;
    const res = await query(sql, [incidentId]);
    return res.rowCount || 0;
  }
}
