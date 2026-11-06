# RoadLife Backend API Documentation

## Base URL
- Development: `http://localhost:3030`
- API Version: `v1` (`/api/v1`)

## Standard Response Format
All responses follow the unified JSON structure:
```json
{
  "success": true,
  "message": "Human readable summary",
  "data": {},
  "meta": {}
}
```

Error response:
```json
{
  "success": false,
  "message": "Validation failed or error description",
  "error": {}
}
```

---

## 1. Health Checks
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/health` | Application status health check | Public |
| `GET` | `/health/db` | PostgreSQL database connection status | Public |

---

## 2. Authentication APIs
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | Register a new user | Public |
| `POST` | `/api/v1/auth/login` | User login (JWT returned) | Public |
| `POST` | `/api/v1/auth/forgot-password` | Request password reset token | Public |
| `POST` | `/api/v1/auth/reset-password` | Reset password using reset token | Public |
| `POST` | `/api/v1/auth/logout` | User logout | User JWT |
| `GET` | `/api/v1/auth/me` | Current user profile | User JWT |
| `POST` | `/api/v1/admin/auth/login` | Global Admin login | Public |
| `POST` | `/api/v1/admin/auth/logout` | Admin logout | Admin JWT |
| `GET` | `/api/v1/admin/auth/me` | Current Admin profile | Admin JWT |

---

## 3. Users Module
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/v1/users/profile` | Get authenticated user profile | User JWT |
| `PUT` | `/api/v1/users/profile` | Update profile information | User JWT |
| `PATCH` | `/api/v1/users/transport-mode` | Update transport mode (DRIVER, CYCLIST, WALKER) | User JWT |
| `DELETE` | `/api/v1/users/account` | Soft delete account | User JWT |
| `GET` | `/api/v1/users` | List users (paginated & filtered) | Admin JWT |
| `GET` | `/api/v1/users/:id` | Get user by ID | Admin JWT |

---

## 4. Hazards & Geolocation
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/v1/hazards/categories` | Get active hazard categories | Public |
| `GET` | `/api/v1/hazards/nearby` | Find hazards near coordinate radius (Haversine km) | Public |
| `GET` | `/api/v1/hazards` | List hazards with filters & pagination | Public |
| `GET` | `/api/v1/hazards/:id` | Get hazard by ID | Public |
| `POST` | `/api/v1/hazards` | Create a hazard | User / Admin JWT |
| `PUT` | `/api/v1/hazards/:id` | Update hazard details | User / Admin JWT |
| `DELETE` | `/api/v1/hazards/:id` | Delete hazard | User / Admin JWT |

---

## 5. Hazard Reporting & Moderation
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/hazard-reports` | Submit a hazard report | User JWT |
| `GET` | `/api/v1/hazard-reports/my` | Get own submitted hazard reports | User JWT |
| `GET` | `/api/v1/hazard-reports/:id` | Get report details | User / Admin JWT |
| `GET` | `/api/v1/admin/hazard-reports` | List reports for moderation | Admin JWT |
| `PATCH` | `/api/v1/admin/hazard-reports/:id/approve` | Approve report, create hazard, notify user, log action | Admin JWT |
| `PATCH` | `/api/v1/admin/hazard-reports/:id/reject` | Reject report with reason, notify user, log action | Admin JWT |

---

## 6. Journeys Module
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/journeys/start` | Start a new journey & activate live location | User JWT |
| `POST` | `/api/v1/journeys/:id/end` | End journey & deactivate live location | User JWT |
| `POST` | `/api/v1/journeys/:id/cancel` | Cancel an active journey, persist distance & deactivate live location | User JWT |
| `GET` | `/api/v1/journeys/active` | Get current active journey | User JWT |
| `GET` | `/api/v1/journeys/history` | Get past completed/cancelled journeys | User JWT |
| `GET` | `/api/v1/journeys/:id` | Get journey details | User JWT |

---

## 7. Live Locations & Proximity Awareness (DEPRECATED)
> **Note**: HTTP live location pings are **DEPRECATED**.
> Mobile and web clients should migrate to the **WebSocket `/location` namespace** for real-time tracking, pace rules, and bounding-box queries.
> See full guide in [docs/LOCATION_SOCKET.md](file:///d:/John-Roadlife/road-life-backend-john/docs/LOCATION_SOCKET.md).
>
> Endpoints return standard `Deprecation` and `Sunset` headers configured via `HTTP_LOCATION_DEPRECATION_AT` and `HTTP_LOCATION_SUNSET_AT`.

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/locations/start` | Start sharing live location | User JWT |
| `POST` | `/api/v1/locations/update` | Update current coordinates *(Deprecated)* | User JWT |
| `POST` | `/api/v1/locations/stop` | Stop sharing live location | User JWT |
| `GET` | `/api/v1/locations/nearby` | Find nearby active cyclists and walkers | User JWT |
| `GET` | `/api/v1/locations/awareness` | Driver proximity engine *(Deprecated)* | User JWT |

---

## 8. Notifications Module
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/v1/notifications` | Get paginated notifications & unread count | User JWT |
| `PATCH` | `/api/v1/notifications/:id/read` | Mark single notification as read | User JWT |
| `PATCH` | `/api/v1/notifications/read-all` | Mark all notifications as read | User JWT |
| `DELETE` | `/api/v1/notifications/:id` | Delete notification | User JWT |
| `POST` | `/api/v1/notifications` | Dispatch notification (Admin) | Admin JWT |

---

## 9. Admin Dataset Imports
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/admin/datasets/upload` | Upload & validate CSV hazard dataset | Admin JWT |
| `POST` | `/api/v1/admin/datasets/:id/validate` | Re-validate and view report | Admin JWT |
| `GET` | `/api/v1/admin/datasets/:id/preview` | Preview staging records | Admin JWT |
| `POST` | `/api/v1/admin/datasets/:id/import` | Transactional batch import into hazards | Admin JWT |
| `GET` | `/api/v1/admin/datasets/history` | View dataset import history logs | Admin JWT |

---

## 10. Content & Settings
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/v1/content/:slug` | Get published content (faq, terms, privacy, etc.) | Public |
| `GET` | `/api/v1/admin/content` | List all content pages | Admin JWT |
| `POST` | `/api/v1/admin/content` | Create content page | Admin JWT |
| `PUT` | `/api/v1/admin/content/:id` | Update content page | Admin JWT |
| `DELETE` | `/api/v1/admin/content/:id` | Delete content page | Admin JWT |
| `GET` | `/api/v1/settings` | Get public system & map configurations | Public |
| `GET` | `/api/v1/admin/settings` | Get all system settings | Admin JWT |
| `PUT` | `/api/v1/admin/settings/:key` | Update system setting key | Admin JWT |

---

## 11. Admin Dashboard & Analytics
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/v1/admin/dashboard/summary` | Key platform performance metrics | Admin JWT |
| `GET` | `/api/v1/admin/dashboard/hazards` | Hazard severity, status, and category breakdown | Admin JWT |
| `GET` | `/api/v1/admin/dashboard/users` | User growth and transport mode distribution | Admin JWT |
| `GET` | `/api/v1/admin/dashboard/journeys` | Total distance, duration, and status metrics | Admin JWT |
| `GET` | `/api/v1/admin/dashboard/reports` | Hazard report status metrics | Admin JWT |
| `GET` | `/api/v1/admin/activity-logs` | System audit and activity logs | Admin JWT |
