import { query } from '../../config/database.js';
import type {
  Journey,
  StartJourneyDTO,
  EndJourneyDTO,
  JourneyFilterOptions,
  LiveLocation,
  UpdateLiveLocationDTO,
  NearbyLocationOptions,
} from './journey.types.js';

export class JourneyRepository {
  // --- Journey Management ---
  async createJourney(userId: number, data: StartJourneyDTO): Promise<Journey> {
    const sql = `
      INSERT INTO journeys (
        user_id, transport_mode, title, origin_name, destination_name,
        start_latitude, start_longitude, end_latitude, end_longitude,
        route_polyline, waypoints, status, started_at, last_on_route_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'ACTIVE', NOW(), NOW())
      RETURNING *
    `;
    const params = [
      userId,
      data.transport_mode || 'DRIVER',
      data.title || null,
      data.origin_name || null,
      data.destination_name || null,
      data.start_latitude,
      data.start_longitude,
      data.end_latitude ?? null,
      data.end_longitude ?? null,
      data.route_polyline ?? null,
      JSON.stringify(data.waypoints || []),
    ];
    const result = await query<Journey>(sql, params);
    return result.rows[0];
  }

  async cancelActiveJourneysByUserId(userId: number): Promise<Journey[]> {
    const sql = `
      UPDATE journeys
      SET status = 'CANCELLED',
          ended_at = NOW(),
          updated_at = NOW()
      WHERE user_id = $1 AND status = 'ACTIVE'
      RETURNING *
    `;
    const result = await query<Journey>(sql, [userId]);
    return result.rows;
  }

  async updateLastOnRouteAt(journeyId: string | number): Promise<void> {
    const sql = `
      UPDATE journeys
      SET last_on_route_at = NOW(),
          updated_at = NOW()
      WHERE id = $1 AND status = 'ACTIVE'
    `;
    await query(sql, [journeyId]);
  }

  async updateJourneyDistance(id: string | number, distanceKm: number): Promise<void> {
    const sql = `
      UPDATE journeys
      SET distance_km = GREATEST(COALESCE(distance_km, 0::double precision), $1::double precision),
          updated_at = NOW()
      WHERE id = $2
    `;
    await query(sql, [distanceKm, id]);
  }

  async findActiveJourneys(): Promise<Journey[]> {
    const sql = `
      SELECT * FROM journeys
      WHERE status = 'ACTIVE'
    `;
    const result = await query<Journey>(sql);
    return result.rows;
  }

  async autoExpireStaleJourneys(userId?: number, timeoutMinutes = 30): Promise<{ count: number; expiredJourneys: Journey[] }> {
    const safeMinutes = Math.max(1, timeoutMinutes);
    let sql: string;
    let params: any[];

    if (userId) {
      sql = `
        UPDATE journeys
        SET status = 'CANCELLED',
            ended_at = NOW(),
            updated_at = NOW()
        WHERE user_id = $1
          AND status = 'ACTIVE'
          AND (NOW() - COALESCE(last_on_route_at, started_at)) > ($2 || ' minutes')::INTERVAL
        RETURNING *
      `;
      params = [userId, safeMinutes];
    } else {
      sql = `
        UPDATE journeys
        SET status = 'CANCELLED',
            ended_at = NOW(),
            updated_at = NOW()
        WHERE status = 'ACTIVE'
          AND (NOW() - COALESCE(last_on_route_at, started_at)) > ($1 || ' minutes')::INTERVAL
        RETURNING *
      `;
      params = [safeMinutes];
    }

    const result = await query<Journey>(sql, params);
    return { count: result.rowCount || 0, expiredJourneys: result.rows };
  }

  async findJourneyById(id: string | number): Promise<Journey | null> {
    const sql = `
      SELECT j.*, u.name AS user_name
      FROM journeys j
      LEFT JOIN users u ON j.user_id = u.id
      WHERE j.id = $1
    `;
    const result = await query<Journey>(sql, [id]);
    return result.rows[0] || null;
  }

  async findActiveJourneyByUserId(userId: number): Promise<Journey | null> {
    const sql = `
      SELECT * FROM journeys
      WHERE user_id = $1 AND status = 'ACTIVE'
      ORDER BY started_at DESC
      LIMIT 1
    `;
    const result = await query<Journey>(sql, [userId]);
    return result.rows[0] || null;
  }

