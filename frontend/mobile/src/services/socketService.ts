import { io, Socket } from 'socket.io-client';
import { Platform } from 'react-native';
import { NotificationRecord } from '../types/notification';

const getSocketUrl = (): string => {
  if (Platform.OS === 'web') {
    return 'http://localhost:5000';
  }
  return 'http://10.53.10.252:5000';
};

type NotificationCallback = (notification: NotificationRecord) => void;
type ConnectionStatusCallback = (connected: boolean) => void;

class SocketService {
  private socket: Socket | null = null;
  private notificationListeners: Set<NotificationCallback> = new Set();
  private statusListeners: Set<ConnectionStatusCallback> = new Set();
  private currentToken: string | null = null;

  public connect(token: string): void {
    if (this.socket && this.currentToken === token && this.socket.connected) {
      return;
    }

    if (this.socket) {
      this.disconnect();
    }

    this.currentToken = token;
    const socketUrl = getSocketUrl();

    this.socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    this.socket.on('connect', () => {
      this.notifyStatusListeners(true);
    });

    this.socket.on('disconnect', () => {
      this.notifyStatusListeners(false);
    });

    this.socket.on('connect_error', () => {
      this.notifyStatusListeners(false);
    });

    this.socket.on('notification:new', (notification: NotificationRecord) => {
      this.notificationListeners.forEach((listener) => {
        try {
          listener(notification);
        } catch (e) {
          console.error('[SocketService] Error in notification listener:', e);
        }
      });
    });
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.currentToken = null;
    this.notifyStatusListeners(false);
  }

  public isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  public onNotification(callback: NotificationCallback): () => void {
    this.notificationListeners.add(callback);
    return () => {
      this.notificationListeners.delete(callback);
    };
  }

  public onConnectionChange(callback: ConnectionStatusCallback): () => void {
    this.statusListeners.add(callback);
    callback(this.isConnected());
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  private notifyStatusListeners(status: boolean): void {
    this.statusListeners.forEach((listener) => {
      try {
        listener(status);
      } catch (e) {
        console.error('[SocketService] Error in status listener:', e);
      }
    });
  }
}

export const socketService = new SocketService();
