import { VerificationSummary } from './verification';

export type IncidentCategory =
  | 'ACCIDENT'
  | 'FIRE'
  | 'SUSPICIOUS_ACTIVITY'
  | 'ROAD_HAZARD'
  | 'FLOOD_WATERLOGGING'
  | 'MEDICAL_EMERGENCY'
  | 'INFRASTRUCTURE_ISSUE'
  | 'OTHER';

export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type IncidentStatus = 'PENDING' | 'ACTIVE' | 'RESOLVED' | 'CANCELLED';

export interface Incident {
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
  verification?: VerificationSummary;
}

export const CATEGORY_LABELS: Record<IncidentCategory, string> = {
  ACCIDENT: 'Accident',
  FIRE: 'Fire',
  SUSPICIOUS_ACTIVITY: 'Suspicious Activity',
  ROAD_HAZARD: 'Road Hazard',
  FLOOD_WATERLOGGING: 'Flood / Waterlogging',
  MEDICAL_EMERGENCY: 'Medical Emergency',
  INFRASTRUCTURE_ISSUE: 'Infrastructure Issue',
  OTHER: 'Other',
};

export const SEVERITY_COLORS: Record<IncidentSeverity, string> = {
  LOW: '#10B981',
  MEDIUM: '#F59E0B',
  HIGH: '#F97316',
  CRITICAL: '#EF4444',
};

export const STATUS_COLORS: Record<IncidentStatus, string> = {
  PENDING: '#6B7280',
  ACTIVE: '#3B82F6',
  RESOLVED: '#10B981',
  CANCELLED: '#9CA3AF',
};
