import { Platform } from 'react-native';
import { ApiResponse, AuthResponse, User } from '../types/auth';

const getBaseUrl = (): string => {
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:5000/api';
  }
  return 'http://localhost:5000/api';
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
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

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
