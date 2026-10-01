import { query } from '../db';
import { config } from '../config';

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
}

export interface NearbyUserResult {
  distance_meters: number;
}

export interface NearbyQueryResponse {
  nearby_user_count: number;
  radius_meters: number;
  nearby_users: NearbyUserResult[];
}

export interface NeighborhoodResult {
  neighborhood: string | null;
  latitude: number;
  longitude: number;
  note?: string;
}

export class LocationService {
  /**
   * Validate coordinate bounds and finite numbers
   */
  public static validateCoordinates(
    latitude: any,
    longitude: any,
    accuracy?: any
  ): { valid: boolean; message?: string } {
    if (
      latitude === undefined ||
      latitude === null ||
      typeof latitude !== 'number' ||
      isNaN(latitude) ||
      !isFinite(latitude)
    ) {
      return { valid: false, message: 'Invalid latitude: must be a valid number' };
    }

    if (latitude < -90 || latitude > 90) {
      return { valid: false, message: 'Latitude must be between -90 and 90 degrees' };
    }

    if (
      longitude === undefined ||
      longitude === null ||
      typeof longitude !== 'number' ||
      isNaN(longitude) ||
      !isFinite(longitude)
    ) {
      return { valid: false, message: 'Invalid longitude: must be a valid number' };
    }

    if (longitude < -180 || longitude > 180) {
      return { valid: false, message: 'Longitude must be between -180 and 180 degrees' };
    }

    if (accuracy !== undefined && accuracy !== null) {
      if (typeof accuracy !== 'number' || isNaN(accuracy) || accuracy < 0) {
        return { valid: false, message: 'Accuracy must be a non-negative number' };
      }
    }

    return { valid: true };
  }

  /**
   * Validate radius limits
   */
  public static validateRadius(radius: any): { valid: boolean; radius: number; message?: string } {
    const min = config.location.minRadiusMeters;
    const max = config.location.maxRadiusMeters;

    if (radius === undefined || radius === null) {
      return { valid: true, radius: 1000 }; // default 1 km
    }

    const parsed = typeof radius === 'number' ? radius : parseFloat(radius);

    if (isNaN(parsed) || !isFinite(parsed)) {
      return { valid: false, radius: 0, message: 'Radius must be a valid number' };
    }

    if (parsed < min || parsed > max) {
      return {
        valid: false,
        radius: parsed,
        message: `Radius must be between ${min} and ${max} meters`,
      };
    }

    return { valid: true, radius: parsed };
  }

  /**
   * UPSERT single latest usable location for user
   */
  public static async upsertUserLocation(
    userId: string,
    latitude: number,
    longitude: number,
    accuracy: number | null = null
  ): Promise<{ updated: boolean; updated_at: string }> {
    const validation = this.validateCoordinates(latitude, longitude, accuracy);
    if (!validation.valid) {
      throw new Error(validation.message);
    }

    const sql = `
      INSERT INTO user_locations (user_id, location, latitude, longitude, accuracy, updated_at)
      VALUES (
        $1,
        ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
        $3,
        $2,
        $4,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (user_id) DO UPDATE
      SET location = EXCLUDED.location,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          accuracy = EXCLUDED.accuracy,
          updated_at = CURRENT_TIMESTAMP
      RETURNING updated_at;
    `;

    // Note: ST_MakePoint takes (longitude, latitude)
    const res = await query(sql, [userId, longitude, latitude, accuracy]);
    return {
      updated: true,
      updated_at: res.rows[0].updated_at.toISOString(),
    };
  }

  /**
   * Retrieve authenticated user's OWN location
   */
  public static async getUserLocation(
    userId: string
  ): Promise<{ latitude: number; longitude: number; accuracy: number | null; updated_at: string } | null> {
    const res = await query(
      `SELECT latitude, longitude, accuracy, updated_at
       FROM user_locations
       WHERE user_id = $1`,
      [userId]
    );

    if (res.rows.length === 0) {
      return null;
    }

    const row = res.rows[0];
    return {
      latitude: row.latitude,
      longitude: row.longitude,
      accuracy: row.accuracy,
      updated_at: row.updated_at.toISOString(),
    };
  }

  /**
   * PostGIS geospatial radius search for nearby users.
   * STRICT PRIVACY: NEVER returns other users' exact coordinates, full names, or private IDs!
   */
  public static async findNearbyUsers(
    callerUserId: string,
    radiusMeters: number,
    maxAgeMinutes: number = config.location.maxAgeMinutes
  ): Promise<NearbyQueryResponse> {
    // 1. Get caller's location first
    const callerLocation = await this.getUserLocation(callerUserId);
    if (!callerLocation) {
      return {
        nearby_user_count: 0,
        radius_meters: radiusMeters,
        nearby_users: [],
      };
    }

    // 2. Query other users within radius using PostGIS ST_DWithin and ST_Distance
    const sql = `
      SELECT
        ROUND(ST_Distance(
          location,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
        )) AS distance_meters
      FROM user_locations
      WHERE user_id != $3
        AND updated_at >= NOW() - ($4 || ' minutes')::interval
        AND ST_DWithin(
          location,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          $5
        )
      ORDER BY distance_meters ASC;
    `;

    const res = await query(sql, [
      callerLocation.longitude,
      callerLocation.latitude,
      callerUserId,
      maxAgeMinutes,
      radiusMeters,
    ]);

    const nearbyUsers: NearbyUserResult[] = res.rows.map((row) => ({
      distance_meters: parseInt(row.distance_meters, 10),
    }));

    return {
      nearby_user_count: nearbyUsers.length,
      radius_meters: radiusMeters,
      nearby_users: nearbyUsers,
    };
  }

  /**
   * Determine neighborhood for authenticated user
   */
  public static async getNeighborhood(userId: string): Promise<NeighborhoodResult | null> {
    const callerLocation = await this.getUserLocation(userId);
    if (!callerLocation) {
      return null;
    }

    // Check if within any defined neighborhood polygon
    const res = await query(
      `SELECT name
       FROM neighborhoods
       WHERE ST_Intersects(
         boundary,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
       )
       LIMIT 1`,
      [callerLocation.longitude, callerLocation.latitude]
    );

    const name = res.rows.length > 0 ? res.rows[0].name : null;

    return {
      neighborhood: name,
      latitude: callerLocation.latitude,
      longitude: callerLocation.longitude,
      note: name ? undefined : 'No registered neighborhood boundary in database for this point',
    };
  }
}
