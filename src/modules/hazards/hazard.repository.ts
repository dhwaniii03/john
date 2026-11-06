import { query, pool } from '../../config/database.js';
import type {
  Hazard,
  HazardCategory,
  CreateHazardCategoryDTO,
  UpdateHazardCategoryDTO,
  CreateHazardDTO,
  UpdateHazardDTO,
  HazardFilterOptions,
  NearbyHazardOptions,
  HazardReport,
  CreateHazardReportDTO,
  ReportFilterOptions,
} from './hazard.types.js';

export class HazardRepository {
  // --- Hazard Categories ---
  async getCategories(onlyActive = true): Promise<HazardCategory[]> {
    const sql = `
      SELECT 
        c.*,
        COUNT(h.id)::int AS usage_count
      FROM hazard_categories c
      LEFT JOIN hazards h ON c.id = h.category_id
      ${onlyActive ? 'WHERE c.is_active = true' : ''}
      GROUP BY c.id
      ORDER BY c.name ASC
    `;
    const result = await query<HazardCategory>(sql);
    return result.rows;
  }

  async findCategoryById(id: number): Promise<HazardCategory | null> {
    const sql = `
      SELECT 
        c.*,
        COUNT(h.id)::int AS usage_count
      FROM hazard_categories c
      LEFT JOIN hazards h ON c.id = h.category_id
      WHERE c.id = $1
      GROUP BY c.id
    `;
    const result = await query<HazardCategory>(sql, [id]);
    return result.rows[0] || null;
  }

  async findCategoryBySlug(slug: string): Promise<HazardCategory | null> {
    const sql = `
      SELECT 
        c.*,
        COUNT(h.id)::int AS usage_count
      FROM hazard_categories c
      LEFT JOIN hazards h ON c.id = h.category_id
      WHERE c.slug = $1
      GROUP BY c.id
    `;
    const result = await query<HazardCategory>(sql, [slug]);
    return result.rows[0] || null;
  }

  async findCategoryByName(name: string): Promise<HazardCategory | null> {
    const sql = `
      SELECT 
        c.*,
        COUNT(h.id)::int AS usage_count
      FROM hazard_categories c
      LEFT JOIN hazards h ON c.id = h.category_id
      WHERE LOWER(c.name) = LOWER($1)
      GROUP BY c.id
    `;
    const result = await query<HazardCategory>(sql, [name.trim()]);
    return result.rows[0] || null;
  }

  async createCategory(data: CreateHazardCategoryDTO): Promise<HazardCategory> {
    const slug =
      data.slug ||
      data.name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    const sql = `
      INSERT INTO hazard_categories (
        name, slug, description, icon_url, default_severity, default_expiry_days, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *, 0 AS usage_count
    `;
    const params = [
      data.name.trim(),
      slug,
      data.description || null,
      data.icon_url || null,
      (data.default_severity || 'MEDIUM').toUpperCase(),
      data.default_expiry_days ?? 7,
      data.is_active ?? true,
    ];
    const result = await query<HazardCategory>(sql, params);
    return result.rows[0];
  }

