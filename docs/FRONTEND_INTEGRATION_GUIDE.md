# RoadLife Frontend Integration Guide

A complete, production-ready integration guide for Web and Mobile engineering teams connecting to the **RoadLife Backend API**.

---

## 1. Quick Reference & Endpoints

| Resource | Value | Notes |
| :--- | :--- | :--- |
| **HTTP Base URL** | `http://localhost:3030` | Development server |
| **API Version** | `/api/v1` | All REST routes are prefixed with `/api/v1` |
| **WebSocket URL** | `ws://localhost:3030/location` | Socket.IO `/location` namespace |
| **Interactive Swagger UI** | `http://localhost:3030/api-docs` | Built-in interactive API explorer |
| **OpenAPI 3.0 Spec JSON** | `http://localhost:3030/api-docs.json` | Can be imported into code generators |
| **Postman Collection** | [`RoadLife_Postman_Collection.json`](../RoadLife_Postman_Collection.json) | Full collection in repository root |

---

## 2. Authentication & Authorization

RoadLife uses **JSON Web Tokens (JWT)** with role-based access control.

### 2.1 HTTP Request Headers
Pass the token in the `Authorization` header on all protected routes:
```http
Authorization: Bearer <your_jwt_token>
```

### 2.2 Roles & Account Status
* **`user`**: Standard citizen, driver, cyclist, or walker. Can create journeys, send live location updates, submit hazards, and vote.
* **`admin` / `GLOBAL_ADMIN`**: Back-office staff. Can moderate hazards, inspect users, view audit logs, and trigger batch imports. Cannot stream driver telemetry.
* **Account Status**:
  * `ACTIVE`: Normal access.
  * `SUSPENDED`: Blocked with `403 Forbidden` (`Account has been suspended`).
  * `DELETED` (`deleted_at !== null`): Blocked with `403 Forbidden`.

### 2.3 Unified Response Schemas

#### Standard Success (`200 OK`, `201 Created`):
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { ... },
  "meta": {
    "totalItems": 100,
    "totalPages": 10,
    "currentPage": 1,
    "limit": 10
  }
}
```

#### Standard Error (`400`, `401`, `403`, `404`, `409`, `429`, `500`):
```json
{
  "success": false,
  "message": "Human-readable error description",
  "error": { ... }
}
```

---

## 3. Core HTTP API Reference

### 3.1 Authentication (`/api/v1/auth`)

| Method | Endpoint | Auth | Request Body | Description |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/send-otp` | Public | `{ "phone": "+1234567890" }` | Request SMS OTP |
| `POST` | `/verify-otp` | Public | `{ "phone": "+1234567890", "otp": "123456" }` | Verify OTP |
| `POST` | `/register` | Public | `{ "email", "password", "name", "phone" }` | Register new account |
| `POST` | `/login` | Public | `{ "email", "password" }` | User login (returns `{ user, token }`) |
| `POST` | `/forgot-password` | Public | `{ "email" }` | Request reset token |
| `POST` | `/reset-password` | Public | `{ "token", "newPassword" }` | Set new password |
| `POST` | `/logout` | Public | `{}` | Invalidate session |
| `GET` | `/me` | User JWT | None | Get current user profile |

---

### 3.2 User Profile & Mode (`/api/v1/users`)

| Method | Endpoint | Auth | Request Body | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/profile` | User JWT | None | Get full personal profile |
| `PUT` | `/profile` | User JWT | `{ "name", "phone", "first_name", "last_name" }` | Update profile info |
| `POST` | `/profile/photo` | User JWT | `multipart/form-data` (`file`) | Upload avatar image |
| `PATCH` | `/transport-mode` | User JWT | `{ "transport_mode": "DRIVER" \| "CYCLIST" \| "WALKER" }` | Switch active transport mode |
| `GET` | `/stats` | User JWT | None | Get user activity statistics |
| `DELETE` | `/account` | User JWT | None | Soft-delete user account |

---

### 3.3 Hazards & Public Crowdsourcing (`/api/v1/hazards`)

| Method | Endpoint | Auth | Description / Parameters |
| :--- | :--- | :--- | :--- |
| `GET` | `/categories` | Public | List active hazard categories (Pothole, Flood, Accident, etc.) |
| `GET` | `/nearby` | Public | Query nearby hazards: `?latitude=12.97&longitude=77.59&radius=10` (radius in km) |
| `GET` | `/` | Public | Paginated list: `?page=1&limit=20&status=ACTIVE&category_id=2` |
| `GET` | `/:id` | Public | Single hazard detail with confirmations/resolutions count |
| `POST` | `/` | User JWT | Create hazard: `{ title, description, latitude, longitude, severity, category_id, image_url? }` |
| `POST` | `/:id/confirm` | User JWT | Upvote/Confirm active hazard. Returns `409 Conflict` on duplicate vote |
| `POST` | `/:id/resolve` | User JWT | Vote hazard as resolved/cleared. Returns `409 Conflict` on duplicate vote |
| `PUT` | `/:id` | User JWT | Update hazard (owner or admin only) |
| `DELETE` | `/:id` | User JWT | Delete hazard (owner or admin only) |

---

### 3.4 Citizen Hazard Reports (`/api/v1/hazard-reports`)

Citizen users can submit reports that undergo moderation before becoming public hazards.

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/` | User JWT | Submit report: `{ title, description, latitude, longitude, address, image_url? }` |
| `GET` | `/my` | User JWT | Get own submitted reports (`PENDING`, `APPROVED`, `REJECTED`) |
| `GET` | `/:id` | User JWT | Get single report status |

