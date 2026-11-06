import journeyRepository, { JourneyRepository } from './journey.repository.js';
import hazardRepository from '../hazards/hazard.repository.js';
import { polylineCache } from '../../utils/polyline-cache.js';
import locationService from '../locations/location.service.js';
import locationRedisRepository from '../locations/location.redis.repository.js';
import type {
  Journey,
  StartJourneyDTO,
  EndJourneyDTO,
  JourneyFilterOptions,
  LiveLocation,
  UpdateLiveLocationDTO,
  NearbyLocationOptions,
  DriverAwarenessResult,
} from './journey.types.js';
import { getPaginationMeta } from '../../utils/pagination.js';

export class JourneyService {
  constructor(private readonly repo: JourneyRepository = journeyRepository) { }

  // --- Journey Flow ---
  async startJourney(userId: number, data: StartJourneyDTO): Promise<Journey> {
    // End/Cancel ANY existing active journeys for this user to guarantee previous journey is ended
    const cancelled = await this.repo.cancelActiveJourneysByUserId(userId);
    for (const c of cancelled) {
      const runningMeters = await locationRedisRepository.getRunningDistance(userId);
      if (runningMeters > 0) {
        await this.repo.updateJourneyDistance(c.id, Math.round((runningMeters / 1000) * 100) / 100);
      }
      locationService.evictJourneyPolyline(Number(c.id));
    }
    await this.repo.stopLiveLocation(userId);
    await locationService.clearUserRedisState(userId);

    const journey = await this.repo.createJourney(userId, data);

    // Warm up polyline cache if route_polyline was provided
    if (journey.route_polyline) {
      polylineCache.getOrCreate(Number(journey.id), journey.route_polyline);
    }

    // Also activate user's live location at the starting point
    await this.repo.upsertLiveLocation(userId, {
      journey_id: journey.id,
      latitude: data.start_latitude,
      longitude: data.start_longitude,
      transport_mode: journey.transport_mode,
    });

    return journey;
  }

  async endJourney(userId: number, journeyId: string | number, data: EndJourneyDTO): Promise<Journey> {
    const journey = await this.repo.findJourneyById(journeyId);
    if (!journey) {
      throw new Error('Journey not found');
    }

    if (Number(journey.user_id) !== Number(userId)) {
      throw new Error('Forbidden: You can only end your own journeys');
    }

    if (journey.status !== 'ACTIVE') {
      throw new Error(`Journey has already been marked as ${journey.status}`);
    }

    // Prefer server-computed running distance from Redis; fallback to client value only if server distance is 0/unavailable
    const runningMeters = await locationRedisRepository.getRunningDistance(userId);
    let distanceKm: number | undefined;
    if (runningMeters > 0) {
      distanceKm = Math.round((runningMeters / 1000) * 100) / 100;
    } else if (data.distance_km !== undefined) {
      distanceKm = data.distance_km;
    }

    const updated = await this.repo.endJourney(journeyId, {
      ...data,
      distance_km: distanceKm,
    });
    if (!updated) {
      throw new Error('Failed to end journey');
    }

    // Save final breadcrumb point at journey end
    let endLat = data.end_latitude;
    let endLng = data.end_longitude;
    if (endLat === undefined || endLng === undefined) {
      const lastKnown = await locationRedisRepository.getUserLocation(userId);
      if (lastKnown) {
        endLat = lastKnown.lat;
        endLng = lastKnown.lng;
      }
    }
    if (endLat !== undefined && endLng !== undefined) {
      try {
        await this.repo.createJourneyLocation({
          journey_id: Number(journeyId),
          user_id: userId,
          latitude: endLat,
          longitude: endLng,
          speed: data.avg_speed_kmh,
          recorded_at: new Date(),
        });
      } catch (err: any) {
        console.error(`[JourneyService] Error saving final breadcrumb point at journey end for ${journeyId}:`, err.message);
      }
    }

    // Stop live location sharing, evict polyline cache, and clear Redis state
    await this.repo.stopLiveLocation(userId);
    await locationService.clearUserRedisState(userId);
    locationService.evictJourneyPolyline(Number(journeyId));

    return updated;
  }

  async cancelJourney(userId: number, journeyId: string | number): Promise<Journey> {
    const journey = await this.repo.findJourneyById(journeyId);
    if (!journey || Number(journey.user_id) !== Number(userId)) {
      throw new Error('Journey not found');
    }

    if (journey.status !== 'ACTIVE') {
      throw new Error(`Journey has already been marked as ${journey.status}`);
    }

    const runningMeters = await locationRedisRepository.getRunningDistance(userId);
    const cancelled = await this.repo.cancelJourney(journeyId, userId);
    if (!cancelled) {
      throw new Error('Failed to cancel journey');
    }

    if (runningMeters > 0) {
      await this.repo.updateJourneyDistance(cancelled.id, Math.round((runningMeters / 1000) * 100) / 100);
    }

    await this.repo.stopLiveLocation(userId);
    await locationService.clearUserRedisState(userId);
    locationService.evictJourneyPolyline(Number(journeyId));

    return cancelled;
  }

