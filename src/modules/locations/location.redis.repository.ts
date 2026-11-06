import { redis, isRedisAvailable } from '../../config/redis.js';
import { locationConfig } from '../../config/location.config.js';
import type { TransportMode } from '../journeys/journey.types.js';

export interface RedisLiveUser {
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
  mode: TransportMode;
  journeyId?: string;
  updatedAt: number;
  runningDistanceMeters: number;
  lastSavedLat?: number;
  lastSavedLng?: number;
  lastSavedAt?: number;
  lastSavedHeading?: number;
}

export interface NearbyRedisUser {
  userId: number;
  latitude: number;
  longitude: number;
  distanceKm: number;
  transportMode: TransportMode;
  lastSeenAt: number;
}

export class LocationRedisRepository {
  private getGeoKey(mode: TransportMode): string {
    return `live:geo:${mode.toUpperCase()}`;
  }

  private getUserKey(userId: number | string): string {
    return `live:user:${userId}`;
  }

  /**
   * Upsert a user's live position in Redis geo set, hash, and live:seen sorted set.
   */
  async upsertLocation(
    userId: number,
    data: {
      latitude: number;
      longitude: number;
      speed?: number;
      heading?: number;
      mode: TransportMode;
      journeyId?: number | string;
      previousMode?: TransportMode;
      clientTimestamp?: number;
    }
  ): Promise<void> {
    if (!isRedisAvailable()) {
      throw new Error('Redis is not available');
    }

    const now = Date.now();
    const userKey = this.getUserKey(userId);
    const newGeoKey = this.getGeoKey(data.mode);

    const pipeline = redis.pipeline();

    // 1. If mode changed, remove from old geo set
    if (data.previousMode && data.previousMode.toUpperCase() !== data.mode.toUpperCase()) {
      pipeline.zrem(this.getGeoKey(data.previousMode), String(userId));
    }

    // 2. Add to the new mode geo set: GEOADD key longitude latitude member
    pipeline.geoadd(newGeoKey, data.longitude, data.latitude, String(userId));

    // 3. Update user hash
    const hashData: Record<string, string> = {
      lat: String(data.latitude),
      lng: String(data.longitude),
      mode: data.mode.toUpperCase(),
      updatedAt: String(now),
    };

    if (data.speed !== undefined) hashData.speed = String(data.speed);
    if (data.heading !== undefined) hashData.heading = String(data.heading);
    if (data.journeyId !== undefined) hashData.journeyId = String(data.journeyId);

    pipeline.hset(userKey, hashData);
    pipeline.expire(userKey, locationConfig.redis.userHashTtlSeconds);

    // 4. Update live:seen sorted set (score = current server timestamp)
    pipeline.zadd('live:seen', now, String(userId));

    await pipeline.exec();
  }

  /**
   * Retrieve cached user live location state from Redis.
   */
  async getUserLocation(userId: number): Promise<RedisLiveUser | null> {
    if (!isRedisAvailable()) return null;

    const raw = await redis.hgetall(this.getUserKey(userId));
    if (!raw || Object.keys(raw).length === 0 || !raw.lat || !raw.lng) {
      return null;
    }

    return {
      lat: typeof raw.lat === 'number' ? raw.lat : parseFloat(raw.lat),
      lng: typeof raw.lng === 'number' ? raw.lng : parseFloat(raw.lng),
      speed: raw.speed !== undefined && raw.speed !== null ? Number(raw.speed) : undefined,
      heading: raw.heading !== undefined && raw.heading !== null ? Number(raw.heading) : undefined,
      mode: (raw.mode || 'DRIVER') as TransportMode,
      journeyId: raw.journeyId !== undefined && raw.journeyId !== null ? String(raw.journeyId) : undefined,
      updatedAt: raw.updatedAt ? Number(raw.updatedAt) : 0,
      runningDistanceMeters: raw.runningDistanceMeters ? Number(raw.runningDistanceMeters) : 0,
      lastSavedLat: raw.lastSavedLat !== undefined && raw.lastSavedLat !== null ? Number(raw.lastSavedLat) : undefined,
      lastSavedLng: raw.lastSavedLng !== undefined && raw.lastSavedLng !== null ? Number(raw.lastSavedLng) : undefined,
      lastSavedAt: raw.lastSavedAt !== undefined && raw.lastSavedAt !== null ? Number(raw.lastSavedAt) : undefined,
      lastSavedHeading: raw.lastSavedHeading !== undefined && raw.lastSavedHeading !== null ? Number(raw.lastSavedHeading) : undefined,
    };
  }

