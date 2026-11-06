import type { Request, Response, NextFunction } from 'express';
import { getCache, setCache } from '../config/redis.js';

/**
 * Express middleware to cache GET endpoint responses in Upstash Redis.
 * Sends 'X-Cache: HIT' on cache hit, 'X-Cache: MISS' on cache miss.
 *
 * @param ttlSeconds Time-to-live for cached responses in seconds (default: 300)
 */
export const cacheResponse = (ttlSeconds = 300) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = `http_cache:${req.originalUrl || req.url}`;

    try {
      const cached = await getCache<{
        statusCode: number;
        headers: Record<string, string>;
        body: any;
      }>(cacheKey);

      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        if (cached.headers) {
          for (const [key, value] of Object.entries(cached.headers)) {
            if (key.toLowerCase() !== 'x-cache') {
              res.setHeader(key, value);
            }
          }
        }
        res.status(cached.statusCode).send(cached.body);
        return;
      }

      res.setHeader('X-Cache', 'MISS');

      // Intercept res.send to capture response body
      const originalSend = res.send.bind(res);

      res.send = (body: any): Response => {
        // Cache only successful responses (200-299)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const contentType = res.getHeader('content-type');
          let parsedBody = body;
          if (typeof body === 'string' && contentType && String(contentType).includes('application/json')) {
            try {
              parsedBody = JSON.parse(body);
            } catch {
              parsedBody = body;
            }
          }

          setCache(
            cacheKey,
            {
              statusCode: res.statusCode,
              headers: {
                'content-type': String(contentType || 'application/json'),
              },
              body: parsedBody,
            },
            ttlSeconds
          ).catch((err) => {
            console.warn('[Cache Middleware] Failed to store cache:', err.message);
          });
        }

        return originalSend(body);
      };

      next();
    } catch (err: any) {
      console.warn('[Cache Middleware] Error:', err.message);
      next();
    }
  };
};

export { getCache, setCache, deleteCache, getOrSetCache } from '../config/redis.js';
