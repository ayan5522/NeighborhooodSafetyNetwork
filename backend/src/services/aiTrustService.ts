import path from 'path';
import { spawn } from 'child_process';
import { query } from '../db';

export interface AITrustAssessment {
  id?: string;
  incident_id: string;
  trust_score: number | null;
  confidence_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNAVAILABLE';
  trust_category: 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH' | null;
  model_version: string;
  feature_version: string;
  explanation: string[];
  raw_probability?: number | null;
  features_snapshot?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export class AITrustService {
  private static pythonScriptPath = path.resolve(__dirname, '../../../ai/services/predict.py');

  /**
   * Extract real structured features from PostgreSQL for a given incident.
   */
  public static async extractFeatures(incidentId: string): Promise<Record<string, any> | null> {
    // 1. Fetch incident record
    const incSql = `
      SELECT
        id,
        reporter_id,
        category,
        severity,
        latitude,
        longitude,
        created_at
      FROM incidents
      WHERE id = $1;
    `;
    const incRes = await query(incSql, [incidentId]);
    if (incRes.rows.length === 0) {
      return null;
    }
    const incident = incRes.rows[0];

    // 2. Fetch community verification counts
    const verSql = `
      SELECT
        COUNT(*) FILTER (WHERE verification_type = 'CONFIRM')::int AS confirm_count,
        COUNT(*) FILTER (WHERE verification_type = 'DISPUTE')::int AS dispute_count
      FROM incident_verifications
      WHERE incident_id = $1;
    `;
    const verRes = await query(verSql, [incidentId]);
    const confirmCount = verRes.rows[0]?.confirm_count || 0;
    const disputeCount = verRes.rows[0]?.dispute_count || 0;
    const totalVotes = confirmCount + disputeCount;
    const confirmationRatio = totalVotes > 0 ? Number((confirmCount / totalVotes).toFixed(3)) : 0.50;

    // 3. Incident age in hours
    const ageHours = Math.max(
      0.1,
      Number(((Date.now() - new Date(incident.created_at).getTime()) / (1000 * 3600)).toFixed(2))
    );

    // 4. Similar incidents within 2km and 24 hours (PostGIS)
    const simSql = `
      SELECT COUNT(*)::int AS count
      FROM incidents
      WHERE category = $1
        AND id != $2
        AND created_at >= NOW() - INTERVAL '24 hours'
        AND ST_DWithin(
          location,
          ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
          2000
        );
    `;
    const simRes = await query(simSql, [
      incident.category,
      incident.id,
      incident.longitude,
      incident.latitude,
    ]);
    const similarIncidentCount = simRes.rows[0]?.count || 0;

    // 5. Reporter previous history
    const repSql = `
      SELECT
        COUNT(*)::int AS total_reports,
        COUNT(*) FILTER (WHERE status = 'ACTIVE' OR status = 'RESOLVED')::int AS confirmed_reports,
        COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS disputed_reports
      FROM incidents
      WHERE reporter_id = $1 AND id != $2;
    `;
    const repRes = await query(repSql, [incident.reporter_id, incident.id]);
    const prevReports = repRes.rows[0]?.total_reports || 0;
    const prevConfirmed = repRes.rows[0]?.confirmed_reports || 0;
    const prevDisputed = repRes.rows[0]?.disputed_reports || 0;

    // Neutral baseline 0.50 for new reporters
    const reporterReliability =
      prevReports === 0
        ? 0.50
        : Number(((prevConfirmed + 1) / (prevReports + 2)).toFixed(3));

    // 6. Moderation history for author of incident
    const modSql = `
      SELECT
        COUNT(*) FILTER (WHERE ir.status = 'ACTION_TAKEN')::int AS actions_taken,
        COUNT(*) FILTER (WHERE ir.status = 'DISMISSED')::int AS dismissed
      FROM incident_reports ir
      JOIN incidents i ON ir.incident_id = i.id
      WHERE i.reporter_id = $1;
    `;
    const modRes = await query(modSql, [incident.reporter_id]);
    const actionsTaken = modRes.rows[0]?.actions_taken || 0;
    let moderationHistory = 0.0;
    if (actionsTaken > 0) {
      moderationHistory = Math.max(-1.0, -0.4 * actionsTaken);
    } else if (prevReports >= 2) {
      moderationHistory = 0.3;
    }

    // 7. Nearby incident consistency (density / corroboration within 5km)
    const nearSql = `
      SELECT COUNT(*)::int AS count
      FROM incidents
      WHERE id != $1
        AND ST_DWithin(
          location,
          ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
          5000
        )
        AND created_at >= NOW() - INTERVAL '48 hours';
    `;
    const nearRes = await query(nearSql, [
      incident.id,
      incident.longitude,
      incident.latitude,
    ]);
    const nearbyCount = nearRes.rows[0]?.count || 0;
    let nearbyConsistency = 0.50;
    if (nearbyCount >= 4) {
      nearbyConsistency = 0.85;
    } else if (nearbyCount >= 1) {
      nearbyConsistency = 0.65;
    } else {
      nearbyConsistency = 0.45;
    }

    return {
      category: incident.category,
      severity: incident.severity,
      confirmation_count: confirmCount,
      dispute_count: disputeCount,
      confirmation_ratio: confirmationRatio,
      incident_age_hours: ageHours,
      similar_incident_count: similarIncidentCount,
      reporter_previous_reports: prevReports,
      reporter_previous_confirmed_reports: prevConfirmed,
      reporter_previous_disputed_reports: prevDisputed,
      reporter_reliability: reporterReliability,
      nearby_incident_consistency: nearbyConsistency,
      moderation_history: moderationHistory,
    };
  }

  /**
   * Execute Python prediction service via stdin/stdout with timeout safety.
   */
  public static async executePythonPrediction(
    features: Record<string, any>,
    timeoutMs: number = 4000
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python', [this.pythonScriptPath, '--stdin'], {
        windowsHide: true,
      });

