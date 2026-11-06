import type http from 'http';
import { Server, type Socket } from 'socket.io';
import { env } from '../config/env.js';
import { pool } from '../config/database.js';
import { verifyToken } from '../utils/jwt.js';
import { locationConfig } from '../config/location.config.js';
import {
  LOCATION_NAMESPACE,
  CLIENT_EVENTS,
  SERVER_EVENTS,
} from '../config/location.constants.js';
import {
  locationUpdateSchema,
  locationHeartbeatSchema,
  locationModeSchema,
  hazardsAreaSchema,
} from '../modules/locations/location.validation.js';
import {
  createSocketRedisAdapter,
  closeSocketRedisAdapter,
} from './socket.adapter.js';
import locationService from '../modules/locations/location.service.js';

export interface LocationSocketData {
  user: {
    id: number;
    email: string;
    name: string;
    role: string;
    transportMode: 'DRIVER' | 'CYCLIST' | 'WALKER';
  };
  tokenExp: number | null;
  lastPingAt: number;
  lastHeartbeatAt: number;
  lastModeChangeAt: number;
  lastHazardsAreaAt: number;
  lastAwarenessEmittedAt: number;
  invalidCount: number;
  lastInvalidResetAt: number;
}

export type CustomSocket = Socket<any, any, any, LocationSocketData>;

let io: Server | null = null;
const userSocketsMap = new Map<number, Set<CustomSocket>>();

/**
 * Handle invalid payloads and rate-limit disconnection after abuse.
 */
const handleInvalidPayload = (socket: CustomSocket, errorMsg: string): void => {
  const now = Date.now();
  if (now - socket.data.lastInvalidResetAt > 60000) {
    socket.data.invalidCount = 0;
    socket.data.lastInvalidResetAt = now;
  }
  socket.data.invalidCount = (socket.data.invalidCount || 0) + 1;

  if (socket.data.invalidCount > locationConfig.limits.maxInvalidPayloadsPerMinute) {
    console.warn(`[WS /location] Disconnecting userId=${socket.data.user?.id} due to repeated invalid payloads.`);
    socket.emit(SERVER_EVENTS.LOCATION_ERROR, {
      code: 'TOO_MANY_INVALID_PAYLOADS',
      message: 'Connection terminated due to repeated invalid payloads',
    });
    socket.disconnect(true);
    return;
  }

  socket.emit(SERVER_EVENTS.LOCATION_ERROR, {
    code: 'INVALID_PAYLOAD',
    message: errorMsg,
  });
};

/**
 * Initialize Socket.IO server and mount the /location namespace.
 */
