import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createApp } from './app';
import { config } from './config';
import { checkDatabaseHealth, closePool } from './db';
import { runMigrations } from './db/migrate';

const startServer = async () => {
  try {
    console.log(`Starting Neighborhood Safety & Alert Network API in ${config.env} mode...`);

    // Verify database connection and PostGIS
    const dbHealth = await checkDatabaseHealth();
    if (!dbHealth.connected) {
      console.error('Fatal: Cannot connect to PostgreSQL:', dbHealth.error);
      process.exit(1);
    }
    console.log(`Connected to database '${dbHealth.database}' as user '${dbHealth.user}'`);
    console.log(`PostGIS version: ${dbHealth.postgisVersion}`);

    // Auto-run non-destructive migrations
    await runMigrations();

    const app = createApp();
    const server = http.createServer(app);

    // Initialize Socket.IO
    const io = new SocketIOServer(server, {
      cors: {
        origin: config.cors.origin,
        methods: ['GET', 'POST', 'PATCH', 'DELETE'],
        credentials: true,
      },
    });

    io.on('connection', (socket) => {
      console.log(`Socket client connected: ${socket.id}`);
      socket.on('disconnect', () => {
        console.log(`Socket client disconnected: ${socket.id}`);
      });
    });

    server.listen(config.port, () => {
      console.log(`====================================================`);
      console.log(`Neighborhood Safety Network API running on port ${config.port}`);
      console.log(`Health check: http://localhost:${config.port}/api/health`);
      console.log(`====================================================`);
    });

    // Graceful shutdown
    const handleShutdown = async (signal: string) => {
      console.log(`\nReceived ${signal}. Gracefully shutting down...`);
      io.close();
      server.close(async () => {
        await closePool();
        console.log('Server and database pool closed. Clean exit.');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