  async updateCategory(id: number, data: UpdateHazardCategoryDTO): Promise<HazardCategory | null> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(data.name.trim());
    }
    if (data.slug !== undefined) {
      updates.push(`slug = $${paramIndex++}`);
      params.push(data.slug.trim());
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(data.description);
    }
    if (data.icon_url !== undefined) {
      updates.push(`icon_url = $${paramIndex++}`);
      params.push(data.icon_url);
    }
    if (data.default_severity !== undefined) {
      updates.push(`default_severity = $${paramIndex++}`);
      params.push(data.default_severity.toUpperCase());
    }
    if (data.default_expiry_days !== undefined) {
      updates.push(`default_expiry_days = $${paramIndex++}`);
      params.push(data.default_expiry_days);
    }
    if (data.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(data.is_active);
    }

    if (updates.length === 0) {
      return this.findCategoryById(id);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);

    const sql = `
      UPDATE hazard_categories
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query<HazardCategory>(sql, params);
    if (!result.rows[0]) return null;
    return this.findCategoryById(id);
  }

  async deleteCategory(id: number): Promise<boolean> {
    const result = await query('DELETE FROM hazard_categories WHERE id = $1 RETURNING id', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  // --- Hazards CRUD ---
  async create(data: CreateHazardDTO): Promise<Hazard> {
    const sql = `
      INSERT INTO hazards (
        category_id, title, description, latitude, longitude, severity, status, source, reported_by, image_url, address, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;
    const params = [
      data.category_id || null,
      data.title,
      data.description || null,
      data.latitude,
      data.longitude,
      (data.severity || 'MEDIUM').toUpperCase(),
      (data.status || 'ACTIVE').toUpperCase(),
      (data.source || 'USER').toUpperCase(),
      data.reported_by || null,
      data.image_url || null,
      data.address || null,
      data.expires_at || null,
    ];
    const result = await query<Hazard>(sql, params);
    return result.rows[0];
  }

  async findById(id: string | number): Promise<Hazard | null> {
    const sql = `
      SELECT h.*, 
             c.name AS category_name, 
             c.slug AS category_slug,
             u.name AS reporter_name
      FROM hazards h
      LEFT JOIN hazard_categories c ON h.category_id = c.id
      LEFT JOIN users u ON h.reported_by = u.id
      WHERE h.id = $1
    `;
    const result = await query<Hazard>(sql, [id]);
    return result.rows[0] || null;
  }

  async findAll(options: HazardFilterOptions): Promise<{ hazards: Hazard[]; total: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 10));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (options.category_id) {
      conditions.push(`h.category_id = $${paramIndex++}`);
      params.push(options.category_id);
    }

    if (options.category_slug) {
      conditions.push(`c.slug = $${paramIndex++}`);
      params.push(options.category_slug);
    }

    if (options.severity) {
      conditions.push(`h.severity = $${paramIndex++}`);
      params.push(options.severity.toUpperCase());
    }

    if (options.status) {
      conditions.push(`h.status = $${paramIndex++}`);
      params.push(options.status.toUpperCase());
    }

    if (options.source) {
      conditions.push(`h.source = $${paramIndex++}`);
      params.push(options.source.toUpperCase());
    }

    if (options.reported_by) {
      conditions.push(`h.reported_by = $${paramIndex++}`);
      params.push(options.reported_by);
    }

    if (options.search) {
      conditions.push(`(h.title ILIKE $${paramIndex} OR h.description ILIKE $${paramIndex} OR h.address ILIKE $${paramIndex})`);
      params.push(`%${options.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*) as count 
      FROM hazards h
      LEFT JOIN hazard_categories c ON h.category_id = c.id
      ${whereClause}
    `;
    const countResult = await query(countQuery, params);
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    const dataQuery = `
      SELECT h.*, 
             c.name AS category_name, 
             c.slug AS category_slug,
             u.name AS reporter_name
      FROM hazards h
      LEFT JOIN hazard_categories c ON h.category_id = c.id
      LEFT JOIN users u ON h.reported_by = u.id
      ${whereClause}
      ORDER BY h.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const dataResult = await query<Hazard>(dataQuery, [...params, limit, offset]);

    return { hazards: dataResult.rows, total };
  }

  async findNearby(options: NearbyHazardOptions): Promise<Hazard[]> {
    const radius = options.radiusKm || 10;
    const limit = options.limit || 50;
    const status = (options.status || 'ACTIVE').toUpperCase();

    // Fast bounding-box pre-filter: eliminates >95% of candidates using B-tree indices before trig acos
    const clampedLat = Math.max(-89.9, Math.min(89.9, options.latitude));
    const latDelta = radius / 111.32;
    const minLat = Math.max(-90, clampedLat - latDelta);
    const maxLat = Math.min(90, clampedLat + latDelta);

    const cosLat = Math.cos((clampedLat * Math.PI) / 180);
    const lonDelta = cosLat > 0.01 ? radius / (111.32 * cosLat) : 180;

    let lngFilterSql: string;
    const params: any[] = [
      options.latitude,
      options.longitude,
      status,
      radius,
      limit,
      minLat,
      maxLat,
    ];

    if (lonDelta >= 180) {
      lngFilterSql = 'AND h.longitude BETWEEN -180 AND 180';
    } else {
      const rawMinLng = options.longitude - lonDelta;
      const rawMaxLng = options.longitude + lonDelta;

      if (rawMinLng < -180) {
        const wrappedMin = rawMinLng + 360;
        params.push(wrappedMin, rawMaxLng);
        lngFilterSql = `AND (h.longitude >= $${params.length - 1} OR h.longitude <= $${params.length})`;
      } else if (rawMaxLng > 180) {
        const wrappedMax = rawMaxLng - 360;
        params.push(rawMinLng, wrappedMax);
        lngFilterSql = `AND (h.longitude >= $${params.length - 1} OR h.longitude <= $${params.length})`;
      } else {
        params.push(rawMinLng, rawMaxLng);
        lngFilterSql = `AND h.longitude BETWEEN $${params.length - 1} AND $${params.length}`;
      }
    }

    // Haversine formula calculation in SQL returning distance in kilometers
    const sql = `
      SELECT h.*, 
             c.name AS category_name, 
             c.slug AS category_slug,
             (6371 * acos(
               LEAST(1.0, GREATEST(-1.0,
                 cos(radians($1)) * cos(radians(h.latitude)) *
                 cos(radians(h.longitude) - radians($2)) +
                 sin(radians($1)) * sin(radians(h.latitude))
               ))
             )) AS distance_km
      FROM hazards h
      LEFT JOIN hazard_categories c ON h.category_id = c.id
      WHERE h.status = $3
        AND (h.expires_at IS NULL OR h.expires_at > NOW())
        AND h.latitude BETWEEN $6 AND $7
        ${lngFilterSql}
        AND (6371 * acos(
              LEAST(1.0, GREATEST(-1.0,
                cos(radians($1)) * cos(radians(h.latitude)) *
                cos(radians(h.longitude) - radians($2)) +
                sin(radians($1)) * sin(radians(h.latitude))
              ))
            )) <= $4
      ORDER BY distance_km ASC
      LIMIT $5
    `;

    const result = await query<Hazard>(sql, params);

    return result.rows.map((row) => ({
      ...row,
      distance_km: row.distance_km ? Math.round(row.distance_km * 100) / 100 : 0,
    }));
  }

  async findInBoundingBox(bounds: {
    minLat: number;
    minLng: number;
    maxLat: number;
    maxLng: number;
    limit?: number;
  }): Promise<Hazard[]> {
    const limit = bounds.limit || 300;

    const sql = `
      SELECT h.*, 
             c.name AS category_name, 
             c.slug AS category_slug
      FROM hazards h
      LEFT JOIN hazard_categories c ON h.category_id = c.id
      WHERE h.status = 'ACTIVE'
        AND (h.expires_at IS NULL OR h.expires_at > NOW())
        AND h.latitude BETWEEN $1 AND $2
        AND h.longitude BETWEEN $3 AND $4
      ORDER BY 
        CASE h.severity
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          WHEN 'LOW' THEN 4
          ELSE 5
        END ASC,
        h.id ASC
      LIMIT $5
    `;
    const result = await query<Hazard>(sql, [
      bounds.minLat,
      bounds.maxLat,
      bounds.minLng,
      bounds.maxLng,
      limit,
    ]);

    return result.rows;
  }

  async update(id: string | number, data: UpdateHazardDTO): Promise<Hazard | null> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    const fields: (keyof UpdateHazardDTO)[] = [
      'category_id',
      'title',
      'description',
      'latitude',
      'longitude',
      'severity',
      'status',
      'image_url',
      'address',
      'expires_at',
    ];

    for (const field of fields) {
      if (data[field] !== undefined) {
        let val = data[field];
        if (field === 'severity' || field === 'status') {
          val = String(val).toUpperCase();
        }
        updates.push(`${field} = $${paramIndex++}`);
        params.push(val);
      }
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const sql = `
      UPDATE hazards
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query<Hazard>(sql, params);
    return result.rows[0] ? this.findById(id) : null;
  }

  async updateStatus(id: string | number, status: string): Promise<Hazard | null> {
    const sql = `
      UPDATE hazards
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    const result = await query<Hazard>(sql, [status.toUpperCase(), id]);
    return result.rows[0] ? this.findById(id) : null;
  }

  async delete(id: string | number): Promise<boolean> {
    const result = await query('DELETE FROM hazards WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  // --- Hazard Reports CRUD & Moderation ---
  async createReport(userId: number, data: CreateHazardReportDTO): Promise<HazardReport> {
    const sql = `
      INSERT INTO hazard_reports (
        user_id, category_id, title, description, latitude, longitude, address, image_url, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING')
      RETURNING *
    `;
    const params = [
      userId,
      data.category_id || null,
      data.title || null,
      data.description,
      data.latitude,
      data.longitude,
      data.address || null,
      data.image_url || null,
    ];
    const result = await query<HazardReport>(sql, params);
    return result.rows[0];
  }

  async findReportById(id: string | number): Promise<HazardReport | null> {
    const sql = `
      SELECT r.*,
             u.name AS user_name,
             u.email AS user_email,
             c.name AS category_name,
             c.is_active AS category_is_active,
             a.name AS reviewer_name
      FROM hazard_reports r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN hazard_categories c ON r.category_id = c.id
      LEFT JOIN admins a ON r.reviewed_by = a.id
      WHERE r.id = $1
    `;
    const result = await query<HazardReport>(sql, [id]);
    return result.rows[0] || null;
  }

  async findReports(options: ReportFilterOptions): Promise<{ reports: HazardReport[]; total: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 10));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (options.user_id) {
      conditions.push(`r.user_id = $${paramIndex++}`);
      params.push(options.user_id);
    }

    if (options.status && options.status.toLowerCase() !== 'all') {
      conditions.push(`r.status = $${paramIndex++}`);
      params.push(options.status.toUpperCase());
    }

    const catFilter = options.category?.trim();
    const catIdFilter = options.category_id;

    if (catFilter && catFilter.toLowerCase() !== 'all') {
      if (catFilter.toLowerCase() === 'other') {
        conditions.push(`(r.category_id IS NULL OR c.id IS NULL OR c.is_active = false OR LOWER(c.name) = 'other' OR c.slug = 'other')`);
      } else {
        conditions.push(`(c.is_active = true AND (LOWER(c.name) = LOWER($${paramIndex}) OR c.slug = LOWER($${paramIndex})))`);
        params.push(catFilter);
        paramIndex++;
      }
    } else if (catIdFilter) {
      conditions.push(`(
        ((c.slug = 'other' OR LOWER(c.name) = 'other') AND (r.category_id IS NULL OR c.id IS NULL OR c.is_active = false OR r.category_id = $${paramIndex}))
        OR (c.is_active = true AND r.category_id = $${paramIndex})
      )`);
      params.push(catIdFilter);
      paramIndex++;
    }

    if (options.search) {
      conditions.push(`(r.description ILIKE $${paramIndex} OR r.title ILIKE $${paramIndex} OR r.address ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex} OR c.name ILIKE $${paramIndex})`);
      params.push(`%${options.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*) as count
      FROM hazard_reports r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN hazard_categories c ON r.category_id = c.id
      ${whereClause}
    `;
    const countResult = await query(countQuery, params);
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    const dataQuery = `
      SELECT r.*,
             u.name AS user_name,
             u.email AS user_email,
             c.name AS category_name,
             c.is_active AS category_is_active,
             a.name AS reviewer_name
      FROM hazard_reports r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN hazard_categories c ON r.category_id = c.id
      LEFT JOIN admins a ON r.reviewed_by = a.id
      ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const dataResult = await query<HazardReport>(dataQuery, [...params, limit, offset]);

    return { reports: dataResult.rows, total };
  }

  async approveReport(
    reportId: number,
    adminId: number,
    hazardOptions?: { severity?: string; title?: string; category_id?: number }
  ): Promise<{ report: HazardReport; hazard: Hazard }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Get report
      const repRes = await client.query<HazardReport>(
        'SELECT * FROM hazard_reports WHERE id = $1 FOR UPDATE',
        [reportId]
      );
      if (repRes.rows.length === 0) {
        throw new Error('Hazard report not found');
      }
      const report = repRes.rows[0];

      // 2. Create hazard from report
      const categoryId = hazardOptions?.category_id || report.category_id || null;
      const title = hazardOptions?.title || report.title || 'Reported Hazard';
      const severity = (hazardOptions?.severity || 'MEDIUM').toUpperCase();

      const hazRes = await client.query<Hazard>(
        `INSERT INTO hazards (
          category_id, title, description, latitude, longitude, severity, status, source, reported_by, image_url, address
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', 'USER', $7, $8, $9)
        RETURNING *`,
        [
          categoryId,
          title,
          report.description,
          report.latitude,
          report.longitude,
          severity,
          report.user_id,
          report.image_url,
          report.address,
        ]
      );
      const createdHazard = hazRes.rows[0];

      // 3. Update report status
      const updReport = await client.query<HazardReport>(
        `UPDATE hazard_reports
         SET status = 'APPROVED',
             hazard_id = $1,
             reviewed_by = $2,
             reviewed_at = NOW(),
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [createdHazard.id, adminId, reportId]
      );

      // 4. Create activity log
      await client.query(
        `INSERT INTO activity_logs (actor_type, actor_id, action, entity_type, entity_id, metadata)
         VALUES ('ADMIN', $1, 'APPROVE_HAZARD_REPORT', 'HAZARD_REPORT', $2, $3)`,
        [adminId, reportId, JSON.stringify({ hazard_id: createdHazard.id, severity })]
      );

      // 5. Send notification to user
      await client.query(
        `INSERT INTO notifications (user_id, type, title, message, data)
         VALUES ($1, 'REPORT_STATUS', 'Hazard Report Approved', $2, $3)`,
        [
          report.user_id,
          `Your hazard report "${title}" has been reviewed and verified. Thank you for making roads safer!`,
          JSON.stringify({ report_id: reportId, hazard_id: createdHazard.id, status: 'APPROVED' }),
        ]
      );

      await client.query('COMMIT');
      return { report: updReport.rows[0], hazard: createdHazard };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async rejectReport(reportId: number, adminId: number, rejectionReason: string): Promise<HazardReport> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const repRes = await client.query<HazardReport>(
        'SELECT * FROM hazard_reports WHERE id = $1 FOR UPDATE',
        [reportId]
      );
      if (repRes.rows.length === 0) {
        throw new Error('Hazard report not found');
      }
      const report = repRes.rows[0];

      const updReport = await client.query<HazardReport>(
        `UPDATE hazard_reports
         SET status = 'REJECTED',
             rejection_reason = $1,
             reviewed_by = $2,
             reviewed_at = NOW(),
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [rejectionReason, adminId, reportId]
      );

      // Activity log
      await client.query(
        `INSERT INTO activity_logs (actor_type, actor_id, action, entity_type, entity_id, metadata)
         VALUES ('ADMIN', $1, 'REJECT_HAZARD_REPORT', 'HAZARD_REPORT', $2, $3)`,
        [adminId, reportId, JSON.stringify({ rejection_reason: rejectionReason })]
      );

      // User notification
      await client.query(
        `INSERT INTO notifications (user_id, type, title, message, data)
         VALUES ($1, 'REPORT_STATUS', 'Hazard Report Update', $2, $3)`,
        [
          report.user_id,
          `Your hazard report could not be approved. Reason: ${rejectionReason}`,
          JSON.stringify({ report_id: reportId, status: 'REJECTED', reason: rejectionReason }),
        ]
      );

      await client.query('COMMIT');
      return updReport.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // --- Hazard Confirmation & Resolution ---
  async confirmHazard(hazardId: string | number, userId?: number): Promise<Hazard> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const checkRes = await client.query<Hazard>('SELECT * FROM hazards WHERE id = $1 FOR UPDATE', [hazardId]);
      if (checkRes.rows.length === 0) {
        throw new Error('Hazard not found');
      }

      if (userId) {
        const existingConfirm = await client.query(
          'SELECT id FROM hazard_confirmations WHERE hazard_id = $1 AND user_id = $2',
          [hazardId, userId]
        );
        if (existingConfirm.rows.length > 0) {
          throw new Error('You have already confirmed this hazard');
        }
      }

      await client.query(
        'INSERT INTO hazard_confirmations (hazard_id, user_id, confirmed_at) VALUES ($1, $2, NOW())',
        [hazardId, userId || null]
      );

      await client.query(
        `UPDATE hazards
         SET confirmation_count = COALESCE(confirmation_count, 0) + 1,
             last_confirmed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [hazardId]
      );

      await client.query('COMMIT');
      const updated = await this.findById(hazardId);
      if (!updated) throw new Error('Hazard not found');
      return updated;
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        throw new Error('You have already confirmed this hazard', { cause: err });
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async resolveHazard(
    hazardId: string | number,
    userId?: number,
    isAdmin = false,
    resolveThreshold = 3
  ): Promise<Hazard> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const checkRes = await client.query<Hazard>('SELECT * FROM hazards WHERE id = $1 FOR UPDATE', [hazardId]);
      if (checkRes.rows.length === 0) {
        throw new Error('Hazard not found');
      }

      const currentHazard = checkRes.rows[0];

      if (userId) {
        const existingResolve = await client.query(
          'SELECT id FROM hazard_resolutions WHERE hazard_id = $1 AND user_id = $2',
          [hazardId, userId]
        );
        if (existingResolve.rows.length > 0) {
          throw new Error('You have already submitted a resolution for this hazard');
        }
      }

      await client.query(
        'INSERT INTO hazard_resolutions (hazard_id, user_id, resolved_at) VALUES ($1, $2, NOW())',
        [hazardId, userId || null]
      );

      const newResolvedCount = (currentHazard.resolved_count || 0) + 1;
      const shouldResolve = isAdmin || newResolvedCount >= resolveThreshold;
      const newStatus = shouldResolve ? 'RESOLVED' : currentHazard.status;

      await client.query(
        `UPDATE hazards
         SET resolved_count = COALESCE(resolved_count, 0) + 1,
             status = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [newStatus, hazardId]
      );

      await client.query('COMMIT');
      const updated = await this.findById(hazardId);
      if (!updated) throw new Error('Hazard not found');
      return updated;
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        throw new Error('You have already submitted a resolution for this hazard', { cause: err });
      }
      throw err;
    } finally {
      client.release();
    }
  }
}

export default new HazardRepository();