---

### 3.5 Journeys (`/api/v1/journeys`)

| Method | Endpoint | Auth | Description & Payload |
| :--- | :--- | :--- | :--- |
| `POST` | `/start` | User JWT | Start journey: `{ "title"?, "start_latitude", "start_longitude", "transport_mode"?, "route_polyline"? }` |
| `GET` | `/active` | User JWT | Get current running journey for user (or `null` if none) |
| `POST` | `/:id/end` | User JWT | Complete journey: `{ "end_latitude"?, "end_longitude"?, "distance_km"? }`. Persists final distance and closes tracking. |
| `POST` | `/:id/cancel` | User JWT | Cancel active journey. Persists accumulated running distance and deactivates tracking. |
| `GET` | `/history` | User JWT | Paginated journey history: `?page=1&limit=10` |
| `GET` | `/:id` | User JWT | Get journey details by ID |
| `DELETE`| `/:id` | User JWT | Delete a journey record |

---

### 3.6 Media & File Uploads (`/api/v1/uploads`)

* **Endpoint**: `POST /api/v1/uploads` or `POST /api/v1/uploads/image`
* **Format**: `multipart/form-data` with field name `file` (or `image`), OR JSON base64: `{ "image": "data:image/png;base64,..." }`.
* **Accepted Formats**: `JPEG`, `PNG`, `WEBP`, `GIF` (Max 10MB).
* **Response**:
  ```json
  {
    "success": true,
    "message": "Image uploaded successfully",
    "data": {
      "url": "/uploads/general/1793014500000-photo.webp",
      "path": "uploads/general/1793014500000-photo.webp",
      "filename": "1793014500000-photo.webp",
      "mimetype": "image/webp",
      "size": 142500
    }
  }
  ```

---

### 3.7 Health & Operational Endpoints

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Public | Overall API & Redis status |
| `GET` | `/health/redis` | Public | Dedicated Redis connection health check (`200` healthy, `503` degraded) |
| `GET` | `/health/db` | Public | Dedicated PostgreSQL database connection check |

---

## 4. Real-Time Tracking: Socket.IO `/location` Namespace

> **CRITICAL**: Do **NOT** poll `POST /api/v1/locations/update` for real-time driver tracking. That HTTP endpoint is deprecated and returns standard `Deprecation` and `Sunset` headers. All real-time telemetry, driver proximity, and speed-adaptive saving are powered by **Socket.IO `/location`**.

