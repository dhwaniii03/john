import locationRedisRepository, {
  type NearbyRedisUser,
  type RedisLiveUser,
} from './location.redis.repository.js';
import hazardRepository from '../hazards/hazard.repository.js';
import journeyRepository from '../journeys/journey.repository.js';
import { calculateDistanceKm, calculateHeadingDifference } from '../../utils/geo.js';
import { polylineCache } from '../../utils/polyline-cache.js';
import { locationConfig } from '../../config/location.config.js';
import { isRedisAvailable, redis } from '../../config/redis.js';
import { pool } from '../../config/database.js';
import type { TransportMode } from '../journeys/journey.types.js';
import type { LocationUpdatePayload } from './location.validation.js';

export interface PingResult {
  success: boolean;
  code?: 'LOCATION_UNAVAILABLE' | 'OUT_OF_ORDER' | 'IMPOSSIBLE_JUMP' | 'INVALID_JOURNEY';
  receivedAt: number;
  distanceDeltaMeters?: number;
}

export class LocationService {
  // NOTE: Disconnect grace timers and active socket connections are maintained in-memory per server instance.
  // In multi-instance deployments, Socket.IO Redis adapter handles cross-node broadcasting and presence.
  private disconnectTimers = new Map<number, NodeJS.Timeout>();

  // Cached active journey verification: `${userId}:${journeyId}` -> { valid, expiresAt }
  private activeJourneyCache = new Map<string, { valid: boolean; expiresAt: number }>();

  // Throttled on-route check tracking: userId -> last checked timestamp
  private lastOnRouteCheckMap = new Map<number, number>();

  // Throttled database update tracking: journeyId -> last updated timestamp
  private lastOnRouteUpdateMap = new Map<number, number>();

  // Polyline string cache to avoid repeated DB lookups: journeyId -> rawPolyline
  private journeyPolylineStringCache = new Map<number, string>();

  /**
   * Verify that a journey belongs to the user and is ACTIVE, caching the check for 60 seconds.
   */
  async verifyActiveJourney(userId: number, journeyId: string | number): Promise<boolean> {
    const cacheKey = `${userId}:${journeyId}`;
    const cached = this.activeJourneyCache.get(cacheKey);
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
      return cached.valid;
    }

