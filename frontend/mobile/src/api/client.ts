import { Platform } from 'react-native';
import { ApiResponse, AuthResponse, User } from '../types/auth';
import { Incident } from '../types/incident';
import { Alert, EmergencyContact, SOSEvent } from '../types/alert';
import { VerificationSummary, VerificationType } from '../types/verification';
import { NotificationRecord, NotificationsResponse } from '../types/notification';
import {
  DashboardStats,
  UserSummary,
  ModerationQueueItem,
  ModerationDetailResponse,
  IncidentReportRecord,
  ReportReason,
  ModerationAction,
} from '../types/admin';
import { AuditLogRecord, AuditLogsResponse, AuditLogFilters } from '../types/audit';

const getBaseUrl = (): string => {
  if (Platform.OS === 'web') {
    return 'http://localhost:5000/api';
  }
  // Laptop Wi-Fi IP for physical Android/iOS devices on same Wi-Fi network
  return 'http://10.53.10.252:5000/api';
};

const BASE_URL = getBaseUrl();

let currentToken: string | null = null;

export const setAuthToken = (token: string | null): void => {
  currentToken = token;
};

export const getAuthToken = (): string | null => currentToken;

const request = async <T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> => {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  // Only set Content-Type to JSON if body is NOT FormData
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (currentToken) {
    headers['Authorization'] = `Bearer ${currentToken}`;
  }

  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        success: false,
        message: data.message || `Request failed with status ${res.status}`,
      };
    }

    return data;
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Network connection failed. Please check backend server.',
    };
  }
};

export const registerUser = async (data: {
  full_name: string;
  email: string;
  password: string;
  confirm_password: string;
}): Promise<AuthResponse> => {
  return request<AuthResponse['data']>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const loginUser = async (data: {
  email: string;
  password: string;
}): Promise<AuthResponse> => {
  return request<AuthResponse['data']>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const logoutUser = async (): Promise<ApiResponse> => {
  return request('/auth/logout', {
    method: 'POST',
  });
};

export const getCurrentUser = async (): Promise<ApiResponse<{ user: User }>> => {
  return request<{ user: User }>('/users/me', {
    method: 'GET',
  });
};

export const updateProfile = async (
  full_name: string
): Promise<ApiResponse<{ user: User }>> => {
  return request<{ user: User }>('/users/me', {
    method: 'PATCH',
    body: JSON.stringify({ full_name }),
  });
};

export const forgotPassword = async (
  email: string
): Promise<ApiResponse<{ message: string; dev_otp?: string }>> => {
  return request<{ message: string; dev_otp?: string }>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
};

export const verifyOtp = async (
  email: string,
  otp: string
): Promise<ApiResponse<{ message: string; reset_token: string }>> => {
  return request<{ message: string; reset_token: string }>('/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ email, otp }),
  });
};

export const resetPassword = async (
  reset_token: string,
  new_password: string,
  confirm_new_password: string
): Promise<ApiResponse<{ message: string }>> => {
  return request<{ message: string }>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ reset_token, new_password, confirm_new_password }),
  });
};

