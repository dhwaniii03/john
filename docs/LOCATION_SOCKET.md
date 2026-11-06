# Location WebSocket Service Documentation (`/location`)

The `/location` Socket.IO namespace provides high-throughput, low-latency live location tracking and geospatial proximity awareness for the RoadLife mobile and web applications.

It replaces the legacy polling endpoint `POST /api/v1/locations/update` with an in-memory Redis architecture (geospatial sorted sets and hashes), reducing database load by over 95%.

---

## 1. Connection & Handshake

### 1.1 Connection Endpoint
- **URL**: `ws[s]://<server-domain>/location`
- **Namespace**: `/location`
- **Transport**: `websocket` ONLY (HTTP long-polling is disabled for performance).

### 1.2 Authentication Handshake
Clients must provide a valid JWT access token in the `auth` object during handshake:

```javascript
import { io } from 'socket.io-client';

const socket = io('https://api.roadlife.com/location', {
  transports: ['websocket'], // MANDATORY: websocket transport only
  auth: {
    token: userJwtToken, // Regular user JWT
  },
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});
```

### 1.3 Role Permissions & Allow-List
- **Allowed Roles**: Regular user tokens only (`role: 'user'`, case-insensitive).
- **Rejected Roles**: Admin roles (`admin`, `GLOBAL_ADMIN`, `SUPER_ADMIN`) and system tokens are strictly rejected with code `AUTHENTICATION_FAILED`. Admin users do not send GPS location pings.
- **Account Status**: Suspended (`status === 'SUSPENDED'`) and soft-deleted (`deleted_at !== null`) accounts are rejected.

---

## 2. Event Specifications

### 2.1 Server-to-Client Events

#### `location:config`
Emitted by the server **immediately** after successful handshake. Contains client pacing rules:

```json
{
  "modes": {
    "DRIVER": {
      "pingIntervalMs": 2000,
      "awarenessRadiusKm": 5.0,
      "maxPingsPerSecond": 2
    },
    "CYCLIST": {
      "pingIntervalMs": 3000,
      "awarenessRadiusKm": 2.0,
      "maxPingsPerSecond": 1
    },
    "WALKER": {
      "pingIntervalMs": 4000,
      "awarenessRadiusKm": 1.0,
      "maxPingsPerSecond": 1
    }
  },
  "history": {
    "modes": {
      "DRIVER": { "distanceMeters": 100, "timeIntervalSeconds": 20, "headingChangeDegrees": 20 },
      "CYCLIST": { "distanceMeters": 60, "timeIntervalSeconds": 30, "headingChangeDegrees": 25 },
      "WALKER": { "distanceMeters": 30, "timeIntervalSeconds": 60, "headingChangeDegrees": 30 }
    },
    "minMovementForTimeRuleMeters": 8
  }
}
```

#### `awareness:update`
Emitted by the server periodically (at most once every 5 seconds) to active drivers and riders with nearby users:

```json
{
  "cyclists": [
    {
      "userId": 1024,
      "latitude": 12.9730,
      "longitude": 77.5950,
      "speed": 18.5,
      "heading": 85,
      "distanceMeters": 145.2
    }
  ],
  "walkers": [
    {
      "userId": 2048,
      "latitude": 12.9720,
      "longitude": 77.5940,
      "speed": 4.2,
      "heading": 12,
      "distanceMeters": 60.5
    }
  ],
  "summary": {
    "cyclistCount": 1,
    "walkerCount": 1
  }
}
```

#### `location:rate_limited`
Emitted when client exceeds rate limit thresholds:

```json
{
  "retryAfterMs": 1400
}
```

#### `location:error`
Emitted when an operational or validation error occurs:

```json
{
  "code": "TOKEN_EXPIRED",
  "message": "Authentication token has expired. Please reconnect with a fresh token."
}
```

---

### 2.2 Client-to-Server Events

#### `location:update`
Sent periodically by the client according to mode pace rules.

**Payload:**
```json
{
  "lat": 12.971598,
  "lng": 77.594562,
  "speed": 42.5,
  "heading": 90,
  "accuracy": 4.5,
  "journeyId": 1402,
  "clientTimestamp": 1782777600000
}
```

*Fields:*
- `lat` (number, -90 to 90): Latitude.
- `lng` (number, -180 to 180): Longitude.
- `speed` (number, optional, >= 0): Current speed in km/h.
- `heading` (number, optional, 0 to 360): Bearing in degrees.
- `accuracy` (number, optional, >= 0): GPS accuracy in meters.
- `journeyId` (number, optional): Active journey ID (must be owned by the user and `ACTIVE`).
- `clientTimestamp` (number): Unix epoch millisecond timestamp.

#### `location:heartbeat`
Keepalive ping sent when stationary or when GPS is paused (rate limit: minimum gap 5 s).

**Payload:** `{}`

#### `location:mode`
Switches active transport mode without disconnecting (rate limit: at most 6 changes/min).