### 4.1 Connection Setup
* **Namespace**: `/location`
* **Transport**: `websocket` strictly (`transports: ['websocket']`)
* **Handshake Authentication**: Send the user JWT token in the `auth` object.

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3030/location', {
  transports: ['websocket'],
  auth: {
    token: userToken, // Valid JWT access token
  },
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});
```

### 4.2 Lifecycle & Reconnection Rules
1. **Concurrency Limit**: Maximum of 2 concurrent connections per user. Connecting a 3rd socket cleanly disconnects the oldest socket with error code `CONCURRENCY_LIMIT`.
2. **Ephemeral Live State & 30-Second Grace Period**:
   * Live coordinates in Redis exist only while connected.
   * If the app disconnects or loses network, a **30-second disconnect grace timer** starts.
   * If the client reconnects within 30 seconds, tracking resumes seamlessly without loss of odometer or state.
   * If the client remains disconnected after 30 seconds, Redis automatically purges the user's live position to prevent "ghost drivers" from lingering on maps.
3. **Token Expiration**: The socket automatically disconnects with `TOKEN_EXPIRED` when the JWT expires. Re-authenticate before reconnecting.

---

### 4.3 Events Sent by Server to Client

#### `location:config` (Emitted immediately on connect)
Provides the client with pacing rules based on current movement speed:
```json
{
  "still": {
    "speedThresholdMs": 0.5,
    "heartbeatIntervalSeconds": 45
  },
  "normal": {
    "speedThresholdMs": 15,
    "minDistanceMeters": 30,
    "minIntervalSeconds": 20
  },
  "fast": {
    "speedThresholdMs": 15,
    "minDistanceMeters": 30,
    "minIntervalSeconds": 2
  }
}
```

#### `awareness:update` (Emitted every ~5s to active drivers)
Contains nearby cyclists and pedestrians within a 5km radius:
```json
{
  "cyclists": 3,
  "walkers": 7
}
```

#### `location:ack` (Ping Confirmation)
Emitted in response to `location:update`:
```json
{
  "receivedAt": 1793014500000,
  "timestamp": 1793014499950
}
```

#### `location:rate_limited`
Emitted if pings are sent faster than the 800ms minimum gap:
```json
{
  "retryAfterMs": 420
}
```

#### `location:error`
Emitted on validation or logical rejection:
```json
{
  "code": "INVALID_JOURNEY",
  "message": "Active journey not found for this user"
}
```
*Possible Error Codes*: `RATE_LIMITED`, `INVALID_PAYLOAD`, `ACCURACY_EXCEEDED`, `OUT_OF_ORDER`, `IMPOSSIBLE_JUMP`, `INVALID_JOURNEY`, `TOKEN_EXPIRED`, `CONCURRENCY_LIMIT`, `AREA_QUERY_LIMIT`.

---

### 4.4 Events Sent by Client to Server

#### 1. `location:update` (Main Telemetry Ping)
Send whenever the client position changes according to pace rules. Supports both Socket.IO event listening and request-response callback acknowledgements.

* **Payload Format**:
```json
{
  "lat": 12.9716,
  "lng": 77.5946,
  "speed": 45.0,
  "heading": 90.0,
  "accuracy": 8.5,
  "journeyId": 7,
  "clientTimestamp": 1793014500000
}
```
* **Validation Rules**:
  * `lat`: Number between `-90` and `90`.
  * `lng`: Number between `-180` and `180`.
  * `speed`: Optional Number $\ge 0$ (in km/h).
  * `heading`: Optional Number $0 \le \text{heading} \le 360$.
  * `accuracy`: Optional Number in meters. Pings with `accuracy > 100m` are dropped to prevent erratic GPS noise.
  * `clientTimestamp`: Unix epoch milliseconds. Server clamps timestamps with $> 60\text{s}$ drift to server receive time.
  * **Anti-Spoofing Jump Speed**: If implied speed between consecutive pings exceeds $100\text{ m/s}$ (~$360\text{ km/h}$), the ping is rejected as an `IMPOSSIBLE_JUMP`.
  * **Minimum Gap**: Minimum $800\text{ ms}$ between pings.

* **Client Example (with Callback Acknowledgement)**:
```javascript
socket.emit('location:update', {
  lat: currentLat,
  lng: currentLng,
  speed: currentSpeedKmh,
  heading: currentCompassHeading,
  journeyId: activeJourneyId, // optional if just free-roaming
  clientTimestamp: Date.now(),
}, (err, ack) => {
  if (err) {
    console.warn('Ping rejected:', err.code, err.message);
  } else {
    console.log('Ping confirmed at:', ack.receivedAt);
  }
});
```

---

#### 2. `location:heartbeat` (Low-Power Stationary Ping)
When stationary (`speed <= 0.5 m/s`), send a lightweight heartbeat every 45 seconds to keep the session alive without sending full telemetry coordinates:
```javascript
socket.emit('location:heartbeat', { clientTimestamp: Date.now() });
```

---

#### 3. `location:mode` (Dynamic Mode Switch)
If the user switches between walking, cycling, or driving during their app session:
```javascript
socket.emit('location:mode', { mode: 'CYCLIST' }); // 'DRIVER' | 'CYCLIST' | 'WALKER'
```

---

#### 4. `hazards:area` (Viewport Bounding-Box Query)
Fetches cached hazards in the visible map rectangle without repeatedly hammering the SQL database:
```javascript
socket.emit('hazards:area', {
  minLat: 12.9500,
  maxLat: 12.9900,
  minLng: 77.5700,
  maxLng: 77.6200,
  limit: 50
});

socket.on('hazards:area', (data) => {
  console.log(`Received ${data.count} hazards in viewport. Truncated: ${data.truncated}`);
  renderHazardsOnMap(data.hazards);
});
```

---

## 5. Storage Partitioning: Redis vs PostgreSQL

RoadLife separates ephemeral live tracking from permanent historical breadcrumbs to achieve extreme speed and minimal database write amplification.

```
       CLIENT TELEMETRY PING
                 │
                 ▼
      [ LocationService ]
        │             │
        │             └── If on ACTIVE journey AND
        │                 movement threshold satisfied:
        │                         │
        ▼                         ▼
   REDIS (RAM)             POSTGRESQL (SSD)
 ─────────────────        ──────────────────
 • live:user:{id}         • journey_locations
 • live:geo:{mode}          (History breadcrumbs)
 • live:seen              • journeys
 • journey:distance         (distance_km, status)
 • hazards:area
