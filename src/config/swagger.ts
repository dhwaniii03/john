import swaggerUi from 'swagger-ui-express';
import type { Express, Request, Response } from 'express';
import { env } from './env.js';

export const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'RoadLife API',
    version: '1.0.0',
    description: `## RoadLife Backend API & Real-Time Tracking Specification

Comprehensive API specification for the RoadLife crowdsourced road hazards, real-time driver proximity awareness, and trip tracking platform.

---

### ⚡ Real-Time Tracking: Socket.IO (/location)
> **NOTE FOR FRONTEND DEVELOPERS**: Live driver location telemetry, pace-based GPS tracking, and real-time proximity alerts operate over **Socket.IO WebSocket**, not HTTP polling. The HTTP \`/api/v1/locations/*\` endpoints below are **DEPRECATED**.
>
> * **Namespace**: \`/location\`
> * **Connection URL**: \`ws://localhost:3030/location\` (or \`wss://<domain>/location\`)
> * **Transport**: \`transports: ['websocket']\`
> * **Handshake Auth**: \`{ auth: { token: "<USER_JWT>" } }\`
> * **Client Events**:
>   * \`location:update\`: \`{ lat: number, lng: number, speed?: number, heading?: number, accuracy?: number, journeyId?: number, clientTimestamp: number }\`
>   * \`location:heartbeat\`: \`{ clientTimestamp: number }\` (send every 45s when stationary)
>   * \`location:mode\`: \`{ mode: "DRIVER" | "CYCLIST" | "WALKER" }\`
>   * \`hazards:area\`: \`{ minLat: number, maxLat: number, minLng: number, maxLng: number, limit?: number }\`
> * **Server Events**:
>   * \`location:config\`: Dynamic pacing rules sent immediately on handshake.
>   * \`location:ack\`: Confirmation with server timestamp \`{ receivedAt: number, timestamp: number }\`.
>   * \`awareness:update\`: Broadcast of nearby road users \`{ cyclists: number, walkers: number }\`.
>   * \`location:error\`: Rejection error \`{ code: string, message: string }\`.
>
> 📖 See full integration guide in **docs/FRONTEND_INTEGRATION_GUIDE.md**.`,
    contact: {
      name: 'RoadLife Development Team',
      email: 'support@roadlife.com',
    },
    license: {
      name: 'ISC',
    },
  },
  servers: [
    {
      url: `http://${env.host}:${env.port}`,
      description: 'Local development server',
    },
  ],
  tags: [
    { name: 'Health', description: 'Application, Redis, and database connectivity health checks' },
    { name: 'Authentication', description: 'Public registration, login, OTP dispatch, and password resets' },
    { name: 'Users', description: 'User profile management, transport mode, and admin user directory' },
    { name: 'Hazards', description: 'Public hazard browsing, proximity search, voting, and report CRUD' },
    { name: 'Hazard Reports', description: 'Citizen hazard reporting and review' },
    { name: 'Journeys', description: 'Trip tracking, polyline route tracking, cancel, and journey history' },
    { name: 'Live Locations', description: '⚠️ HTTP location endpoints (DEPRECATED: migrate to Socket.IO /location namespace for real-time tracking)' },
    { name: 'Notifications', description: 'In-app notifications and OneSignal push broadcasts' },
    { name: 'Uploads', description: 'Authenticated multipart/form-data and base64 image uploads' },
    { name: 'Admin', description: 'Platform administration, dashboard metrics, dataset imports, and audit logs' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Provide your JWT bearer token in the Authorization header (e.g. Bearer <token>)',
      },
    },
    schemas: {
      ApiResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Operation completed successfully' },
          data: { type: 'object', nullable: true },
          meta: { type: 'object', nullable: true },
        },
      },
      ApiError: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'Validation failed or resource not found' },
          error: { type: 'object', nullable: true },
        },
      },
      PaginationMeta: {
        type: 'object',
        properties: {
          totalItems: { type: 'integer', example: 100 },
          totalPages: { type: 'integer', example: 10 },
          currentPage: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 10 },
          hasNextPage: { type: 'boolean', example: true },
          hasPrevPage: { type: 'boolean', example: false },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          email: { type: 'string', format: 'email', example: 'driver@roadlife.com' },
          name: { type: 'string', example: 'Alex Smith' },
          first_name: { type: 'string', example: 'Alex' },
          last_name: { type: 'string', example: 'Smith' },
          phone: { type: 'string', example: '+1234567890' },
          profile_image: { type: 'string', nullable: true, example: '/uploads/profiles/alex.jpg' },
          transport_mode: { type: 'string', enum: ['DRIVER', 'CYCLIST', 'WALKER'], example: 'DRIVER' },
          status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED', 'DELETED'], example: 'ACTIVE' },
          role: { type: 'string', example: 'user' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      Hazard: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 10 },
          category_id: { type: 'integer', example: 1 },
          title: { type: 'string', example: 'Deep Pothole' },
          description: { type: 'string', example: 'Dangerous pothole in the right lane' },
          latitude: { type: 'number', format: 'double', example: 12.971598 },
          longitude: { type: 'number', format: 'double', example: 77.594562 },
          severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], example: 'HIGH' },
          status: { type: 'string', enum: ['ACTIVE', 'INVESTIGATING', 'RESOLVED'], example: 'ACTIVE' },
          source: { type: 'string', enum: ['USER', 'ADMIN', 'OFFICIAL_DATASET'], example: 'USER' },
          reported_by: { type: 'integer', nullable: true, example: 5 },
          image_url: { type: 'string', nullable: true },
          address: { type: 'string', nullable: true, example: 'MG Road, Bangalore' },
          confirmation_count: { type: 'integer', example: 4 },
          resolved_count: { type: 'integer', example: 0 },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      HazardCategory: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          name: { type: 'string', example: 'Pothole' },
          slug: { type: 'string', example: 'pothole' },
          description: { type: 'string', example: 'Road surface crater or dangerous depression' },
          icon_url: { type: 'string', nullable: true },
          default_severity: { type: 'string', example: 'HIGH' },
          default_expiry_days: { type: 'integer', example: 7 },
          is_active: { type: 'boolean', example: true },
        },
      },
      HazardReport: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 3 },
          user_id: { type: 'integer', example: 7 },
          category_id: { type: 'integer', nullable: true, example: 2 },
          hazard_id: { type: 'integer', nullable: true },
          title: { type: 'string', example: 'Fallen tree on highway' },
          description: { type: 'string', example: 'Large branch blocking shoulder' },
          latitude: { type: 'number', example: 12.972 },
          longitude: { type: 'number', example: 77.595 },
          status: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED'], example: 'PENDING' },
          reviewed_by: { type: 'integer', nullable: true },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      Journey: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 12 },
          user_id: { type: 'integer', example: 4 },
          transport_mode: { type: 'string', example: 'DRIVER' },
          title: { type: 'string', example: 'Morning Commute' },
          start_latitude: { type: 'number', example: 12.971 },
          start_longitude: { type: 'number', example: 77.594 },
          end_latitude: { type: 'number', nullable: true, example: 12.981 },
          end_longitude: { type: 'number', nullable: true, example: 77.604 },
          distance_km: { type: 'number', example: 5.4 },
          duration_minutes: { type: 'integer', example: 18 },
          status: { type: 'string', enum: ['ACTIVE', 'COMPLETED', 'CANCELLED'], example: 'ACTIVE' },
          route_polyline: { type: 'string', nullable: true },
          started_at: { type: 'string', format: 'date-time' },
        },
      },
      LiveLocation: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 25 },
          user_id: { type: 'integer', example: 9 },
          latitude: { type: 'number', example: 12.9716 },
          longitude: { type: 'number', example: 77.5946 },
          transport_mode: { type: 'string', example: 'CYCLIST' },
          is_active: { type: 'boolean', example: true },
          last_updated_at: { type: 'string', format: 'date-time' },
        },
      },
      Notification: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 8 },
          user_id: { type: 'integer', example: 3 },
          type: { type: 'string', example: 'HAZARD_ALERT' },
          title: { type: 'string', example: 'Caution: Road Hazard Ahead' },
          message: { type: 'string', example: 'A high severity pothole was reported 200m ahead.' },
          is_read: { type: 'boolean', example: false },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      RegisterInput: {
        type: 'object',
        required: ['email', 'password', 'otp'],
        properties: {
          email: { type: 'string', format: 'email', example: 'user@roadlife.com' },
          password: { type: 'string', minLength: 6, example: 'Password@123' },
          otp: { type: 'string', example: '1234' },
          name: { type: 'string', example: 'Jane Doe' },
          first_name: { type: 'string', example: 'Jane' },
          last_name: { type: 'string', example: 'Doe' },
          phone: { type: 'string', example: '+1234567890' },
          transport_mode: { type: 'string', enum: ['DRIVER', 'CYCLIST', 'WALKER'], default: 'DRIVER' },
        },
      },
      LoginInput: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'admin@roadlife.com' },
          password: { type: 'string', example: 'Admin@1234' },
        },
      },
      CreateHazardInput: {
        type: 'object',
        required: ['title', 'latitude', 'longitude'],
        properties: {
          category_id: { type: 'integer', example: 1 },
          title: { type: 'string', example: 'Fallen Tree' },
          description: { type: 'string', example: 'Large branch obstructing lane' },
          latitude: { type: 'number', minimum: -90, maximum: 90, example: 12.971598 },
          longitude: { type: 'number', minimum: -180, maximum: 180, example: 77.594562 },
          severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'MEDIUM' },
          address: { type: 'string', example: '123 Main Street' },
          image_url: { type: 'string', nullable: true },
        },
      },
      StartJourneyInput: {
        type: 'object',
        required: ['start_latitude', 'start_longitude'],
        properties: {
          start_latitude: { type: 'number', example: 12.971 },
          start_longitude: { type: 'number', example: 77.594 },
          end_latitude: { type: 'number', example: 12.985 },
          end_longitude: { type: 'number', example: 77.605 },
          title: { type: 'string', example: 'Evening Ride' },
          origin_name: { type: 'string', example: 'City Center' },
          destination_name: { type: 'string', example: 'Tech Park' },
          transport_mode: { type: 'string', enum: ['DRIVER', 'CYCLIST', 'WALKER'] },
          route_polyline: { type: 'string' },
        },
      },
      EndJourneyInput: {
        type: 'object',
        properties: {
          end_latitude: { type: 'number' },
          end_longitude: { type: 'number' },
          distance_km: { type: 'number', example: 8.5 },
          duration_minutes: { type: 'integer', example: 22 },
          avg_speed_kmh: { type: 'number', example: 23.2 },
          hazards_count: { type: 'integer', example: 2 },
          status: { type: 'string', enum: ['COMPLETED', 'CANCELLED'], default: 'COMPLETED' },
        },
      },
      UpdateLocationInput: {
        type: 'object',
        required: ['latitude', 'longitude'],
        properties: {
          journey_id: { type: 'integer', nullable: true },
          latitude: { type: 'number', minimum: -90, maximum: 90, example: 12.972 },
          longitude: { type: 'number', minimum: -180, maximum: 180, example: 77.595 },
          transport_mode: { type: 'string', enum: ['DRIVER', 'CYCLIST', 'WALKER'] },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Application health status',
        description: 'Returns operational status of the RoadLife API server.',
        responses: {
          '200': {
            description: 'API is healthy and operational',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } },
          },
        },
      },
    },
    '/health/db': {
      get: {
        tags: ['Health'],
        summary: 'Database connection health status',
        description: 'Executes a test query against PostgreSQL.',
        responses: {
          '200': {
            description: 'PostgreSQL database connected and operational',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } },
          },
          '503': {
            description: 'PostgreSQL database connection failed',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
          },
        },
      },
    },
    '/api/v1/content/{slug}': {
      get: {
        tags: ['Health'],
        summary: 'Get published public content page',
        parameters: [
          { name: 'slug', in: 'path', required: true, schema: { type: 'string', example: 'faq' } },
        ],
        responses: {
          '200': { description: 'Content page retrieved' },
          '404': { description: 'Content page not found' },
        },
      },
    },
    '/api/v1/settings': {
      get: {
        tags: ['Health'],
        summary: 'Get public system and map configuration settings',
        responses: {
          '200': { description: 'System settings retrieved' },
        },
      },
    },
    '/api/v1/auth/register': {
      post: {
        tags: ['Authentication'],
        summary: 'Register new user account',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterInput' } } },
        },
        responses: {
          '201': { description: 'User successfully registered' },
          '400': { description: 'Validation failed or email already registered' },
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'User login',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginInput' } } },
        },
        responses: {
          '200': { description: 'Login successful, JWT access token returned' },
          '401': { description: 'Invalid credentials or suspended account' },
        },
      },
    },
    '/api/v1/auth/send-otp': {
      post: {
        tags: ['Authentication'],
        summary: 'Request OTP dispatch for registration or password reset',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', format: 'email' },
                  phone: { type: 'string' },
                  purpose: { type: 'string', enum: ['REGISTRATION', 'PASSWORD_RESET'], default: 'REGISTRATION' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'OTP dispatched successfully' },
        },
      },
    },
    '/api/v1/auth/verify-otp': {
      post: {
        tags: ['Authentication'],
        summary: 'Verify dispatched OTP',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['otp'],
                properties: {
                  email: { type: 'string' },
                  phone: { type: 'string' },
                  otp: { type: 'string', example: '1234' },
                  purpose: { type: 'string', default: 'REGISTRATION' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'OTP verified successfully' },
          '400': { description: 'Invalid or expired OTP' },
        },
      },
    },
    '/api/v1/auth/forgot-password': {
      post: {
        tags: ['Authentication'],
        summary: 'Initiate password reset request',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: { email: { type: 'string', format: 'email' } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Password reset OTP generated' },
        },
      },
    },
    '/api/v1/auth/reset-password': {
      post: {
        tags: ['Authentication'],
        summary: 'Reset password with verified OTP',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'otp', 'newPassword'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  otp: { type: 'string' },
                  newPassword: { type: 'string', minLength: 6 },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Password updated successfully' },
          '400': { description: 'Invalid OTP or user not found' },
        },
      },
    },
    '/api/v1/auth/me': {
      get: {
        tags: ['Authentication'],
        summary: 'Get authenticated user profile',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'User profile returned' },
          '401': { description: 'Authentication required' },
        },
      },
    },
    '/api/v1/users/profile': {
      get: {
        tags: ['Users'],
        summary: 'Get current user profile and statistics',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Profile returned' },
          '401': { description: 'Unauthorized' },
        },
      },
      put: {
        tags: ['Users'],
        summary: 'Update current user profile',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  first_name: { type: 'string' },
                  last_name: { type: 'string' },
                  phone: { type: 'string' },
                  notification_enabled: { type: 'boolean' },
                  location_enabled: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Profile updated successfully' },
        },
      },
    },
    '/api/v1/users/transport-mode': {
      patch: {
        tags: ['Users'],
        summary: 'Update user transport mode',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['transport_mode'],
                properties: { transport_mode: { type: 'string', enum: ['DRIVER', 'CYCLIST', 'WALKER'] } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Transport mode updated' },
        },
      },
    },
    '/api/v1/users/account': {
      delete: {
        tags: ['Users'],
        summary: 'Soft-delete own user account',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Account deleted' },
        },
      },
    },
    '/api/v1/users': {
      get: {
        tags: ['Users'],
        summary: 'List users with pagination and filters (Admin only)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'User listing' },
          '403': { description: 'Forbidden: Admin privileges required' },
        },
      },
    },
    '/api/v1/users/{id}': {
      get: {
        tags: ['Users'],
        summary: 'Get user details by ID (Owner or Admin)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'User profile details' },
          '403': { description: 'Forbidden: Access denied to other user profiles' },
          '404': { description: 'User not found' },
        },
      },
    },
    '/api/v1/hazards/categories': {
      get: {
        tags: ['Hazards'],
        summary: 'Get active hazard categories',
        responses: {
          '200': { description: 'List of active categories' },
        },
      },
    },
    '/api/v1/hazards/nearby': {
      get: {
        tags: ['Hazards'],
        summary: 'Find active hazards within coordinate radius',
        parameters: [
          { name: 'latitude', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'longitude', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'radius', in: 'query', schema: { type: 'number', default: 10 } },
          { name: 'status', in: 'query', schema: { type: 'string', default: 'ACTIVE' } },
        ],
        responses: {
          '200': { description: 'Nearby hazards list' },
        },
      },
    },
    '/api/v1/hazards': {
      get: {
        tags: ['Hazards'],
        summary: 'List hazards with filtering and pagination',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'severity', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Paginated hazards' },
        },
      },
      post: {
        tags: ['Hazards'],
        summary: 'Create a new hazard',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateHazardInput' } } },
        },
        responses: {
          '201': { description: 'Hazard created successfully' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/api/v1/hazards/{id}': {
      get: {
        tags: ['Hazards'],
        summary: 'Get hazard details by ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Hazard details' },
          '404': { description: 'Hazard not found' },
        },
      },
      put: {
        tags: ['Hazards'],
        summary: 'Update hazard details (Owner or Admin only)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        responses: {
          '200': { description: 'Hazard updated' },
          '403': { description: 'Forbidden: You can only edit your own hazards' },
          '404': { description: 'Hazard not found' },
        },
      },
      delete: {
        tags: ['Hazards'],
        summary: 'Delete hazard (Owner or Admin only)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Hazard deleted' },
          '403': { description: 'Forbidden: You can only delete your own hazards' },
          '404': { description: 'Hazard not found' },
        },
      },
    },
    '/api/v1/hazards/{id}/confirm': {
      post: {
        tags: ['Hazards'],
        summary: 'Confirm hazard presence (1 vote per user)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Hazard confirmed' },
          '409': { description: 'Conflict: You have already confirmed this hazard' },
        },
      },
    },
    '/api/v1/hazards/{id}/resolve': {
      post: {
        tags: ['Hazards'],
        summary: 'Submit hazard resolution vote (1 vote per user)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Hazard resolution vote recorded' },
          '409': { description: 'Conflict: You have already submitted a resolution vote for this hazard' },
        },
      },
    },
    '/api/v1/hazard-reports': {
      post: {
        tags: ['Hazard Reports'],
        summary: 'Submit citizen hazard report for moderation',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['description', 'latitude', 'longitude'],
                properties: {
                  category_id: { type: 'integer' },
                  title: { type: 'string' },
                  description: { type: 'string' },
                  latitude: { type: 'number' },
                  longitude: { type: 'number' },
                  address: { type: 'string' },
                  image_url: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Report submitted for review' },
        },
      },
    },
    '/api/v1/hazard-reports/my': {
      get: {
        tags: ['Hazard Reports'],
        summary: 'Get citizen reports submitted by authenticated user',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'User submitted reports' },
        },
      },
    },
    '/api/v1/hazard-reports/{id}': {
      get: {
        tags: ['Hazard Reports'],
        summary: 'Get hazard report details (Owner or Admin)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Report details' },
          '403': { description: 'Forbidden: Access denied' },
        },
      },
    },
    '/api/v1/journeys/start': {
      post: {
        tags: ['Journeys'],
        summary: 'Start a new trip and activate live tracking',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/StartJourneyInput' } } },
        },
        responses: {
          '201': { description: 'Journey started' },
        },
      },
    },
    '/api/v1/journeys/{id}/end': {
      post: {
        tags: ['Journeys'],
        summary: 'End active trip (Owner only)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/EndJourneyInput' } } },
        },
        responses: {
          '200': { description: 'Journey ended' },
          '403': { description: 'Forbidden: You can only end your own journey' },
        },
      },
    },
    '/api/v1/journeys/{id}/cancel': {
      post: {
        tags: ['Journeys'],
        summary: 'Cancel active trip and persist running distance (Owner only)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Journey cancelled successfully' },
          '403': { description: 'Forbidden: You can only cancel your own journey' },
          '404': { description: 'Journey not found' },
        },
      },
    },
    '/api/v1/journeys/active': {
      get: {
        tags: ['Journeys'],
        summary: 'Get current active journey for authenticated user',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Active journey' },
        },
      },
    },
    '/api/v1/journeys/history': {
      get: {
        tags: ['Journeys'],
        summary: 'Get past completed journeys history',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Trip history' },
        },
      },
    },
    '/api/v1/locations/start': {
      post: {
        tags: ['Live Locations'],
        deprecated: true,
        summary: 'Start live location sharing (DEPRECATED: Use Socket.IO /location)',
        description: '⚠️ DEPRECATED: Please migrate to WebSocket namespace /location for real-time location streaming and driver awareness.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateLocationInput' } } },
        },
        responses: { '200': { description: 'Location sharing started' } },
      },
    },
    '/api/v1/locations/update': {
      post: {
        tags: ['Live Locations'],
        deprecated: true,
        summary: 'Update current live coordinates (DEPRECATED: Use Socket.IO /location)',
        description: '⚠️ DEPRECATED: Returns Deprecation and Sunset HTTP headers. Please migrate to WebSocket namespace /location.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateLocationInput' } } },
        },
        responses: { '200': { description: 'Location updated' } },
      },
    },
    '/api/v1/locations/stop': {
      post: {
        tags: ['Live Locations'],
        deprecated: true,
        summary: 'Stop sharing live location (DEPRECATED: Use Socket.IO /location)',
        description: '⚠️ DEPRECATED: Disconnecting from Socket.IO /location automatically initiates 30s grace period cleanup.',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Location sharing stopped' } },
      },
    },
    '/api/v1/locations/nearby': {
      get: {
        tags: ['Live Locations'],
        deprecated: true,
        summary: 'Find active nearby cyclists and walkers (DEPRECATED)',
        description: '⚠️ DEPRECATED: Awareness is streamed in real-time over WebSocket /location via awareness:update event.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'latitude', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'longitude', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'radius', in: 'query', schema: { type: 'number', default: 5 } },
        ],
        responses: { '200': { description: 'Nearby active road users' } },
      },
    },
    '/api/v1/locations/awareness': {
      get: {
        tags: ['Live Locations'],
        deprecated: true,
        summary: 'Driver proximity awareness engine (DEPRECATED)',
        description: '⚠️ DEPRECATED: Streamed automatically via WebSocket /location awareness:update event.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'latitude', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'longitude', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'radius', in: 'query', schema: { type: 'number', default: 5 } },
        ],
        responses: { '200': { description: 'Consolidated proximity awareness data' } },
      },
    },
    '/api/v1/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'Get user notifications',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Notifications list' } },
      },
      post: {
        tags: ['Notifications'],
        summary: 'Dispatch notification or broadcast (Admin only)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title', 'message'],
                properties: {
                  title: { type: 'string' },
                  message: { type: 'string' },
                  type: { type: 'string' },
                  audience: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Notification dispatched' },
          '403': { description: 'Forbidden: Admin only' },
        },
      },
    },
    '/api/v1/notifications/{id}/read': {
      patch: {
        tags: ['Notifications'],
        summary: 'Mark single notification as read (Owner only)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Notification marked as read' } },
      },
    },
    '/api/v1/notifications/read-all': {
      patch: {
        tags: ['Notifications'],
        summary: 'Mark all notifications as read for current user',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'All marked as read' } },
      },
    },
    '/api/v1/uploads': {
      post: {
        tags: ['Uploads'],
        summary: 'Upload image file via multipart/form-data or base64 (Authenticated only)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary' },
                  folder: { type: 'string', enum: ['hazards', 'profiles', 'general'], default: 'general' },
                },
              },
            },
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  image: { type: 'string', description: 'Base64 image string' },
                  folder: { type: 'string', enum: ['hazards', 'profiles', 'general'] },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'File uploaded successfully' },
          '401': { description: 'Authentication required' },
        },
      },
    },
    '/api/v1/admin/auth/login': {
      post: {
        tags: ['Admin'],
        summary: 'Administrator login',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginInput' } } },
        },
        responses: {
          '200': { description: 'Admin login successful' },
          '401': { description: 'Invalid administrator credentials' },
        },
      },
    },
    '/api/v1/admin/dashboard/summary': {
      get: {
        tags: ['Admin'],
        summary: 'Platform summary KPIs (Admin only)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Summary KPI statistics' }, '403': { description: 'Forbidden' } },
      },
    },
    '/api/v1/admin/dashboard/hazards': {
      get: {
        tags: ['Admin'],
        summary: 'Hazard analytics by severity and category (Admin only)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Hazard analytics' }, '403': { description: 'Forbidden' } },
      },
    },
    '/api/v1/admin/hazard-reports': {
      get: {
        tags: ['Admin'],
        summary: 'List reports submitted for moderation (Admin only)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Reports pending review' }, '403': { description: 'Forbidden' } },
      },
    },
    '/api/v1/admin/hazard-reports/{id}/approve': {
      patch: {
        tags: ['Admin'],
        summary: 'Approve citizen hazard report and publish active hazard (Admin only)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Report approved and hazard created' }, '403': { description: 'Forbidden' } },
      },
    },
    '/api/v1/admin/hazard-reports/{id}/reject': {
      patch: {
        tags: ['Admin'],
        summary: 'Reject citizen hazard report (Admin only)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['rejection_reason'],
                properties: { rejection_reason: { type: 'string' } },
              },
            },
          },
        },
        responses: { '200': { description: 'Report rejected' }, '403': { description: 'Forbidden' } },
      },
    },
    '/api/v1/admin/datasets/upload': {
      post: {
        tags: ['Admin'],
        summary: 'Upload bulk CSV dataset for validation and staging (Admin only)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['csvContent'],
                properties: {
                  filename: { type: 'string', example: 'hazards.csv' },
                  csvContent: { type: 'string', description: 'Raw CSV file text content' },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'Dataset parsed and staged' }, '403': { description: 'Forbidden' } },
      },
    },
    '/api/v1/admin/datasets/{id}/import': {
      post: {
        tags: ['Admin'],
        summary: 'Execute batch import from staged dataset into hazards (Admin only)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Dataset rows imported into hazards' }, '403': { description: 'Forbidden' } },
      },
    },
    '/api/v1/admin/activity-logs': {
      get: {
        tags: ['Admin'],
        summary: 'View audit activity logs (Admin only)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Audit logs' }, '403': { description: 'Forbidden' } },
      },
    },
  },
};

export const setupSwagger = (app: Express): void => {
  // Serve OpenAPI specification JSON
  app.get('/api-docs.json', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  // Serve Swagger UI
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'RoadLife API Documentation',
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'list',
        filter: true,
      },
    })
  );
};
