import { createAdapter } from '@socket.io/redis-adapter';
import { Redis, type RedisOptions } from 'ioredis';
import { env } from '../config/env.js';

let pubClient: Redis | null = null;
let subClient: Redis | null = null;

export const createSocketRedisAdapter = () => {
  if (!env.socketRedisAdapter) {
    return undefined;
  }

  const options: RedisOptions = {
    lazyConnect: true,
    maxRetriesPerRequest: null, // Pub/Sub requires null maxRetriesPerRequest
    enableReadyCheck: true,
    retryStrategy(times) {
      return Math.min(times * 200, 3000);
    },
  };

  if (env.redisTls) {
    options.tls = {};
  }

  pubClient = new Redis(env.redisUrl, options);
  subClient = new Redis(env.redisUrl, options);

  pubClient.on('error', (err) => {
    console.error('⚠️  Socket.IO Redis pubClient error:', err.message);
  });

  subClient.on('error', (err) => {
    console.error('⚠️  Socket.IO Redis subClient error:', err.message);
  });

  Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
    console.log('📡 Socket.IO Redis adapter connected.');
  }).catch((err) => {
    console.error('⚠️  Failed to connect Socket.IO Redis adapter:', err.message);
  });

  return createAdapter(pubClient, subClient);
};

export const closeSocketRedisAdapter = async (): Promise<void> => {
  try {
    if (pubClient && pubClient.status !== 'end') await pubClient.quit();
    if (subClient && subClient.status !== 'end') await subClient.quit();
  } catch {
    pubClient?.disconnect();
    subClient?.disconnect();
  }
};