    try {
      const res = await pool.query(
        'SELECT id FROM journeys WHERE id = $1 AND user_id = $2 AND status = $3',
        [journeyId, userId, 'ACTIVE']
      );
      const isValid = res.rows.length > 0;
      this.activeJourneyCache.set(cacheKey, {
        valid: isValid,
        expiresAt: now + 60000, // cache for 1 minute
      });
      return isValid;
    } catch (err: any) {
      console.warn(`[LocationService] Error verifying journey ${journeyId} for user ${userId}:`, err.message);
      return false;
    }
  }

  /**
   * Clear cached journey validation (e.g. on journey end or cancel).
   */
  invalidateJourneyCache(userId: number, journeyId?: string | number): void {
    if (journeyId) {
      this.activeJourneyCache.delete(`${userId}:${journeyId}`);
    } else {
      for (const key of this.activeJourneyCache.keys()) {
        if (key.startsWith(`${userId}:`)) {
          this.activeJourneyCache.delete(key);
        }
      }
    }
  }

  /**
   * Ingest and process a live location ping from WebSocket or HTTP.
   */
  async processLocationPing(
    userId: number,
    transportMode: TransportMode,
    data: LocationUpdatePayload
  ): Promise<PingResult> {
    const now = Date.now();

    if (!isRedisAvailable()) {
      return { success: false, code: 'LOCATION_UNAVAILABLE', receivedAt: now };
    }

    // Cancel any pending disconnect removal timer if user is actively sending pings
    this.cancelPendingDisconnect(userId);

    // 1. Verify journey validity if journeyId is provided
    if (data.journeyId) {
      const isJourneyValid = await this.verifyActiveJourney(userId, data.journeyId);
      if (!isJourneyValid) {
        return { success: false, code: 'INVALID_JOURNEY', receivedAt: now };
      }

      // If live state is rebuilt or running distance is missing, seed from journeys.distance_km
      const currentRunningMeters = await locationRedisRepository.getRunningDistance(userId);
      if (currentRunningMeters <= 0) {
        const journey = await journeyRepository.findJourneyById(data.journeyId);
        if (journey && journey.distance_km && Number(journey.distance_km) > 0) {
          const seededMeters = Math.round(Number(journey.distance_km) * 1000 * 100) / 100;
          await locationRedisRepository.setRunningDistance(userId, seededMeters);
        }
      }
    }

    // 2. Fetch previous user state from Redis for sanity checks
    const prev = await locationRedisRepository.getUserLocation(userId);

    let distanceDeltaMeters = 0;

    if (prev) {
      // Out-of-order ping check
      if (data.clientTimestamp < prev.updatedAt) {
        return { success: false, code: 'OUT_OF_ORDER', receivedAt: now };
      }

      // Impossible jump check using server receive time as reference
      const distKm = calculateDistanceKm(
        { latitude: prev.lat, longitude: prev.lng },
        { latitude: data.lat, longitude: data.lng }
      );
      distanceDeltaMeters = Math.round(distKm * 1000 * 100) / 100;

      const elapsedSeconds = Math.max(0.1, (now - prev.updatedAt) / 1000);
      const impliedSpeedMps = distanceDeltaMeters / elapsedSeconds;

      if (impliedSpeedMps > locationConfig.limits.maxJumpSpeedMps) {
        return { success: false, code: 'IMPOSSIBLE_JUMP', receivedAt: now };
      }

      // Accumulate running distance in Redis if valid movement (< 2 km in single ping)
      // Noise gate: ignore movements shorter than max(5m, accuracy / 2) to eliminate stationary GPS jitter
      const accuracy = data.accuracy || 0;
      const noiseGateMeters = Math.max(5, accuracy / 2);
      if (distanceDeltaMeters >= noiseGateMeters && distanceDeltaMeters < 2000) {
        await locationRedisRepository.addRunningDistance(userId, distanceDeltaMeters);
      }
    }

    // 3. Upsert live location in Redis
    await locationRedisRepository.upsertLocation(userId, {
      latitude: data.lat,
      longitude: data.lng,
      speed: data.speed,
      heading: data.heading,
      mode: transportMode,
      journeyId: data.journeyId,
      previousMode: prev?.mode,
      clientTimestamp: data.clientTimestamp,
    });

    // 4. Mode-based breadcrumb history saving & throttled on-route tracking
    if (data.journeyId) {
      const journeyIdNum = Number(data.journeyId);
      this.evaluateHistoryAndOnRouteChecks(
        userId,
        transportMode,
        journeyIdNum,
        data,
        prev,
        now
      ).catch((err) => {
        console.warn(`[LocationService] History/on-route check error for user ${userId}:`, err.message);
      });
    }

    return {
      success: true,
      receivedAt: now,
      distanceDeltaMeters,
    };
  }

  /**
   * Handle user mode change: updates mode and removes user from previous Redis geo set.
   */
  async changeUserMode(userId: number, newMode: TransportMode): Promise<void> {
    if (!isRedisAvailable()) return;
    const prev = await locationRedisRepository.getUserLocation(userId);
    if (!prev) return;

    await locationRedisRepository.upsertLocation(userId, {
      latitude: prev.lat,
      longitude: prev.lng,
      speed: prev.speed,
      heading: prev.heading,
      mode: newMode,
      journeyId: prev.journeyId,
      previousMode: prev.mode,
      clientTimestamp: Date.now(),
    });
  }

  /**
   * Compute proximity awareness (cyclists, walkers, hazards) backed by Redis GEOSEARCH.
   */
  async getDriverAwareness(
    userId: number,
    latitude: number,
    longitude: number,
    radiusKm = 5
  ): Promise<{
    hazards: any[];
    cyclists: NearbyRedisUser[];
    walkers: NearbyRedisUser[];
    summary: {
      hazardCount: number;
      cyclistCount: number;
      walkerCount: number;
    };
  }> {
    // 1. Fetch nearby active hazards from Postgres
    const hazards = await hazardRepository.findNearby({
      latitude,
      longitude,
      radiusKm,
      status: 'ACTIVE',
      limit: 20,
    });

    // 2. Fetch nearby cyclists and walkers from Redis GEOSEARCH
    const cyclists = await locationRedisRepository.getNearbyUsers({
      latitude,
      longitude,
      radiusKm,
      mode: 'CYCLIST',
      excludeUserId: userId,
      limit: 20,
    });

    const walkers = await locationRedisRepository.getNearbyUsers({
      latitude,
      longitude,
      radiusKm,
      mode: 'WALKER',
      excludeUserId: userId,
      limit: 20,
    });

    return {
      hazards,
      cyclists,
      walkers,
      summary: {
        hazardCount: hazards.length,
        cyclistCount: cyclists.length,
        walkerCount: walkers.length,
      },
    };
  }

  /**
   * Fast proximity check for real-time WebSocket awareness emissions:
   * Queries cyclists and walkers purely from Redis GEOSEARCH with ZERO Postgres queries.
   */
  async getLiveUserProximity(
    userId: number,
    latitude: number,
    longitude: number,
    radiusKm = 5
  ): Promise<{ cyclists: NearbyRedisUser[]; walkers: NearbyRedisUser[] }> {
    const [cyclists, walkers] = await Promise.all([
      locationRedisRepository.getNearbyUsers({
        latitude,
        longitude,
        radiusKm,
        mode: 'CYCLIST',
        excludeUserId: userId,
        limit: 20,
      }),
      locationRedisRepository.getNearbyUsers({
        latitude,
        longitude,
        radiusKm,
        mode: 'WALKER',
        excludeUserId: userId,
        limit: 20,
      }),
    ]);

    return { cyclists, walkers };
  }

  /**
   * Fetch hazards in a bounding box with outward grid snapping and 30-60s Redis caching.
   * Snaps outward to grid (floor mins, ceil maxs) so cached answer is always a superset.
   * Superset is cached ordered by severity and id only (cap 300).
   * Results are filtered to client bounds, deterministically ordered per-client distance, and sliced to limit.
   * Returns truncated: true when the 300 cap was hit.
   */
  async getHazardsInArea(bounds: {
    minLat: number;
    minLng: number;
    maxLat: number;
    maxLng: number;
    limit?: number;
  }): Promise<{ hazards: any[]; count: number; truncated: boolean }> {
    const clientLimit = Math.min(bounds.limit || 50, locationConfig.hazards.maxResultsLimit);
    const SUPERSET_CAP = 300;

    // 1. Snap query box OUTWARD to grid (~2.2km grid resolution: 0.02 deg)
    const GRID_STEP = 0.02;
    const snappedMinLat = Number((Math.floor(bounds.minLat / GRID_STEP) * GRID_STEP).toFixed(4));
    const snappedMinLng = Number((Math.floor(bounds.minLng / GRID_STEP) * GRID_STEP).toFixed(4));
    const snappedMaxLat = Number((Math.ceil(bounds.maxLat / GRID_STEP) * GRID_STEP).toFixed(4));
    const snappedMaxLng = Number((Math.ceil(bounds.maxLng / GRID_STEP) * GRID_STEP).toFixed(4));

    const cacheKey = `cache:hazards:bbox:${snappedMinLat}:${snappedMinLng}:${snappedMaxLat}:${snappedMaxLng}`;

    let cachedPayload: { items: any[]; truncated: boolean } | null = null;

    if (isRedisAvailable()) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          cachedPayload = typeof cached === 'string' ? JSON.parse(cached) : (cached as any);
        }
      } catch (err: any) {
        console.warn('[LocationService] Redis cache read error for hazards area:', err.message);
      }
    }

    // 2. Cache miss: fetch superset (cap 300, ordered by severity and id only)
    if (!cachedPayload) {
      const items = await hazardRepository.findInBoundingBox({
        minLat: snappedMinLat,
        minLng: snappedMinLng,
        maxLat: snappedMaxLat,
        maxLng: snappedMaxLng,
        limit: SUPERSET_CAP,
      });

      const truncated = items.length >= SUPERSET_CAP;
      cachedPayload = { items, truncated };

      if (isRedisAvailable() && items.length > 0) {
        try {
          await redis.set(cacheKey, JSON.stringify(cachedPayload), 'EX', 45); // 45 seconds TTL
        } catch (err: any) {
          console.warn('[LocationService] Redis cache write error for hazards area:', err.message);
        }
      }
    }

    const { items: hazardsSuperset, truncated } = cachedPayload;

    // 3. Filter superset to client's exact query box
    const filtered = hazardsSuperset.filter(
      (h) =>
        h.latitude >= bounds.minLat &&
        h.latitude <= bounds.maxLat &&
        h.longitude >= bounds.minLng &&
        h.longitude <= bounds.maxLng
    );

    // 4. Deterministic per-client ordering: Severity first (CRITICAL -> LOW), then distance to THIS client's center, then ID
    const centerLat = (bounds.minLat + bounds.maxLat) / 2;
    const centerLng = (bounds.minLng + bounds.maxLng) / 2;
    const cosCenter = Math.cos((centerLat * Math.PI) / 180);

    const severityRank: Record<string, number> = {
      CRITICAL: 1,
      HIGH: 2,
      MEDIUM: 3,
      LOW: 4,
    };

    filtered.sort((a, b) => {
      const sevA = severityRank[a.severity] || 5;
      const sevB = severityRank[b.severity] || 5;
      if (sevA !== sevB) return sevA - sevB;

      const distA =
        Math.pow(a.latitude - centerLat, 2) + Math.pow((a.longitude - centerLng) * cosCenter, 2);
      const distB =
        Math.pow(b.latitude - centerLat, 2) + Math.pow((b.longitude - centerLng) * cosCenter, 2);
      if (distA !== distB) return distA - distB;

      return (a.id || 0) - (b.id || 0);
    });

    const clientHazards = filtered.slice(0, clientLimit);
    return {
      hazards: clientHazards,
      count: clientHazards.length,
      truncated,
    };
  }

  /**
   * Schedule user live location cleanup on disconnect with 30s grace period.
   */
  scheduleDisconnectCleanup(userId: number): void {
    this.cancelPendingDisconnect(userId);

    const timer = setTimeout(async () => {
      this.disconnectTimers.delete(userId);
      try {
        await locationRedisRepository.removeUserLocation(userId);
        console.log(`[LocationService] Disconnect grace period expired. Cleared Redis state for userId=${userId}`);
      } catch (err: any) {
        console.error(`[LocationService] Error cleaning Redis state for userId=${userId}:`, err.message);
      }
    }, locationConfig.redis.disconnectGracePeriodMs);

    this.disconnectTimers.set(userId, timer);
  }

  /**
   * Cancel pending disconnect cleanup if user reconnects or pings within grace period.
   */
  cancelPendingDisconnect(userId: number): void {
    const existing = this.disconnectTimers.get(userId);
    if (existing) {
      clearTimeout(existing);
      this.disconnectTimers.delete(userId);
    }
  }

  /**
   * Mode-based breadcrumb history rule & throttled on-route check.
   */
  async evaluateHistoryAndOnRouteChecks(
    userId: number,
    mode: TransportMode,
    journeyId: number,
    data: LocationUpdatePayload,
    prev: RedisLiveUser | null,
    now: number
  ): Promise<void> {
    // A. Mode-Based Breadcrumb History Saving Rule
    const thresholds = locationConfig.history.modes[mode] || locationConfig.history.modes.DRIVER;
    const lastSavedLat = prev?.lastSavedLat;
    const lastSavedLng = prev?.lastSavedLng;
    const lastSavedAt = prev?.lastSavedAt;
    const lastSavedHeading = prev?.lastSavedHeading;

    let shouldSaveHistory = false;

    if (lastSavedLat === undefined || lastSavedLng === undefined || lastSavedAt === undefined) {
      // First point of journey
      shouldSaveHistory = true;
    } else {
      const distFromSavedMeters =
        calculateDistanceKm(
          { latitude: lastSavedLat, longitude: lastSavedLng },
          { latitude: data.lat, longitude: data.lng }
        ) * 1000;
      const timeSinceSavedSec = (now - lastSavedAt) / 1000;
      const headingDiff =
        data.heading !== undefined && lastSavedHeading !== undefined
          ? calculateHeadingDifference(data.heading, lastSavedHeading)
          : 0;

      if (distFromSavedMeters >= thresholds.distanceMeters) {
        shouldSaveHistory = true;
      } else if (
        timeSinceSavedSec >= thresholds.timeIntervalSeconds &&
        distFromSavedMeters >= locationConfig.history.minMovementForTimeRuleMeters
      ) {
        shouldSaveHistory = true;
      } else if (headingDiff >= thresholds.headingChangeDegrees) {
        shouldSaveHistory = true;
      }
    }

    if (shouldSaveHistory) {
      try {
        await Promise.all([
          journeyRepository.createJourneyLocation({
            journey_id: journeyId,
            user_id: userId,
            latitude: data.lat,
            longitude: data.lng,
            speed: data.speed,
            heading: data.heading,
            recorded_at: new Date(now), // Explicit server receive time
          }),
          locationRedisRepository.updateLastSavedHistory(userId, {
            latitude: data.lat,
            longitude: data.lng,
            timestamp: now,
            heading: data.heading,
          }),
        ]);
      } catch (err: any) {
        console.error(`[LocationService] Error inserting history point for journey ${journeyId}, user ${userId}:`, err.message);
      }
    }

    // B. Throttled On-Route Check (checked at most once every 15s per user)
    const lastCheck = this.lastOnRouteCheckMap.get(userId) || 0;
    if (now - lastCheck >= locationConfig.redis.onRouteCheckThrottleMs) {
      this.lastOnRouteCheckMap.set(userId, now);

      let rawPolyline = this.journeyPolylineStringCache.get(journeyId);
      if (rawPolyline === undefined) {
        const journey = await journeyRepository.findJourneyById(journeyId);
        rawPolyline = journey?.route_polyline || '__NO_POLYLINE__';
        this.journeyPolylineStringCache.set(journeyId, rawPolyline);
      }

      if (rawPolyline && rawPolyline !== '__NO_POLYLINE__') {
        const isOnRoute = polylineCache.isPointOnRoute(
          { latitude: data.lat, longitude: data.lng },
          journeyId,
          rawPolyline,
          0.15 // 150m buffer
        );

        if (isOnRoute) {
          // Throttled update to database: update journeys.last_on_route_at at most once every 30s
          const lastUpdate = this.lastOnRouteUpdateMap.get(journeyId) || 0;
          if (now - lastUpdate >= locationConfig.redis.lastOnRouteUpdateThrottleMs) {
            this.lastOnRouteUpdateMap.set(journeyId, now);
            await journeyRepository.updateLastOnRouteAt(journeyId);
          }
        }
      }
    }
  }

  /**
   * Evict journey polyline from both string cache and LRU polylineCache.
   */
  evictJourneyPolyline(journeyId: number): void {
    this.journeyPolylineStringCache.delete(journeyId);
    this.lastOnRouteUpdateMap.delete(journeyId);
    polylineCache.evict(journeyId);
  }

  /**
   * Immediate cleanup of user state in Redis (e.g. on journey end).
   */
  async clearUserRedisState(userId: number): Promise<void> {
    this.cancelPendingDisconnect(userId);
    this.invalidateJourneyCache(userId);
    this.lastOnRouteCheckMap.delete(userId);
    await locationRedisRepository.removeUserLocation(userId);
  }

  /**
   * Reset throttle and cache tracking (useful for testing and user reset).
   */
  resetThrottles(userId?: number, journeyId?: number): void {
    if (userId) this.lastOnRouteCheckMap.delete(userId);
    else this.lastOnRouteCheckMap.clear();

    if (journeyId) {
      this.lastOnRouteUpdateMap.delete(journeyId);
      this.journeyPolylineStringCache.delete(journeyId);
    } else {
      this.lastOnRouteUpdateMap.clear();
      this.journeyPolylineStringCache.clear();
    }
  }
}

export default new LocationService();