```

### 5.1 What is Stored in Redis (In-Memory, Low Latency)
1. **`live:user:<userId>`**: Hash holding `lat`, `lng`, `mode`, `speed`, `heading`, `updatedAt`. Updated on every valid ping.
2. **`live:geo:<MODE>`**: Redis Geospatial Index (`GEOADD`). Used for sub-millisecond proximity queries (`GEOSEARCH`) to warn drivers of nearby cyclists or pedestrians.
3. **`live:seen`**: Sorted set recording the last heartbeat timestamp for stale session pruning.
4. **`journey:distance:<journeyId>`**: Monotonic odometer distance counter. Flushed to PostgreSQL every 60 seconds or when the journey completes/cancels.

---

### 5.2 What is Persisted in PostgreSQL Database
1. **`journey_locations`**: Permanent history trail of coordinates (breadcrumbs).
2. **`journeys`**: Master journey record (`distance_km`, `status`, `started_at`, `ended_at`, `route_polyline`).

---

### 5.3 Conditions Required to Save a History Breadcrumb
A ping is **only** persisted to `journey_locations` when **all** of the following conditions are met:
1. **Active Journey**: The payload contains a `journeyId` belonging to the user that is currently `ACTIVE`. Free-roam pings (no `journeyId`) write exclusively to Redis (0 SQL database queries).
2. **Mode-Specific Movement Thresholds**:
   * **First Point**: The very first ping of a journey is always saved.
   * **Speed / Distance Movement**:
     * **DRIVER**: Distance moved $\ge 100\text{ meters}$ since last saved point.
     * **CYCLIST**: Distance moved $\ge 60\text{ meters}$.
     * **WALKER**: Distance moved $\ge 30\text{ meters}$.
   * **Slow Traffic Time Rule**: If the time elapsed exceeds the mode interval (20s for DRIVER, 30s for CYCLIST, 60s for WALKER), a point is saved **only if** the user moved at least **$8\text{ meters}$**.
   * **Cornering & Turns**: If the compass heading changes by $\ge 20^\circ$ (DRIVER), $25^\circ$ (CYCLIST), or $30^\circ$ (WALKER), a point is saved immediately to accurately map street turns without cutting corners.
   * **Stationary Filter**: Pings with $< 8\text{ meters}$ movement (e.g. waiting at red lights or in gridlock) are **never** written to PostgreSQL, completely preventing GPS drift from bloating the database.

---

## 6. Frontend Integration Checklist

Use this checklist during mobile/web app development:

### 1. Connection & Token Lifecycle
- [ ] Implement token storage and refresh logic.
- [ ] Connect to WebSocket using `transports: ['websocket']` with `{ auth: { token } }`.
- [ ] Re-arm or reconnect socket when refreshing the auth token.
- [ ] Listen for `location:error` with code `TOKEN_EXPIRED` to trigger re-authentication.

### 2. Location Streaming & Pacing
- [ ] Listen to `location:config` on connect and store pace thresholds (`still`, `normal`, `fast`).
- [ ] Throttle outgoing `location:update` events to not exceed 1 ping per 800ms.
- [ ] Filter out raw GPS readings where `accuracy > 100m` before sending.
- [ ] Include the active `journeyId` in `location:update` whenever the user starts a journey.
- [ ] Switch to `location:heartbeat` when stationary for $> 45\text{s}$ to conserve device battery.

### 3. Error Handling
- [ ] Handle `409 Conflict` gracefully when a user confirms or resolves a hazard they already voted on.
- [ ] Handle `429 Too Many Requests` or `location:rate_limited` with exponential backoff.
- [ ] Display offline warning banner if `/health/redis` returns `503`.

---

## 7. Frontend Environment Variables

Configure your frontend `.env` or application config:

```env
# HTTP API Base URL
VITE_API_URL=http://localhost:3030
# or for Next.js:
NEXT_PUBLIC_API_URL=http://localhost:3030

# WebSocket Base URL
VITE_SOCKET_URL=http://localhost:3030
# or for Next.js:
NEXT_PUBLIC_SOCKET_URL=http://localhost:3030

# API Version Prefix
VITE_API_PREFIX=/api/v1
```

---

## 8. Importing the Postman Collection

1. Open Postman.
2. Click **Import** in the top left corner.
3. Drag and drop [`RoadLife_Postman_Collection.json`](../RoadLife_Postman_Collection.json).
4. Select the imported collection, click the **Variables** tab, and configure:
   * `baseUrl`: `http://localhost:3030`
   * `userToken`: Paste a valid JWT token obtained from `POST /api/v1/auth/login`.
   * `adminToken`: Paste a valid Admin JWT obtained from `POST /api/v1/admin/auth/login`.
5. All requests automatically inherit authentication tokens and base URLs.
