import { type Request, type Response, type NextFunction } from 'express';
import journeyService, { JourneyService } from './journey.service.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { env } from '../../config/env.js';
import { isRedisAvailable } from '../../config/redis.js';
import locationService from '../locations/location.service.js';

export class JourneyController {
  private readonly httpUpdateRateLimitMap = new Map<number, number>();
  private readonly httpAwarenessRateLimitMap = new Map<number, number>();
  private readonly appVersionUsageMap = new Map<string, { updateCount: number; awarenessCount: number }>();
  private usageSummaryTimer: NodeJS.Timeout | null = null;

  constructor(private readonly service: JourneyService = journeyService) {
    if (process.env.NODE_ENV !== 'test') {
      this.usageSummaryTimer = setInterval(() => {
        this.logUsageSummary();
      }, 60000);
      this.usageSummaryTimer.unref();
    }
  }

  private logUsageSummary(): void {
    if (this.appVersionUsageMap.size === 0) return;
    const stats: Record<string, { updateCount: number; awarenessCount: number }> = {};
    for (const [ver, counts] of this.appVersionUsageMap.entries()) {
      stats[ver] = { ...counts };
    }
    this.appVersionUsageMap.clear();
    console.log('[HTTP Location Deprecated Usage Summary] App version stats in last 60s:', JSON.stringify(stats));
  }

  private recordAppVersion(endpoint: 'update' | 'awareness', appVersion: string): void {
    let existing = this.appVersionUsageMap.get(appVersion);
    if (!existing) {
      existing = { updateCount: 0, awarenessCount: 0 };
      this.appVersionUsageMap.set(appVersion, existing);
    }
    if (endpoint === 'update') {
      existing.updateCount++;
    } else {
      existing.awarenessCount++;
    }
  }

  private setDeprecationHeaders(res: Response, endpoint: 'update' | 'awareness', _userId: number, req: Request): void {
    res.setHeader('Deprecation', env.httpLocationDeprecationAt);
    res.setHeader('Sunset', env.httpLocationSunsetAt);

    const appVersion =
      (req.headers['x-app-version'] as string) || (req.headers['user-agent'] as string) || 'unknown';
    this.recordAppVersion(endpoint, appVersion);
  }

