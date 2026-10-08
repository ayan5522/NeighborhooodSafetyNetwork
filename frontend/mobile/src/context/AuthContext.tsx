import React, { createContext, useContext, useState, useEffect } from 'react';
import { storage } from '../utils/storage';
import { User } from '../types/auth';
import {
  setAuthToken,
  loginUser,
  registerUser,
  logoutUser,
  getCurrentUser,
  updateProfile as apiUpdateProfile,
} from '../api/client';

const TOKEN_KEY = 'nsn_auth_token';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  authenticated: boolean;
  login: (
    email: string,
    password: string
  ) => Promise<{ success: boolean; message?: string; unverified?: boolean; email?: string }>;
  register: (
    full_name: string,
    email: string,
    password: string,
    confirm_password: string
  ) => Promise<{ success: boolean; message?: string; email?: string }>;
  setAuthSession: (authToken: string, loggedInUser: User) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (full_name: string) => Promise<{ success: boolean; message?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Restore session on app start
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const storedToken = await storage.getItem(TOKEN_KEY);
        if (storedToken) {
          setAuthToken(storedToken);
          const res = await getCurrentUser();
          if (res.success && res.data?.user) {
            setUser(res.data.user);
            setToken(storedToken);
          } else {
            // Token expired or invalid
            await storage.deleteItem(TOKEN_KEY);
            setAuthToken(null);
            setUser(null);
            setToken(null);
          }
        }
      } catch (err) {
        console.warn('Failed to restore session from storage:', err);
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await loginUser({ email, password });
    if (res.success && res.data?.token && res.data?.user) {
      const { user: loggedInUser, token: authToken } = res.data;
      await storage.setItem(TOKEN_KEY, authToken);
      setAuthToken(authToken);
      setUser(loggedInUser);
      setToken(authToken);
      return { success: true };
    }

    const isUnverified =
      (res.message && res.message.toLowerCase().includes('verify')) ||
      res.data?.email_verified === false;

    return {
      success: false,
      message: res.message || 'Login failed',
      unverified: isUnverified,
      email: res.data?.email || email.trim(),
    };
  };

  const register = async (
    full_name: string,
    email: string,
    password: string,
    confirm_password: string
  ) => {
    const res = await registerUser({
      full_name,
      email,
      password,
      confirm_password,
    });
    if (res.success) {
      return { success: true, email: res.data?.email || email.trim() };
    }
    return { success: false, message: res.message || 'Registration failed' };
  };

  const setAuthSession = async (authToken: string, loggedInUser: User) => {
    await storage.setItem(TOKEN_KEY, authToken);
    setAuthToken(authToken);
    setUser(loggedInUser);
    setToken(authToken);
  };

  const logout = async () => {
    try {
      await logoutUser();
    } catch {
      // Continue cleanup even if server unreachable
    }
    await storage.deleteItem(TOKEN_KEY);
    setAuthToken(null);
    setUser(null);
    setToken(null);
  };

  const updateUser = async (full_name: string) => {
    const res = await apiUpdateProfile(full_name);
    if (res.success && res.data?.user) {
      setUser(res.data.user);
      return { success: true };
    }
    return { success: false, message: res.message || 'Profile update failed' };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        authenticated: !!user && !!token,
        login,
        register,
        setAuthSession,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
