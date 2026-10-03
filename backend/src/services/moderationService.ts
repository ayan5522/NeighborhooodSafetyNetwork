import { query, pool } from '../db';
import { NotificationService } from './notificationService';

export const VALID_REPORT_REASONS = [
  'FALSE_INFORMATION',
  'SPAM',
  'DUPLICATE',
  'INAPPROPRIATE_CONTENT',
  'MISLEADING',
  'OTHER',
] as const;

export type ReportReason = (typeof VALID_REPORT_REASONS)[number];

export const VALID_REPORT_STATUSES = [
  'PENDING',
  'REVIEWED',
  'DISMISSED',
  'ACTION_TAKEN',
] as const;

export type ReportStatus = (typeof VALID_REPORT_STATUSES)[number];

export const VALID_MODERATION_ACTIONS = [
  'RESOLVE_INCIDENT',
  'CANCEL_INCIDENT',
  'MARK_DUPLICATE',
  'MARK_MISLEADING',
  'OTHER',
] as const;

export type ModerationAction = (typeof VALID_MODERATION_ACTIONS)[number];

export interface IncidentReportRecord {
  id: string;
  incident_id: string;
  reporter_user_id: string;
  reason: ReportReason;
  description: string | null;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface ModerationQueueItem extends IncidentReportRecord {
  incident_title: string;
  incident_category: string;
  incident_severity: string;
  incident_status: string;
  incident_created_at: string;
  incident_image_url: string | null;
  incident_report_count: number;
}

export interface ModerationDetailResponse {
  report: IncidentReportRecord;
  incident: {
    id: string;
    title: string;
    description: string;
    category: string;
    severity: string;
    status: string;
    latitude: number;
    longitude: number;
    image_url: string | null;
    created_at: string;
  };
  verification: {
    confirmations: number;
    disputes: number;
  };
  active_alerts_count: number;
}

export class ModerationService {
  /**
   * Submit an incident report (Community Flag).
   * Validates reason, prevents self-reporting and duplicate flags.
   */
  static async reportIncident(
    reporterUserId: string,
    incidentId: string,
    reason: string,
    description?: string
  ): Promise<IncidentReportRecord> {
    if (!VALID_REPORT_REASONS.includes(reason as ReportReason)) {
      const err: any = new Error(
        `Invalid report reason. Must be one of: ${VALID_REPORT_REASONS.join(', ')}`
      );
      err.statusCode = 400;
      throw err;
    }

    // Check incident existence and reporter
    const incRes = await query<{ id: string; reporter_id: string; title: string }>(
      'SELECT id, reporter_id, title FROM incidents WHERE id = $1',
      [incidentId]
    );

    if (incRes.rows.length === 0) {
      const err: any = new Error('Incident not found');
      err.statusCode = 404;
      throw err;
    }

    const incident = incRes.rows[0];

    // Self-reporting restriction: Original reporter cannot report their own incident
    if (incident.reporter_id === reporterUserId) {
      const err: any = new Error('Incident reporters cannot flag their own incidents');
      err.statusCode = 403;
      throw err;
    }

    // Duplicate report prevention
    const existingRes = await query(
      'SELECT id FROM incident_reports WHERE incident_id = $1 AND reporter_user_id = $2',
      [incidentId, reporterUserId]
    );

    if (existingRes.rows.length > 0) {
      const err: any = new Error(
        'You have already submitted a moderation report for this incident'
      );
      err.statusCode = 409;
      throw err;
    }

    const trimmedDesc = description && description.trim().length > 0
      ? description.trim().substring(0, 1000)
      : null;

    const insertRes = await query<IncidentReportRecord>(
      `INSERT INTO incident_reports (
        incident_id,
        reporter_user_id,
        reason,
        description,
        status
      ) VALUES ($1, $2, $3, $4, 'PENDING')
      RETURNING *`,
      [incidentId, reporterUserId, reason, trimmedDesc]
    );

    return insertRes.rows[0];
  }