      let stdoutData = '';
      let stderrData = '';
      let isTimedOut = false;

      const timer = setTimeout(() => {
        isTimedOut = true;
        pythonProcess.kill();
        reject(new Error(`Python AI process timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      pythonProcess.stdout.on('data', (chunk) => {
        stdoutData += chunk.toString();
      });

      pythonProcess.stderr.on('data', (chunk) => {
        stderrData += chunk.toString();
      });

      pythonProcess.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      pythonProcess.on('close', (code) => {
        clearTimeout(timer);
        if (isTimedOut) return;

        if (code !== 0) {
          reject(new Error(`Python process exited with code ${code}: ${stderrData || stdoutData}`));
          return;
        }

        try {
          const parsed = JSON.parse(stdoutData);
          if (!parsed.success) {
            reject(new Error(parsed.error || 'AI prediction failed'));
            return;
          }
          resolve(parsed.data);
        } catch (err: any) {
          reject(new Error(`Failed to parse AI output: ${err.message}`));
        }
      });

      // Write feature payload to stdin
      pythonProcess.stdin.write(JSON.stringify(features));
      pythonProcess.stdin.end();
    });
  }

  /**
   * Evaluate an incident's trust score.
   * If Python service is unavailable, returns a safe fallback without breaking application flow.
   */
  public static async evaluateIncident(
    incidentId: string,
    forceRefresh: boolean = false
  ): Promise<AITrustAssessment> {
    // 1. Check existing cached assessment if not forced refresh
    if (!forceRefresh) {
      const cachedSql = `
        SELECT
          id,
          incident_id,
          trust_score,
          confidence_level,
          trust_category,
          model_version,
          feature_version,
          explanation,
          raw_probability,
          created_at,
          updated_at
        FROM incident_ai_assessments
        WHERE incident_id = $1
        ORDER BY created_at DESC
        LIMIT 1;
      `;
      const cachedRes = await query(cachedSql, [incidentId]);
      if (cachedRes.rows.length > 0) {
        const row = cachedRes.rows[0];
        // Cache valid for 10 minutes unless forced
        const ageMs = Date.now() - new Date(row.updated_at).getTime();
        if (ageMs < 10 * 60 * 1000) {
          return {
            id: row.id,
            incident_id: row.incident_id,
            trust_score: row.trust_score,
            confidence_level: row.confidence_level,
            trust_category: row.trust_category,
            model_version: row.model_version,
            feature_version: row.feature_version,
            explanation: row.explanation || [],
            raw_probability: row.raw_probability ? Number(row.raw_probability) : null,
            created_at: row.created_at,
            updated_at: row.updated_at,
          };
        }
      }
    }

    // 2. Extract live features
    const features = await this.extractFeatures(incidentId);
    if (!features) {
      throw new Error(`Incident not found with ID ${incidentId}`);
    }

    // 3. Invoke Python AI engine with resilient fallback
    try {
      const prediction = await this.executePythonPrediction(features);

      // 4. Persist assessment
      const insertSql = `
        INSERT INTO incident_ai_assessments (
          incident_id,
          trust_score,
          confidence_level,
          trust_category,
          model_version,
          feature_version,
          explanation,
          raw_probability,
          features_snapshot,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *;
      `;

      const savedRes = await query(insertSql, [
        incidentId,
        prediction.trust_score,
        prediction.confidence_level,
        prediction.trust_category,
        prediction.model_version,
        prediction.feature_version,
        JSON.stringify(prediction.explanation || []),
        prediction.raw_probability,
        JSON.stringify(features),
      ]);

      const saved = savedRes.rows[0];
      return {
        id: saved.id,
        incident_id: saved.incident_id,
        trust_score: saved.trust_score,
        confidence_level: saved.confidence_level,
        trust_category: saved.trust_category,
        model_version: saved.model_version,
        feature_version: saved.feature_version,
        explanation: saved.explanation || [],
        raw_probability: saved.raw_probability ? Number(saved.raw_probability) : null,
        created_at: saved.created_at,
        updated_at: saved.updated_at,
      };
    } catch (aiError: any) {
      console.warn(`[AITrustService] Prediction unavailable for incident ${incidentId}:`, aiError.message);

      // Safe, non-blocking fallback assessment
      return {
        incident_id: incidentId,
        trust_score: null,
        confidence_level: 'UNAVAILABLE',
        trust_category: null,
        model_version: 'trust-model-v1',
        feature_version: 'v1',
        explanation: ['AI reliability estimation is temporarily unavailable.'],
      };
    }
  }

  /**
   * Retrieve current assessment for an incident.
   */
  public static async getIncidentAssessment(incidentId: string): Promise<AITrustAssessment | null> {
    const sql = `
      SELECT
        id,
        incident_id,
        trust_score,
        confidence_level,
        trust_category,
        model_version,
        feature_version,
        explanation,
        raw_probability,
        created_at,
        updated_at
      FROM incident_ai_assessments
      WHERE incident_id = $1
      ORDER BY created_at DESC
      LIMIT 1;
    `;
    const res = await query(sql, [incidentId]);
    if (res.rows.length === 0) {
      return null;
    }
    const row = res.rows[0];
    return {
      id: row.id,
      incident_id: row.incident_id,
      trust_score: row.trust_score,
      confidence_level: row.confidence_level,
      trust_category: row.trust_category,
      model_version: row.model_version,
      feature_version: row.feature_version,
      explanation: row.explanation || [],
      raw_probability: row.raw_probability ? Number(row.raw_probability) : null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
