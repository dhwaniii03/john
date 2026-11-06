import http from 'http';
import app from './app.js';
import { env } from './config/env.js';
import pool, { connectDB } from './config/database.js';
import { connectRedis, quitRedis, redis, isRedisAvailable } from './config/redis.js';
import { initLocationSocket, closeLocationSocket } from './websocket/location.socket.js';
import journeyService from './modules/journeys/journey.service.js';
import journeyRepository from './modules/journeys/journey.repository.js';
import locationRedisRepository from './modules/locations/location.redis.repository.js';
import { locationConfig } from './config/location.config.js';

let staleJourneyInterval: NodeJS.Timeout | null = null;
const activeTimers: NodeJS.Timeout[] = [];

export const registerTimer = (timer: NodeJS.Timeout): void => {
  activeTimers.push(timer);
};

const server = http.createServer(app);

// Initialize Socket.IO with /location namespace attached to HTTP server
const io = initLocationSocket(server);

const startServer = async () => {
  try {
    await connectDB();
    await connectRedis();

    server.listen(env.port, () => {
      console.log(`🚀 RoadLife server is running on http://${env.host}:${env.port}`);
      console.log(`📡 Environment: ${env.nodeEnv}`);
    });

    // Periodic cleanup of stale active journeys (inactive or off-route for > 30 minutes)
    staleJourneyInterval = setInterval(async () => {
      try {
        const expiredCount = await journeyService.autoExpireAllStaleJourneys(30);
        if (expiredCount > 0) {
          console.log(`🧹 Auto-expired ${expiredCount} stale/off-route journey(s)`);
        }
      } catch (err) {
        console.error('Error during periodic journey auto-expiry check:', err);
      }
    }, 5 * 60 * 1000);

    registerTimer(staleJourneyInterval);

    // Periodic distributed cleanup of stale Redis users (>15 mins inactive) using Redis lock
    const staleRedisCleanupInterval = setInterval(async () => {
      try {
        const cleaned = await locationRedisRepository.cleanStaleUsers();
        if (cleaned > 0) {
          console.log(`🧹 Cleaned ${cleaned} stale user(s) from Redis live tracking`);
        }
      } catch (err: any) {
        console.error('Error during Redis stale location cleanup:', err.message);
      }
    }, locationConfig.redis.cleanupIntervalMs);

    registerTimer(staleRedisCleanupInterval);

    // Periodic distributed running distance flush to PostgreSQL journeys.distance_km (every 60s)
    const distanceFlushInterval = setInterval(async () => {
      if (!isRedisAvailable()) return;
      const lockKey = 'lock:flush:journey_distances';
      const acquired = await redis.set(lockKey, '1', 'EX', 55, 'NX');
      if (!acquired) return;
      try {
        const flushed = await journeyService.flushActiveJourneyDistances();
        if (flushed > 0) {
          console.log(`📊 Flushed running distances to PostgreSQL for ${flushed} active journey(s)`);
        }
      } catch (err: any) {
        console.error('Error during periodic journey distance flush:', err.message);
      } finally {
        await redis.del(lockKey);
      }
    }, locationConfig.redis.distanceFlushIntervalMs);

    registerTimer(distanceFlushInterval);

    // Periodic distributed retention job for journey_locations (older than JOURNEY_LOCATIONS_RETENTION_DAYS)
    const runJourneyLocationsRetention = async () => {
      const lockKey = 'lock:retention:journey_locations';
      if (isRedisAvailable()) {
        const acquired = await redis.set(lockKey, '1', 'EX', 600, 'NX');
        if (!acquired) return;
      }
      try {
        const deleted = await journeyRepository.pruneOldJourneyLocations(
          env.journeyLocationsRetentionDays,
          5000
        );
        if (deleted > 0) {
          console.log(`🧹 [Retention] Pruned ${deleted} journey_locations records older than ${env.journeyLocationsRetentionDays} days`);
        }
      } catch (err: any) {
        console.error('Error during journey_locations retention pruning:', err.message);
      }
    };

    const retentionBootTimeout = setTimeout(runJourneyLocationsRetention, 30000);
    retentionBootTimeout.unref();
    const retentionInterval = setInterval(runJourneyLocationsRetention, 24 * 60 * 60 * 1000);
    registerTimer(retentionInterval);
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown handler
let isShuttingDown = false;
export const gracefulShutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

  // 1. Clear all intervals and registered timers
  if (staleJourneyInterval) clearInterval(staleJourneyInterval);
  activeTimers.forEach((timer) => clearInterval(timer));

  // 2. Stop accepting new HTTP connections and close sockets
  server.close(async () => {
    console.log('🔌 HTTP server closed to new connections.');

    try {
      // 3. Close Socket.IO server & disconnect clients
      await closeLocationSocket();

      // 4. Disconnect Redis cleanly
      await quitRedis();
      console.log('📦 Redis client disconnected.');

      // 5. Drain PostgreSQL pool
      await pool.end();
      console.log('🗄️  PostgreSQL pool drained.');

      console.log('✅ Graceful shutdown completed.');
      process.exit(0);
    } catch (err) {
      console.error('❌ Error during graceful shutdown cleanup:', err);
      process.exit(1);
    }
  });

  // Force shutdown after timeout if hanging
  setTimeout(() => {
    console.error('⚠️  Graceful shutdown timed out, forcing exit.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();

export { server, io };
