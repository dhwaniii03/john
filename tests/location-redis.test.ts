import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import locationRedisRepository from '../src/modules/locations/location.redis.repository.js';
import locationService from '../src/modules/locations/location.service.js';
import { connectRedis, quitRedis, isRedisAvailable } from '../src/config/redis.js';

describe('Phase 3: Redis Live Storage & Geo Awareness', () => {
  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    // Cleanup test data
    await locationRedisRepository.removeUserLocation(8881);
    await locationRedisRepository.removeUserLocation(8882);
    await locationRedisRepository.removeUserLocation(8883);
    await quitRedis();
  });

  it('1. Upserts user live location in Redis and retrieves state', async () => {
    if (!isRedisAvailable()) return;

    await locationRedisRepository.upsertLocation(8881, {
      latitude: 12.971598,
      longitude: 77.594562,
      speed: 12.5,
      heading: 90,
      mode: 'DRIVER',
      journeyId: 99,
    });

    const user = await locationRedisRepository.getUserLocation(8881);
    expect(user).toBeDefined();
    expect(user?.lat).toBeCloseTo(12.971598, 4);
    expect(user?.lng).toBeCloseTo(77.594562, 4);
    expect(user?.mode).toBe('DRIVER');
    expect(user?.journeyId).toBe('99');
  });

  it('2. Changing mode removes user from old geo set and adds to new geo set', async () => {
    if (!isRedisAvailable()) return;

    // Initially CYCLIST
    await locationRedisRepository.upsertLocation(8882, {
      latitude: 12.972,
      longitude: 77.595,
      mode: 'CYCLIST',
    });

    let nearbyCyclists = await locationRedisRepository.getNearbyUsers({
      latitude: 12.971,
      longitude: 77.594,
      radiusKm: 2,
      mode: 'CYCLIST',
    });
    expect(nearbyCyclists.some((u) => u.userId === 8882)).toBe(true);

    // Switch to WALKER
    await locationRedisRepository.upsertLocation(8882, {
      latitude: 12.972,
      longitude: 77.595,
      mode: 'WALKER',
      previousMode: 'CYCLIST',
    });

    nearbyCyclists = await locationRedisRepository.getNearbyUsers({
      latitude: 12.971,
      longitude: 77.594,
      radiusKm: 2,
      mode: 'CYCLIST',
    });
    expect(nearbyCyclists.some((u) => u.userId === 8882)).toBe(false);

    const nearbyWalkers = await locationRedisRepository.getNearbyUsers({
      latitude: 12.971,
      longitude: 77.594,
      radiusKm: 2,
      mode: 'WALKER',
    });
    expect(nearbyWalkers.some((u) => u.userId === 8882)).toBe(true);
  });

  it('3. Accumulates and retrieves running distance in Redis', async () => {
    if (!isRedisAvailable()) return;

    await locationRedisRepository.addRunningDistance(8881, 150.5);
    await locationRedisRepository.addRunningDistance(8881, 200.25);

    const total = await locationRedisRepository.getRunningDistance(8881);
    expect(total).toBeCloseTo(350.75, 1);
  });

  it('4. LocationService drops out-of-order pings', async () => {
    if (!isRedisAvailable()) return;

    const t1 = Date.now();
    await locationService.processLocationPing(8883, 'DRIVER', {
      lat: 12.97,
      lng: 77.59,
      clientTimestamp: t1,
    });

    // Send older ping
    const res = await locationService.processLocationPing(8883, 'DRIVER', {
      lat: 12.971,
      lng: 77.591,
      clientTimestamp: t1 - 10000,
    });

    expect(res.success).toBe(false);
    expect(res.code).toBe('OUT_OF_ORDER');
  });

  it('5. LocationService drops impossible jumps (>100 m/s implied speed)', async () => {
    if (!isRedisAvailable()) return;

    const t1 = Date.now();
    await locationService.processLocationPing(8883, 'DRIVER', {
      lat: 12.97,
      lng: 77.59,
      clientTimestamp: t1,
    });

    // 1 second later, jumped 50km
    const res = await locationService.processLocationPing(8883, 'DRIVER', {
      lat: 13.4,
      lng: 77.59,
      clientTimestamp: t1 + 1000,
    });

    expect(res.success).toBe(false);
    expect(res.code).toBe('IMPOSSIBLE_JUMP');
  });
});
