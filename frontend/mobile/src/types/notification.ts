export type NotificationType =
  | 'INCIDENT_NEARBY'
  | 'ALERT_CREATED'
  | 'ALERT_UPDATED'
  | 'ALERT_RESOLVED'
  | 'SOS_NOTIFICATION'
  | 'COMMUNITY_VERIFICATION'
  | 'SYSTEM';

export interface NotificationRecord {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, any>;
  alert_id?: string | null;
  incident_id?: string | null;
  is_read: boolean;
  read_at?: string | null;
  created_at: string;
}

export interface NotificationsResponse {
  notifications: NotificationRecord[];
  total: number;
  page: number;
  limit: number;
  unread_count: number;
}
