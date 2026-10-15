import { query } from '../db';

export const VALID_CATEGORIES = [
  'ACCIDENT',
  'FIRE',
  'SUSPICIOUS_ACTIVITY',
  'ROAD_HAZARD',
  'FLOOD_WATERLOGGING',
  'MEDICAL_EMERGENCY',
  'INFRASTRUCTURE_ISSUE',
  'OTHER',
] as const;

export type IncidentCategory = typeof VALID_CATEGORIES[number];

export const VALID_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type IncidentSeverity = typeof VALID_SEVERITIES[number];

export const VALID_STATUSES = ['PENDING', 'ACTIVE', 'RESOLVED', 'CANCELLED'] as const;
export type IncidentStatus = typeof VALID_STATUSES[number];

export interface IncidentRecord {
  id: string;
  reporter_id: string;
  reporter_name?: string;
  category: IncidentCategory;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  latitude: number;
  longitude: number;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  distance_meters?: number;
}

export class IncidentService {
  public static validateIncidentData(data: {
    category: any;
    title: any;
    description: any;
    severity: any;
    latitude: any;
    longitude: any;
  }): { valid: boolean; message?: string } {
    const { category, title, description, severity, latitude, longitude } = data;

    if (!category || !VALID_CATEGORIES.includes(category)) {
      return {
        valid: false,
        message: `Invalid category. Allowed: ${VALID_CATEGORIES.join(', ')}`,
      };
    }

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return { valid: false, message: 'Title is required' };
    }

