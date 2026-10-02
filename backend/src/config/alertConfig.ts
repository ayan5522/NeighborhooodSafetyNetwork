import { IncidentSeverity } from '../services/incidentService';

export type AlertPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type AlertStatus = 'ACTIVE' | 'RESOLVED' | 'EXPIRED';

export interface AlertSeverityConfig {
  radiusMeters: number;
  priority: AlertPriority;
  expiryHours: number;
}

/**
 * Centralized Alert Priority & Radius Rules
 * Defines radius, priority mapping, and expiration hours per incident severity.
 */
export const ALERT_PRIORITY_RULES: Record<IncidentSeverity, AlertSeverityConfig> = {
  LOW: {
    radiusMeters: 1000,
    priority: 'LOW',
    expiryHours: 6,
  },
  MEDIUM: {
    radiusMeters: 2000,
    priority: 'NORMAL',
    expiryHours: 6,
  },
  HIGH: {
    radiusMeters: 3000,
    priority: 'HIGH',
    expiryHours: 3,
  },
  CRITICAL: {
    radiusMeters: 5000,
    priority: 'URGENT',
    expiryHours: 1,
  },
};
