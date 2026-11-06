import { Redis as UpstashRedis } from '@upstash/redis';
import { env } from './env.js';

let isConnected = false;
let lastErrorLogTimestamp = 0;
const ERROR_LOG_THROTTLE_MS = 10000;

export const isRedisConfigured = Boolean(
  env.upstashRedisRestUrl && env.upstashRedisRestToken
);

const rawClient: UpstashRedis | null = isRedisConfigured
  ? new UpstashRedis({
      url: env.upstashRedisRestUrl!,
      token: env.upstashRedisRestToken!,
    })
  : null;

/**
 * Creates a compatibility wrapper around Upstash Redis so that existing
 * ioredis commands (positional SET NX EX, pipeline signatures, status, event listeners)
 * work seamlessly without modification.
 */
function createRedisProxy(client: UpstashRedis | null): any {
  if (!client) {
    const pipeMock: any = {
      geoadd: () => pipeMock,
      zadd: () => pipeMock,
      zrem: () => pipeMock,
      zscore: () => pipeMock,
      hset: () => pipeMock,
      expire: () => pipeMock,
      del: () => pipeMock,
      exec: async () => [],
    };

    const dummy: any = {
      status: 'close',
      on: () => dummy,
      once: () => dummy,
      off: () => dummy,
      connect: async () => false,
      quit: async () => {},
      disconnect: () => {},
      ping: async () => 'PONG',
      get: async () => null,
      set: async () => null,
      del: async () => 0,
      hget: async () => null,
      hset: async () => 0,
      hgetall: async () => ({}),
      hincrbyfloat: async () => 0,
      zrange: async () => [],
      zrangebyscore: async () => [],
      pipeline: () => pipeMock,
    };
    return dummy;
  }

  const wrappedPipeline = () => {
    const p = client.pipeline();
    const wrapper = {
      geoadd(key: string, ...args: any[]) {
        if (args.length === 3) {
          // Positional: (lng, lat, member)
          (p as any).geoadd(key, {
            longitude: Number(args[0]),
            latitude: Number(args[1]),
            member: String(args[2]),
          });
        } else {
          (p as any).geoadd(key, args[0]);
        }
        return wrapper;
      },
      zadd(key: string, ...args: any[]) {
        if (args.length === 2) {
          // Positional: (score, member)
          (p as any).zadd(key, {
            score: Number(args[0]),
            member: String(args[1]),
          });
        } else {
          (p as any).zadd(key, args[0]);
        }
        return wrapper;
      },
      zrem(key: string, ...members: any[]) {
        (p as any).zrem(key, ...members.map(String));
        return wrapper;
      },
      zscore(key: string, member: any) {
        (p as any).zscore(key, String(member));
        return wrapper;
      },
      hset(key: string, ...args: any[]) {
        if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
          (p as any).hset(key, args[0]);
        } else if (args.length >= 2 && typeof args[0] === 'string') {
          (p as any).hset(key, { [args[0]]: args[1] });
        } else {
          (p as any).hset(key, args[0]);
        }
        return wrapper;
      },
      expire(key: string, seconds: number) {
        (p as any).expire(key, seconds);
        return wrapper;
      },
      del(...keys: string[]) {
        (p as any).del(...keys);
        return wrapper;
      },
      async exec() {
        return p.exec();
      },
    };
    return wrapper;
  };

  const proxy = new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'pipeline') {
        return wrappedPipeline;
      }
      if (prop === 'status') {
        return isConnected ? 'ready' : 'close';
      }
      if (prop === 'on' || prop === 'once' || prop === 'off') {
        return () => proxy;
      }
      if (prop === 'connect') {
        return async () => {
          await target.ping();
          isConnected = true;
          return 'OK';
        };
      }
      if (prop === 'quit' || prop === 'disconnect') {
        return async () => {
          isConnected = false;
        };
      }
      if (prop === 'hset') {
        return async (key: string, ...args: any[]) => {
          if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
            return target.hset(key, args[0]);
          }
          if (args.length >= 2 && typeof args[0] === 'string') {
            return target.hset(key, { [args[0]]: args[1] });
          }
          return (target as any).hset(key, ...args);
        };
      }
      if (prop === 'set') {
        return async (key: string, value: any, ...args: any[]) => {
          if (args.length === 0) {
            return target.set(key, value);
          }
          if (typeof args[0] === 'object' && args[0] !== null) {
            return target.set(key, value, args[0]);
          }
          // Handle positional arguments: ('EX', seconds, 'NX')
          const opts: any = {};
          for (let i = 0; i < args.length; i++) {
            const a = String(args[i]).toUpperCase();
            if (a === 'EX' && i + 1 < args.length) {
              opts.ex = Number(args[++i]);
            } else if (a === 'PX' && i + 1 < args.length) {
              opts.px = Number(args[++i]);
            } else if (a === 'NX') {
              opts.nx = true;
            } else if (a === 'XX') {
              opts.xx = true;
            }
          }
          return target.set(key, value, opts);
        };
      }
      if (prop === 'zrangebyscore') {
        return async (key: string, min: any, max: any, ...args: any[]) => {
          const opts: any = { byScore: true };
          for (let i = 0; i < args.length; i++) {
            const a = String(args[i]).toUpperCase();
            if (a === 'LIMIT' && i + 2 < args.length) {
              opts.offset = Number(args[++i]);
              opts.count = Number(args[++i]);
            }
          }
          const minScore = min === '-inf' ? 0 : Number(min);
          const maxScore = max === '+inf' ? Date.now() + 1e12 : Number(max);
          return target.zrange(key, minScore, maxScore, opts);
        };
      }
      const val = Reflect.get(target, prop, receiver);
      if (typeof val === 'function') {
        return val.bind(target);
      }
      return val;
    },
  });

  return proxy;
}

