/**
 * Shared Socket.IO event name constants for the /location namespace.
 * Single reference for backend and mobile teams.
 */
export const LOCATION_NAMESPACE = '/location';

export const CLIENT_EVENTS = {
  LOCATION_UPDATE: 'location:update',
  LOCATION_HEARTBEAT: 'location:heartbeat',
  LOCATION_MODE: 'location:mode',
  HAZARDS_AREA: 'hazards:area',
} as const;

export const SERVER_EVENTS = {
  LOCATION_CONFIG: 'location:config',
  AWARENESS_UPDATE: 'awareness:update',
  LOCATION_ERROR: 'location:error',
  LOCATION_RATE_LIMITED: 'location:rate_limited',
} as const;

export type ClientEventName = (typeof CLIENT_EVENTS)[keyof typeof CLIENT_EVENTS];
export type ServerEventName = (typeof SERVER_EVENTS)[keyof typeof SERVER_EVENTS];