  /**
   * Fetch paginated reports for Moderation Queue (MODERATOR & ADMIN).
   * Default sorting: PENDING reports first, then newest.
   */
  static async getModerationReports(options: {
    status?: string;
    reason?: string;
    page: number;
    limit: number;
  }): Promise<{ reports: ModerationQueueItem[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (options.status) {
      conditions.push(`ir.status = $${paramIdx++}`);
      params.push(options.status);
    }

    if (options.reason) {
      conditions.push(`ir.reason = $${paramIdx++}`);
      params.push(options.reason);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count query
    const countRes = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM incident_reports ir ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    // Data query (safe joins, does NOT expose reporter personal info)
    const dataQuery = `
      SELECT 
        ir.id,
        ir.incident_id,
        ir.reporter_user_id,
        ir.reason,
        ir.description,
        ir.status,
        ir.created_at,
        ir.updated_at,
        ir.reviewed_by,
        ir.reviewed_at,
        inc.title as incident_title,
        inc.category as incident_category,
        inc.severity as incident_severity,
        inc.status as incident_status,
        inc.created_at as incident_created_at,
        inc.image_url as incident_image_url,
        (
          SELECT COUNT(*)::int 
          FROM incident_reports r2 
          WHERE r2.incident_id = ir.incident_id
        ) as incident_report_count
      FROM incident_reports ir
      JOIN incidents inc ON ir.incident_id = inc.id
      ${whereClause}
      ORDER BY 
        CASE WHEN ir.status = 'PENDING' THEN 0 ELSE 1 END,
        ir.created_at DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `;
    params.push(limit, offset);

    const reportRes = await query<ModerationQueueItem>(dataQuery, params);

    return {
      reports: reportRes.rows,
      total,
      page,
      limit,
    };
  }

  /**
   * Fetch single report detail along with incident metadata and verification counts.
   */
  static async getModerationReportById(reportId: string): Promise<ModerationDetailResponse> {
    const reportRes = await query<IncidentReportRecord>(
      'SELECT * FROM incident_reports WHERE id = $1',
      [reportId]
    );

    if (reportRes.rows.length === 0) {
      const err: any = new Error('Moderation report not found');
      err.statusCode = 404;
      throw err;
    }

    const report = reportRes.rows[0];

    // Fetch incident details
    const incRes = await query(
      `SELECT id, title, description, category, severity, status, latitude, longitude, image_url, created_at
       FROM incidents
       WHERE id = $1`,
      [report.incident_id]
    );

    if (incRes.rows.length === 0) {
      const err: any = new Error('Associated incident not found');
      err.statusCode = 404;
      throw err;
    }

    const incident = incRes.rows[0];

    // Fetch verification counts
    const verifRes = await query<{ verification_type: string; count: string }>(
      `SELECT verification_type, COUNT(*)::text as count
       FROM incident_verifications
       WHERE incident_id = $1
       GROUP BY verification_type`,
      [report.incident_id]
    );

    let confirmations = 0;
    let disputes = 0;
    verifRes.rows.forEach((r) => {
      const cnt = parseInt(r.count, 10);
      if (r.verification_type === 'CONFIRM') confirmations = cnt;
      else if (r.verification_type === 'DISPUTE') disputes = cnt;
    });

    // Fetch active alerts count for this incident
    const alertRes = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count
       FROM alerts
       WHERE incident_id = $1 AND status = 'ACTIVE' AND expires_at > CURRENT_TIMESTAMP`,
      [report.incident_id]
    );
    const activeAlertsCount = parseInt(alertRes.rows[0]?.count || '0', 10);

    return {
      report,
      incident,
      verification: {
        confirmations,
        disputes,
      },
      active_alerts_count: activeAlertsCount,
    };
  }

  /**
   * Mark report as REVIEWED.
   */
  static async reviewReport(
    moderatorId: string,
    reportId: string
  ): Promise<IncidentReportRecord> {
    const res = await query<IncidentReportRecord>(
      `UPDATE incident_reports
       SET status = 'REVIEWED', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [moderatorId, reportId]
    );

    if (res.rows.length === 0) {
      const err: any = new Error('Moderation report not found');
      err.statusCode = 404;
      throw err;
    }

    return res.rows[0];
  }

  /**
   * Mark report as DISMISSED.
   */
  static async dismissReport(
    moderatorId: string,
    reportId: string
  ): Promise<IncidentReportRecord> {
    const res = await query<IncidentReportRecord>(
      `UPDATE incident_reports
       SET status = 'DISMISSED', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [moderatorId, reportId]
    );

    if (res.rows.length === 0) {
      const err: any = new Error('Moderation report not found');
      err.statusCode = 404;
      throw err;
    }

    return res.rows[0];
  }

  /**
   * Take moderation action on report and incident atomically.
   */
  static async takeModerationAction(
    moderatorId: string,
    reportId: string,
    action: string,
    notes?: string
  ): Promise<{ report: IncidentReportRecord; action: string }> {
    if (!VALID_MODERATION_ACTIONS.includes(action as ModerationAction)) {
      const err: any = new Error(
        `Invalid moderation action. Must be one of: ${VALID_MODERATION_ACTIONS.join(', ')}`
      );
      err.statusCode = 400;
      throw err;
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Fetch report
      const repRes = await client.query<IncidentReportRecord>(
        'SELECT * FROM incident_reports WHERE id = $1 FOR UPDATE',
        [reportId]
      );

      if (repRes.rows.length === 0) {
        const err: any = new Error('Moderation report not found');
        err.statusCode = 404;
        throw err;
      }

      const report = repRes.rows[0];

      // Fetch incident
      const incRes = await client.query<{ id: string; reporter_id: string; title: string }>(
        'SELECT id, reporter_id, title FROM incidents WHERE id = $1 FOR UPDATE',
        [report.incident_id]
      );

      if (incRes.rows.length === 0) {
        const err: any = new Error('Associated incident not found');
        err.statusCode = 404;
        throw err;
      }

      const incident = incRes.rows[0];

      // Apply incident updates based on action
      if (action === 'RESOLVE_INCIDENT') {
        await client.query(
          `UPDATE incidents
           SET status = 'RESOLVED', updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [incident.id]
        );

        // Resolve active alerts
        await client.query(
          `UPDATE alerts
           SET status = 'RESOLVED'
           WHERE incident_id = $1 AND status = 'ACTIVE'`,
          [incident.id]
        );
      } else if (action === 'CANCEL_INCIDENT') {
        await client.query(
          `UPDATE incidents
           SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [incident.id]
        );

        // Resolve active alerts
        await client.query(
          `UPDATE alerts
           SET status = 'RESOLVED'
           WHERE incident_id = $1 AND status = 'ACTIVE'`,
          [incident.id]
        );
      }

      // Update report status to ACTION_TAKEN
      const updatedReportRes = await client.query<IncidentReportRecord>(
        `UPDATE incident_reports
         SET status = 'ACTION_TAKEN',
             reviewed_by = $1,
             reviewed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [moderatorId, reportId]
      );

      await client.query('COMMIT');

      // Notify incident reporter (without disclosing moderator identity)
      await NotificationService.createNotification({
        user_id: incident.reporter_id,
        type: 'SYSTEM',
        title: 'Incident Moderation Notice',
        message: `Your incident "${incident.title}" has been reviewed by the moderation team (Action: ${action.replace('_', ' ')}).`,
        incident_id: incident.id,
      });

      return {
        report: updatedReportRes.rows[0],
        action,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
