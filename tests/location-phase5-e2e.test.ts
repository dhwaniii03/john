import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'http';
import { io as Client, type Socket as ClientSocket } from 'socket.io-client';
import { generateToken } from '../src/utils/jwt.js';
import { connectRedis, quitRedis, isRedisAvailable, redis } from '../src/config/redis.js';
import locationRedisRepository from '../src/modules/locations/location.redis.repository.js';
import locationService from '../src/modules/locations/location.service.js';
import journeyService from '../src/modules/journeys/journey.service.js';
import journeyRepository from '../src/modules/journeys/journey.repository.js';
import hazardRepository from '../src/modules/hazards/hazard.repository.js';
import { decodePolyline } from '../src/utils/geo.js';

vi.mock('../src/config/database.js', async () => {
  const actual = await vi.importActual('../src/config/database.js');
  return {
    ...actual,
    pool: {
      connect: vi.fn(),
      query: vi.fn(async (text: string, params: any[]) => {
        if (text.includes('FROM users')) {
          const userId = params?.[0];
          return {
            rows: [
              {
                id: userId,
                email: 'test@test.com',
                name: 'Test User',
                role: 'user',
                transport_mode: 'DRIVER',
                status: 'ACTIVE',
                deleted_at: null,
              },
            ],
          };
        }
        if (text.includes('FROM journeys')) {
          return {
            rows: [
              {
                id: params?.[0] || 992,
                user_id: params?.[1] || 7702,
                status: 'ACTIVE',
                distance_km: 0,
                route_polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
              },
            ],
          };
        }
        return { rows: [] };
      }),
    },
  };
});

