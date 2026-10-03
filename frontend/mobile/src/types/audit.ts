export type AuditAction =
  | 'USER_REGISTERED'
  | 'USER_LOGIN_SUCCESS'
  | 'USER_LOGIN_FAILED'
  | 'USER_LOGOUT'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED'
  | 'PROFILE_UPDATED'
  | 'LOCATION_UPDATED'
  | 'INCIDENT_CREATED'
  | 'INCIDENT_UPDATED'
  | 'INCIDENT_CANCELLED'
  | 'INCIDENT_RESOLVED'
  | 'INCIDENT_VERIFICATION_CREATED'
  | 'INCIDENT_VERIFICATION_UPDATED'
  | 'ALERT_CREATED'
  | 'ALERT_READ'
  | 'ALERT_RESOLVED'
  | 'ALERT_EXPIRED'
  | 'SOS_CREATED'
  | 'SOS_RESOLVED'
  | 'NOTIFICATION_READ'
  | 'NOTIFICATIONS_MARKED_READ'
  | 'INCIDENT_REPORTED'
  | 'MODERATION_REVIEWED'
  | 'MODERATION_DISMISSED'
  | 'MODERATION_ACTION_TAKEN'
  | 'USER_SUSPENDED'
  | 'USER_RESTORED'
  | 'USER_ROLE_CHANGED'
  | 'ADMIN_LOGIN'
  | 'ADMIN_ACTION'
  | 'SECURITY_EVENT';

export interface AuditLogRecord {
  id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  action: AuditAction;
  entity_type: string;
  entity_id: string | null;
  description: string;
  metadata: Record<string, any>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface AuditLogsResponse {
  logs: AuditLogRecord[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface AuditLogFilters {
  actor_user_id?: string;
  action?: string;
  entity_type?: string;
  entity_id?: string;
  from_date?: string;
  to_date?: string;
}