**Payload:**
```json
{
  "transportMode": "CYCLIST"
}
```
*Response*: `mode:ack` event with `{ "transportMode": "CYCLIST" }`.

#### `hazards:area` (with Acknowledgment Callback)
Fetches active hazards within a bounding box (rate limit: minimum gap 5 s, max span 0.5 degrees per axis).

**Payload:**
```json
{
  "minLat": 12.9500,
  "minLng": 77.5700,
  "maxLat": 12.9900,
  "maxLng": 77.6100,
  "limit": 50
}
```

**Acknowledgment Callback:**
```javascript
socket.emit('hazards:area', bounds, (err, response) => {
  if (err) {
    console.warn('Hazards error:', err.code, err.message);
    return;
  }
  console.log(`Received ${response.count} hazards:`, response.hazards);
});
```

---

## 3. Error Codes & Client Handling

| Error Code | Description | Client Action |
| :--- | :--- | :--- |
| `CONCURRENCY_LIMIT` | User opened a 3rd socket connection. Oldest socket disconnected. | **CRITICAL WARNING**: Do NOT reconnect immediately in an infinite loop! If your app runs across multiple activities, tabs, or background services, ensure only one active socket is maintained. |
| `TOKEN_EXPIRED` | JWT access token expired during session. | Refresh access token via `POST /api/v1/auth/refresh-token`, update `socket.auth.token`, and reconnect. |
| `AUTHENTICATION_FAILED`| Missing or invalid JWT, or forbidden role (e.g. admin). | Verify user credentials and token format. |
| `ACCOUNT_INACTIVE` | User account suspended or deleted. | Log out user and redirect to login screen. |
| `INVALID_BOUNDS` | Bounding box exceeds 0.5° span or coordinates inverted. | Correct bounding box coordinates. |
| `INVALID_PAYLOAD` | Validation failed for incoming message fields. | Ensure payload conforms to schema. |
| `INVALID_JOURNEY` | Journey not found, not owned, or not ACTIVE. | Check journey status before attaching `journeyId`. |
| `OUT_OF_ORDER` | Client timestamp is older than previous received ping. | Ignore stale location updates. |
| `IMPOSSIBLE_JUMP` | Movement implies speed > 100 m/s (360 km/h). | Drop spurious GPS anomaly. |
| `RATE_LIMITED` | Message sent faster than permitted throttle gap. | Back off and observe `retryAfterMs`. |

---

## 4. Token Refresh Flow

When the server detects an expiring JWT, it disconnects with `TOKEN_EXPIRED`. The client should implement an automated re-auth workflow:

```javascript
socket.on('location:error', async (error) => {
  if (error.code === 'TOKEN_EXPIRED') {
    socket.disconnect();
    const freshToken = await authService.refreshAccessToken();
    socket.auth = { token: freshToken };
    socket.connect();
  }
});
```

---

## 5. Production Rollout Checklist

### 5.1 Environment Configuration Defaults
Both feature flags remain **`false`** until production readiness verification:
- `LOCATION_SOCKET_ENABLED=false`
- `LOCATION_HTTP_USES_REDIS=false`

### 5.2 Rollout Sequence

1. **Phase A: Staging Verification**
   - Run end-to-end load tests using `npx tsx scripts/load/simulate-location-clients.ts --clients 100 --duration 60`.
   - Verify Redis memory usage (`INFO memory`) and key TTL cleanup (`live:seen`, `cache:hazards:*`).
   - Confirm migration `018_create_journey_locations_table.sql` is executed.

2. **Phase B: Enable Socket Service (`LOCATION_SOCKET_ENABLED=true`)**
   - Set `LOCATION_SOCKET_ENABLED=true` in production environment.
   - Deploy mobile app version supporting `/location` WebSocket with automatic fallback to HTTP.
   - Monitor connection counts, connection drop rates, and Redis memory.

3. **Phase C: Route HTTP Endpoints to Redis (`LOCATION_HTTP_USES_REDIS=true`)**
   - Set `LOCATION_HTTP_USES_REDIS=true`.
   - Legacy HTTP pings (`/api/v1/locations/update` and `/awareness`) now bypass Postgres writes and update Redis live state directly.
   - Observe periodic 1-minute `[HTTP Location Deprecated Usage Summary]` aggregation logs to track migration progress across mobile app versions.

4. **Phase D: Deprecation & Sunset**
   - After app version adoption exceeds 98%, decommission HTTP update endpoints per `Sunset` header (configured via `HTTP_LOCATION_SUNSET_AT`, e.g. `Thu, 01 Jul 2027 00:00:00 GMT`).

### 5.3 Rollback Plan
If Redis experiences high latency or crashes:
1. Revert `LOCATION_HTTP_USES_REDIS=false` (HTTP immediately returns to Postgres writes).
2. Set `LOCATION_SOCKET_ENABLED=false` (Socket namespace disconnects and mobile clients fall back to HTTP).
3. If necessary, execute `npm run migrate:rollback` on a maintenance window.
