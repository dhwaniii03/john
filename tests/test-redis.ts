import {
  connectRedis,
  isRedisAvailable,
  getCache,
  setCache,
  deleteCache,
  getOrSetCache,
  redis,
} from '../src/config/redis.js';
import locationRedisRepository from '../src/modules/locations/location.redis.repository.js';

async function runRedisTests() {
  console.log('--- Testing Upstash Redis Integration ---');

  const connected = await connectRedis();
  if (!connected || !isRedisAvailable()) {
    console.error('❌ Failed to connect to Upstash Redis. Check your .env credentials.');
    process.exit(1);
  }

  const testKey = 'test:upstash:user:123';
  const testData = { id: 123, name: 'John Doe', role: 'driver' };

  // 1. Basic Set & Get
  console.log('1. Testing setCache and getCache...');
  await setCache(testKey, testData, 60);
  const retrieved = await getCache<typeof testData>(testKey);
  console.log('Retrieved user from cache:', retrieved);
  if (!retrieved || retrieved.id !== testData.id) {
    throw new Error('Retrieved data does not match stored data!');
  }

  // 2. getOrSetCache
  console.log('2. Testing getOrSetCache pattern...');
  let fetcherCalled = false;
  const computedKey = 'test:upstash:computed:456';
  await deleteCache(computedKey);

  const initial = await getOrSetCache(computedKey, async () => {
    fetcherCalled = true;
    return { calculatedValue: 42 };
  }, 60);
  console.log('getOrSetCache initial (should call fetcher):', initial, 'fetcherCalled:', fetcherCalled);

  fetcherCalled = false;
  const cachedResult = await getOrSetCache(computedKey, async () => {
    fetcherCalled = true;
    return { calculatedValue: 999 };
  }, 60);
  console.log('getOrSetCache cached (should NOT call fetcher):', cachedResult, 'fetcherCalled:', fetcherCalled);
  if (cachedResult.calculatedValue !== 42 || fetcherCalled !== false) {
    throw new Error('getOrSetCache failed to serve cached value!');
  }

  // 3. Location Redis Repository Live Geo Test
  console.log('3. Testing Location Redis Geo Upsert & Query...');
  const testUserId = 9991;
  await locationRedisRepository.upsertLocation(testUserId, {
    latitude: 12.971598,
    longitude: 77.594562,
    speed: 15.0,
    heading: 90,
    mode: 'DRIVER',
    journeyId: 1001,
  });

  const liveUser = await locationRedisRepository.getUserLocation(testUserId);
  console.log('Retrieved live user state from Redis:', liveUser);
  if (!liveUser || liveUser.mode !== 'DRIVER' || liveUser.journeyId !== '1001') {
    throw new Error('Live user state failed to retrieve correctly!');
  }

  const nearby = await locationRedisRepository.getNearbyUsers({
    latitude: 12.971,
    longitude: 77.594,
    radiusKm: 5,
    mode: 'DRIVER',
  });
  console.log('Nearby drivers found:', nearby.length);
  const found = nearby.find((u) => u.userId === testUserId);
  if (!found) {
    throw new Error('Test user not found in nearby drivers geo query!');
  }
  console.log('Found user in geo query:', found);

  // 4. Running Distance accumulation
  console.log('4. Testing running distance accumulation...');
  const d1 = await locationRedisRepository.addRunningDistance(testUserId, 150.5);
  const d2 = await locationRedisRepository.addRunningDistance(testUserId, 50.5);
  const currentDist = await locationRedisRepository.getRunningDistance(testUserId);
  console.log('Accumulated running distance in Redis:', currentDist);
  if (Math.abs(currentDist - 201) > 0.1) {
    throw new Error(`Running distance mismatch: expected ~201, got ${currentDist}`);
  }

  // 5. Cleanup
  console.log('5. Cleaning up test keys...');
  await deleteCache(testKey);
  await deleteCache(computedKey);
  await locationRedisRepository.removeUserLocation(testUserId);
  await redis.del('lock:test');

  const afterDelete = await getCache(testKey);
  console.log('After delete check:', afterDelete);

  console.log('🎉 All Upstash Redis tests passed successfully!');
}

runRedisTests().catch((err) => {
  console.error('❌ Redis test failed:', err);
  process.exit(1);
});
