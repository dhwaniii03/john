import { describe, it, expect, beforeEach, vi } from 'vitest';
import { polylineCache, PolylineCache } from '../src/utils/polyline-cache.js';
import { calculateHeadingDifference, decodePolyline } from '../src/utils/geo.js';
import locationService from '../src/modules/locations/location.service.js';
import journeyRepository from '../src/modules/journeys/journey.repository.js';
import locationRedisRepository from '../src/modules/locations/location.redis.repository.js';

describe('Phase 4: Polyline Cache & Mode-Based History Rule', () => {
  beforeEach(() => {
    polylineCache.clear();
    locationService.resetThrottles();
    vi.restoreAllMocks();
  });

  describe('1. PolylineCache & Bounding Box Optimization', () => {
    // Encoded polyline between (12.971598, 77.594562) and (12.975000, 77.598000)
    const testPolyline = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';

    it('Decodes polyline on first access and caches decoded points and bounding box', () => {
      const cached = polylineCache.getOrCreate(1001, testPolyline);
      expect(cached.coordinates.length).toBeGreaterThan(0);
      expect(cached.bbox.minLat).toBeLessThanOrEqual(cached.bbox.maxLat);
      expect(cached.bbox.minLng).toBeLessThanOrEqual(cached.bbox.maxLng);
      expect(polylineCache.size()).toBe(1);

      // Second access returns the cached object without re-parsing
      const cached2 = polylineCache.getOrCreate(1001, testPolyline);
      expect(cached2).toBe(cached);
    });

    it('Rejects points far outside bounding box immediately without segment evaluation', () => {
      polylineCache.getOrCreate(1001, testPolyline);

      // Point in London (far away from Bangalore)
      const isFarOnRoute = polylineCache.isPointOnRoute(
        { latitude: 51.5074, longitude: -0.1278 },
        1001,
        testPolyline
      );
      expect(isFarOnRoute).toBe(false);
    });

    it('Identifies point directly on polyline segment as on-route', () => {
      const coords = decodePolyline(testPolyline);
      expect(coords.length).toBeGreaterThan(0);

      // Point right at start coordinate
      const isOnRoute = polylineCache.isPointOnRoute(
        { latitude: coords[0].latitude, longitude: coords[0].longitude },
        1001,
        testPolyline,
        0.15
      );
      expect(isOnRoute).toBe(true);
    });

    it('Identifies point beyond 150m threshold as off-route', () => {
      const coords = decodePolyline(testPolyline);
      expect(coords.length).toBeGreaterThan(0);

      // Shift point by ~0.01 deg (~1.1 km away)
      const isOffRoute = polylineCache.isPointOnRoute(
        { latitude: coords[0].latitude + 0.01, longitude: coords[0].longitude + 0.01 },
        1001,
        testPolyline,
        0.15
      );
      expect(isOffRoute).toBe(false);
    });

    it('Evicts journey correctly from polyline cache', () => {
      polylineCache.getOrCreate(1001, testPolyline);
      expect(polylineCache.size()).toBe(1);

      polylineCache.evict(1001);
      expect(polylineCache.size()).toBe(0);
    });

    it('Enforces LRU max size eviction', () => {
      const tinyCache = new PolylineCache(2);
      tinyCache.getOrCreate(1, testPolyline);
      tinyCache.getOrCreate(2, testPolyline);
      expect(tinyCache.size()).toBe(2);

      tinyCache.getOrCreate(3, testPolyline);
      expect(tinyCache.size()).toBe(2);
      // Journey 1 was evicted
      expect(tinyCache.getOrCreate(1, testPolyline)).toBeDefined();
    });
  });

  describe('2. Mode-Based Breadcrumb History Saving Rule', () => {
    it('Saves initial breadcrumb for the very first ping of a journey', async () => {
      const createLocationSpy = vi.spyOn(journeyRepository, 'createJourneyLocation').mockResolvedValue(undefined as any);
      const updateHistorySpy = vi.spyOn(locationRedisRepository, 'updateLastSavedHistory').mockResolvedValue(undefined as any);

      const now = Date.now();
      await locationService.evaluateHistoryAndOnRouteChecks(
        771,
        'DRIVER',
        501,
        { lat: 12.9716, lng: 77.5946, clientTimestamp: now, speed: 10, heading: 90 },
        null, // No previous saved history
        now
      );

      expect(createLocationSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          journey_id: 501,
          user_id: 771,
          latitude: 12.9716,
          longitude: 77.5946,
        })
      );
      expect(updateHistorySpy).toHaveBeenCalledWith(
        771,
        expect.objectContaining({
          latitude: 12.9716,
          longitude: 77.5946,
        })
      );
    });

    it('DRIVER: Saves breadcrumb when distance moved >= 100 meters', async () => {
      const createLocationSpy = vi.spyOn(journeyRepository, 'createJourneyLocation').mockResolvedValue(undefined as any);
      const updateHistorySpy = vi.spyOn(locationRedisRepository, 'updateLastSavedHistory').mockResolvedValue(undefined as any);

      const now = Date.now();
      const prev = {
        lat: 12.9716,
        lng: 77.5946,
        mode: 'DRIVER' as const,
        updatedAt: now - 5000,
        runningDistanceMeters: 0,
        lastSavedLat: 12.9716,
        lastSavedLng: 77.5946,
        lastSavedAt: now - 5000, // 5 seconds ago
        lastSavedHeading: 90,
      };

      // Move ~150 meters north (0.00135 deg lat)
      await locationService.evaluateHistoryAndOnRouteChecks(
        771,
        'DRIVER',
        501,
        { lat: 12.97295, lng: 77.5946, clientTimestamp: now, speed: 15, heading: 90 },
        prev,
        now
      );

      expect(createLocationSpy).toHaveBeenCalledTimes(1);
      expect(updateHistorySpy).toHaveBeenCalledTimes(1);
    });

    it('DRIVER: Does NOT save breadcrumb for small movement (< 100m) before time or heading threshold', async () => {
      const createLocationSpy = vi.spyOn(journeyRepository, 'createJourneyLocation').mockResolvedValue(undefined as any);
      const updateHistorySpy = vi.spyOn(locationRedisRepository, 'updateLastSavedHistory').mockResolvedValue(undefined as any);

      const now = Date.now();
      const prev = {
        lat: 12.9716,
        lng: 77.5946,
        mode: 'DRIVER' as const,
        updatedAt: now - 5000,
        runningDistanceMeters: 0,
        lastSavedLat: 12.9716,
        lastSavedLng: 77.5946,
        lastSavedAt: now - 5000, // Only 5s ago (< 20s)
        lastSavedHeading: 90,
      };

      // Move only 20 meters north
      await locationService.evaluateHistoryAndOnRouteChecks(
        771,
        'DRIVER',
        501,
        { lat: 12.97178, lng: 77.5946, clientTimestamp: now, speed: 5, heading: 92 },
        prev,
        now
      );

      expect(createLocationSpy).not.toHaveBeenCalled();
      expect(updateHistorySpy).not.toHaveBeenCalled();
    });

    it('DRIVER: Prevents stationary breadcrumb spam by requiring >= 8m movement for time threshold', async () => {
      const createLocationSpy = vi.spyOn(journeyRepository, 'createJourneyLocation').mockResolvedValue(undefined as any);

      const now = Date.now();
      const prev = {
        lat: 12.9716,
        lng: 77.5946,
        mode: 'DRIVER' as const,
        updatedAt: now - 25000,
        runningDistanceMeters: 0,
        lastSavedLat: 12.9716,
        lastSavedLng: 77.5946,
        lastSavedAt: now - 25000, // 25s ago (> 20s time threshold)
        lastSavedHeading: 90,
      };

      // Stationary ping (0 movement, stopped at traffic signal)
      await locationService.evaluateHistoryAndOnRouteChecks(
        771,
        'DRIVER',
        501,
        { lat: 12.9716, lng: 77.5946, clientTimestamp: now, speed: 0, heading: 90 },
        prev,
        now
      );

      // Dropped because movement was < 8m
      expect(createLocationSpy).not.toHaveBeenCalled();
    });

    it('DRIVER: Saves breadcrumb on heading change >= 20° even across compass 0°/360° north boundary', async () => {
      const createLocationSpy = vi.spyOn(journeyRepository, 'createJourneyLocation').mockResolvedValue(undefined as any);
      const updateHistorySpy = vi.spyOn(locationRedisRepository, 'updateLastSavedHistory').mockResolvedValue(undefined as any);

      const now = Date.now();
      const prev = {
        lat: 12.9716,
        lng: 77.5946,
        mode: 'DRIVER' as const,
        updatedAt: now - 5000,
        runningDistanceMeters: 0,
        lastSavedLat: 12.9716,
        lastSavedLng: 77.5946,
        lastSavedAt: now - 5000,
        lastSavedHeading: 350, // 350 degrees
      };

      // Turn right to 15 degrees: difference is (360 - 350) + 15 = 25 degrees (>= 20° threshold)
      expect(calculateHeadingDifference(15, 350)).toBe(25);

      await locationService.evaluateHistoryAndOnRouteChecks(
        771,
        'DRIVER',
        501,
        { lat: 12.9718, lng: 77.5947, clientTimestamp: now, speed: 10, heading: 15 },
        prev,
        now
      );

      expect(createLocationSpy).toHaveBeenCalledTimes(1);
      expect(updateHistorySpy).toHaveBeenCalledTimes(1);
    });

    it('WALKER: Triggers history save on >= 30m distance or >= 30° heading change', async () => {
      const createLocationSpy = vi.spyOn(journeyRepository, 'createJourneyLocation').mockResolvedValue(undefined as any);

      const now = Date.now();
      const prev = {
        lat: 12.9716,
        lng: 77.5946,
        mode: 'WALKER' as const,
        updatedAt: now - 5000,
        runningDistanceMeters: 0,
        lastSavedLat: 12.9716,
        lastSavedLng: 77.5946,
        lastSavedAt: now - 5000,
        lastSavedHeading: 0,
      };

      // Move ~35 meters (0.00032 deg lat)
      await locationService.evaluateHistoryAndOnRouteChecks(
        771,
        'WALKER',
        501,
        { lat: 12.97192, lng: 77.5946, clientTimestamp: now, speed: 1.2, heading: 0 },
        prev,
        now
      );

      expect(createLocationSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('3. Throttled On-Route Tracking Checks', () => {
    it('Throttles database update of journeys.last_on_route_at to at most once per 30 seconds', async () => {
      vi.spyOn(journeyRepository, 'createJourneyLocation').mockResolvedValue(undefined as any);
      vi.spyOn(locationRedisRepository, 'updateLastSavedHistory').mockResolvedValue(undefined as any);
      const updateSpy = vi.spyOn(journeyRepository, 'updateLastOnRouteAt').mockResolvedValue(undefined as any);
      vi.spyOn(journeyRepository, 'findJourneyById').mockResolvedValue({
        id: 501,
        user_id: 771,
        status: 'ACTIVE',
        route_polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
      } as any);

      const now = Date.now();
      const coords = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');

      // First check at t=0
      await locationService.evaluateHistoryAndOnRouteChecks(
        771,
        'DRIVER',
        501,
        { lat: coords[0].latitude, lng: coords[0].longitude, clientTimestamp: now },
        null,
        now
      );
      expect(updateSpy).toHaveBeenCalledTimes(1);

      // Second check at t=10s: throttled by 15s check throttle -> no DB update
      await locationService.evaluateHistoryAndOnRouteChecks(
        771,
        'DRIVER',
        501,
        { lat: coords[0].latitude, lng: coords[0].longitude, clientTimestamp: now + 10000 },
        null,
        now + 10000
      );
      expect(updateSpy).toHaveBeenCalledTimes(1);

      // Third check at t=20s: check throttle (15s) passed, but update throttle (30s) not passed -> no DB update
      await locationService.evaluateHistoryAndOnRouteChecks(
        771,
        'DRIVER',
        501,
        { lat: coords[0].latitude, lng: coords[0].longitude, clientTimestamp: now + 20000 },
        null,
        now + 20000
      );
      expect(updateSpy).toHaveBeenCalledTimes(1);

      // Fourth check at t=35s: both check throttle (15s) and update throttle (30s) passed -> second DB update
      await locationService.evaluateHistoryAndOnRouteChecks(
        771,
        'DRIVER',
        501,
        { lat: coords[0].latitude, lng: coords[0].longitude, clientTimestamp: now + 35000 },
        null,
        now + 35000
      );
      expect(updateSpy).toHaveBeenCalledTimes(2);
    });
  });
});