export const initLocationSocket = (httpServer: http.Server): Server => {
  const corsOrigin =
    env.corsOrigin === '*'
      ? '*'
      : env.corsOrigin.includes(',')
        ? env.corsOrigin.split(',').map((o) => o.trim())
        : env.corsOrigin;

  io = new Server(httpServer, {
    path: '/socket.io',
    transports: ['websocket'], // Use pure WebSocket to eliminate HTTP long-polling overhead
    cors: {
      origin: corsOrigin,
      credentials: true,
    },
    maxHttpBufferSize: locationConfig.limits.socketMaxHttpBufferSize,
    adapter: createSocketRedisAdapter(),
  });

  if (!env.locationSocketEnabled) {
    console.log('ℹ️  Location WebSocket namespace (/location) disabled via LOCATION_SOCKET_ENABLED=false');
    return io;
  }

  const locationNs = io.of(LOCATION_NAMESPACE);

  // 1. Handshake Authentication Middleware
  locationNs.use(async (socket: CustomSocket, next) => {
    try {
      const authHeader = socket.handshake.headers.authorization;
      const authToken = socket.handshake.auth?.token;
      let token: string | undefined;

      if (typeof authToken === 'string' && authToken.trim()) {
        token = authToken.trim().replace(/^Bearer\s+/i, '');
      } else if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }

      if (!token) {
        console.warn(`[WS /location] Handshake rejected: No authentication token provided (socketId=${socket.id})`);
        return next(new Error('AUTHENTICATION_FAILED: Authentication token required in handshake auth'));
      }

      let decoded;
      try {
        decoded = verifyToken(token);
      } catch (jwtErr: any) {
        console.warn(`[WS /location] Handshake rejected: JWT verification failed for socketId=${socket.id}: ${jwtErr.message}`);
        return next(new Error('AUTHENTICATION_FAILED: Invalid or expired token'));
      }

      if (!decoded || !decoded.userId) {
        console.warn(`[WS /location] Handshake rejected: Token missing userId for socketId=${socket.id}`);
        return next(new Error('AUTHENTICATION_FAILED: Invalid or expired token'));
      }

      // Strict allow-list: /location accepts regular user tokens only to prevent ID collision
      if (!decoded.role || decoded.role.toLowerCase() !== 'user') {
        console.warn(`[WS /location] Handshake rejected: Role "${decoded.role}" not permitted on /location (userId=${decoded.userId}, socketId=${socket.id})`);
        return next(new Error('AUTHENTICATION_FAILED: Only user role tokens are permitted on the /location namespace'));
      }

      // Query user from PostgreSQL once during connection handshake
      const userResult = await pool.query(
        'SELECT id, email, name, role, transport_mode, status, deleted_at FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (userResult.rows.length === 0) {
        console.warn(`[WS /location] Handshake rejected: User id=${decoded.userId} not found in database (socketId=${socket.id})`);
        return next(new Error('AUTHENTICATION_FAILED: User account not found'));
      }

      const user = userResult.rows[0];

      // Strict allow-list on database user account role
      if (!user.role || user.role.toLowerCase() !== 'user') {
        console.warn(`[WS /location] Handshake rejected: Database role "${user.role}" not permitted on /location (userId=${user.id})`);
        return next(new Error('AUTHENTICATION_FAILED: Only regular user accounts are permitted on the /location namespace'));
      }

      if (user.deleted_at) {
        console.warn(`[WS /location] Handshake rejected: User id=${user.id} has been soft-deleted`);
        return next(new Error('AUTHENTICATION_FAILED: Account has been deleted'));
      }

      if (user.status && user.status.toUpperCase() === 'SUSPENDED') {
        console.warn(`[WS /location] Handshake rejected: User id=${user.id} account is suspended`);
        return next(new Error('AUTHENTICATION_FAILED: Account has been suspended'));
      }

      // Attach user details to socket session
      socket.data = {
        user: {
          id: Number(user.id),
          email: user.email,
          name: user.name,
          role: user.role || 'user',
          transportMode: (user.transport_mode || 'DRIVER').toUpperCase() as any,
        },
        tokenExp: decoded.exp ? decoded.exp * 1000 : null,
        lastPingAt: 0,
        lastHeartbeatAt: 0,
        lastModeChangeAt: 0,
        lastHazardsAreaAt: 0,
        lastAwarenessEmittedAt: 0,
        invalidCount: 0,
        lastInvalidResetAt: Date.now(),
      };

      next();
    } catch (err: any) {
      console.error(`[WS /location] Handshake error for socketId=${socket.id}:`, err.message);
      next(new Error(`AUTHENTICATION_FAILED: ${err.message || 'Authentication error'}`));
    }
  });

  // 2. Connection Lifecycle & Event Handlers
  locationNs.on('connection', (socket: CustomSocket) => {
    const userId = socket.data.user.id;
    console.log(`[WS /location] User connected: userId=${userId}, socketId=${socket.id}, mode=${socket.data.user.transportMode}`);

    // NOTE: The 2-sockets-per-user limit below is tracked per server instance in local memory.
    // In a multi-instance deployment with Redis adapter, cross-instance concurrency enforcement
    // requires calling io.of(LOCATION_NAMESPACE).fetchSockets() or maintaining active socket IDs in Redis.
    let userSockets = userSocketsMap.get(userId);
    if (!userSockets) {
      userSockets = new Set();
      userSocketsMap.set(userId, userSockets);
    }

    if (userSockets.size >= locationConfig.limits.maxSocketsPerUser) {
      const oldestSocket = userSockets.values().next().value;
      if (oldestSocket) {
        console.log(`[WS /location] Concurrency limit reached for userId=${userId}. Disconnecting older socket: ${oldestSocket.id}`);
        oldestSocket.emit(SERVER_EVENTS.LOCATION_ERROR, {
          code: 'CONCURRENCY_LIMIT',
          message: 'Connection superseded by a newer session',
        });
        oldestSocket.disconnect(true);
        userSockets.delete(oldestSocket);
      }
    }
    userSockets.add(socket);

    // Send pace rules immediately upon connection
    socket.emit(SERVER_EVENTS.LOCATION_CONFIG, locationConfig.paceRules);

    // Track active socket timers for cleanup
    const socketTimers: (NodeJS.Timeout | NodeJS.Immediate)[] = [];

    // Schedule disconnect on JWT expiration (capped at 24.8 days to prevent 32-bit integer overflow, re-arming as needed)
    if (socket.data.tokenExp) {
      const armExpiryTimer = (targetTimestamp: number) => {
        const msRemaining = targetTimestamp - Date.now();
        if (msRemaining <= 0) {
          console.log(`[WS /location] Disconnecting userId=${userId} due to JWT token expiration.`);
          socket.emit(SERVER_EVENTS.LOCATION_ERROR, {
            code: 'TOKEN_EXPIRED',
            message: 'Authentication token has expired. Please reconnect with a fresh token.',
          });
          socket.disconnect(true);
          return;
        }

        const delay = Math.min(msRemaining, 2147483647);
        const timer = setTimeout(() => {
          if (targetTimestamp - Date.now() <= 1000) {
            console.log(`[WS /location] Disconnecting userId=${userId} due to JWT token expiration.`);
            socket.emit(SERVER_EVENTS.LOCATION_ERROR, {
              code: 'TOKEN_EXPIRED',
              message: 'Authentication token has expired. Please reconnect with a fresh token.',
            });
            socket.disconnect(true);
          } else {
            armExpiryTimer(targetTimestamp);
          }
        }, delay);
        socketTimers.push(timer);
      };

      armExpiryTimer(socket.data.tokenExp);
    }

    // Periodic 5-minute permission re-check (single cheap query per connected user, not per ping)
    const recheckInterval = setInterval(async () => {
      try {
        const checkResult = await pool.query(
          'SELECT id, status, deleted_at FROM users WHERE id = $1',
          [userId]
        );
        if (
          checkResult.rows.length === 0 ||
          checkResult.rows[0].deleted_at ||
          checkResult.rows[0].status?.toUpperCase() === 'SUSPENDED'
        ) {
          console.warn(`[WS /location] User userId=${userId} suspended/deleted during periodic re-check. Disconnecting.`);
          socket.emit(SERVER_EVENTS.LOCATION_ERROR, {
            code: 'ACCOUNT_DEACTIVATED',
            message: 'Account is no longer active',
          });
          socket.disconnect(true);
        }
      } catch (err: any) {
        console.error(`[WS /location] Periodic permission re-check error for userId=${userId}:`, err.message);
      }
    }, 5 * 60 * 1000);
    socketTimers.push(recheckInterval);

    // --- CLIENT EVENT: location:update & location:ping ---
    const handleLocationUpdate = async (rawPayload: unknown, maybeCallback?: unknown) => {
      const cb = typeof maybeCallback === 'function' ? (maybeCallback as (err: any, data?: any) => void) : null;
      const now = Date.now();
      const elapsed = now - (socket.data.lastPingAt || 0);

      // Server-side rate limiting (800ms minimum gap)
      if (elapsed < locationConfig.limits.minPingGapMs) {
        const retryAfterMs = locationConfig.limits.minPingGapMs - elapsed;
        if (cb) {
          cb({ code: 'RATE_LIMITED', message: 'Rate limit exceeded', retryAfterMs });
        } else {
          socket.emit(SERVER_EVENTS.LOCATION_RATE_LIMITED, { retryAfterMs });
        }
        return;
      }
      socket.data.lastPingAt = now;

      // Safely parse JSON if payload is passed as a string (e.g. from Postman Text mode)
      let payloadToValidate = rawPayload;
      if (typeof rawPayload === 'string') {
        try {
          payloadToValidate = JSON.parse(rawPayload);
        } catch {
          const errMsg = 'Payload must be a valid JSON object';
          if (cb) {
            cb({ code: 'INVALID_PAYLOAD', message: errMsg });
          } else {
            handleInvalidPayload(socket, errMsg);
          }
          return;
        }
      }

      // Zod payload validation
      const parseResult = locationUpdateSchema.safeParse(payloadToValidate);
      if (!parseResult.success) {
        const errMsg = parseResult.error.issues[0]?.message || 'Invalid location payload';
        console.warn(`[WS /location] Payload validation failed for userId=${userId}:`, errMsg, payloadToValidate);
        if (cb) {
          cb({ code: 'INVALID_PAYLOAD', message: errMsg });
        } else {
          handleInvalidPayload(socket, errMsg);
        }
        return;
      }

      const payload = parseResult.data;

      // Drop ping if accuracy is worse than threshold
      if (payload.accuracy !== undefined && payload.accuracy > locationConfig.limits.maxAccuracyMeters) {
        console.log(`[WS /location] Dropped ping due to accuracy (${payload.accuracy}m > ${locationConfig.limits.maxAccuracyMeters}m threshold) for userId=${userId}`);
        if (cb) cb(null, { dropped: true, reason: 'ACCURACY_EXCEEDED' });
        return;
      }

      // Clamp client timestamp to server receive time if clock drift exceeds tolerance
      const maxDriftMs = locationConfig.limits.clientTimestampDriftToleranceSec * 1000;
      let effectiveTimestamp = payload.clientTimestamp;
      if (Math.abs(now - payload.clientTimestamp) > maxDriftMs) {
        effectiveTimestamp = now;
      }

      // Ingest ping into Redis and evaluate checks
      const result = await locationService.processLocationPing(
        userId,
        socket.data.user.transportMode,
        { ...payload, clientTimestamp: effectiveTimestamp }
      );

      if (!result.success) {
        const errObj = {
          code: result.code || 'LOCATION_ERROR',
          message:
            result.code === 'OUT_OF_ORDER'
              ? 'Out of order ping dropped'
              : result.code === 'IMPOSSIBLE_JUMP'
                ? 'Impossible position jump detected'
                : result.code === 'INVALID_JOURNEY'
                  ? 'Active journey not found for this user'
                  : 'Location tracking currently unavailable',
        };
        console.warn(`[WS /location] Ping rejected for userId=${userId}: [${errObj.code}] ${errObj.message}`);
        if (cb) {
          cb(errObj);
        } else {
          socket.emit(SERVER_EVENTS.LOCATION_ERROR, errObj);
        }
        return;
      }

      console.log(`[WS /location] Live ping processed: userId=${userId}, lat=${payload.lat}, lng=${payload.lng}, speed=${payload.speed ?? 'N/A'}${payload.journeyId ? ', journeyId=' + payload.journeyId : ''}`);

      const ackData = {
        receivedAt: result.receivedAt,
        timestamp: effectiveTimestamp,
      };

      // Emit location:ack event for event listeners
      socket.emit('location:ack', ackData);

      // Invoke callback if client passed an acknowledgement callback (or checked Ack in Postman)
      if (cb) {
        cb(null, ackData);
      }

      // Emit throttled awareness update from Redis (max once every 5 seconds) without querying Postgres hazards
      if (now - (socket.data.lastAwarenessEmittedAt || 0) >= locationConfig.redis.awarenessThrottleMs) {
        socket.data.lastAwarenessEmittedAt = now;
        locationService
          .getLiveUserProximity(userId, payload.lat, payload.lng, 5)
          .then((awareness) => {
            socket.emit(SERVER_EVENTS.AWARENESS_UPDATE, {
              cyclists: awareness.cyclists,
              walkers: awareness.walkers,
            });
          })
          .catch((err) => {
            console.warn(`[WS /location] Awareness update error for userId=${userId}:`, err.message);
          });
      }
    };

    socket.on(CLIENT_EVENTS.LOCATION_UPDATE, handleLocationUpdate);
    socket.on('location:ping', handleLocationUpdate);

    // --- CLIENT EVENT: location:heartbeat ---
    socket.on(CLIENT_EVENTS.LOCATION_HEARTBEAT, (rawPayload: unknown, maybeCallback?: unknown) => {
      const cb = typeof maybeCallback === 'function' ? (maybeCallback as (err: any, data?: any) => void) : null;
      const now = Date.now();
      const elapsed = now - (socket.data.lastHeartbeatAt || 0);
      if (elapsed < locationConfig.limits.heartbeatMinGapMs) {
        const retryAfterMs = locationConfig.limits.heartbeatMinGapMs - elapsed;
        if (cb) {
          cb({ code: 'RATE_LIMITED', message: 'Heartbeat rate limit exceeded', retryAfterMs });
        } else {
          socket.emit(SERVER_EVENTS.LOCATION_RATE_LIMITED, { retryAfterMs });
        }
        return;
      }
      socket.data.lastHeartbeatAt = now;

      let payloadToValidate = rawPayload;
      if (typeof rawPayload === 'string') {
        try {
          payloadToValidate = JSON.parse(rawPayload);
        } catch {
          // empty heartbeat is acceptable
          payloadToValidate = {};
        }
      }

      const parseResult = locationHeartbeatSchema.safeParse(payloadToValidate);
      if (!parseResult.success) {
        if (cb) {
          cb({ code: 'INVALID_PAYLOAD', message: 'Invalid heartbeat payload' });
        } else {
          handleInvalidPayload(socket, 'Invalid heartbeat payload');
        }
        return;
      }

      // Acknowledged heartbeat
      const ackData = { receivedAt: now };
      socket.emit('heartbeat:ack', ackData);
      if (cb) cb(null, ackData);
    });

    // --- CLIENT EVENT: location:mode ---
    socket.on(CLIENT_EVENTS.LOCATION_MODE, async (rawPayload: unknown, maybeCallback?: unknown) => {
      const cb = typeof maybeCallback === 'function' ? (maybeCallback as (err: any, data?: any) => void) : null;
      const now = Date.now();
      const elapsed = now - (socket.data.lastModeChangeAt || 0);
      if (elapsed < locationConfig.limits.modeChangeMinGapMs) {
        const retryAfterMs = locationConfig.limits.modeChangeMinGapMs - elapsed;
        if (cb) {
          cb({ code: 'RATE_LIMITED', message: 'Mode change rate limit exceeded', retryAfterMs });
        } else {
          socket.emit(SERVER_EVENTS.LOCATION_RATE_LIMITED, { retryAfterMs });
        }
        return;
      }
      socket.data.lastModeChangeAt = now;

      let payloadToValidate = rawPayload;
      if (typeof rawPayload === 'string') {
        try {
          payloadToValidate = JSON.parse(rawPayload);
        } catch {
          const errMsg = 'Invalid JSON in mode payload';
          if (cb) {
            cb({ code: 'INVALID_PAYLOAD', message: errMsg });
          } else {
            handleInvalidPayload(socket, errMsg);
          }
          return;
        }
      }

      const parseResult = locationModeSchema.safeParse(payloadToValidate);
      if (!parseResult.success) {
        const errMsg = 'Invalid transportMode payload';
        if (cb) {
          cb({ code: 'INVALID_PAYLOAD', message: errMsg });
        } else {
          handleInvalidPayload(socket, errMsg);
        }
        return;
      }

      socket.data.user.transportMode = parseResult.data.transportMode;
      console.log(`[WS /location] User mode changed: userId=${userId}, newMode=${parseResult.data.transportMode}`);
      await locationService.changeUserMode(userId, parseResult.data.transportMode);
      const ackData = { transportMode: parseResult.data.transportMode };
      socket.emit('mode:ack', ackData);
      if (cb) cb(null, ackData);
    });

    // --- CLIENT EVENT: hazards:area ---
    socket.on(CLIENT_EVENTS.HAZARDS_AREA, async (rawPayload: unknown, maybeCallback?: unknown) => {
      const cb = typeof maybeCallback === 'function' ? (maybeCallback as (err: any, data?: any) => void) : null;
      try {
        const now = Date.now();
        const elapsed = now - (socket.data.lastHazardsAreaAt || 0);
        if (elapsed < locationConfig.limits.hazardsAreaMinGapMs) {
          const retryAfterMs = locationConfig.limits.hazardsAreaMinGapMs - elapsed;
          if (cb) {
            cb({ code: 'RATE_LIMITED', message: 'Too many hazards area requests', retryAfterMs });
          } else {
            socket.emit(SERVER_EVENTS.LOCATION_RATE_LIMITED, { retryAfterMs });
          }
          return;
        }
        socket.data.lastHazardsAreaAt = now;

        let payloadToValidate = rawPayload;
        if (typeof rawPayload === 'string') {
          try {
            payloadToValidate = JSON.parse(rawPayload);
          } catch {
            const errorMsg = 'Invalid JSON in bounding box payload';
            if (cb) {
              cb({ code: 'INVALID_BOUNDS', message: errorMsg });
            } else {
              handleInvalidPayload(socket, errorMsg);
            }
            return;
          }
        }

        const parseResult = hazardsAreaSchema.safeParse(payloadToValidate);
        if (!parseResult.success) {
          const errorMsg = parseResult.error.issues[0]?.message || 'Invalid bounding box';
          if (cb) {
            cb({ code: 'INVALID_BOUNDS', message: errorMsg });
          } else {
            handleInvalidPayload(socket, errorMsg);
          }
          return;
        }

        const bounds = parseResult.data;
        const limit = Math.min(bounds.limit || 50, locationConfig.hazards.maxResultsLimit);

        const result = await locationService.getHazardsInArea({
          minLat: bounds.minLat,
          minLng: bounds.minLng,
          maxLat: bounds.maxLat,
          maxLng: bounds.maxLng,
          limit,
        });

        if (cb) {
          cb(null, result);
        } else {
          socket.emit('hazards:area:response', result);
        }
      } catch (err: any) {
        console.warn(`[WS /location] hazards:area error for user ${userId}:`, err?.message || err);
        if (cb) {
          cb({ code: 'HAZARDS_UNAVAILABLE', message: 'Unable to fetch hazards at this time' });
        }
      }
    });

    // --- Socket Disconnect ---
    socket.on('disconnect', (reason) => {
      console.log(`[WS /location] User disconnected: userId=${userId}, socketId=${socket.id}, reason=${reason}`);

      // Clear all timers for this socket
      socketTimers.forEach((timer) => {
        clearInterval(timer as NodeJS.Timeout);
        clearTimeout(timer as NodeJS.Timeout);
      });

      // Remove from concurrency tracker first
      const sockets = userSocketsMap.get(userId);
      if (sockets) {
        sockets.delete(socket);
        if (sockets.size === 0) {
          userSocketsMap.delete(userId);
          // NOTE: Disconnect grace timers and userSocketsMap are maintained in-memory per server instance.
          // Schedule Redis live state cleanup only if NO other sockets remain active for this user
          locationService.scheduleDisconnectCleanup(userId);
        } else {
          console.log(`[WS /location] Socket ${socket.id} closed for userId=${userId}, but ${sockets.size} active socket(s) remain. Retaining Redis state.`);
        }
      }
    });
  });

  return io;
};

/**
 * Gracefully close the Socket.IO server.
 */
export const closeLocationSocket = async (): Promise<void> => {
  if (io) {
    await new Promise<void>((resolve) => {
      io?.close(() => {
        console.log('🔌 Socket.IO server closed.');
        resolve();
      });
    });
    await closeSocketRedisAdapter();
  }
};

export const getIO = (): Server | null => io;
