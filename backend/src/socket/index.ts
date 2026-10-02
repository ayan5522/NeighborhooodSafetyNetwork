import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { config } from '../config';
import { verifyJwt, TokenPayload } from '../utils/crypto';

export interface AuthenticatedSocket extends Socket {
  user?: TokenPayload;
}

let ioInstance: SocketIOServer | null = null;

export const initSocketServer = (httpServer: HttpServer): SocketIOServer => {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.cors.origin,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      credentials: true,
    },
  });

  // JWT Authentication Middleware for Socket.IO
  io.use((socket: AuthenticatedSocket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

      if (!token || typeof token !== 'string') {
        return next(new Error('Authentication error: Token required'));
      }

      const payload = verifyJwt(token);
      socket.user = payload;
      next();
    } catch (err: any) {
      return next(new Error('Authentication error: Invalid or expired token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    if (!socket.user) {
      socket.disconnect(true);
      return;
    }

    // Join isolated user room based on database user ID
    const userRoom = `user:${socket.user.user_id}`;
    socket.join(userRoom);

    socket.on('disconnect', () => {
      // Clean disconnect, no sensitive logs
    });
  });

  ioInstance = io;
  return io;
};

export const getIo = (): SocketIOServer | null => {
  return ioInstance;
};

export const setIo = (io: SocketIOServer | null): void => {
  ioInstance = io;
};

export const emitToUser = (userId: string, event: string, payload: any): boolean => {
  if (!ioInstance) {
    return false;
  }
  ioInstance.to(`user:${userId}`).emit(event, payload);
  return true;
};