  async findJourneys(
    options: JourneyFilterOptions
  ): Promise<{ journeys: Journey[]; total: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 10));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (options.user_id) {
      conditions.push(`j.user_id = $${paramIndex++}`);
      params.push(options.user_id);
    }

    if (options.status && options.status.toUpperCase() !== 'ALL') {
      conditions.push(`j.status = $${paramIndex++}`);
      params.push(options.status.toUpperCase());
    }

    if (options.transport_mode && options.transport_mode.toUpperCase() !== 'ALL') {
      conditions.push(`j.transport_mode = $${paramIndex++}`);
      params.push(options.transport_mode.toUpperCase());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*) as count
      FROM journeys j
      ${whereClause}
    `;
    const countResult = await query(countQuery, params);
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    const dataQuery = `
      SELECT j.*, u.name AS user_name
      FROM journeys j
      LEFT JOIN users u ON j.user_id = u.id
      ${whereClause}
      ORDER BY j.started_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const dataResult = await query<Journey>(dataQuery, [...params, limit, offset]);

    return { journeys: dataResult.rows, total };
  }

  async endJourney(id: string | number, data: EndJourneyDTO): Promise<Journey | null> {
    const sql = `
      UPDATE journeys
      SET status = $1,
          end_latitude = COALESCE($2, end_latitude),
          end_longitude = COALESCE($3, end_longitude),
          distance_km = GREATEST(COALESCE(distance_km, 0::double precision), COALESCE($4::double precision, 0::double precision)),
          duration_minutes = COALESCE(ROUND($5::numeric)::integer, ROUND(EXTRACT(EPOCH FROM (NOW() - started_at)) / 60)::integer),
          avg_speed_kmh = COALESCE($6::double precision, avg_speed_kmh),
          hazards_count = COALESCE($7::integer, hazards_count),
          cyclists_nearby = COALESCE($8::integer, cyclists_nearby),
          walkers_nearby = COALESCE($9::integer, walkers_nearby),
          route_polyline = COALESCE($10, route_polyline),
          ended_at = NOW(),
          updated_at = NOW()
      WHERE id = $11
      RETURNING *
    `;
    const params = [
      data.status || 'COMPLETED',
      data.end_latitude ?? null,
      data.end_longitude ?? null,
      data.distance_km ?? null,
      data.duration_minutes ?? null,
      data.avg_speed_kmh ?? null,
      data.hazards_count ?? null,
      data.cyclists_nearby ?? null,
      data.walkers_nearby ?? null,
      data.route_polyline ?? null,
      id,
    ];
    const result = await query<Journey>(sql, params);
    return result.rows[0] || null;
  }

  // --- Live Geolocation Management ---
  async upsertLiveLocation(userId: number, data: UpdateLiveLocationDTO): Promise<LiveLocation> {
    const sql = `
      INSERT INTO live_locations (
        user_id, journey_id, latitude, longitude, transport_mode, is_active, last_updated_at
      )
      VALUES ($1, $2, $3, $4, $5, true, NOW())
      ON CONFLICT (user_id) DO UPDATE
      SET journey_id = COALESCE(EXCLUDED.journey_id, live_locations.journey_id),
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          transport_mode = EXCLUDED.transport_mode,
          is_active = true,
          last_updated_at = NOW()
      RETURNING *
    `;
    const params = [
      userId,
      data.journey_id || null,
      data.latitude,
      data.longitude,
      data.transport_mode || 'DRIVER',
    ];
    const result = await query<LiveLocation>(sql, params);
    return result.rows[0];
  }

  async stopLiveLocation(userId: number): Promise<boolean> {
    const sql = `
      UPDATE live_locations
      SET is_active = false, last_updated_at = NOW()
      WHERE user_id = $1
    `;
    const result = await query(sql, [userId]);
    return (result.rowCount ?? 0) > 0;
  }

  async findNearbyLocations(options: NearbyLocationOptions): Promise<LiveLocation[]> {
    const radius = options.radiusKm || 5;
    const limit = options.limit || 50;

    const conditions: string[] = [
      'l.is_active = true',
      "l.last_updated_at > NOW() - INTERVAL '15 minutes'", // filter out stale locations older than 15 mins
    ];
    const params: any[] = [options.latitude, options.longitude, radius];
    let paramIndex = 4;

    if (options.excludeUserId) {
      conditions.push(`l.user_id != $${paramIndex++}`);
      params.push(options.excludeUserId);
    }

    if (options.transport_mode) {
      conditions.push(`l.transport_mode = $${paramIndex++}`);
      params.push(options.transport_mode.toUpperCase());
    }

    const whereClause = conditions.join(' AND ');

    const sql = `
      SELECT l.*,
             u.name AS user_name,
             u.first_name,
             u.last_name,
             (6371 * acos(
               LEAST(1.0, GREATEST(-1.0,
                 cos(radians($1)) * cos(radians(l.latitude)) *
                 cos(radians(l.longitude) - radians($2)) +
                 sin(radians($1)) * sin(radians(l.latitude))
               ))
             )) AS distance_km
      FROM live_locations l
      LEFT JOIN users u ON l.user_id = u.id
      WHERE ${whereClause}
        AND (6371 * acos(
              LEAST(1.0, GREATEST(-1.0,
                cos(radians($1)) * cos(radians(l.latitude)) *
                cos(radians(l.longitude) - radians($2)) +
                sin(radians($1)) * sin(radians(l.latitude))
              ))
            )) <= $3
      ORDER BY distance_km ASC
      LIMIT $${paramIndex}
    `;
    params.push(limit);

    const result = await query<LiveLocation>(sql, params);
    return result.rows.map((row) => ({
      ...row,
      distance_km: row.distance_km ? Math.round(row.distance_km * 100) / 100 : 0,
    }));
  }

  async cleanStaleLocations(maxAgeMinutes = 15): Promise<number> {
    const sql = `
      UPDATE live_locations
      SET is_active = false
      WHERE is_active = true AND last_updated_at < NOW() - ($1 || ' minutes')::INTERVAL
    `;
    const result = await query(sql, [maxAgeMinutes]);
    return result.rowCount ?? 0;
  }

  async cancelJourney(id: string | number, userId: number): Promise<Journey | null> {
    const sql = `
      UPDATE journeys
      SET status = 'CANCELLED',
          ended_at = NOW(),
          updated_at = NOW()
      WHERE id = $1 AND user_id = $2 AND status = 'ACTIVE'
      RETURNING *
    `;
    const result = await query<Journey>(sql, [id, userId]);
    return result.rows[0] || null;
  }

  async createJourneyLocation(data: {
    journey_id: number;
    user_id: number;
    latitude: number;
    longitude: number;
    speed?: number;
    heading?: number;
    recorded_at?: Date;
  }): Promise<void> {
    const sql = `
      INSERT INTO journey_locations (journey_id, user_id, latitude, longitude, speed, heading, recorded_at)
      VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()))
    `;
    await query(sql, [
      data.journey_id,
      data.user_id,
      data.latitude,
      data.longitude,
      data.speed ?? null,
      data.heading ?? null,
      data.recorded_at ?? null,
    ]);
  }

  async getJourneyLocations(journeyId: string | number): Promise<any[]> {
    const sql = `
      SELECT id, journey_id, user_id, latitude, longitude, speed, heading, recorded_at
      FROM journey_locations
      WHERE journey_id = $1
      ORDER BY recorded_at ASC
    `;
    const result = await query(sql, [journeyId]);
    return result.rows;
  }

  async deleteJourney(id: string | number, userId: number): Promise<boolean> {
    const sql = `
      DELETE FROM journeys
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `;
    const result = await query(sql, [id, userId]);
    return (result.rowCount ?? 0) > 0;
  }

  async pruneOldJourneyLocations(retentionDays = 60, batchSize = 5000): Promise<number> {
    let totalDeleted = 0;
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    while (true) {
      const sql = `
        DELETE FROM journey_locations
        WHERE id IN (
          SELECT id FROM journey_locations
          WHERE recorded_at < $1
          LIMIT $2
        )
        RETURNING id
      `;
      const result = await query(sql, [cutoffDate, batchSize]);
      const count = result.rowCount ?? 0;
      totalDeleted += count;

      if (count < batchSize) {
        break;
      }
    }

    return totalDeleted;
  }
}

export default new JourneyRepository();