  startJourney = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        sendError(res, 'Authentication required to start journey', 401);
        return;
      }
      const journey = await this.service.startJourney(req.user.id, {
        ...req.body,
        transport_mode: req.body.transport_mode || req.user.transport_mode || 'DRIVER',
      });
      sendSuccess(res, 'Journey started successfully', journey, 201);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to start journey', 400);
    }
  };

  endJourney = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        sendError(res, 'Authentication required to end journey', 401);
        return;
      }
      const journeyId = String(req.params.id);
      const journey = await this.service.endJourney(req.user.id, journeyId, req.body);
      sendSuccess(res, 'Journey ended successfully', journey, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to end journey', 400);
    }
  };

  cancelJourney = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        sendError(res, 'Authentication required to cancel journey', 401);
        return;
      }
      const journeyId = String(req.params.id);
      const journey = await this.service.cancelJourney(req.user.id, journeyId);
      sendSuccess(res, 'Journey cancelled successfully', journey, 200);
    } catch (error: any) {
      const status = error.message?.includes('not found') ? 404 : 400;
      sendError(res, error.message || 'Failed to cancel journey', status);
    }
  };

  getActiveJourney = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        sendError(res, 'Authentication required', 401);
        return;
      }
      const journey = await this.service.getActiveJourney(req.user.id);
      sendSuccess(res, journey ? 'Active journey retrieved' : 'No active journey found', journey, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to get active journey', 400);
    }
  };

  getJourneyHistory = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        sendError(res, 'Authentication required', 401);
        return;
      }
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 10;
      const status = req.query.status ? String(req.query.status) : undefined;
      const transport_mode = req.query.transport_mode ? String(req.query.transport_mode) : undefined;

      const result = await this.service.getJourneys({
        user_id: req.user.id,
        status,
        transport_mode,
        page,
        limit,
      });

      sendSuccess(res, 'Journey history retrieved successfully', result.journeys, 200, result.pagination);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch journey history', 400);
    }
  };

  getJourneyById = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);
      const isAdmin = !!req.admin || req.user?.role === 'admin' || req.user?.role === 'GLOBAL_ADMIN';
      const journey = await this.service.getJourneyById(id, req.user?.id, isAdmin);
      sendSuccess(res, 'Journey details retrieved successfully', journey, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Journey not found', 404);
    }
  };

  getJourneys = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 10;
      const status = req.query.status ? String(req.query.status) : undefined;
      const transport_mode = req.query.transport_mode ? String(req.query.transport_mode) : undefined;

      const result = await this.service.getJourneys({
        user_id: req.user?.role === 'admin' ? undefined : req.user?.id,
        status,
        transport_mode,
        page,
        limit,
      });

      sendSuccess(res, 'Journeys retrieved successfully', result.journeys, 200, result.pagination);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch journeys', 400);
    }
  };

  deleteJourney = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        sendError(res, 'Authentication required to delete journey', 401);
        return;
      }
      const id = String(req.params.id);
      const isAdmin = !!req.admin || req.user?.role === 'admin' || req.user?.role === 'GLOBAL_ADMIN';
      await this.service.deleteJourney(id, req.user.id, isAdmin);
      sendSuccess(res, 'Journey deleted successfully', { id: Number(id) || id }, 200);
    } catch (error: any) {
      const status = error.message?.includes('Forbidden') ? 403 : error.message?.includes('not found') ? 404 : 400;
      sendError(res, error.message || 'Failed to delete journey', status);
    }
  };

  // --- Location Endpoints ---
  startLocationSharing = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        sendError(res, 'Authentication required', 401);
        return;
      }
      const location = await this.service.updateLiveLocation(req.user.id, {
        ...req.body,
        transport_mode: req.body.transport_mode || req.user.transport_mode || 'DRIVER',
      });
      sendSuccess(res, 'Location sharing started', location, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to start location sharing', 400);
    }
  };

  updateLocation = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        sendError(res, 'Authentication required', 401);
        return;
      }
      const userId = req.user.id;
      this.setDeprecationHeaders(res, 'update', userId, req);

      if (env.locationHttpUsesRedis) {
        if (!isRedisAvailable()) {
          sendError(res, 'Location service degraded: Redis is currently unavailable', 503);
          return;
        }

        const now = Date.now();
        const lastPing = this.httpUpdateRateLimitMap.get(userId) || 0;
        const MIN_UPDATE_GAP_MS = 1000;
        if (now - lastPing < MIN_UPDATE_GAP_MS) {
          const retryAfterSec = Math.ceil((MIN_UPDATE_GAP_MS - (now - lastPing)) / 1000);
          res.setHeader('Retry-After', retryAfterSec);
          sendError(res, 'Rate limit exceeded: Please transition to WebSocket /location', 429);
          return;
        }
        this.httpUpdateRateLimitMap.set(userId, now);

        const transportMode = req.body.transport_mode || req.user.transport_mode || 'DRIVER';
        const pingResult = await locationService.processLocationPing(userId, transportMode, {
          lat: req.body.latitude,
          lng: req.body.longitude,
          speed: req.body.speed,
          heading: req.body.heading,
          accuracy: req.body.accuracy,
          journeyId: req.body.journey_id,
          clientTimestamp: req.body.timestamp ? new Date(req.body.timestamp).getTime() : now,
        });

        if (!pingResult.success) {
          sendError(res, `Location ping rejected: ${pingResult.code}`, 400);
          return;
        }

        sendSuccess(
          res,
          'Location updated successfully (Redis)',
          {
            user_id: userId,
            latitude: req.body.latitude,
            longitude: req.body.longitude,
            updated_at: new Date(pingResult.receivedAt),
          },
          200
        );
        return;
      }

      const location = await this.service.updateLiveLocation(userId, {
        ...req.body,
        transport_mode: req.body.transport_mode || req.user.transport_mode || 'DRIVER',
      });
      sendSuccess(res, 'Location updated successfully', location, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to update location', 400);
    }
  };

  stopLocationSharing = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        sendError(res, 'Authentication required', 401);
        return;
      }
      await this.service.stopLiveLocation(req.user.id);
      sendSuccess(res, 'Location sharing stopped successfully', null, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to stop location sharing', 400);
    }
  };

  getNearbyLocations = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const latitude = parseFloat(String(req.query.latitude));
      const longitude = parseFloat(String(req.query.longitude));
      const radiusKm = req.query.radius ? parseFloat(String(req.query.radius)) : 5;
      const transport_mode = req.query.transport_mode ? (String(req.query.transport_mode) as any) : undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;

      if (isNaN(latitude) || isNaN(longitude)) {
        sendError(res, 'Valid latitude and longitude query parameters are required', 400);
        return;
      }

      const locations = await this.service.getNearbyLocations({
        latitude,
        longitude,
        radiusKm,
        transport_mode,
        excludeUserId: req.user?.id,
        limit,
      });

      sendSuccess(res, 'Nearby active users retrieved successfully', locations, 200, {
        count: locations.length,
        radiusKm,
      });
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch nearby locations', 400);
    }
  };

  getDriverAwareness = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        sendError(res, 'Authentication required', 401);
        return;
      }
      const userId = req.user.id;
      this.setDeprecationHeaders(res, 'awareness', userId, req);

      const latitude = parseFloat(String(req.query.latitude));
      const longitude = parseFloat(String(req.query.longitude));
      const radiusKm = req.query.radius ? parseFloat(String(req.query.radius)) : 5;

      if (isNaN(latitude) || isNaN(longitude)) {
        sendError(res, 'Valid latitude and longitude are required', 400);
        return;
      }

      if (env.locationHttpUsesRedis) {
        if (!isRedisAvailable()) {
          sendError(res, 'Awareness service degraded: Redis is currently unavailable', 503);
          return;
        }

        const now = Date.now();
        const lastQuery = this.httpAwarenessRateLimitMap.get(userId) || 0;
        const MIN_AWARENESS_GAP_MS = 3000;
        if (now - lastQuery < MIN_AWARENESS_GAP_MS) {
          const retryAfterSec = Math.ceil((MIN_AWARENESS_GAP_MS - (now - lastQuery)) / 1000);
          res.setHeader('Retry-After', retryAfterSec);
          sendError(res, 'Rate limit exceeded: Please transition to WebSocket /location', 429);
          return;
        }
        this.httpAwarenessRateLimitMap.set(userId, now);

        const awareness = await locationService.getDriverAwareness(userId, latitude, longitude, radiusKm);
        sendSuccess(res, 'Driver proximity awareness data retrieved (Redis)', awareness, 200);
        return;
      }

      const awareness = await this.service.getDriverAwareness(userId, latitude, longitude, radiusKm);
      sendSuccess(res, 'Driver proximity awareness data retrieved', awareness, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch driver awareness data', 400);
    }
  };
}

export default new JourneyController();
