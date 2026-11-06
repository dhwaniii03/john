import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';

// Middleware
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';

// Module Routes
import authRoutes from './modules/auth/auth.routes.js';
import userRoutes from './modules/users/user.routes.js';
import hazardRoutes from './modules/hazards/hazard.routes.js';
import hazardReportRoutes from './modules/hazards/hazard-report.routes.js';
import journeyRoutes from './modules/journeys/journey.routes.js';
import locationRoutes from './modules/journeys/location.routes.js';
import notificationRoutes from './modules/notifications/notification.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import adminController from './modules/admin/admin.controller.js';
import uploadRoutes from './modules/uploads/upload.routes.js';
import searchHistoryRoutes from './modules/search-history/search-history.routes.js';
import pool from './config/database.js';
import { setupSwagger } from './config/swagger.js';
import { checkRedisHealth } from './config/redis.js';
import { env } from './config/env.js';

const app: Express = express();

// Swagger Documentation UI and OpenAPI specification
setupSwagger(app);

// Global Middlewares
app.use(
  cors({
    origin:
      env.corsOrigin === '*'
        ? '*'
        : env.corsOrigin.includes(',')
          ? env.corsOrigin.split(',').map((o) => o.trim())
          : env.corsOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Static uploads directory serving
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

// Resilient fallback for uploads: if a requested file isn't found in the requested subfolder
// (e.g. requested in /uploads/hazards/ but stored in /uploads/general/ or vice versa), resolve it.
app.use('/uploads/:folder/:filename', (req: Request, res: Response, next: NextFunction) => {
  const rawFilename = req.params.filename;
  const filename = Array.isArray(rawFilename) ? rawFilename[0] : rawFilename;
  if (!filename) {
    return next();
  }

  const uploadRoot = path.resolve(process.cwd(), 'uploads');
  const candidates = [
    path.join(uploadRoot, 'hazards', filename),
    path.join(uploadRoot, 'general', filename),
    path.join(uploadRoot, 'profiles', filename),
    path.join(uploadRoot, filename),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return res.sendFile(candidate);
    }
  }
  next();
});

// Health Check Endpoints
app.get('/health', async (_req: Request, res: Response) => {
  const redisHealth = await checkRedisHealth();
  res.status(200).json({
    success: true,
    message: 'RoadLife API is operational',
    services: {
      redis: redisHealth,
    },
    timestamp: new Date().toISOString(),
  });
});

app.get('/health/redis', async (_req: Request, res: Response) => {
  const redisHealth = await checkRedisHealth();
  const statusCode = redisHealth.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json({
    success: redisHealth.status === 'healthy',
    message: redisHealth.status === 'healthy' ? 'Redis is operational' : 'Redis connection failed',
    redis: redisHealth,
    timestamp: new Date().toISOString(),
  });
});

app.get('/health/db', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT NOW() as db_time');
    res.status(200).json({
      success: true,
      message: 'PostgreSQL database connected and operational',
      databaseTime: result.rows[0].db_time,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(503).json({
      success: false,
      message: 'PostgreSQL database connection failed',
      error: error.message,
    });
  }
});

// Public Content & Settings Routes
app.get('/api/v1/content/:slug', adminController.getPublicContent);
app.get('/api/v1/settings', adminController.getPublicSettings);

// Mount API Modules
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/hazards', hazardRoutes);
app.use('/api/v1/hazard-reports', hazardReportRoutes);
app.use('/api/v1/journeys', journeyRoutes);
app.use('/api/v1/locations', locationRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/uploads', uploadRoutes);
app.use('/api/v1/search-history', searchHistoryRoutes);
app.use('/api/v1/users/search-history', searchHistoryRoutes);

// Fallback & Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
