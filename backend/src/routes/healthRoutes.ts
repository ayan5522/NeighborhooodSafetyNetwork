import { Router, Request, Response } from 'express';
import { checkDatabaseHealth } from '../db';

const router = Router();

router.get('/health', async (_req: Request, res: Response) => {
  const dbHealth = await checkDatabaseHealth();

  const isHealthy = dbHealth.connected && !!dbHealth.postgisVersion;
  const statusCode = isHealthy ? 200 : 503;

  res.status(statusCode).json({
    status: isHealthy ? 'healthy' : 'degraded',
    project: 'NeighborhoodSafetyNetwork',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      connected: dbHealth.connected,
      name: dbHealth.database,
      user: dbHealth.user,
      postgisVersion: dbHealth.postgisVersion || null,
      latencyMs: dbHealth.latencyMs || null,
      error: dbHealth.error || null,
    },
  });
});

export default router;