describe('Phase 5: Hazards Area Event, Distance Monotonicity & End-to-End Tracking', () => {
  let server: http.Server;
  let serverPort: number;
  let closeLocationSocket: () => Promise<void>;

  beforeAll(async () => {
    process.env.LOCATION_SOCKET_ENABLED = 'true';
    const { env } = await import('../src/config/env.js');
    env.locationSocketEnabled = true;

    await connectRedis();

    server = http.createServer();
    const socketModule = await import('../src/websocket/location.socket.js');
    socketModule.initLocationSocket(server);
    closeLocationSocket = socketModule.closeLocationSocket;

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        serverPort = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterAll(async () => {
    // Key hygiene: delete only test keys
    await locationRedisRepository.removeUserLocation(7701);
    await locationRedisRepository.removeUserLocation(7702);
    await closeLocationSocket();
    await quitRedis();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const connectClient = (token: string): Promise<ClientSocket> => {
    return new Promise((resolve, reject) => {
      const client = Client(`http://127.0.0.1:${serverPort}/location`, {
        transports: ['websocket'],
        auth: { token },
        reconnection: false,
      });

      client.on('connect', () => resolve(client));
      client.on('connect_error', (err) => reject(err));
    });
  };

  describe('1. Distance Monotonicity & Meter-to-Km Conversion', () => {
    it('1000m accurately converts to 1.0 km, 1500m to 1.5 km, 250m to 0.25 km', () => {
      const toKm = (meters: number) => Math.round((meters / 1000) * 100) / 100;
      expect(toKm(1000)).toBe(1.0);
      expect(toKm(1500)).toBe(1.5);
      expect(toKm(250)).toBe(0.25);
      expect(toKm(1234)).toBe(1.23);
    });

    it('Live state rebuild seeds running distance from journeys.distance_km', async () => {
      if (!isRedisAvailable()) return;

      const userId = 7701;
      const journeyId = 901;

      // Ensure clean initial state in Redis
      await locationRedisRepository.removeUserLocation(userId);

      // Mock active journey in DB with 3.5 km distance
      vi.spyOn(journeyRepository, 'findJourneyById').mockResolvedValue({
        id: journeyId,
        user_id: userId,
        status: 'ACTIVE',
        distance_km: 3.5,
        route_polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
      } as any);

      vi.spyOn(locationService, 'verifyActiveJourney').mockResolvedValue(true);
      vi.spyOn(journeyRepository, 'createJourneyLocation').mockResolvedValue(undefined as any);

      const now = Date.now();
      const pingResult = await locationService.processLocationPing(userId, 'DRIVER', {
        lat: 12.9716,
        lng: 77.5946,
        journeyId,
        clientTimestamp: now,
      });

      expect(pingResult.success).toBe(true);

      // Verify that Redis was seeded with 3500 meters (3.5 km * 1000)
      const seededDistance = await locationRedisRepository.getRunningDistance(userId);
      expect(seededDistance).toBe(3500);

      // Clean up
      await locationRedisRepository.removeUserLocation(userId);
    });
  });

  describe('2. Phase 5: hazards:area WebSocket Event & Area Caching', () => {
    it('Responds with hazards in bounding box via acknowledgement callback', async () => {
      const token = generateToken({ userId: 101, email: 'active@test.com', role: 'user' });
      const client = await connectClient(token);

      // Mock database findInBoundingBox
      vi.spyOn(hazardRepository, 'findInBoundingBox').mockResolvedValue([
        {
          id: 1,
          title: 'Pothole on Main Road',
          latitude: 12.972,
          longitude: 77.595,
          status: 'ACTIVE',
        } as any,
      ]);

      const response = await new Promise<any>((resolve) => {
        client.emit(
          'hazards:area',
          {
            minLat: 12.96,
            minLng: 77.58,
            maxLat: 12.98,
            maxLng: 77.61,
            limit: 20,
          },
          (err: any, data: any) => resolve({ err, data })
        );
      });

      expect(response.err).toBeNull();
      expect(response.data).toBeDefined();
      expect(response.data.hazards.length).toBe(1);
      expect(response.data.hazards[0].title).toBe('Pothole on Main Road');

      client.disconnect();
    });

    it('Rejects bounding boxes exceeding maximum allowed span (0.5 degrees per axis)', async () => {
      const token = generateToken({ userId: 101, email: 'active@test.com', role: 'user' });
      const client = await connectClient(token);

      const response = await new Promise<any>((resolve) => {
        client.emit(
          'hazards:area',
          {
            minLat: 12.0,
            minLng: 77.0,
            maxLat: 13.0, // 1.0 degree span > 0.5 limit
            maxLng: 77.2,
          },
          (err: any, data: any) => resolve({ err, data })
        );
      });

      expect(response.err).toBeDefined();
      expect(response.err.code).toBe('INVALID_BOUNDS');

      client.disconnect();
    });

    it('Rate limits rapid hazards:area queries within min gap (5s)', async () => {
      const token = generateToken({ userId: 101, email: 'active@test.com', role: 'user' });
      const client = await connectClient(token);

      vi.spyOn(hazardRepository, 'findInBoundingBox').mockResolvedValue([]);

      // First query succeeds
      await new Promise<any>((resolve) => {
        client.emit(
          'hazards:area',
          { minLat: 12.96, minLng: 77.58, maxLat: 12.98, maxLng: 77.6 },
          () => resolve(true)
        );
      });

      // Immediate second query is rate limited
      const secondResponse = await new Promise<any>((resolve) => {
        client.emit(
          'hazards:area',
          { minLat: 12.96, minLng: 77.58, maxLat: 12.98, maxLng: 77.6 },
          (err: any, data: any) => resolve({ err, data })
        );
      });

      expect(secondResponse.err).toBeDefined();
      expect(secondResponse.err.code).toBe('RATE_LIMITED');

      client.disconnect();
    });

    it('Handles hazards:area with missing callback without crashing or throwing', async () => {
      const token = generateToken({ userId: 102, email: 'nocb@test.com', role: 'user' });
      const client = await connectClient(token);

      vi.spyOn(hazardRepository, 'findInBoundingBox').mockResolvedValue([]);

      const receivedEvent = new Promise<any>((resolve) => {
        client.on('hazards:area:response', (data) => resolve(data));
      });

      // Emit without callback function
      client.emit('hazards:area', { minLat: 12.96, minLng: 77.58, maxLat: 12.98, maxLng: 77.6 });

      const res = await Promise.race([
        receivedEvent,
        new Promise((r) => setTimeout(() => r('timeout'), 1000)),
      ]);
      expect(res).not.toBe('timeout');

      client.disconnect();
    });

    it('Cache hit/miss, per-client center ordering, and truncated: true on cap hit', async () => {
      if (isRedisAvailable()) {
        await redis.del('cache:hazards:bbox:12.96:77.58:12.98:77.6');
      }

      // 2 hazards in the shared snapped grid cell [12.96, 77.58, 12.98, 77.60]
      // Hazard 10 is near southwest, Hazard 20 is near northeast
      const hazardCloseToA = { id: 10, title: 'Near A', latitude: 12.964, longitude: 77.584, severity: 'HIGH' };
      const hazardCloseToB = { id: 20, title: 'Near B', latitude: 12.974, longitude: 77.594, severity: 'HIGH' };

      const dbSpy = vi.spyOn(hazardRepository, 'findInBoundingBox').mockResolvedValue([
        hazardCloseToA,
        hazardCloseToB,
      ] as any);

      // Client A query: box [12.961, 77.581, 12.975, 77.595] -> center (12.968, 77.588), closer to Hazard 10
      const resA = await locationService.getHazardsInArea({
        minLat: 12.961,
        minLng: 77.581,
        maxLat: 12.975,
        maxLng: 77.595,
      });

      expect(dbSpy).toHaveBeenCalledTimes(1);
      expect(resA.hazards.length).toBe(2);
      expect(resA.hazards[0].id).toBe(10); // Closest to Client A center
      expect(resA.hazards[1].id).toBe(20);
      expect(resA.truncated).toBe(false);

      // Client B query: box [12.963, 77.583, 12.977, 77.597] -> center (12.970, 77.590), closer to Hazard 20
      // Snaps to the SAME grid cell: [12.96, 77.58, 12.98, 77.60]
      const resB = await locationService.getHazardsInArea({
        minLat: 12.963,
        minLng: 77.583,
        maxLat: 12.977,
        maxLng: 77.597,
      });

      // Cache hit: DB was not queried again!
      expect(dbSpy).toHaveBeenCalledTimes(1);
      expect(resB.hazards.length).toBe(2);
      // Client B's center orders hazardCloseToB (id 20) first!
      expect(resB.hazards[0].id).toBe(20);
      expect(resB.hazards[1].id).toBe(10);

      // Verify truncated: true when cap (300) is reached
      if (isRedisAvailable()) {
        await redis.del('cache:hazards:bbox:12.96:77.58:12.98:77.6');
      }
      const fake300Hazards = Array.from({ length: 300 }, (_, i) => ({
        id: i + 1,
        title: `Cap Hazard ${i + 1}`,
        latitude: 12.965,
        longitude: 77.585,
        severity: 'MEDIUM',
      }));
      dbSpy.mockResolvedValueOnce(fake300Hazards as any);

      const resCap = await locationService.getHazardsInArea({
        minLat: 12.960,
        minLng: 77.580,
        maxLat: 12.980,
        maxLng: 77.600,
      });
      expect(resCap.truncated).toBe(true);
    });

    it('findNearby handles cos(latitude) scale, pole clamping, and +/-180 wrap correctly', async () => {
      const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
      vi.spyOn(await import('../src/config/database.js'), 'query').mockImplementation(mockQuery as any);

      // Test 1: Near pole (lat = 89.95 clamped)
      await hazardRepository.findNearby({
        latitude: 89.95,
        longitude: 0,
        radiusKm: 10,
      });
      expect(mockQuery).toHaveBeenCalled();
      let lastCallSql = mockQuery.mock.calls[0][0];
      expect(lastCallSql).toContain('h.longitude BETWEEN -180 AND 180');

      // Test 2: Wrap around +180 antimeridian
      mockQuery.mockClear();
      await hazardRepository.findNearby({
        latitude: 0,
        longitude: 179.95,
        radiusKm: 20, // lonDelta approx 0.18 deg -> maxLng > 180
      });
      lastCallSql = mockQuery.mock.calls[0][0];
      expect(lastCallSql).toContain('OR h.longitude <=');

      // Test 3: Wrap around -180 antimeridian
      mockQuery.mockClear();
      await hazardRepository.findNearby({
        latitude: 0,
        longitude: -179.95,
        radiusKm: 20,
      });
      lastCallSql = mockQuery.mock.calls[0][0];
      expect(lastCallSql).toContain('h.longitude >=');
    });

    it('rollbackLastMigration refuses to run and throws if down file is missing', async () => {
      const { rollbackLastMigration } = await import('../src/database/migrations/rollback.js');
      const { pool } = await import('../src/config/database.js');

      // Mock DB client returning a migration without down file
      const mockClient = {
        query: vi.fn(async (text: string) => {
          if (text.includes('SELECT id, migration_name FROM schema_migrations')) {
            return {
              rows: [{ id: 999, migration_name: '999_missing_down_migration.sql' }],
            };
          }
          return { rows: [] };
        }),
        release: vi.fn(),
      };

      vi.spyOn(pool, 'connect').mockResolvedValue(mockClient as any);

      await expect(rollbackLastMigration()).rejects.toThrow(/Cannot rollback/i);
      // Ensure it did NOT delete from schema_migrations
      const deleteCalls = mockClient.query.mock.calls.filter((call) =>
        call[0]?.includes('DELETE FROM schema_migrations')
      );
      expect(deleteCalls.length).toBe(0);
    });
  });

  describe('3. End-to-End Journey Tracking & Breadcrumbs Lifecycle', () => {
    it('End-to-End: pings along route save breadcrumbs, update on-route, accumulate distance, and prefer server distance on end', async () => {
      if (!isRedisAvailable()) return;

      const userId = 7702;
      const journeyId = 992;
      const token = generateToken({ userId, email: 'e2e@test.com', role: 'user' });

      // Clean Redis state
      await locationRedisRepository.removeUserLocation(userId);
      locationService.resetThrottles(userId, journeyId);

      const coords = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
      expect(coords.length).toBeGreaterThan(0);

      // Mock journey in DB
      vi.spyOn(journeyRepository, 'findJourneyById').mockResolvedValue({
        id: journeyId,
        user_id: userId,
        status: 'ACTIVE',
        distance_km: 0,
        route_polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
      } as any);

      vi.spyOn(locationService, 'verifyActiveJourney').mockResolvedValue(true);
      const createLocationSpy = vi.spyOn(journeyRepository, 'createJourneyLocation').mockResolvedValue(undefined as any);
      const updateOnRouteSpy = vi.spyOn(journeyRepository, 'updateLastOnRouteAt').mockResolvedValue(undefined as any);
      const endJourneyRepoSpy = vi.spyOn(journeyRepository, 'endJourney').mockResolvedValue({
        id: journeyId,
        user_id: userId,
        status: 'COMPLETED',
        distance_km: 0.15,
      } as any);

      const client = await connectClient(token);

      // Ping 1: Initial starting coordinate -> saves initial breadcrumb
      const now = Date.now();
      await new Promise<void>((resolve) => {
        client.emit(
          'location:update',
          {
            lat: coords[0].latitude,
            lng: coords[0].longitude,
            speed: 12,
            heading: 90,
            journeyId,
            clientTimestamp: now,
          }
        );
        client.once('location:ack', () => resolve());
      });

      expect(createLocationSpy).toHaveBeenCalledTimes(1);

      // Wait 2000ms so 120m movement gives implied speed of ~60 m/s (< 100 m/s max jump filter)
      await new Promise((r) => setTimeout(r, 2000));

      // Ping 2: Move ~120 meters along route (0.00108 deg) -> triggers DRIVER rule (>= 100m) and on-route check
      const t2 = Date.now();
      await new Promise<void>((resolve) => {
        client.emit(
          'location:update',
          {
            lat: coords[0].latitude + 0.00108,
            lng: coords[0].longitude,
            speed: 25,
            heading: 90,
            journeyId,
            clientTimestamp: t2,
          }
        );
        client.once('location:ack', () => resolve());
      });

      // 2 breadcrumbs saved in journey_locations
      expect(createLocationSpy).toHaveBeenCalledTimes(2);
      expect(updateOnRouteSpy).toHaveBeenCalled();

      // Check distance accumulated in Redis
      const runningDistMeters = await locationRedisRepository.getRunningDistance(userId);
      expect(runningDistMeters).toBeGreaterThan(100);

      // End Journey: client supplies a stale distance of 0.01 km, but server PREFERS server-computed distance (runningDistMeters ~ 0.15 km)
      const endedJourney = await journeyService.endJourney(userId, journeyId, {
        status: 'COMPLETED',
        distance_km: 0.01, // Client stale value
        end_latitude: coords[0].latitude + 0.00135,
        end_longitude: coords[0].longitude,
      });

      expect(endedJourney).toBeDefined();
      // Confirm endJourney called repository with server-computed distance (~0.15 km), NOT the stale client value 0.01 km
      expect(endJourneyRepoSpy).toHaveBeenCalledWith(
        journeyId,
        expect.objectContaining({
          distance_km: expect.closeTo(0.15, 0.05),
        })
      );

      // Confirm final point saved in journey_locations
      expect(createLocationSpy).toHaveBeenCalledTimes(3);

      // Confirm Redis live state is cleared after journey end
      const userAfterEnd = await locationRedisRepository.getUserLocation(userId);
      expect(userAfterEnd).toBeNull();

      client.disconnect();
    }, 10000);
  });
});
