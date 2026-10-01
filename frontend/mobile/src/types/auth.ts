export type UserRole = 'RESIDENT' | 'MODERATOR' | 'ADMIN';
export type AccountStatus = 'ACTIVE' | 'SUSPENDED';

export interface User {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  account_status: AccountStatus;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  data?: {
    user: User;
    token: string;
  };
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
}
