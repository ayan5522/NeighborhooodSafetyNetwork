import path from 'path';
import express, { Express } from 'express';
import cors from 'cors';
import { config } from './config';
import healthRoutes from './routes/healthRoutes';
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import locationRoutes from './routes/locationRoutes';
import incidentRoutes from './routes/incidentRoutes';
import alertRoutes from './routes/alertRoutes';
import emergencyContactRoutes from './routes/emergencyContactRoutes';
import sosRoutes from './routes/sosRoutes';
import notificationRoutes from './routes/notificationRoutes';
import adminRoutes from './routes/adminRoutes';
import moderationRoutes from './routes/moderationRoutes';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';

export const createApp = (): Express => {
  const app = express();

  // Middleware
  app.use(
    cors({
      origin: config.cors.origin,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Static files for uploaded incident images
  app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

  // Root welcome
  app.get('/', (_req, res) => {
    res.json({
      message: 'Neighborhood Safety & Alert Network API',
      status: 'active',
      version: '1.0.0',
    });
  });

  // API Routes
  app.use('/api', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/location', locationRoutes);
  app.use('/api/incidents', incidentRoutes);
  app.use('/api/alerts', alertRoutes);
  app.use('/api/emergency-contacts', emergencyContactRoutes);
  app.use('/api/sos', sosRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/moderation', moderationRoutes);

  // Fallthrough 404 handler
  app.use(notFoundHandler);

  // Centralized Error handler
  app.use(errorHandler);

  return app;
};