  /**
   * Remove a user from all geo sets, user hash, and live:seen.
   */
  async removeUserLocation(userId: number): Promise<void> {
    if (!isRedisAvailable()) return;

    const pipeline = redis.pipeline();
    pipeline.zrem(this.getGeoKey('DRIVER'), String(userId));
    pipeline.zrem(this.getGeoKey('CYCLIST'), String(userId));
    pipeline.zrem(this.getGeoKey('WALKER'), String(userId));
    pipeline.del(this.getUserKey(userId));
    pipeline.zrem('live:seen', String(userId));
    await pipeline.exec();
  }

  /**
   * Search nearby users using Redis GEOSEARCH filtered against live:seen to exclude stale members.
   */
  async getNearbyUsers(options: {
    latitude: number;
    longitude: number;
    radiusKm: number;
    mode: TransportMode;
    excludeUserId?: number;
    limit?: number;
  }): Promise<NearbyRedisUser[]> {
    if (!isRedisAvailable()) return [];

    const geoKey = this.getGeoKey(options.mode);
    const limit = options.limit || 50;

    const candidates: { id: number; dist: number; lng: number; lat: number }[] = [];

    // Support @upstash/redis geosearch as well as ioredis redis.call('GEOSEARCH')
    if (typeof (redis as any).geosearch === 'function') {
      try {
        const geoResults = (await (redis as any).geosearch(
          geoKey,
          {
            type: 'fromlonlat',
            coordinate: { lon: options.longitude, lat: options.latitude },
          },
          {
            type: 'byradius',
            radius: options.radiusKm,
            radiusType: 'KM',
          },
          'asc',
          {
            count: { limit },
            withCoord: true,
            withDist: true,
          }
        )) as Array<{ member: string; dist?: number; coord?: { long: number; lat: number } }>;

        if (Array.isArray(geoResults)) {
          for (const item of geoResults) {
            const memberId = Number(item.member);
            if (options.excludeUserId && memberId === options.excludeUserId) {
              continue;
            }
            candidates.push({
              id: memberId,
              dist: item.dist ?? 0,
              lng: item.coord?.long ?? 0,
              lat: item.coord?.lat ?? 0,
            });
          }
        }
      } catch (err: any) {
        console.warn(`[Redis GEOSEARCH] error on ${geoKey}:`, err.message);
        return [];
      }
    } else if (typeof (redis as any).call === 'function') {
      try {
        const rawResults = (await (redis as any).call(
          'GEOSEARCH',
          geoKey,
          'FROMLONLAT',
          options.longitude,
          options.latitude,
          'BYRADIUS',
          options.radiusKm,
          'km',
          'WITHDIST',
          'WITHCOORD',
          'ASC',
          'COUNT',
          limit
        )) as any[];

        if (Array.isArray(rawResults)) {
          for (const item of rawResults) {
            const memberId = Number(item[0]);
            if (options.excludeUserId && memberId === options.excludeUserId) {
              continue;
            }
            candidates.push({
              id: memberId,
              dist: parseFloat(item[1]),
              lng: parseFloat(item[2][0]),
              lat: parseFloat(item[2][1]),
            });
          }
        }
      } catch (err: any) {
        console.warn(`[Redis GEOSEARCH] error on ${geoKey}:`, err.message);
        return [];
      }
    }

    if (candidates.length === 0) {
      return [];
    }

    const now = Date.now();
    const staleCutoff = now - locationConfig.redis.awarenessRecentThresholdSeconds * 1000;

    // Filter results against live:seen using pipeline ZSCORE
    const pipeline = redis.pipeline();
    for (const cand of candidates) {
      pipeline.zscore('live:seen', String(cand.id));
    }

    const scores = await pipeline.exec();
    const validUsers: NearbyRedisUser[] = [];

    candidates.forEach((cand, idx) => {
      const scoreResult = scores?.[idx];
      let score = 0;
      if (typeof scoreResult === 'number') {
        score = scoreResult;
      } else if (Array.isArray(scoreResult) && scoreResult.length > 1 && !scoreResult[0]) {
        score = Number(scoreResult[1] || 0);
      } else if (scoreResult && typeof scoreResult === 'string') {
        score = Number(scoreResult);
      }

      // Only accept if recently active within the awareness threshold window
      if (score >= staleCutoff) {
        validUsers.push({
          userId: cand.id,
          latitude: cand.lat,
          longitude: cand.lng,
          distanceKm: Math.round(cand.dist * 100) / 100,
          transportMode: options.mode,
          lastSeenAt: score,
        });
      }
    });

    return validUsers;
  }