  async getActiveJourney(userId: number): Promise<Journey | null> {
    // Auto-expire active journey if off-route or inactive for > 30 minutes
    const { expiredJourneys } = await this.repo.autoExpireStaleJourneys(userId, 30);
    for (const j of expiredJourneys) {
      const runningMeters = await locationRedisRepository.getRunningDistance(j.user_id);
      if (runningMeters > 0) {
        await this.repo.updateJourneyDistance(j.id, Math.round((runningMeters / 1000) * 100) / 100);
      }
      await locationService.clearUserRedisState(j.user_id);
      locationService.evictJourneyPolyline(Number(j.id));
    }
    return this.repo.findActiveJourneyByUserId(userId);
  }

  async autoExpireAllStaleJourneys(timeoutMinutes = 30): Promise<number> {
    const { count, expiredJourneys } = await this.repo.autoExpireStaleJourneys(undefined, timeoutMinutes);
    for (const j of expiredJourneys) {
      const runningMeters = await locationRedisRepository.getRunningDistance(j.user_id);
      if (runningMeters > 0) {
        await this.repo.updateJourneyDistance(j.id, Math.round((runningMeters / 1000) * 100) / 100);
      }
      await locationService.clearUserRedisState(j.user_id);
      locationService.evictJourneyPolyline(Number(j.id));
    }
    return count;
  }

  async flushActiveJourneyDistances(): Promise<number> {
    const activeJourneys = await this.repo.findActiveJourneys();
    let flushedCount = 0;
    for (const j of activeJourneys) {
      const runningMeters = await locationRedisRepository.getRunningDistance(j.user_id);
      if (runningMeters > 0) {
        const km = Math.round((runningMeters / 1000) * 100) / 100;
        await this.repo.updateJourneyDistance(j.id, km);
        flushedCount++;
      }
    }
    return flushedCount;
  }

  async getJourneyById(id: string | number, userId?: number, isAdmin = false): Promise<Journey> {
    const journey = await this.repo.findJourneyById(id);
    if (!journey) {
      throw new Error('Journey not found');
    }

    if (!isAdmin && userId && Number(journey.user_id) !== Number(userId)) {
      throw new Error('Forbidden: You do not have permission to view this journey');
    }

    return journey;
  }

  async getJourneys(options: JourneyFilterOptions) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 10));

    const { journeys, total } = await this.repo.findJourneys({ ...options, page, limit });
    const pagination = getPaginationMeta(total, page, limit);

    return { journeys, pagination };
  }

  async deleteJourney(id: string | number, userId: number, isAdmin = false): Promise<boolean> {
    const journey = await this.repo.findJourneyById(id);
    if (!journey) {
      throw new Error('Journey not found');
    }

    if (!isAdmin && Number(journey.user_id) !== Number(userId)) {
      throw new Error('Forbidden: You do not have permission to delete this journey');
    }

    locationService.evictJourneyPolyline(Number(id));
    await locationService.clearUserRedisState(userId);

    return this.repo.deleteJourney(id, Number(journey.user_id));
  }

  // --- Live Geolocation Flow ---
  async updateLiveLocation(userId: number, data: UpdateLiveLocationDTO): Promise<LiveLocation> {
    const liveLoc = await this.repo.upsertLiveLocation(userId, data);

    // If journey_id is supplied or user has an active journey, validate and refresh route activity
    try {
      const activeJourney = data.journey_id
        ? await this.repo.findJourneyById(data.journey_id)
        : await this.repo.findActiveJourneyByUserId(userId);

      if (
        activeJourney &&
        Number(activeJourney.user_id) === Number(userId) &&
        activeJourney.status === 'ACTIVE'
      ) {
        if (activeJourney.route_polyline) {
          const isOnRoute = polylineCache.isPointOnRoute(
            { latitude: data.latitude, longitude: data.longitude },
            Number(activeJourney.id),
            activeJourney.route_polyline,
            0.04 // 40m buffer threshold for GPS drift while eliminating parallel streets
          );

          if (isOnRoute) {
            await this.repo.updateLastOnRouteAt(activeJourney.id);
          }
        } else {
          // If no polyline stored, refresh active journey timestamp on valid coordinate update
          await this.repo.updateLastOnRouteAt(activeJourney.id);
        }
      }
    } catch (err) {
      console.warn('Polyline on-route tracking check error:', err);
    }

    return liveLoc;
  }

  async stopLiveLocation(userId: number): Promise<void> {
    await this.repo.stopLiveLocation(userId);
    await locationService.clearUserRedisState(userId);
  }

  async getNearbyLocations(options: NearbyLocationOptions): Promise<LiveLocation[]> {
    return this.repo.findNearbyLocations(options);
  }

  // --- Driver Proximity & Awareness Engine ---
  async getDriverAwareness(
    userId: number,
    latitude: number,
    longitude: number,
    radiusKm = 5
  ): Promise<DriverAwarenessResult> {
    // 1. Fetch nearby active hazards
    const hazards = await hazardRepository.findNearby({
      latitude,
      longitude,
      radiusKm,
      status: 'ACTIVE',
      limit: 20,
    });

    // 2. Fetch nearby active cyclists
    const cyclists = await this.repo.findNearbyLocations({
      latitude,
      longitude,
      radiusKm,
      transport_mode: 'CYCLIST',
      excludeUserId: userId,
      limit: 20,
    });

    // 3. Fetch nearby active walkers
    const walkers = await this.repo.findNearbyLocations({
      latitude,
      longitude,
      radiusKm,
      transport_mode: 'WALKER',
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
}

export default new JourneyService();
