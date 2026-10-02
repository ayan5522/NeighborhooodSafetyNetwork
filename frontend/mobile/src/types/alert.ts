export type AlertPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type AlertStatus = 'ACTIVE' | 'RESOLVED' | 'EXPIRED';

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

export interface Alert {
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

export interface EmergencyContact {
  id: string;
  user_id: string;
  contact_name: string;
  phone_number: string;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface SOSEvent {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  status: 'ACTIVE' | 'RESOLVED';
  created_at: string;
  resolved_at: string | null;
}

export const PRIORITY_COLORS: Record<AlertPriority, string> = {
  LOW: '#10B981',
  NORMAL: '#3B82F6',
  HIGH: '#F97316',
  URGENT: '#EF4444',
};

export const ALERT_STATUS_COLORS: Record<AlertStatus, string> = {
  ACTIVE: '#2563eb',
  RESOLVED: '#10b981',
  EXPIRED: '#6b7280',
};
