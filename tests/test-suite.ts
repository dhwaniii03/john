import http from 'http';
import app from '../src/app.js';
import emailService from '../src/services/email.service.js';
import { pool } from '../src/config/database.js';

// Test environment initialization
process.env.NODE_ENV = 'test';
process.env.DUMMY_OTP = '1234';
emailService.setTestMode(true);

let server: http.Server;
let baseUrl: string;

let userToken = '';
let adminToken = '';
let testUserId: number;
let _testAdminId: number;
let createdHazardId: number;
let createdReportId: number;
let createdJourneyId: number;
let createdNotificationId: number;
let datasetImportId: number;

const results: { name: string; passed: boolean; error?: string }[] = [];

const test = async (name: string, fn: () => Promise<void>) => {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`  ✅ PASS: ${name}`);
  } catch (err: any) {
    results.push({ name, passed: false, error: err.message || String(err) });
    console.error(`  ❌ FAIL: ${name} ->`, err.message || err);
  }
};

const assert = (condition: boolean, msg: string) => {
  if (!condition) throw new Error(msg);
};

const request = async (
  path: string,
  options: {
    method?: string;
    body?: any;
    token?: string;
  } = {}
) => {
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const json = await response.json().catch(() => null);
  return { status: response.status, body: json };
};

const runAllTests = async () => {
  console.log('\n========================================');
  console.log('🚀 RUNNING ROADLIFE BACKEND TEST SUITE');
  console.log('========================================\n');

  // Start test server on random port
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 3030;
      baseUrl = `http://localhost:${port}`;
      console.log(`Test server running at ${baseUrl}`);
      resolve();
    });
  });

  try {
    // --- 1. HEALTH CHECKS ---
    console.log('\n--- 1. HEALTH CHECKS ---');
    await test('GET /health returns 200 and operational status', async () => {
      const res = await request('/health');
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.success === true, 'Expected success=true');
    });

    await test('GET /health/db returns 200 and database connected', async () => {
      const res = await request('/health/db');
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.success === true, 'Expected success=true');
      assert(!!res.body.databaseTime, 'Expected databaseTime in response');
    });

    // --- 2. AUTHENTICATION ---
    console.log('\n--- 2. AUTHENTICATION & SECURITY ---');
    const testEmail = `tester_${Date.now()}@roadlife.test`;

    await test('POST /api/v1/auth/send-otp sends dummy OTP successfully', async () => {
      const res = await request('/api/v1/auth/send-otp', {
        method: 'POST',
        body: {
          email: testEmail,
          purpose: 'REGISTRATION',
        },
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.success === true, 'Expected success=true');
      assert(res.body.data.dummyOtp === '1234', 'Expected dummyOtp 1234 in development');
    });

    await test('POST /api/v1/auth/verify-otp fails with invalid OTP', async () => {
      const res = await request('/api/v1/auth/verify-otp', {
        method: 'POST',
        body: {
          email: testEmail,
          otp: '9999',
          purpose: 'REGISTRATION',
        },
      });
      assert(res.status === 400, `Expected 400, got ${res.status}`);
      assert(res.body.success === false, 'Expected success=false');
    });

    await test('POST /api/v1/auth/verify-otp succeeds with dummy OTP 1234', async () => {
      const res = await request('/api/v1/auth/verify-otp', {
        method: 'POST',
        body: {
          email: testEmail,
          otp: '1234',
          purpose: 'REGISTRATION',
        },
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.success === true, 'Expected success=true');
      assert(res.body.data.verified === true, 'Expected verified=true');
    });

    await test('POST /api/v1/auth/register rejects registration without OTP or invalid OTP', async () => {
      const res = await request('/api/v1/auth/register', {
        method: 'POST',
        body: {
          email: testEmail,
          password: 'Password@123',
          name: 'Test Driver',
          transport_mode: 'DRIVER',
          otp: '0000',
        },
      });
      assert(res.status === 400, `Expected 400, got ${res.status}`);
      assert(res.body.success === false, 'Expected success=false');
    });

    await test('POST /api/v1/auth/register registers new user with dummy OTP 1234', async () => {
      const res = await request('/api/v1/auth/register', {
        method: 'POST',
        body: {
          email: testEmail,
          password: 'Password@123',
          name: 'Test Driver',
          transport_mode: 'DRIVER',
          otp: '1234',
        },
      });
      assert(res.status === 201, `Expected 201, got ${res.status}`);
      assert(res.body.success === true, 'Expected success=true');
      assert(!!res.body.data.tokens.accessToken, 'Expected accessToken');
      userToken = res.body.data.tokens.accessToken;
      testUserId = res.body.data.user.id;
    });

    await test('POST /api/v1/auth/register rejects duplicate email', async () => {
      const res = await request('/api/v1/auth/register', {
        method: 'POST',
        body: {
          email: testEmail,
          password: 'Password@123',
          name: 'Duplicate Driver',
          otp: '1234',
        },
      });
      assert(res.status === 400, `Expected 400, got ${res.status}`);
      assert(res.body.success === false, 'Expected success=false');
    });


    await test('POST /api/v1/auth/login succeeds with correct password', async () => {
      const res = await request('/api/v1/auth/login', {
        method: 'POST',
        body: {
          email: testEmail,
          password: 'Password@123',
        },
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(!!res.body.data.tokens.accessToken, 'Expected accessToken');
      userToken = res.body.data.tokens.accessToken;
    });

    await test('POST /api/v1/auth/login fails with wrong password', async () => {
      const res = await request('/api/v1/auth/login', {
        method: 'POST',
        body: {
          email: testEmail,
          password: 'WrongPassword',
        },
      });
      assert(res.status === 401, `Expected 401, got ${res.status}`);
    });

    await test('GET /api/v1/auth/me returns current user profile', async () => {
      const res = await request('/api/v1/auth/me', { token: userToken });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.data.email === testEmail, 'Expected matching email');
    });

    await test('POST /api/v1/auth/forgot-password sends OTP for password reset', async () => {
      const res = await request('/api/v1/auth/forgot-password', {
        method: 'POST',
        body: {
          email: testEmail,
        },
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.success === true, 'Expected success=true');
      assert(res.body.data.dummyOtp === '1234', 'Expected dummyOtp 1234 in response');
    });

    await test('POST /api/v1/auth/reset-password fails with wrong OTP', async () => {
      const res = await request('/api/v1/auth/reset-password', {
        method: 'POST',
        body: {
          email: testEmail,
          otp: '9999',
          newPassword: 'NewPassword@123',
        },
      });
      assert(res.status === 400, `Expected 400, got ${res.status}`);
      assert(res.body.success === false, 'Expected success=false');
    });

    await test('POST /api/v1/auth/reset-password succeeds with dummy OTP 1234', async () => {
      const res = await request('/api/v1/auth/reset-password', {
        method: 'POST',
        body: {
          email: testEmail,
          otp: '1234',
          newPassword: 'NewPassword@123',
        },
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.success === true, 'Expected success=true');
    });

    await test('POST /api/v1/auth/login succeeds with updated password', async () => {
      const res = await request('/api/v1/auth/login', {
        method: 'POST',
        body: {
          email: testEmail,
          password: 'NewPassword@123',
        },
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(!!res.body.data.tokens.accessToken, 'Expected accessToken with new password');
      userToken = res.body.data.tokens.accessToken;
    });


    await test('POST /api/v1/admin/auth/login logs in global admin', async () => {
      const res = await request('/api/v1/admin/auth/login', {
        method: 'POST',
        body: {
          email: 'admin@roadlife.com',
          password: 'Admin@1234',
        },
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(!!res.body.data.tokens.accessToken, 'Expected admin accessToken');
      adminToken = res.body.data.tokens.accessToken;
      _testAdminId = res.body.data.admin.id;
    });

    await test('Unauthorized user cannot access admin routes', async () => {
      const res = await request('/api/v1/admin/dashboard/summary', { token: userToken });
      assert(res.status === 403, `Expected 403 Forbidden, got ${res.status}`);
    });

    // --- 3. USERS MODULE ---
    console.log('\n--- 3. USERS MODULE ---');
    await test('GET /api/v1/users/profile returns own profile', async () => {
      const res = await request('/api/v1/users/profile', { token: userToken });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.data.id === testUserId, 'Expected matching user ID');
    });

    await test('PUT /api/v1/users/profile updates user info', async () => {
      const res = await request('/api/v1/users/profile', {
        method: 'PUT',
        token: userToken,
        body: { phone: '+1234567890', first_name: 'UpdatedName' },
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.data.phone === '+1234567890', 'Expected updated phone');
    });

    await test('PATCH /api/v1/users/transport-mode updates transport mode', async () => {
      const res = await request('/api/v1/users/transport-mode', {
        method: 'PATCH',
        token: userToken,
        body: { transport_mode: 'CYCLIST' },
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.data.transport_mode === 'CYCLIST', 'Expected transport_mode=CYCLIST');
    });

    // --- 4. HAZARDS MODULE ---
    console.log('\n--- 4. HAZARDS & GEOLOCATION ---');
    await test('GET /api/v1/hazards/categories returns active categories with metadata', async () => {
      const res = await request('/api/v1/hazards/categories');
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(Array.isArray(res.body.data), 'Expected array of categories');
      assert(res.body.data.length >= 7, 'Expected at least 7 seeded categories');
      const first = res.body.data[0];
      assert(first.is_active !== undefined, 'Expected is_active');
      assert(first.default_severity !== undefined, 'Expected default_severity');
      assert(first.usage_count !== undefined, 'Expected usage_count');
    });

    let testCategoryId: number;
    await test('POST /api/v1/admin/hazard-categories creates a new category', async () => {
      const res = await request('/api/v1/admin/hazard-categories', {
        method: 'POST',
        token: adminToken,
        body: {
          name: 'Rockslide Test',
          default_severity: 'HIGH',
          default_expiry_days: 10,
          description: 'Falling rocks and road blockage',
        },
      });
      assert(res.status === 201, `Expected 201, got ${res.status}`);
      assert(res.body.data.name === 'Rockslide Test', 'Expected category name');
      assert(res.body.data.default_severity === 'HIGH', 'Expected default_severity HIGH');
      assert(res.body.data.default_expiry_days === 10, 'Expected default_expiry_days 10');
      testCategoryId = res.body.data.id;
    });

    await test('PUT /api/v1/admin/hazard-categories/:id updates category', async () => {
      const res = await request(`/api/v1/admin/hazard-categories/${testCategoryId}`, {
        method: 'PUT',
        token: adminToken,
        body: {
          default_severity: 'CRITICAL',
          default_expiry_days: 14,
        },
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.data.default_severity === 'CRITICAL', 'Expected CRITICAL');
      assert(res.body.data.default_expiry_days === 14, 'Expected 14');
    });

    await test('DELETE /api/v1/admin/hazard-categories/:id deletes category', async () => {
      const res = await request(`/api/v1/admin/hazard-categories/${testCategoryId}`, {
        method: 'DELETE',
        token: adminToken,
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
    });

    await test('POST /api/v1/hazards creates a new active hazard', async () => {
      const res = await request('/api/v1/hazards', {
        method: 'POST',
        token: userToken,
        body: {
          title: 'Deep Pothole on Main St',
          description: 'Large pothole in the right lane near 5th Ave',
          latitude: 37.7749,
          longitude: -122.4194,
          severity: 'HIGH',
          status: 'ACTIVE',
        },
      });
      assert(res.status === 201, `Expected 201, got ${res.status}`);
      assert(!!res.body.data.id, 'Expected hazard ID');
      createdHazardId = res.body.data.id;
    });

    await test('GET /api/v1/hazards/nearby finds hazard within radius', async () => {
      const res = await request(
        '/api/v1/hazards/nearby?latitude=37.7750&longitude=-122.4190&radius=5'
      );
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(Array.isArray(res.body.data), 'Expected array of nearby hazards');
      assert(res.body.data.length > 0, 'Expected at least 1 hazard nearby');
      assert(typeof res.body.data[0].distance_km === 'number', 'Expected calculated distance_km');
    });

    await test('GET /api/v1/hazards/:id retrieves hazard details', async () => {
      const res = await request(`/api/v1/hazards/${createdHazardId}`);
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.data.title === 'Deep Pothole on Main St', 'Expected matching title');
    });

    await test('POST /api/v1/hazards/:id/confirm records confirmation vote and increments count', async () => {
      const res = await request(`/api/v1/hazards/${createdHazardId}/confirm`, {
        method: 'POST',
        token: userToken,
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.success === true, 'Expected success=true');
      assert(res.body.data.confirmation_count >= 1, 'Expected confirmation_count >= 1');
      assert(!!res.body.data.last_confirmed_at, 'Expected last_confirmed_at timestamp');
    });

    await test('POST /api/v1/hazards/:id/resolve records resolution vote', async () => {
      const res = await request(`/api/v1/hazards/${createdHazardId}/resolve`, {
        method: 'POST',
        token: userToken,
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.success === true, 'Expected success=true');
      assert(res.body.data.resolved_count >= 1, 'Expected resolved_count >= 1');
    });

    await test('POST /api/v1/hazards/:id/resolve as admin marks hazard as RESOLVED immediately', async () => {
      const res = await request(`/api/v1/hazards/${createdHazardId}/resolve`, {
        method: 'POST',
        token: adminToken,
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.data.status === 'RESOLVED', 'Expected status=RESOLVED for admin resolve');
    });

    await test('POST /api/v1/hazards/:id/confirm fails for non-existent hazard', async () => {
      const res = await request('/api/v1/hazards/999999/confirm', {
        method: 'POST',
        token: userToken,
      });
      assert(res.status === 404, `Expected 404, got ${res.status}`);
    });

    // --- 5. HAZARD REPORTING & MODERATION ---
    console.log('\n--- 5. HAZARD REPORTING & ADMIN MODERATION ---');
    await test('POST /api/v1/hazard-reports submits user hazard report', async () => {
      const res = await request('/api/v1/hazard-reports', {
        method: 'POST',
        token: userToken,
        body: {
          title: 'Fallen Tree Branch',
          description: 'Tree branch blocking bike lane after storm',
          latitude: 37.7800,
          longitude: -122.4100,
          address: 'Market St & 4th St',
        },
      });
      assert(res.status === 201, `Expected 201, got ${res.status}`);
      assert(res.body.data.status === 'PENDING', 'Expected status=PENDING');
      createdReportId = res.body.data.id;
    });

    await test('GET /api/v1/hazard-reports/my retrieves submitted reports', async () => {
      const res = await request('/api/v1/hazard-reports/my', { token: userToken });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(Array.isArray(res.body.data), 'Expected array of reports');
      assert(res.body.data.some((r: any) => r.id === createdReportId), 'Expected report in list');
    });

    await test('PATCH /api/v1/admin/hazard-reports/:id/approve approves report and creates hazard', async () => {
      const res = await request(`/api/v1/admin/hazard-reports/${createdReportId}/approve`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          severity: 'HIGH',
          title: 'Verified: Fallen Tree Branch',
        },
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.data.report.status === 'APPROVED', 'Expected report status=APPROVED');
      assert(!!res.body.data.hazard.id, 'Expected created hazard ID');
    });

    // --- 6. JOURNEYS & LOCATION ---
    console.log('\n--- 6. JOURNEYS & LIVE LOCATION ---');
    await test('POST /api/v1/journeys/start starts new journey', async () => {
      const res = await request('/api/v1/journeys/start', {
        method: 'POST',
        token: userToken,
        body: {
          title: 'Morning Commute',
          start_latitude: 37.7749,
          start_longitude: -122.4194,
          transport_mode: 'CYCLIST',
        },
      });
      assert(res.status === 201, `Expected 201, got ${res.status}`);
      assert(res.body.data.status === 'ACTIVE', 'Expected status=ACTIVE');
      createdJourneyId = res.body.data.id;
    });

    await test('GET /api/v1/journeys/active returns current active journey', async () => {
      const res = await request('/api/v1/journeys/active', { token: userToken });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.data.id === createdJourneyId, 'Expected matching active journey ID');
    });

    await test('POST /api/v1/locations/update updates user live coordinate', async () => {
      const res = await request('/api/v1/locations/update', {
        method: 'POST',
        token: userToken,
        body: {
          latitude: 37.7755,
          longitude: -122.4180,
          transport_mode: 'CYCLIST',
          journey_id: createdJourneyId,
        },
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.data.is_active === true, 'Expected is_active=true');
    });

    await test('GET /api/v1/locations/nearby finds active cyclists/walkers', async () => {
      const res = await request('/api/v1/locations/nearby?latitude=37.7750&longitude=-122.4180&radius=5', {
        token: adminToken,
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(Array.isArray(res.body.data), 'Expected array of active users');
      assert(res.body.data.length > 0, 'Expected at least 1 active user');
    });

    await test('GET /api/v1/locations/awareness retrieves driver proximity hazards & cyclists', async () => {
      const res = await request('/api/v1/locations/awareness?latitude=37.7750&longitude=-122.4180&radius=5', {
        token: userToken,
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(!!res.body.data.summary, 'Expected awareness summary');
      assert(Array.isArray(res.body.data.hazards), 'Expected hazards array');
    });

    await test('POST /api/v1/journeys/:id/end ends journey, persists all metrics and polyline, and deactivates location', async () => {
      const res = await request(`/api/v1/journeys/${createdJourneyId}/end`, {
        method: 'POST',
        token: userToken,
        body: {
          end_latitude: 37.7800,
          end_longitude: -122.4100,
          distance_km: 2.5,
          duration_minutes: 12,
          avg_speed_kmh: 12.5,
          hazards_count: 3,
          cyclists_nearby: 2,
          walkers_nearby: 1,
          route_polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
          status: 'COMPLETED',
        },
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.data.status === 'COMPLETED', 'Expected status=COMPLETED');
      assert(Number(res.body.data.distance_km) === 2.5, 'Expected distance_km=2.5');
      assert(Number(res.body.data.duration_minutes) === 12, 'Expected duration_minutes=12');
      assert(Number(res.body.data.avg_speed_kmh) === 12.5, 'Expected avg_speed_kmh=12.5');
      assert(Number(res.body.data.hazards_count) === 3, 'Expected hazards_count=3');
      assert(Number(res.body.data.cyclists_nearby) === 2, 'Expected cyclists_nearby=2');
      assert(Number(res.body.data.walkers_nearby) === 1, 'Expected walkers_nearby=1');
      assert(res.body.data.route_polyline === '_p~iF~ps|U_ulLnnqC_mqNvxq`@', 'Expected matching route_polyline');
      assert(!!res.body.data.ended_at, 'Expected ended_at timestamp');
    });

    await test('GET /api/v1/journeys/history returns completed user journeys with filter options', async () => {
      const res = await request('/api/v1/journeys/history?transport_mode=CYCLIST&status=COMPLETED', {
        token: userToken,
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(Array.isArray(res.body.data), 'Expected array of journeys');
      assert(res.body.data.length > 0, 'Expected at least 1 completed journey');
      assert(res.body.data[0].id === createdJourneyId, 'Expected matching completed journey ID');
    });

    await test('GET /api/v1/journeys/:id retrieves single journey details', async () => {
      const res = await request(`/api/v1/journeys/${createdJourneyId}`, {
        token: userToken,
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.data.id === createdJourneyId, 'Expected matching journey ID');
      assert(res.body.data.route_polyline === '_p~iF~ps|U_ulLnnqC_mqNvxq`@', 'Expected route polyline');
    });

    await test('DELETE /api/v1/journeys/:id deletes journey from user history', async () => {
      const res = await request(`/api/v1/journeys/${createdJourneyId}`, {
        method: 'DELETE',
        token: userToken,
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.success === true, 'Expected success=true');

      // Verify it no longer exists
      const checkRes = await request(`/api/v1/journeys/${createdJourneyId}`, {
        token: userToken,
      });
      assert(checkRes.status === 404, `Expected 404, got ${checkRes.status}`);
    });

    // --- 7. NOTIFICATIONS ---
    console.log('\n--- 7. NOTIFICATIONS MODULE ---');
    await test('GET /api/v1/notifications retrieves user notifications', async () => {
      const res = await request('/api/v1/notifications', { token: userToken });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(Array.isArray(res.body.data), 'Expected array of notifications');
      assert(res.body.data.length > 0, 'Expected notifications from report approval');
      createdNotificationId = res.body.data[0].id;
    });

    await test('PATCH /api/v1/notifications/:id/read marks notification read', async () => {
      const res = await request(`/api/v1/notifications/${createdNotificationId}/read`, {
        method: 'PATCH',
        token: userToken,
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.data.is_read === true, 'Expected is_read=true');
    });

    await test('PATCH /api/v1/notifications/read-all marks all notifications read', async () => {
      const res = await request('/api/v1/notifications/read-all', {
        method: 'PATCH',
        token: userToken,
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
    });

    // --- 8. DATASET IMPORTS ---
    console.log('\n--- 8. DATASET IMPORT WORKFLOW ---');
    const sampleCsv = `title,description,latitude,longitude,severity,category,address
Highway Pothole,Deep pothole right lane,37.7760,-122.4150,HIGH,pothole,101 Highway
Construction Zone,Lane closure ahead,37.7780,-122.4170,MEDIUM,construction,Mission St`;

    await test('POST /api/v1/admin/datasets/upload uploads & validates CSV dataset', async () => {
      const res = await request('/api/v1/admin/datasets/upload', {
        method: 'POST',
        token: adminToken,
        body: {
          filename: 'hazards_sample.csv',
          csvContent: sampleCsv,
        },
      });
      assert(res.status === 201, `Expected 201, got ${res.status}`);
      assert(res.body.data.total_rows === 2, 'Expected 2 total rows');
      assert(res.body.data.status === 'VALIDATED', 'Expected status=VALIDATED');
      datasetImportId = res.body.data.id;
    });

    await test('POST /api/v1/admin/datasets/:id/import imports dataset records into hazards', async () => {
      const res = await request(`/api/v1/admin/datasets/${datasetImportId}/import`, {
        method: 'POST',
        token: adminToken,
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.data.status === 'IMPORTED', 'Expected status=IMPORTED');
      assert(res.body.data.imported_rows === 2, 'Expected 2 imported rows');
    });

    await test('GET /api/v1/admin/datasets/history returns import logs', async () => {
      const res = await request('/api/v1/admin/datasets/history', { token: adminToken });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(Array.isArray(res.body.data), 'Expected array of imports');
    });

    // --- 9. ADMIN DASHBOARD, CONTENT & SETTINGS ---
    console.log('\n--- 9. ADMIN DASHBOARD, CONTENT & SETTINGS ---');
    await test('GET /api/v1/admin/dashboard/summary returns platform metrics', async () => {
      const res = await request('/api/v1/admin/dashboard/summary', { token: adminToken });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.data.totalUsers > 0, 'Expected positive totalUsers');
      assert(res.body.data.totalHazards > 0, 'Expected positive totalHazards');
    });

    await test('GET /api/v1/admin/dashboard/hazards returns hazard statistics', async () => {
      const res = await request('/api/v1/admin/dashboard/hazards', { token: adminToken });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(!!res.body.data.bySeverity, 'Expected bySeverity in hazard stats');
    });

    await test('GET /api/v1/content/faq returns public FAQ content', async () => {
      const res = await request('/api/v1/content/faq');
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(res.body.data.slug === 'faq', 'Expected slug=faq');
    });

    await test('GET /api/v1/settings returns public map and system settings', async () => {
      const res = await request('/api/v1/settings');
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(!!res.body.data.map_config, 'Expected map_config in settings');
    });

    await test('GET /api/v1/admin/activity-logs returns audit log records', async () => {
      const res = await request('/api/v1/admin/activity-logs', { token: adminToken });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(Array.isArray(res.body.data), 'Expected array of activity logs');
      assert(res.body.data.length > 0, 'Expected audit logs recorded during tests');
    });
  } finally {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await pool.end();
  }

  console.log('\n========================================');
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`🏁 TEST SUITE COMPLETE: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('========================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
};

runAllTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
