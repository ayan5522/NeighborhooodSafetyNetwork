import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { NotificationRecord } from '../types/notification';
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../api/client';
import { socketService } from '../services/socketService';

interface NotificationContextType {
  notifications: NotificationRecord[];
  unreadCount: number;
  loading: boolean;
  isSocketConnected: boolean;
  refreshNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, authenticated } = useAuth();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [isSocketConnected, setIsSocketConnected] = useState<boolean>(false);

  const loadNotifications = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await fetchNotifications(1, 30);
      if (res.success && res.data) {
        setNotifications(res.data.notifications);
        setUnreadCount(res.data.unread_count);
      }
    } catch (err) {
      console.error('[NotificationContext] Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadUnreadCount = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetchUnreadNotificationCount();
      if (res.success && res.data) {
        setUnreadCount(res.data.unread_count);
      }
    } catch (err) {
      console.error('[NotificationContext] Failed to fetch unread count:', err);
    }
  }, [token]);

  // Connect socket and register listeners on authentication
  useEffect(() => {
    if (authenticated && token) {
      socketService.connect(token);

      // Listen for socket connection status
      const unsubStatus = socketService.onConnectionChange((connected) => {
        setIsSocketConnected(connected);
        if (connected) {
          // Re-sync with REST when reconnected
          loadNotifications();
        }
      });

      // Listen for incoming real-time notifications
      const unsubNotif = socketService.onNotification((newNotification) => {
        setNotifications((prev) => {
          // Deduplicate if already present
          if (prev.some((n) => n.id === newNotification.id)) {
            return prev;
          }
          return [newNotification, ...prev];
        });
        setUnreadCount((prev) => prev + 1);
      });

      // Initial REST fetch
      loadNotifications();

      return () => {
        unsubStatus();
        unsubNotif();
        socketService.disconnect();
      };
    } else {
      socketService.disconnect();
      setNotifications([]);
      setUnreadCount(0);
      setIsSocketConnected(false);
    }
  }, [authenticated, token, loadNotifications]);

  const handleMarkAsRead = async (id: string) => {
    try {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      await markNotificationAsRead(id);
    } catch (err) {
      console.error('[NotificationContext] Failed to mark notification as read:', err);
      // Revert/refresh on failure
      loadNotifications();
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
      );
      setUnreadCount(0);

      await markAllNotificationsAsRead();
    } catch (err) {
      console.error('[NotificationContext] Failed to mark all as read:', err);
      loadNotifications();
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        isSocketConnected,
        refreshNotifications: loadNotifications,
        markAsRead: handleMarkAsRead,
        markAllAsRead: handleMarkAllAsRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
