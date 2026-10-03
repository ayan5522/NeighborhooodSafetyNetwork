export type UserRole = 'RESIDENT' | 'MODERATOR' | 'ADMIN';
export type AccountStatus = 'ACTIVE' | 'SUSPENDED';

export type ReportReason =
  | 'FALSE_INFORMATION'
  | 'SPAM'
  | 'DUPLICATE'
  | 'INAPPROPRIATE_CONTENT'
  | 'MISLEADING'
  | 'OTHER';

export type ReportStatus = 'PENDING' | 'REVIEWED' | 'DISMISSED' | 'ACTION_TAKEN';

export type ModerationAction =
  | 'RESOLVE_INCIDENT'
  | 'CANCEL_INCIDENT'
  | 'MARK_DUPLICATE'
  | 'MARK_MISLEADING'
  | 'OTHER';

export interface DashboardStats {
  users?: {
    total: number;
    active: number;
    suspended: number;
  };
  incidents: {
    total: number;
    pending: number;
    active: number;
    resolved: number;
    cancelled: number;
  };
  alerts: {
    active: number;
  };
  verification: {
    confirmations: number;
    disputes: number;
  };
  reports: {
    pending: number;
    reviewed: number;
    dismissed: number;
    action_taken: number;
  };
}

export interface UserSummary {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  account_status: AccountStatus;
  created_at: string;
  updated_at: string;
}

export interface IncidentReportRecord {
  id: string;
  incident_id: string;
  reporter_user_id: string;
  reason: ReportReason;
  description: string | null;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface ModerationQueueItem extends IncidentReportRecord {
  incident_title: string;
  incident_category: string;
  incident_severity: string;
  incident_status: string;
  incident_created_at: string;
  incident_image_url: string | null;
  incident_report_count: number;
}

export interface ModerationDetailResponse {
  report: IncidentReportRecord;
  incident: {
    id: string;
    title: string;
    description: string;
    category: string;
    severity: string;
    status: string;
    latitude: number;
    longitude: number;
    image_url: string | null;
    created_at: string;
  };
  verification: {
    confirmations: number;
    disputes: number;
  };
  active_alerts_count: number;
}
