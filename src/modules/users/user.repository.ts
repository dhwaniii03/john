import { query } from '../../config/database.js';
import type { User, UserStats, UpdateProfileDTO, UpdateTransportModeDTO, UserFilterOptions } from './user.types.js';

export class UserRepository {
  async findById(id: string | number): Promise<User | null> {
    const result = await query<User>(
      `SELECT id, email, name, first_name, last_name, phone, profile_image,
              transport_mode, status, notification_enabled, location_enabled,
              role, last_login_at, created_at, updated_at
       FROM users
       WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return result.rows[0] || null;
  }

  async findAll(options: UserFilterOptions): Promise<{ users: User[]; total: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 10));
    const offset = (page - 1) * limit;

    const conditions: string[] = ['deleted_at IS NULL'];
    const params: any[] = [];
    let paramIndex = 1;

    if (options.role) {
      conditions.push(`role = $${paramIndex++}`);
      params.push(options.role);
    }

    if (options.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(options.status);
    }

    if (options.transport_mode) {
      conditions.push(`transport_mode = $${paramIndex++}`);
      params.push(options.transport_mode);
    }

    if (options.search) {
      conditions.push(
        `(name ILIKE $${paramIndex} OR email ILIKE $${paramIndex} OR first_name ILIKE $${paramIndex} OR last_name ILIKE $${paramIndex})`
      );
      params.push(`%${options.search}%`);
      paramIndex++;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countQuery = `SELECT COUNT(*) as count FROM users ${whereClause}`;
    const countResult = await query(countQuery, params);
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    const dataQuery = `
      SELECT id, email, name, first_name, last_name, phone, profile_image,
             transport_mode, status, notification_enabled, location_enabled,
             role, last_login_at, created_at, updated_at
      FROM users
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const dataResult = await query<User>(dataQuery, [...params, limit, offset]);

    return { users: dataResult.rows, total };
  }

  async update(id: string | number, data: UpdateProfileDTO): Promise<User | null> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    const fields: (keyof UpdateProfileDTO)[] = [
      'name',
      'first_name',
      'last_name',
      'phone',
      'profile_image',
      'notification_enabled',
      'location_enabled',
    ];

    for (const field of fields) {
      if (data[field] !== undefined) {
        updates.push(`${field} = $${paramIndex++}`);
        params.push(data[field]);
      }
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const sql = `
      UPDATE users
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex} AND deleted_at IS NULL
      RETURNING id, email, name, first_name, last_name, phone, profile_image,
                transport_mode, status, notification_enabled, location_enabled,
                role, last_login_at, created_at, updated_at
    `;

    const result = await query<User>(sql, params);
    return result.rows[0] || null;
  }

  async updateTransportMode(id: string | number, data: UpdateTransportModeDTO): Promise<User | null> {
    const result = await query<User>(
      `UPDATE users
       SET transport_mode = $1, updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING id, email, name, first_name, last_name, phone, profile_image,
                 transport_mode, status, notification_enabled, location_enabled,
                 role, last_login_at, created_at, updated_at`,
      [data.transport_mode, id]
    );
    return result.rows[0] || null;
  }

  async softDelete(id: string | number): Promise<boolean> {
    const result = await query(
      `UPDATE users
       SET deleted_at = NOW(), status = 'DELETED', updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async delete(id: string | number): Promise<boolean> {
    return this.softDelete(id);
  }

  async getUserStats(userId: string | number): Promise<UserStats> {
    const sql = `
      SELECT
        (SELECT COUNT(*)::int FROM journeys WHERE user_id = $1 AND status = 'COMPLETED') AS completed_journeys,
        (SELECT COUNT(*)::int FROM journeys WHERE user_id = $1) AS total_journeys,
        (SELECT COALESCE(SUM(distance_km), 0)::float FROM journeys WHERE user_id = $1) AS total_distance_km,
        (
          (SELECT COUNT(*)::int FROM hazard_reports WHERE user_id = $1)
          +
          (SELECT COUNT(*)::int FROM hazards WHERE reported_by = $1 AND id NOT IN (SELECT COALESCE(hazard_id, 0) FROM hazard_reports WHERE user_id = $1))
        ) AS hazards_reported
    `;
    const res = await query(sql, [userId]);
    const row = res.rows[0] || {};
    const completedJourneys = parseInt(row.completed_journeys || '0', 10);
    const totalJourneys = parseInt(row.total_journeys || '0', 10);
    const totalDistance = parseFloat(row.total_distance_km || '0');
    const hazardsReported = parseInt(row.hazards_reported || '0', 10);

    return {
      journeys: completedJourneys > 0 ? completedJourneys : totalJourneys,
      completed_journeys: completedJourneys,
      total_journeys: totalJourneys,
      total_distance_km: Math.round(totalDistance * 100) / 100,
      hazards_reported: hazardsReported,
    };
  }
}

export default new UserRepository();
