import { query } from '../db';
import { LocationService } from './locationService';

export interface SOSEvent {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  status: 'ACTIVE' | 'RESOLVED';
  created_at: string;
  resolved_at: string | null;
}

export class SOSService {
  /**
   * Trigger personal SOS event with location validation.
   * If user already has an ACTIVE SOS event, returns the existing active SOS (Requirement 43).
   */
  public static async createSOS(
    userId: string,
    latitude: number,
    longitude: number
  ): Promise<{ sos: SOSEvent; isExisting: boolean }> {
    const validation = LocationService.validateCoordinates(latitude, longitude);
    if (!validation.valid) {
      throw new Error(validation.message || 'Invalid coordinates for SOS');
    }

    // Check for existing ACTIVE SOS
    const existingCheck = await query(
      `SELECT id, user_id, latitude, longitude, status, created_at, resolved_at
       FROM sos_events
       WHERE user_id = $1 AND status = 'ACTIVE'
       LIMIT 1`,
      [userId]
    );

    if (existingCheck.rows.length > 0) {
      const row = existingCheck.rows[0];
      return {
        sos: {
          id: row.id,
          user_id: row.user_id,
          latitude: parseFloat(row.latitude),
          longitude: parseFloat(row.longitude),
          status: row.status,
          created_at: row.created_at,
          resolved_at: row.resolved_at,
        },
        isExisting: true,
      };
    }

    // Insert new SOS
    const sql = `
      INSERT INTO sos_events (user_id, latitude, longitude, location, status)
      VALUES (
        $1,
        $2,
        $3,
        ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography,
        'ACTIVE'
      )
      RETURNING id, user_id, latitude, longitude, status, created_at, resolved_at;
    `;

    const res = await query(sql, [userId, latitude, longitude]);
    const row = res.rows[0];

    return {
      sos: {
        id: row.id,
        user_id: row.user_id,
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude),
        status: row.status,
        created_at: row.created_at,
        resolved_at: row.resolved_at,
      },
      isExisting: false,
    };
  }

  /**
   * Retrieve user's own SOS events
   */
  public static async getMySOS(userId: string): Promise<SOSEvent[]> {
    const sql = `
      SELECT id, user_id, latitude, longitude, status, created_at, resolved_at
      FROM sos_events
      WHERE user_id = $1
      ORDER BY created_at DESC;
    `;

    const res = await query(sql, [userId]);
    return res.rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      latitude: parseFloat(row.latitude),
      longitude: parseFloat(row.longitude),
      status: row.status,
      created_at: row.created_at,
      resolved_at: row.resolved_at,
    }));
  }

  /**
   * Resolve an active SOS event with IDOR protection
   */
  public static async resolveSOS(
    sosId: string,
    userId: string
  ): Promise<SOSEvent | 'FORBIDDEN' | 'NOT_FOUND'> {
    const checkRes = await query(
      `SELECT user_id, status FROM sos_events WHERE id = $1`,
      [sosId]
    );

    if (checkRes.rows.length === 0) {
      return 'NOT_FOUND';
    }

    if (checkRes.rows[0].user_id !== userId) {
      return 'FORBIDDEN';
    }

    if (checkRes.rows[0].status === 'RESOLVED') {
      const getRes = await query(
        `SELECT id, user_id, latitude, longitude, status, created_at, resolved_at FROM sos_events WHERE id = $1`,
        [sosId]
      );
      const row = getRes.rows[0];
      return {
        id: row.id,
        user_id: row.user_id,
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude),
        status: row.status,
        created_at: row.created_at,
        resolved_at: row.resolved_at,
      };
    }

    const sql = `
      UPDATE sos_events
      SET status = 'RESOLVED',
          resolved_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, user_id, latitude, longitude, status, created_at, resolved_at;
    `;

    const res = await query(sql, [sosId]);
    const row = res.rows[0];

    return {
      id: row.id,
      user_id: row.user_id,
      latitude: parseFloat(row.latitude),
      longitude: parseFloat(row.longitude),
      status: row.status,
      created_at: row.created_at,
      resolved_at: row.resolved_at,
    };
  }
}