export const redis = createRedisProxy(rawClient);

/**
 * Connect to Redis at server bootstrap without halting server if offline.
 */
export const connectRedis = async (): Promise<boolean> => {
  if (!isRedisConfigured || !rawClient) {
    console.warn('⚠️  Upstash Redis is not configured (missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN). Live caching disabled.');
    isConnected = false;
    return false;
  }

  try {
    const start = Date.now();
    const res = await rawClient.ping();
    const latency = Date.now() - start;
    isConnected = true;
    console.log(`🚀 Upstash Redis connected successfully: ${res} (${latency}ms)`);
    return true;
  } catch (err: any) {
    isConnected = false;
    const now = Date.now();
    if (now - lastErrorLogTimestamp > ERROR_LOG_THROTTLE_MS) {
      lastErrorLogTimestamp = now;
      console.warn('⚠️  Initial Upstash Redis connection failed:', err.message);
    }
    return false;
  }
};

/**
 * Returns true if Redis is configured and responsive.
 */
export const isRedisAvailable = (): boolean => {
  return isConnected && isRedisConfigured;
};

/**
 * Ping Redis to verify active round-trip.
 */
export const checkRedisHealth = async (): Promise<{
  status: 'healthy' | 'unhealthy';
  latencyMs?: number;
  error?: string;
}> => {
  if (!isRedisConfigured || !rawClient) {
    return { status: 'unhealthy', error: 'Upstash Redis credentials are not configured' };
  }

  const start = Date.now();
  try {
    await rawClient.ping();
    isConnected = true;
    return { status: 'healthy', latencyMs: Date.now() - start };
  } catch (err: any) {
    isConnected = false;
    return { status: 'unhealthy', error: err.message };
  }
};

/**
 * Graceful shutdown of Redis client.
 */
export const quitRedis = async (): Promise<void> => {
  isConnected = false;
  console.log('ℹ️  Upstash Redis client disconnected');
};

/**
 * Cache helper: Get a parsed JSON value by key
 */
export const getCache = async <T>(key: string): Promise<T | null> => {
  if (!isRedisAvailable() || !rawClient) return null;
  try {
    const data = await rawClient.get<T>(key);
    return data ?? null;
  } catch (error: any) {
    console.warn(`[Redis Cache Error] getCache failed for key "${key}":`, error.message);
    return null;
  }
};

/**
 * Cache helper: Set a value with optional TTL (in seconds)
 */
export const setCache = async (
  key: string,
  value: any,
  ttlSeconds?: number
): Promise<void> => {
  if (!isRedisAvailable() || !rawClient) return;
  try {
    if (ttlSeconds && ttlSeconds > 0) {
      await rawClient.set(key, value, { ex: ttlSeconds });
    } else {
      await rawClient.set(key, value);
    }
  } catch (error: any) {
    console.warn(`[Redis Cache Error] setCache failed for key "${key}":`, error.message);
  }
};

/**
 * Cache helper: Delete a single key
 */
export const deleteCache = async (key: string): Promise<void> => {
  if (!isRedisAvailable() || !rawClient) return;
  try {
    await rawClient.del(key);
  } catch (error: any) {
    console.warn(`[Redis Cache Error] deleteCache failed for key "${key}":`, error.message);
  }
};

/**
 * Cache helper: Delete all keys matching a pattern (e.g., 'user:*')
 */
export const deleteCachePattern = async (pattern: string): Promise<void> => {
  if (!isRedisAvailable() || !rawClient) return;
  try {
    const keys = await rawClient.keys(pattern);
    if (keys && keys.length > 0) {
      await rawClient.del(...keys);
    }
  } catch (error: any) {
    console.warn(`[Redis Cache Error] deleteCachePattern failed for pattern "${pattern}":`, error.message);
  }
};

/**
 * Cache helper: Get from cache, or invoke fetcher and cache result
 */
export const getOrSetCache = async <T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds = 300
): Promise<T> => {
  const cached = await getCache<T>(key);
  if (cached !== null) {
    return cached;
  }

  const result = await fetcher();
  if (result !== undefined && result !== null) {
    await setCache(key, result, ttlSeconds);
  }
  return result;
};

export default redis;