    if (title.trim().length > 255) {
      return { valid: false, message: 'Title cannot exceed 255 characters' };
    }

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return { valid: false, message: 'Description is required' };
    }

    if (!severity || !VALID_SEVERITIES.includes(severity)) {
      return {
        valid: false,
        message: `Invalid severity. Allowed: ${VALID_SEVERITIES.join(', ')}`,
      };
    }

    const lat = typeof latitude === 'number' ? latitude : parseFloat(latitude);
    const lng = typeof longitude === 'number' ? longitude : parseFloat(longitude);

    if (isNaN(lat) || !isFinite(lat) || lat < -90 || lat > 90) {
      return { valid: false, message: 'Latitude must be a valid number between -90 and 90' };
    }

    if (isNaN(lng) || !isFinite(lng) || lng < -180 || lng > 180) {
      return { valid: false, message: 'Longitude must be a valid number between -180 and 180' };
    }

    return { valid: true };
  }

  public static async createIncident(data: {
    reporter_id: string;
    category: IncidentCategory;
    title: string;
    description: string;
    severity: IncidentSeverity;
    latitude: number;
    longitude: number;
    image_url?: string | null;
  }): Promise<IncidentRecord> {
    const validation = this.validateIncidentData(data);
    if (!validation.valid) {
      throw new Error(validation.message);
    }

    const sql = `
      INSERT INTO incidents (
        reporter_id,
        category,
        title,
        description,
        severity,
        status,
        latitude,
        longitude,
        location,
        image_url
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        'PENDING',
        $6,
        $7,
        ST_SetSRID(ST_MakePoint($7, $6), 4326)::geography,
        $8
      )
      RETURNING
        id,
        reporter_id,
        category,
        title,
        description,
        severity,
        status,
        latitude,
        longitude,
        image_url,
        created_at,
        updated_at;
    `;

    const res = await query(sql, [
      data.reporter_id,
      data.category,
      data.title.trim(),
      data.description.trim(),
      data.severity,
      data.latitude,
      data.longitude,
      data.image_url ?? null,
    ]);

    return res.rows[0];
  }

  public static async getMyIncidents(reporterId: string): Promise<IncidentRecord[]> {
    const sql = `
      SELECT
        i.id,
        i.reporter_id,
        u.full_name AS reporter_name,
        i.category,
        i.title,
        i.description,
        i.severity,
        i.status,
        i.latitude,
        i.longitude,
        i.image_url,
        i.created_at,
        i.updated_at
      FROM incidents i
      LEFT JOIN users u ON i.reporter_id = u.id
      WHERE i.reporter_id = $1
      ORDER BY i.created_at DESC;
    `;

    const res = await query(sql, [reporterId]);
    return res.rows;
  }

  public static async getIncidentById(incidentId: string): Promise<IncidentRecord | null> {
    const sql = `
      SELECT
        i.id,
        i.reporter_id,
        u.full_name AS reporter_name,
        i.category,
        i.title,
        i.description,
        i.severity,
        i.status,
        i.latitude,
        i.longitude,
        i.image_url,
        i.created_at,
        i.updated_at
      FROM incidents i
      LEFT JOIN users u ON i.reporter_id = u.id
      WHERE i.id = $1;
    `;

    const res = await query(sql, [incidentId]);
    if (res.rows.length === 0) {
      return null;
    }
    return res.rows[0];
  }

  public static async getNearbyIncidents(
    latitude: number,
    longitude: number,
    radiusMeters: number = 5000
  ): Promise<IncidentRecord[]> {
    const sql = `
      SELECT
        i.id,
        i.reporter_id,
        u.full_name AS reporter_name,
        i.category,
        i.title,
        i.description,
        i.severity,
        i.status,
        i.latitude,
        i.longitude,
        i.image_url,
        i.created_at,
        i.updated_at,
        ROUND(ST_Distance(
          i.location,
          ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
        )) AS distance_meters
      FROM incidents i
      LEFT JOIN users u ON i.reporter_id = u.id
      WHERE i.status != 'CANCELLED'
        AND ST_DWithin(
          i.location,
          ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
          $3
        )
      ORDER BY i.created_at DESC;
    `;

    const res = await query(sql, [latitude, longitude, radiusMeters]);
    return res.rows.map((row) => ({
      ...row,
      distance_meters: row.distance_meters ? parseInt(row.distance_meters, 10) : undefined,
    }));
  }

  public static async updateIncident(
    incidentId: string,
    userId: string,
    data: {
      category?: IncidentCategory;
      title?: string;
      description?: string;
      severity?: IncidentSeverity;
    }
  ): Promise<IncidentRecord | 'FORBIDDEN' | 'NOT_FOUND' | 'ALREADY_CANCELLED'> {
    const existing = await this.getIncidentById(incidentId);
    if (!existing) {
      return 'NOT_FOUND';
    }

    if (existing.reporter_id !== userId) {
      return 'FORBIDDEN';
    }

    if (existing.status === 'CANCELLED') {
      return 'ALREADY_CANCELLED';
    }

    const newCategory = data.category || existing.category;
    const newTitle = data.title !== undefined ? data.title.trim() : existing.title;
    const newDesc = data.description !== undefined ? data.description.trim() : existing.description;
    const newSeverity = data.severity || existing.severity;

    const validation = this.validateIncidentData({
      category: newCategory,
      title: newTitle,
      description: newDesc,
      severity: newSeverity,
      latitude: existing.latitude,
      longitude: existing.longitude,
    });

    if (!validation.valid) {
      throw new Error(validation.message);
    }

    const sql = `
      UPDATE incidents
      SET category = $1,
          title = $2,
          description = $3,
          severity = $4,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING
        id,
        reporter_id,
        category,
        title,
        description,
        severity,
        status,
        latitude,
        longitude,
        image_url,
        created_at,
        updated_at;
    `;

    const res = await query(sql, [newCategory, newTitle, newDesc, newSeverity, incidentId]);
    return res.rows[0];
  }

  public static async cancelIncident(
    incidentId: string,
    userId: string,
    userRole?: string
  ): Promise<IncidentRecord | 'FORBIDDEN' | 'NOT_FOUND' | 'ALREADY_CANCELLED'> {
    const existing = await this.getIncidentById(incidentId);
    if (!existing) {
      return 'NOT_FOUND';
    }

    // Only the incident reporter or an already-authorized role (ADMIN, MODERATOR) may cancel
    if (
      existing.reporter_id !== userId &&
      userRole !== 'ADMIN' &&
      userRole !== 'MODERATOR'
    ) {
      return 'FORBIDDEN';
    }

    if (existing.status === 'CANCELLED') {
      return 'ALREADY_CANCELLED';
    }

    const sql = `
      UPDATE incidents
      SET status = 'CANCELLED',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING
        id,
        reporter_id,
        category,
        title,
        description,
        severity,
        status,
        latitude,
        longitude,
        image_url,
        created_at,
        updated_at;
    `;

    const res = await query(sql, [incidentId]);
    return res.rows[0];
  }
}
