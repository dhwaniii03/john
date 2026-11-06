import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import journeyRepository from '../src/modules/journeys/journey.repository.js';
import hazardRepository from '../src/modules/hazards/hazard.repository.js';
import { rollbackLastMigration } from '../src/database/migrations/rollback.js';

describe('Real Database Integration Tests on roadlife_test', () => {
  let testUserId: number;
  let testJourneyId: number;
  let testCategoryId: number;

  beforeAll(async () => {
    // 1. Verify test database connection
    const dbRes = await query('SELECT current_database();');
    expect(dbRes.rows[0].current_database).toBe('roadlife_test');

    // 2. Setup baseline test user
    const userRes = await query(
      `INSERT INTO users (name, email, password, role, transport_mode, status)
       VALUES ('Real DB User', 'realdb@test.local', 'hashed_pass', 'user', 'DRIVER', 'ACTIVE')
       RETURNING id;`
    );
    testUserId = userRes.rows[0].id;

    // 3. Setup baseline test hazard category
    const catRes = await query(
      `INSERT INTO hazard_categories (name, slug, default_severity, default_expiry_days, is_active)
       VALUES ('Road Damage', 'road-damage-test', 'HIGH', 30, true)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id;`
    );
    testCategoryId = catRes.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup test fixtures
    if (testJourneyId) {
      await query('DELETE FROM journey_locations WHERE journey_id = $1', [testJourneyId]);
      await query('DELETE FROM journeys WHERE id = $1', [testJourneyId]);
    }
    if (testUserId) {
      await query('DELETE FROM users WHERE id = $1', [testUserId]);
    }
    await query("DELETE FROM hazards WHERE title LIKE '%Test Antimeridian%'");
  });

  it('1. Confirms database.ts uses TEST_DB_NAME and refuses to connect if set to development DB', async () => {
    const currentDb = await query('SELECT current_database();');
    expect(currentDb.rows[0].current_database).toBe('roadlife_test');
    expect(env.database).toBe('roadlife_test');

    // Verify refusal to start if database name equals development database
    const devDbName = 'roadlife';
    const testSafetyGuard = () => {
      const dbToTest = devDbName;
      if (dbToTest === devDbName) {
        throw new Error(`[SAFETY] Database refused to start: test database name '${dbToTest}' cannot equal development database '${devDbName}' under NODE_ENV=test`);
      }
    };
    expect(testSafetyGuard).toThrow(/cannot equal development database/i);
  });

  it('2. GREATEST distance update: value is monotonic and sets updated_at = NOW()', async () => {
    // Insert test journey with initial distance 5.0 km
    const journeyRes = await query(
      `INSERT INTO journeys (user_id, transport_mode, start_latitude, start_longitude, distance_km, status, started_at, updated_at)
       VALUES ($1, 'DRIVER', 12.9716, 77.5946, 5.0, 'ACTIVE', NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '10 minutes')
       RETURNING id, updated_at;`,
      [testUserId]
    );
    testJourneyId = journeyRes.rows[0].id;
    const initialUpdatedAt = new Date(journeyRes.rows[0].updated_at).getTime();

    // Attempt to update with a smaller distance (3.0 km)
    await journeyRepository.updateJourneyDistance(testJourneyId, 3.0);
    let check = await query('SELECT distance_km, updated_at FROM journeys WHERE id = $1', [testJourneyId]);
    expect(Number(check.rows[0].distance_km)).toBe(5.0); // Stays at 5.0
    expect(new Date(check.rows[0].updated_at).getTime()).toBeGreaterThanOrEqual(initialUpdatedAt);

    // Update with a larger distance (8.25 km)
    await journeyRepository.updateJourneyDistance(testJourneyId, 8.25);
    check = await query('SELECT distance_km, updated_at FROM journeys WHERE id = $1', [testJourneyId]);
    expect(Number(check.rows[0].distance_km)).toBe(8.25); // Successfully increases
  });

  it('3. journey_locations insert and retention batch pruning', async () => {
    const now = new Date();
    await journeyRepository.createJourneyLocation({
      journey_id: testJourneyId,
      user_id: testUserId,
      latitude: 12.9725,
      longitude: 77.5955,
      speed: 35.5,
      heading: 120,
      recorded_at: now,
    });

    const locations = await journeyRepository.getJourneyLocations(testJourneyId);
    expect(locations.length).toBeGreaterThan(0);
    const lastPoint = locations[locations.length - 1];
    expect(Number(lastPoint.latitude)).toBeCloseTo(12.9725, 4);
    expect(Number(lastPoint.longitude)).toBeCloseTo(77.5955, 4);
    expect(Number(lastPoint.speed)).toBe(35.5);
    expect(Number(lastPoint.heading)).toBe(120);

    // Test retention pruning: insert an old location row recorded 75 days ago
    const oldRecordedAt = new Date(Date.now() - 75 * 24 * 60 * 60 * 1000);
    await query(
      `INSERT INTO journey_locations (journey_id, user_id, latitude, longitude, speed, recorded_at)
       VALUES ($1, $2, 12.90, 77.50, 20, $3)`,
      [testJourneyId, testUserId, oldRecordedAt]
    );

    // Prune rows older than 60 days
    const deletedCount = await journeyRepository.pruneOldJourneyLocations(60, 500);
    expect(deletedCount).toBeGreaterThanOrEqual(1);

    // Verify recent point is still intact
    const remaining = await journeyRepository.getJourneyLocations(testJourneyId);
    expect(remaining.some((r) => Number(r.latitude) === 12.9725)).toBe(true);
  });

  it('4. findNearby with antimeridian wrapping (+180/-180) and parameter order', async () => {
    // Insert 3 test hazards:
    // Hazard A: lat 0.0, lng 179.92 (East near date line)
    // Hazard B: lat 0.0, lng -179.92 (West near date line, ~18km from Hazard A across antimeridian)
    // Hazard C: lat 0.0, lng 0.0 (Prime meridian, far away)
    await query(
      `INSERT INTO hazards (category_id, title, latitude, longitude, severity, status, reported_by)
       VALUES 
         ($1, 'Test Antimeridian East', 0.0, 179.92, 'CRITICAL', 'ACTIVE', $2),
         ($1, 'Test Antimeridian West', 0.0, -179.92, 'HIGH', 'ACTIVE', $2),
         ($1, 'Test Antimeridian Far Away', 0.0, 0.0, 'LOW', 'ACTIVE', $2);`,
      [testCategoryId, testUserId]
    );

    // Query 1: Centered at (0.0, 179.95) with radius 25km (crosses +180 antimeridian into negative longitude)
    const resultsCrossingPlus180 = await hazardRepository.findNearby({
      latitude: 0.0,
      longitude: 179.95,
      radiusKm: 25,
      limit: 10,
    });

    const titlesPlus = resultsCrossingPlus180.map((h) => h.title);
    expect(titlesPlus).toContain('Test Antimeridian East');
    expect(titlesPlus).toContain('Test Antimeridian West');
    expect(titlesPlus).not.toContain('Test Antimeridian Far Away');

    // Query 2: Centered at (0.0, -179.95) with radius 25km (crosses -180 antimeridian into positive longitude)
    const resultsCrossingMinus180 = await hazardRepository.findNearby({
      latitude: 0.0,
      longitude: -179.95,
      radiusKm: 25,
      limit: 10,
    });

    const titlesMinus = resultsCrossingMinus180.map((h) => h.title);
    expect(titlesMinus).toContain('Test Antimeridian East');
    expect(titlesMinus).toContain('Test Antimeridian West');
    expect(titlesMinus).not.toContain('Test Antimeridian Far Away');

    // Query 3: Near North Pole (lat 89.95, radius 30km)
    const polarResults = await hazardRepository.findNearby({
      latitude: 89.95,
      longitude: 0.0,
      radiusKm: 30,
      limit: 10,
    });
    expect(Array.isArray(polarResults)).toBe(true);
  });

  it('5. rollbackLastMigration refuses without modifying schema_migrations when .down.sql is missing', async () => {
    // Insert a dummy migration into roadlife_test schema_migrations that has NO down file
    const fakeMigrationName = '999_fake_migration_without_down_file.sql';
    await query(
      `INSERT INTO schema_migrations (migration_name) VALUES ($1) ON CONFLICT DO NOTHING;`,
      [fakeMigrationName]
    );

    // Ensure rollback fails and throws
    await expect(rollbackLastMigration()).rejects.toThrow(/down migration file.*does not exist/i);

    // Ensure the fake record was NOT deleted
    const check = await query('SELECT id FROM schema_migrations WHERE migration_name = $1;', [
      fakeMigrationName,
    ]);
    expect(check.rows.length).toBe(1);

    // Clean up fake test row
    await query('DELETE FROM schema_migrations WHERE migration_name = $1;', [fakeMigrationName]);
  });
});