// Location & Neighborhood APIs
export const updateCurrentLocation = async (data: {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
}): Promise<ApiResponse<{ updated: boolean; updated_at: string }>> => {
  return request<{ updated: boolean; updated_at: string }>('/location/update', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const fetchCurrentLocation = async (): Promise<
  ApiResponse<{
    location: {
      latitude: number;
      longitude: number;
      accuracy: number | null;
      updated_at: string;
    };
  }>
> => {
  return request('/location/current', {
    method: 'GET',
  });
};

export const fetchNearbyUsers = async (
  radius: number = 1000
): Promise<
  ApiResponse<{
    nearby_user_count: number;
    radius_meters: number;
    nearby_users: Array<{ distance_meters: number }>;
  }>
> => {
  return request(`/location/nearby?radius=${radius}`, {
    method: 'GET',
  });
};

export const fetchNeighborhood = async (): Promise<
  ApiResponse<{
    neighborhood: string | null;
    latitude: number;
    longitude: number;
    note?: string;
  }>
> => {
  return request('/location/neighborhood', {
    method: 'GET',
  });
};

// Incident Management APIs
export const getFullImageUrl = (path: string | null | undefined): string | null => {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const base = BASE_URL.replace('/api', '');
  return `${base}${path}`;
};

export const createIncident = async (
  formData: FormData
): Promise<ApiResponse<{ incident: Incident }>> => {
  return request<{ incident: Incident }>('/incidents', {
    method: 'POST',
    body: formData,
  });
};

export const fetchMyIncidents = async (): Promise<
  ApiResponse<{ incidents: Incident[] }>
> => {
  return request<{ incidents: Incident[] }>('/incidents/my', {
    method: 'GET',
  });
};

export const fetchNearbyIncidents = async (
  latitude?: number,
  longitude?: number,
  radius: number = 5000
): Promise<ApiResponse<{ incidents: Incident[]; radius_meters: number }>> => {
  let query = `?radius=${radius}`;
  if (latitude !== undefined && longitude !== undefined) {
    query += `&latitude=${latitude}&longitude=${longitude}`;
  }
  return request<{ incidents: Incident[]; radius_meters: number }>(
    `/incidents/nearby${query}`,
    {
      method: 'GET',
    }
  );
};

export const fetchIncidentById = async (
  id: string
): Promise<ApiResponse<{ incident: Incident }>> => {
  return request<{ incident: Incident }>(`/incidents/${id}`, {
    method: 'GET',
  });
};

export const updateIncident = async (
  id: string,
  data: {
    title?: string;
    description?: string;
    category?: string;
    severity?: string;
  }
): Promise<ApiResponse<{ incident: Incident }>> => {
  return request<{ incident: Incident }>(`/incidents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
};

export const cancelIncident = async (
  id: string
): Promise<ApiResponse<{ incident: Incident }>> => {
  return request<{ incident: Incident }>(`/incidents/${id}/cancel`, {
    method: 'PATCH',
  });
};

// Module 04: Emergency Alerts APIs
export const fetchUserAlerts = async (): Promise<
  ApiResponse<{ alerts: Alert[] }>
> => {
  return request<{ alerts: Alert[] }>('/alerts', {
    method: 'GET',
  });
};

export const fetchUnreadAlertCount = async (): Promise<
  ApiResponse<{ count: number }>
> => {
  return request<{ count: number }>('/alerts/unread-count', {
    method: 'GET',
  });
};

export const fetchAlertById = async (
  id: string
): Promise<ApiResponse<{ alert: Alert }>> => {
  return request<{ alert: Alert }>(`/alerts/${id}`, {
    method: 'GET',
  });
};

export const markAlertAsRead = async (
  id: string
): Promise<ApiResponse<{ alert: Alert }>> => {
  return request<{ alert: Alert }>(`/alerts/${id}/read`, {
    method: 'PATCH',
  });
};

// Module 04: Emergency Contacts APIs
export const fetchEmergencyContacts = async (): Promise<
  ApiResponse<{ contacts: EmergencyContact[] }>
> => {
  return request<{ contacts: EmergencyContact[] }>('/emergency-contacts', {
    method: 'GET',
  });
};

export const createEmergencyContact = async (data: {
  contact_name: string;
  phone_number: string;
  is_primary?: boolean;
}): Promise<ApiResponse<{ contact: EmergencyContact }>> => {
  return request<{ contact: EmergencyContact }>('/emergency-contacts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const deleteEmergencyContact = async (
  id: string
): Promise<ApiResponse<{ message: string }>> => {
  return request<{ message: string }>(`/emergency-contacts/${id}`, {
    method: 'DELETE',
  });
};

// Module 04: Personal SOS APIs
export const createSOS = async (
  latitude: number,
  longitude: number
): Promise<ApiResponse<{ sos: SOSEvent; is_existing: boolean }>> => {
  return request<{ sos: SOSEvent; is_existing: boolean }>('/sos', {
    method: 'POST',
    body: JSON.stringify({ latitude, longitude }),
  });
};

export const fetchMySOS = async (): Promise<
  ApiResponse<{ sos_events: SOSEvent[] }>
> => {
  return request<{ sos_events: SOSEvent[] }>('/sos/my', {
    method: 'GET',
  });
};

export const resolveSOS = async (
  id: string
): Promise<ApiResponse<{ sos: SOSEvent }>> => {
  return request<{ sos: SOSEvent }>(`/sos/${id}/resolve`, {
    method: 'PATCH',
  });
};

// Module 05: Community Verification APIs
export const verifyIncident = async (
  incidentId: string,
  verificationType: VerificationType
): Promise<ApiResponse<VerificationSummary>> => {
  return request<VerificationSummary>(`/incidents/${incidentId}/verify`, {
    method: 'POST',
    body: JSON.stringify({ verification_type: verificationType }),
  });
};

export const fetchIncidentVerifications = async (
  incidentId: string
): Promise<ApiResponse<VerificationSummary>> => {
  return request<VerificationSummary>(`/incidents/${incidentId}/verifications`, {
    method: 'GET',
  });
};

// Module 06: Real-Time Communication & Notifications APIs
export const fetchNotifications = async (
  page: number = 1,
  limit: number = 20
): Promise<ApiResponse<NotificationsResponse>> => {
  return request<NotificationsResponse>(`/notifications?page=${page}&limit=${limit}`, {
    method: 'GET',
  });
};

export const fetchUnreadNotificationCount = async (): Promise<
  ApiResponse<{ unread_count: number }>
> => {
  return request<{ unread_count: number }>('/notifications/unread-count', {
    method: 'GET',
  });
};

export const markNotificationAsRead = async (
  id: string
): Promise<ApiResponse<{ notification: NotificationRecord }>> => {
  return request<{ notification: NotificationRecord }>(`/notifications/${id}/read`, {
    method: 'PATCH',
  });
};

export const markAllNotificationsAsRead = async (): Promise<
  ApiResponse<{ marked_count: number }>
> => {
  return request<{ marked_count: number }>('/notifications/read-all', {
    method: 'PATCH',
  });
};

// Module 07: Admin & Moderation APIs

export const fetchAdminDashboard = async (): Promise<ApiResponse<DashboardStats>> => {
  return request<DashboardStats>('/admin/dashboard', {
    method: 'GET',
  });
};

export const fetchAdminUsers = async (
  search?: string,
  role?: string,
  status?: string,
  page: number = 1,
  limit: number = 20
): Promise<
  ApiResponse<{
    users: UserSummary[];
    total: number;
    page: number;
    limit: number;
  }>
> => {
  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (role) params.append('role', role);
  if (status) params.append('status', status);
  params.append('page', page.toString());
  params.append('limit', limit.toString());

  return request<{
    users: UserSummary[];
    total: number;
    page: number;
    limit: number;
  }>(`/admin/users?${params.toString()}`, {
    method: 'GET',
  });
};

export const suspendUser = async (
  id: string
): Promise<ApiResponse<{ user: UserSummary }>> => {
  return request<{ user: UserSummary }>(`/admin/users/${id}/suspend`, {
    method: 'PATCH',
  });
};

export const restoreUser = async (
  id: string
): Promise<ApiResponse<{ user: UserSummary }>> => {
  return request<{ user: UserSummary }>(`/admin/users/${id}/restore`, {
    method: 'PATCH',
  });
};

export const changeUserRole = async (
  id: string,
  role: string
): Promise<ApiResponse<{ user: UserSummary }>> => {
  return request<{ user: UserSummary }>(`/admin/users/${id}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
};

export const reportIncident = async (
  incidentId: string,
  reason: ReportReason,
  description?: string
): Promise<ApiResponse<{ report: IncidentReportRecord }>> => {
  return request<{ report: IncidentReportRecord }>(`/incidents/${incidentId}/report`, {
    method: 'POST',
    body: JSON.stringify({ reason, description }),
  });
};

export const fetchModerationReports = async (
  status?: string,
  reason?: string,
  page: number = 1,
  limit: number = 20
): Promise<
  ApiResponse<{
    reports: ModerationQueueItem[];
    total: number;
    page: number;
    limit: number;
  }>
> => {
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  if (reason) params.append('reason', reason);
  params.append('page', page.toString());
  params.append('limit', limit.toString());

  return request<{
    reports: ModerationQueueItem[];
    total: number;
    page: number;
    limit: number;
  }>(`/moderation/reports?${params.toString()}`, {
    method: 'GET',
  });
};

export const fetchModerationReportById = async (
  id: string
): Promise<ApiResponse<ModerationDetailResponse>> => {
  return request<ModerationDetailResponse>(`/moderation/reports/${id}`, {
    method: 'GET',
  });
};

export const reviewModerationReport = async (
  id: string
): Promise<ApiResponse<{ report: IncidentReportRecord }>> => {
  return request<{ report: IncidentReportRecord }>(`/moderation/reports/${id}/review`, {
    method: 'PATCH',
  });
};

export const dismissModerationReport = async (
  id: string
): Promise<ApiResponse<{ report: IncidentReportRecord }>> => {
  return request<{ report: IncidentReportRecord }>(`/moderation/reports/${id}/dismiss`, {
    method: 'PATCH',
  });
};

export const takeModerationAction = async (
  id: string,
  action: ModerationAction,
  notes?: string
): Promise<ApiResponse<{ report: IncidentReportRecord; action: string }>> => {
  return request<{ report: IncidentReportRecord; action: string }>(
    `/moderation/reports/${id}/action`,
    {
      method: 'PATCH',
      body: JSON.stringify({ action, notes }),
    }
  );
};

// Module 08: Audit Logging APIs (Admin Only)

export const fetchAuditLogs = async (
  filters: AuditLogFilters = {},
  page: number = 1,
  limit: number = 20
): Promise<ApiResponse<AuditLogsResponse>> => {
  const params = new URLSearchParams();
  if (filters.actor_user_id) params.append('actor_user_id', filters.actor_user_id);
  if (filters.action) params.append('action', filters.action);
  if (filters.entity_type) params.append('entity_type', filters.entity_type);
  if (filters.entity_id) params.append('entity_id', filters.entity_id);
  if (filters.from_date) params.append('from_date', filters.from_date);
  if (filters.to_date) params.append('to_date', filters.to_date);
  params.append('page', page.toString());
  params.append('limit', limit.toString());

  return request<AuditLogsResponse>(`/admin/audit-logs?${params.toString()}`, {
    method: 'GET',
  });
};

export const fetchAuditLogById = async (
  id: string
): Promise<ApiResponse<{ log: AuditLogRecord }>> => {
  return request<{ log: AuditLogRecord }>(`/admin/audit-logs/${id}`, {
    method: 'GET',
  });
};