  /**
   * Distributed stale user cleanup with Redis lock.
   * Removes users from geo sets and user hashes whose last seen > 15 minutes.
   */
  async cleanStaleUsers(): Promise<number> {
    if (!isRedisAvailable()) return 0;

    const lockKey = 'lock:cleanup:stale';
    // Acquire distributed lock: SET key value NX EX 55
    const acquired = await redis.set(lockKey, '1', 'EX', locationConfig.redis.cleanupLockTtlSeconds, 'NX');
    if (!acquired) {
      return 0; // Another instance is already running cleanup
    }

    try {
      const now = Date.now();
      const staleCutoff = now - locationConfig.redis.cleanupStaleThresholdSeconds * 1000;

      // Fetch stale user IDs from live:seen
      const staleUserIds = await redis.zrangebyscore('live:seen', '-inf', staleCutoff, 'LIMIT', 0, 100);
      if (staleUserIds.length === 0) {
        return 0;
      }

      const pipeline = redis.pipeline();
      for (const uid of staleUserIds) {
        pipeline.zrem(this.getGeoKey('DRIVER'), uid);
        pipeline.zrem(this.getGeoKey('CYCLIST'), uid);
        pipeline.zrem(this.getGeoKey('WALKER'), uid);
        pipeline.del(this.getUserKey(uid));
        pipeline.zrem('live:seen', uid);
      }
      await pipeline.exec();

      return staleUserIds.length;
    } finally {
      await redis.del(lockKey);
    }
  }

  /**
   * Accumulate running distance in meters for a user's active journey in Redis.
   */
  async addRunningDistance(userId: number, deltaMeters: number): Promise<number> {
    if (!isRedisAvailable() || deltaMeters <= 0) return 0;
    const res = await redis.hincrbyfloat(this.getUserKey(userId), 'runningDistanceMeters', deltaMeters);
    return typeof res === 'number' ? res : parseFloat(res);
  }

  /**
   * Fetch current running distance in meters from Redis.
   */
  async getRunningDistance(userId: number): Promise<number> {
    if (!isRedisAvailable()) return 0;
    const raw = await redis.hget(this.getUserKey(userId), 'runningDistanceMeters');
    return raw ? parseFloat(raw) : 0;
  }

  /**
   * Set or seed running distance in meters in Redis (e.g. from journeys.distance_km).
   */
  async setRunningDistance(userId: number, distanceMeters: number): Promise<void> {
    if (!isRedisAvailable() || distanceMeters < 0) return;
    await redis.hset(this.getUserKey(userId), 'runningDistanceMeters', String(distanceMeters));
  }
  /**
   * Update the last saved history breadcrumb coordinates and time in the user's Redis hash.
   */
  async updateLastSavedHistory(
    userId: number,
    data: {
      latitude: number;
      longitude: number;
      timestamp: number;
      heading?: number;
    }
  ): Promise<void> {
    if (!isRedisAvailable()) return;
    const userKey = this.getUserKey(userId);
    const updates: Record<string, string> = {
      lastSavedLat: String(data.latitude),
      lastSavedLng: String(data.longitude),
      lastSavedAt: String(data.timestamp),
    };
    if (data.heading !== undefined) {
      updates.lastSavedHeading = String(data.heading);
    }
    await redis.hset(userKey, updates);
  }
}

export default new LocationRedisRepository();
