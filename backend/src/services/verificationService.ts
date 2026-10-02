import { query } from '../db';
import { IncidentService } from './incidentService';
import { NotificationService } from './notificationService';

export const VALID_VERIFICATION_TYPES = ['CONFIRM', 'DISPUTE'] as const;
export type VerificationType = typeof VALID_VERIFICATION_TYPES[number];

export type CommunityVerificationStatus =
  | 'UNVERIFIED'
  | 'COMMUNITY_CONFIRMED'
  | 'COMMUNITY_DISPUTED';

export interface VerificationSummary {
  incident_id: string;
  confirm_count: number;
  dispute_count: number;
  total_verifications: number;
  status: CommunityVerificationStatus;
  my_verification: VerificationType | null;
}

export type VerificationSubmissionResult =
  | { success: true; summary: VerificationSummary }
  | { success: false; code: 'NOT_FOUND' | 'FORBIDDEN_SELF_VERIFY' | 'INCIDENT_CLOSED' | 'INVALID_TYPE'; message: string };

export class VerificationService {
  /**
   * Dynamically calculate verification status based on aggregate counts.
   * - 0 / 0 or confirm == dispute => UNVERIFIED
   * - confirm > dispute => COMMUNITY_CONFIRMED
   * - dispute > confirm => COMMUNITY_DISPUTED
   */
  public static calculateStatus(confirmCount: number, disputeCount: number): CommunityVerificationStatus {
    if (confirmCount === 0 && disputeCount === 0) {
      return 'UNVERIFIED';
    }
    if (confirmCount === disputeCount) {
      return 'UNVERIFIED';
    }
    if (confirmCount > disputeCount) {
      return 'COMMUNITY_CONFIRMED';
    }
    return 'COMMUNITY_DISPUTED';
  }

  /**
   * Retrieves aggregate verification statistics and current user's verification choice for an incident.
   * Verifier identities are strictly kept private and never exposed.
   */
  public static async getVerificationSummary(
    incidentId: string,
    currentUserId?: string
  ): Promise<VerificationSummary> {
    const countsSql = `
      SELECT
        COUNT(*) FILTER (WHERE verification_type = 'CONFIRM')::int AS confirm_count,
        COUNT(*) FILTER (WHERE verification_type = 'DISPUTE')::int AS dispute_count
      FROM incident_verifications
      WHERE incident_id = $1;
    `;

    const countsRes = await query(countsSql, [incidentId]);
    const confirmCount = countsRes.rows[0]?.confirm_count ?? 0;
    const disputeCount = countsRes.rows[0]?.dispute_count ?? 0;
    const total = confirmCount + disputeCount;

    let myVerification: VerificationType | null = null;
    if (currentUserId) {
      const mySql = `
        SELECT verification_type
        FROM incident_verifications
        WHERE incident_id = $1 AND user_id = $2;
      `;
      const myRes = await query(mySql, [incidentId, currentUserId]);
      if (myRes.rows.length > 0) {
        myVerification = myRes.rows[0].verification_type as VerificationType;
      }
    }

    const status = this.calculateStatus(confirmCount, disputeCount);

    return {
      incident_id: incidentId,
      confirm_count: confirmCount,
      dispute_count: disputeCount,
      total_verifications: total,
      status,
      my_verification: myVerification,
    };
  }

  /**
   * Submit or update a verification (CONFIRM / DISPUTE) for an incident.
   * - Enforces authentication
   * - Prevents self-verification by reporter (403)
   * - Disallows verification for closed incidents (RESOLVED or CANCELLED)
   * - Upserts record so user can change or reaffirm vote without duplicate rows
   */
  public static async submitVerification(
    incidentId: string,
    userId: string,
    verificationType: string
  ): Promise<VerificationSubmissionResult> {
    if (!verificationType || !VALID_VERIFICATION_TYPES.includes(verificationType as VerificationType)) {
      return {
        success: false,
        code: 'INVALID_TYPE',
        message: `Invalid verification type. Allowed types: ${VALID_VERIFICATION_TYPES.join(', ')}`,
      };
    }

    const incident = await IncidentService.getIncidentById(incidentId);
    if (!incident) {
      return {
        success: false,
        code: 'NOT_FOUND',
        message: 'Incident not found',
      };
    }

    // Guard: Reporter cannot verify their own report
    if (incident.reporter_id === userId) {
      return {
        success: false,
        code: 'FORBIDDEN_SELF_VERIFY',
        message: 'You cannot verify your own report',
      };
    }

    // Guard: Incident must be open for community verification
    if (incident.status === 'CANCELLED' || incident.status === 'RESOLVED') {
      return {
        success: false,
        code: 'INCIDENT_CLOSED',
        message: `Cannot verify an incident that is ${incident.status.toLowerCase()}`,
      };
    }

    // Upsert verification record
    const upsertSql = `
      INSERT INTO incident_verifications (incident_id, user_id, verification_type, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (incident_id, user_id)
      DO UPDATE SET
        verification_type = EXCLUDED.verification_type,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;

    await query(upsertSql, [incidentId, userId, verificationType]);

    // Module 06: Generate COMMUNITY_VERIFICATION notification for incident reporter (shielding verifier identity)
    try {
      const typeLabel = verificationType === 'CONFIRM' ? 'confirmation' : 'dispute';
      await NotificationService.createNotification({
        user_id: incident.reporter_id,
        type: 'COMMUNITY_VERIFICATION',
        title: 'Community Response',
        message: `Your incident report received a new community ${typeLabel}.`,
        incident_id: incidentId,
      });
    } catch (notifErr) {
      console.warn('Non-blocking verification notification warning:', notifErr);
    }

    const summary = await this.getVerificationSummary(incidentId, userId);
    return {
      success: true,
      summary,
    };
  }
}
