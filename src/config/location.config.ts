export interface PaceRule {
  speedThresholdMs: number;
  minDistanceMeters?: number;
  minIntervalSeconds?: number;
  maxIntervalSeconds?: number;
  heartbeatIntervalSeconds?: number;
}

export interface ModeHistoryThresholds {
  distanceMeters: number;
  timeIntervalSeconds: number;
  headingChangeDegrees: number;
}

export const locationConfig = {
  // Client pace rules sent in location:config
  paceRules: {
    still: {
      speedThresholdMs: 0.5,
      heartbeatIntervalSeconds: Number(process.env.PACE_STILL_HEARTBEAT_SEC) || 45,
    },
    normal: {
      speedThresholdMs: 15,
      minDistanceMeters: Number(process.env.PACE_NORMAL_DISTANCE_METERS) || 30,
      minIntervalSeconds: Number(process.env.PACE_NORMAL_MIN_INTERVAL_SEC) || 20,
    },
    fast: {
      speedThresholdMs: 15,
      minDistanceMeters: Number(process.env.PACE_FAST_DISTANCE_METERS) || 30,
      minIntervalSeconds: Number(process.env.PACE_FAST_MIN_INTERVAL_SEC) || 2,
    },
  },

  // Server-side rate limiting & verification limits
  limits: {
    minPingGapMs: Number(process.env.LOCATION_MIN_PING_GAP_MS) || 800,
    maxPingsPerSecond: Number(process.env.LOCATION_MAX_PINGS_PER_SEC) || 1,
    maxAccuracyMeters: Number(process.env.LOCATION_MAX_ACCURACY_METERS) || 100,
    maxJumpSpeedMps: Number(process.env.LOCATION_MAX_JUMP_SPEED_MPS) || 100,
    maxInvalidPayloadsPerMinute: Number(process.env.LOCATION_MAX_INVALID_PER_MIN) || 20,
    maxSocketsPerUser: Number(process.env.LOCATION_MAX_SOCKETS_PER_USER) || 2,
    socketMaxHttpBufferSize: Number(process.env.LOCATION_SOCKET_BUFFER_BYTES) || 10240, // 10KB
    clientTimestampDriftToleranceSec: Number(process.env.LOCATION_TIMESTAMP_DRIFT_SEC) || 60,
    heartbeatMinGapMs: Number(process.env.LOCATION_HEARTBEAT_MIN_GAP_MS) || 5000,
    modeChangeMinGapMs: Number(process.env.LOCATION_MODE_MIN_GAP_MS) || 12000, // ~5 per minute
    hazardsAreaMinGapMs: Number(process.env.HAZARDS_AREA_MIN_GAP_MS) || 5000,
  },

  // History point saving thresholds per transport mode
  history: {
    minMovementForTimeRuleMeters: Number(process.env.HISTORY_MIN_TIME_RULE_METERS) || 8,
    modes: {
      WALKER: {
        distanceMeters: Number(process.env.HISTORY_WALKER_DISTANCE_M) || 30,
        timeIntervalSeconds: Number(process.env.HISTORY_WALKER_TIME_S) || 60,
        headingChangeDegrees: Number(process.env.HISTORY_WALKER_HEADING_DEG) || 30,
      },
      CYCLIST: {
        distanceMeters: Number(process.env.HISTORY_CYCLIST_DISTANCE_M) || 60,
        timeIntervalSeconds: Number(process.env.HISTORY_CYCLIST_TIME_S) || 30,
        headingChangeDegrees: Number(process.env.HISTORY_CYCLIST_HEADING_DEG) || 25,
      },
      DRIVER: {
        distanceMeters: Number(process.env.HISTORY_DRIVER_DISTANCE_M) || 100,
        timeIntervalSeconds: Number(process.env.HISTORY_DRIVER_TIME_S) || 20,
        headingChangeDegrees: Number(process.env.HISTORY_DRIVER_HEADING_DEG) || 20,
      },
    } as Record<'WALKER' | 'CYCLIST' | 'DRIVER', ModeHistoryThresholds>,
  },

  // Redis cache & timing settings
  redis: {
    userHashTtlSeconds: Number(process.env.REDIS_USER_TTL_SEC) || 900, // 15 min
    cleanupIntervalMs: Number(process.env.REDIS_CLEANUP_INTERVAL_MS) || 60000, // 60 s
    cleanupStaleThresholdSeconds: Number(process.env.REDIS_STALE_THRESHOLD_SEC) || 900, // 15 min
    awarenessRecentThresholdSeconds: Number(process.env.AWARENESS_RECENT_THRESHOLD_SEC) || 180, // 3 min
    cleanupLockTtlSeconds: 55,
    disconnectGracePeriodMs: Number(process.env.SOCKET_DISCONNECT_GRACE_MS) || 30000, // 30 s
    awarenessThrottleMs: Number(process.env.AWARENESS_THROTTLE_MS) || 5000, // 5 s
    onRouteCheckThrottleMs: Number(process.env.ON_ROUTE_CHECK_THROTTLE_MS) || 15000, // 15 s
    lastOnRouteUpdateThrottleMs: Number(process.env.LAST_ON_ROUTE_UPDATE_THROTTLE_MS) || 30000, // 30 s
    distanceFlushIntervalMs: Number(process.env.DISTANCE_FLUSH_INTERVAL_MS) || 60000, // 60 s
  },

  // Hazards area query caps
  hazards: {
    maxBoundingBoxDiagonalKm: Number(process.env.HAZARDS_MAX_BBOX_DIAG_KM) || 50,
    maxResultsLimit: Number(process.env.HAZARDS_AREA_MAX_LIMIT) || 100,
  },
};
