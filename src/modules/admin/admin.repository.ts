import { query } from '../../config/database.js';
import type {
  DashboardSummary,
  HazardAnalytics,
  UserAnalytics,
  JourneyAnalytics,
  ReportAnalytics,
  ContentPage,
  CreateContentPageDTO,
  UpdateContentPageDTO,
  SystemSetting,
  ActivityLog,
  ActivityLogFilterOptions,
  DatasetImport,
  DashboardFilterOptions,
  UserActivityTimelineItem,
  AdminUserDetail,
} from './admin.types.js';

function parseFilterDates(options?: DashboardFilterOptions): {
  startDate?: Date;
  endDate?: Date;
  prevStartDate?: Date;
  prevEndDate?: Date;
  label: string;
} {
  const now = new Date();
  let endDate: Date | undefined;
  let startDate: Date | undefined;
  let prevEndDate: Date | undefined;
  let prevStartDate: Date | undefined;
  let label: string;

  const period = options?.period || 'all';

  if (options?.startDate && options?.endDate) {
    startDate = new Date(options.startDate);
    endDate = new Date(options.endDate);
    const diffMs = endDate.getTime() - startDate.getTime();
    prevEndDate = new Date(startDate);
    prevStartDate = new Date(startDate.getTime() - (diffMs || 86400000));
    label = 'vs prev period';
  } else if (period === '7d') {
    endDate = now;
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    prevEndDate = startDate;
    prevStartDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    label = 'vs last week';
  } else if (period === '30d') {
    endDate = now;
    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    prevEndDate = startDate;
    prevStartDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    label = 'vs prev 30 days';
  } else if (period === 'this_month') {
    endDate = now;
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    prevEndDate = startDate;
    prevStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    label = 'vs last month';
  } else if (period === 'last_month') {
    endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    prevEndDate = startDate;
    prevStartDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    label = 'vs prev month';
  } else {
    // Default 'all' - compare last 7 days vs previous 7 days for trend badges
    prevEndDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    prevStartDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    label = 'vs last week';
  }

  return { startDate, endDate, prevStartDate, prevEndDate, label };
}

function calcPctChange(current: number, previous: number): { change: string; isPositive: boolean } {
  if (previous === 0) {
    if (current === 0) return { change: '0%', isPositive: true };
    return { change: `+${current}`, isPositive: true };
  }
  const diff = current - previous;
  const percent = (diff / previous) * 100;
  const formatted = `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`;
  return { change: formatted, isPositive: percent >= 0 };
}

export class AdminRepository {
  // --- Analytics & Dashboard ---
  async getDashboardSummary(options?: DashboardFilterOptions): Promise<DashboardSummary> {
    const { startDate, endDate, prevStartDate, prevEndDate, label } = parseFilterDates(options);

    const currStart = startDate
      ? startDate.toISOString()
      : prevEndDate
        ? prevEndDate.toISOString()
        : new Date(0).toISOString();
    const currEnd = endDate ? endDate.toISOString() : new Date().toISOString();
    const prevStart = prevStartDate ? prevStartDate.toISOString() : new Date(0).toISOString();
    const prevEnd = prevEndDate ? prevEndDate.toISOString() : new Date(0).toISOString();

    const sql = `
      SELECT 
        (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS total_users,
        (SELECT COUNT(*) FROM users WHERE status = 'ACTIVE' AND deleted_at IS NULL) AS active_users,
        (SELECT COUNT(*) FROM users WHERE status = 'SUSPENDED' AND deleted_at IS NULL) AS suspended_users,
        (SELECT COUNT(*) FROM hazards) AS total_hazards,
        (SELECT COUNT(*) FROM hazards WHERE status = 'ACTIVE') AS active_hazards,
        (SELECT COUNT(*) FROM hazards WHERE status = 'RESOLVED') AS resolved_hazards,
        (SELECT COUNT(*) FROM hazard_reports WHERE status = 'PENDING') AS pending_reports,
        (SELECT COUNT(*) FROM journeys) AS total_journeys,
        (SELECT COUNT(*) FROM journeys WHERE status = 'ACTIVE') AS active_journeys,
        (SELECT COUNT(*) FROM dataset_imports) AS total_dataset_imports,

        -- Period comparisons
        (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND created_at >= $1::timestamptz AND created_at <= $2::timestamptz) AS curr_users,
        (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND created_at >= $3::timestamptz AND created_at < $4::timestamptz) AS prev_users,

        (SELECT COUNT(*) FROM journeys WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz) AS curr_journeys,
        (SELECT COUNT(*) FROM journeys WHERE created_at >= $3::timestamptz AND created_at < $4::timestamptz) AS prev_journeys,

        (SELECT COUNT(*) FROM hazard_reports WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz) AS curr_reports,
        (SELECT COUNT(*) FROM hazard_reports WHERE created_at >= $3::timestamptz AND created_at < $4::timestamptz) AS prev_reports,

        (SELECT COUNT(*) FROM hazards WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz) AS curr_hazards,
        (SELECT COUNT(*) FROM hazards WHERE created_at >= $3::timestamptz AND created_at < $4::timestamptz) AS prev_hazards
    `;

    const result = await query(sql, [currStart, currEnd, prevStart, prevEnd]);
    const row = result.rows[0];

    const currUsersCount = parseInt(row.curr_users || '0', 10);
    const prevUsersCount = parseInt(row.prev_users || '0', 10);
    const usersDelta = calcPctChange(currUsersCount, prevUsersCount);

    const currJourneysCount = parseInt(row.curr_journeys || '0', 10);
    const prevJourneysCount = parseInt(row.prev_journeys || '0', 10);
    const journeysDelta = calcPctChange(currJourneysCount, prevJourneysCount);

    const currReportsCount = parseInt(row.curr_reports || '0', 10);
    const prevReportsCount = parseInt(row.prev_reports || '0', 10);
    const reportsDelta = calcPctChange(currReportsCount, prevReportsCount);

    const currHazardsCount = parseInt(row.curr_hazards || '0', 10);
    const prevHazardsCount = parseInt(row.prev_hazards || '0', 10);
    const hazardsDelta = calcPctChange(currHazardsCount, prevHazardsCount);

    return {
      totalUsers: parseInt(row.total_users || '0', 10),
      activeUsers: parseInt(row.active_users || '0', 10),
      suspendedUsers: parseInt(row.suspended_users || '0', 10),
      totalHazards: parseInt(row.total_hazards || '0', 10),
      activeHazards: parseInt(row.active_hazards || '0', 10),
      resolvedHazards: parseInt(row.resolved_hazards || '0', 10),
      pendingReports: parseInt(row.pending_reports || '0', 10),
      totalJourneys: parseInt(row.total_journeys || '0', 10),
      activeJourneys: parseInt(row.active_journeys || '0', 10),
      totalDatasetImports: parseInt(row.total_dataset_imports || '0', 10),

      usersChange: usersDelta.change,
      usersChangeLabel: label,
      usersIsPositive: usersDelta.isPositive,

      journeysChange: journeysDelta.change,
      journeysChangeLabel: label,
      journeysIsPositive: journeysDelta.isPositive,

      reportsChange: reportsDelta.change,
      reportsChangeLabel: label,
      reportsIsPositive: reportsDelta.isPositive,

      hazardsChange: hazardsDelta.change,
      hazardsChangeLabel: label,
      hazardsIsPositive: hazardsDelta.isPositive,
    };
  }

  async getHazardAnalytics(options?: DashboardFilterOptions): Promise<HazardAnalytics> {
    const { startDate, endDate } = parseFilterDates(options);
    const hasDateFilter = startDate && endDate;
    const filterClause = hasDateFilter ? 'WHERE created_at >= $1 AND created_at <= $2' : '';
    const params = hasDateFilter ? [startDate.toISOString(), endDate.toISOString()] : [];

    const severityRes = await query<{ severity: string; count: string }>(
      `SELECT severity, COUNT(*) as count FROM hazards ${filterClause} GROUP BY severity`,
      params
    );
    const statusRes = await query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) as count FROM hazards ${filterClause} GROUP BY status`,
      params
    );
    const sourceRes = await query<{ source: string; count: string }>(
      `SELECT source, COUNT(*) as count FROM hazards ${filterClause} GROUP BY source`,
      params
    );
    const catRes = await query<{ category_name: string; count: string }>(
      `SELECT COALESCE(c.name, 'Uncategorized') AS category_name, COUNT(h.id) AS count
       FROM hazards h
       LEFT JOIN hazard_categories c ON h.category_id = c.id
       ${hasDateFilter ? 'WHERE h.created_at >= $1 AND h.created_at <= $2' : ''}
       GROUP BY c.name
       ORDER BY count DESC`,
      params
    );
    const recentRes = await query<{ count: string }>(
      "SELECT COUNT(*) as count FROM hazards WHERE created_at > NOW() - INTERVAL '7 days'"
    );

    const bySeverity: Record<string, number> = {};
    severityRes.rows.forEach((r) => (bySeverity[r.severity] = parseInt(r.count, 10)));

    const byStatus: Record<string, number> = {};
    statusRes.rows.forEach((r) => (byStatus[r.status] = parseInt(r.count, 10)));

    const bySource: Record<string, number> = {};
    sourceRes.rows.forEach((r) => (bySource[r.source] = parseInt(r.count, 10)));

    return {
      bySeverity,
      byStatus,
      bySource,
      byCategory: catRes.rows.map((r) => ({
        category_name: r.category_name,
        count: parseInt(r.count, 10),
      })),
      recentCreatedCount: parseInt(recentRes.rows[0]?.count || '0', 10),
    };
  }

  async getUserAnalytics(): Promise<UserAnalytics> {
    const totalRes = await query('SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL');
    const transportRes = await query<{ transport_mode: string; count: string }>(
      'SELECT transport_mode, COUNT(*) as count FROM users WHERE deleted_at IS NULL GROUP BY transport_mode'
    );
    const statusRes = await query<{ status: string; count: string }>(
      'SELECT status, COUNT(*) as count FROM users WHERE deleted_at IS NULL GROUP BY status'
    );
    const last7DaysRes = await query<{ count: string }>(
      "SELECT COUNT(*) as count FROM users WHERE created_at > NOW() - INTERVAL '7 days' AND deleted_at IS NULL"
    );
    const last30DaysRes = await query<{ count: string }>(
      "SELECT COUNT(*) as count FROM users WHERE created_at > NOW() - INTERVAL '30 days' AND deleted_at IS NULL"
    );

    const byTransportMode: Record<string, number> = {};
    transportRes.rows.forEach((r) => (byTransportMode[r.transport_mode] = parseInt(r.count, 10)));

    const byStatus: Record<string, number> = {};
    statusRes.rows.forEach((r) => (byStatus[r.status] = parseInt(r.count, 10)));

    return {
      totalUsers: parseInt(totalRes.rows[0]?.count || '0', 10),
      byTransportMode,
      byStatus,
      newUsersLast7Days: parseInt(last7DaysRes.rows[0]?.count || '0', 10),
      newUsersLast30Days: parseInt(last30DaysRes.rows[0]?.count || '0', 10),
    };
  }

  async getJourneyAnalytics(): Promise<JourneyAnalytics> {
    const totalRes = await query(
      'SELECT COUNT(*) as count, COALESCE(SUM(distance_km), 0) as total_dist, COALESCE(SUM(duration_minutes), 0) as total_dur FROM journeys'
    );
    const statusRes = await query<{ status: string; count: string }>(
      'SELECT status, COUNT(*) as count FROM journeys GROUP BY status'
    );
    const transportRes = await query<{ transport_mode: string; count: string }>(
      'SELECT transport_mode, COUNT(*) as count FROM journeys GROUP BY transport_mode'
    );

    const byStatus: Record<string, number> = {};
    statusRes.rows.forEach((r) => (byStatus[r.status] = parseInt(r.count, 10)));

    const byTransportMode: Record<string, number> = {};
    transportRes.rows.forEach((r) => (byTransportMode[r.transport_mode] = parseInt(r.count, 10)));

    return {
      totalJourneys: parseInt(totalRes.rows[0]?.count || '0', 10),
      byStatus,
      byTransportMode,
      totalDistanceKm: Math.round(parseFloat(totalRes.rows[0]?.total_dist || '0') * 100) / 100,
      totalDurationMinutes: parseInt(totalRes.rows[0]?.total_dur || '0', 10),
    };
  }

  async getReportAnalytics(): Promise<ReportAnalytics> {
    const totalRes = await query('SELECT COUNT(*) as count FROM hazard_reports');
    const statusRes = await query<{ status: string; count: string }>(
      'SELECT status, COUNT(*) as count FROM hazard_reports GROUP BY status'
    );

    const byStatus: Record<string, number> = {};
    statusRes.rows.forEach((r) => (byStatus[r.status] = parseInt(r.count, 10)));

    return {
      totalReports: parseInt(totalRes.rows[0]?.count || '0', 10),
      pendingReports: byStatus['PENDING'] || 0,
      approvedReports: byStatus['APPROVED'] || 0,
      rejectedReports: byStatus['REJECTED'] || 0,
    };
  }

  // --- Content Pages ---
  async findContentBySlug(slug: string): Promise<ContentPage | null> {
    const result = await query<ContentPage>(
      'SELECT * FROM content_pages WHERE slug = $1 AND is_published = true',
      [slug]
    );
    return result.rows[0] || null;
  }

  async getAllContent(onlyPublished = false): Promise<ContentPage[]> {
    const sql = onlyPublished
      ? 'SELECT * FROM content_pages WHERE is_published = true ORDER BY title ASC'
      : 'SELECT * FROM content_pages ORDER BY title ASC';
    const result = await query<ContentPage>(sql);
    return result.rows;
  }

  async findContentById(id: string | number): Promise<ContentPage | null> {
    const result = await query<ContentPage>('SELECT * FROM content_pages WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async createContent(data: CreateContentPageDTO): Promise<ContentPage> {
    const sql = `
      INSERT INTO content_pages (slug, title, content, is_published)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const params = [
      data.slug.toLowerCase().trim(),
      data.title,
      data.content,
      data.is_published !== undefined ? data.is_published : true,
    ];
    const result = await query<ContentPage>(sql, params);
    return result.rows[0];
  }

  async updateContent(
    id: string | number,
    data: UpdateContentPageDTO
  ): Promise<ContentPage | null> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      params.push(data.title);
    }
    if (data.content !== undefined) {
      updates.push(`content = $${paramIndex++}`);
      params.push(data.content);
    }
    if (data.is_published !== undefined) {
      updates.push(`is_published = $${paramIndex++}`);
      params.push(data.is_published);
    }

    if (updates.length === 0) {
      return this.findContentById(id);
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const sql = `
      UPDATE content_pages
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    const result = await query<ContentPage>(sql, params);
    return result.rows[0] || null;
  }

  async deleteContent(id: string | number): Promise<boolean> {
    const result = await query('DELETE FROM content_pages WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  // --- Settings ---
  async getAllSettings(): Promise<SystemSetting[]> {
    const result = await query<SystemSetting>('SELECT * FROM settings ORDER BY key ASC');
    return result.rows;
  }

  async getSettingByKey(key: string): Promise<SystemSetting | null> {
    const result = await query<SystemSetting>('SELECT * FROM settings WHERE key = $1', [key]);
    return result.rows[0] || null;
  }

  async upsertSetting(
    key: string,
    value: any,
    description?: string,
    updatedBy?: number
  ): Promise<SystemSetting> {
    const sql = `
      INSERT INTO settings (key, value, description, updated_by, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value,
          description = COALESCE(EXCLUDED.description, settings.description),
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
      RETURNING *
    `;

    const params = [
      key,
      typeof value === 'object' ? JSON.stringify(value) : JSON.stringify({ value }),
      description || null,
      updatedBy || null,
    ];

    const result = await query<SystemSetting>(sql, params);
    return result.rows[0];
  }

  // --- Activity Logs ---
  async createActivityLog(
    actorType: 'ADMIN' | 'USER' | 'SYSTEM',
    actorId: number | null,
    action: string,
    entityType: string,
    entityId: number | null,
    metadata?: Record<string, any>
  ): Promise<ActivityLog> {
    const sql = `
      INSERT INTO activity_logs (actor_type, actor_id, action, entity_type, entity_id, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const params = [
      actorType,
      actorId,
      action,
      entityType,
      entityId,
      JSON.stringify(metadata || {}),
    ];
    const result = await query<ActivityLog>(sql, params);
    return result.rows[0];
  }

  async getActivityLogs(
    options: ActivityLogFilterOptions
  ): Promise<{ logs: ActivityLog[]; total: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (options.actor_type) {
      conditions.push(`actor_type = $${paramIndex++}`);
      params.push(options.actor_type.toUpperCase());
    }
    if (options.actor_id) {
      conditions.push(`actor_id = $${paramIndex++}`);
      params.push(options.actor_id);
    }
    if (options.entity_type) {
      conditions.push(`entity_type = $${paramIndex++}`);
      params.push(options.entity_type.toUpperCase());
    }
    if (options.action) {
      conditions.push(`action ILIKE $${paramIndex++}`);
      params.push(`%${options.action}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `SELECT COUNT(*) as count FROM activity_logs ${whereClause}`;
    const countResult = await query(countQuery, params);
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    const dataQuery = `
      SELECT * FROM activity_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const dataResult = await query<ActivityLog>(dataQuery, [...params, limit, offset]);

    return { logs: dataResult.rows, total };
  }

  // --- Dataset Imports ---
  async createDatasetImport(data: {
    admin_id: number;
    filename: string;
    file_size: number;
    total_rows: number;
    raw_preview: any[];
  }): Promise<DatasetImport> {
    const sql = `
      INSERT INTO dataset_imports (
        admin_id, filename, file_size, total_rows, status, raw_preview
      )
      VALUES ($1, $2, $3, $4, 'VALIDATED', $5)
      RETURNING *
    `;
    const params = [
      data.admin_id,
      data.filename,
      data.file_size,
      data.total_rows,
      JSON.stringify(data.raw_preview),
    ];
    const result = await query<DatasetImport>(sql, params);
    return result.rows[0];
  }

  async findDatasetImportById(id: string | number): Promise<DatasetImport | null> {
    const result = await query<DatasetImport>('SELECT * FROM dataset_imports WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async updateDatasetImport(
    id: string | number,
    updates: Partial<DatasetImport>
  ): Promise<DatasetImport | null> {
    const updateClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (updates.status !== undefined) {
      updateClauses.push(`status = $${paramIndex++}`);
      params.push(updates.status);
    }
    if (updates.imported_rows !== undefined) {
      updateClauses.push(`imported_rows = $${paramIndex++}`);
      params.push(updates.imported_rows);
    }
    if (updates.failed_rows !== undefined) {
      updateClauses.push(`failed_rows = $${paramIndex++}`);
      params.push(updates.failed_rows);
    }
    if (updates.error_summary !== undefined) {
      updateClauses.push(`error_summary = $${paramIndex++}`);
      params.push(JSON.stringify(updates.error_summary));
    }
    if (updates.raw_preview !== undefined) {
      updateClauses.push(`raw_preview = $${paramIndex++}`);
      params.push(JSON.stringify(updates.raw_preview));
    }

    updateClauses.push(`updated_at = NOW()`);
    params.push(id);

    const sql = `
      UPDATE dataset_imports
      SET ${updateClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    const result = await query<DatasetImport>(sql, params);
    return result.rows[0] || null;
  }

  async deleteDatasetImport(id: string | number): Promise<boolean> {
    const result = await query('DELETE FROM dataset_imports WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async getDatasetImports(
    page = 1,
    limit = 10
  ): Promise<{ imports: DatasetImport[]; total: number }> {
    const offset = (page - 1) * limit;
    const countResult = await query('SELECT COUNT(*) as count FROM dataset_imports');
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    const dataResult = await query<DatasetImport>(
      'SELECT * FROM dataset_imports ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );

    return { imports: dataResult.rows, total };
  }

  // --- User Activity & Details ---
  async getUserActivityTimeline(
    userId: string | number,
    options?: { page?: number; limit?: number }
  ): Promise<{ activities: UserActivityTimelineItem[]; total: number }> {
    const page = Math.max(1, options?.page || 1);
    const limit = Math.max(1, Math.min(100, options?.limit || 50));
    const offset = (page - 1) * limit;

    const baseSql = `
      SELECT 
        'join-' || id::text AS id,
        'Joined Road Life' AS title,
        created_at AS timestamp,
        'join' AS type,
        'Registered as ' || LOWER(transport_mode) AS description
      FROM users
      WHERE id = $1 AND deleted_at IS NULL

      UNION ALL

      SELECT 
        'report-' || r.id::text AS id,
        'Reported ' || COALESCE(c.name, 'a hazard') || CASE WHEN r.address IS NOT NULL AND r.address <> '' THEN ' on ' || r.address ELSE '' END AS title,
        r.created_at AS timestamp,
        'report' AS type,
        COALESCE(r.description, r.title, '') AS description
      FROM hazard_reports r
      LEFT JOIN hazard_categories c ON r.category_id = c.id
      WHERE r.user_id = $1

      UNION ALL

      SELECT 
        'review-' || r.id::text AS id,
        CASE 
          WHEN r.status = 'APPROVED' THEN 'Report approved — ' || COALESCE(r.title, c.name, 'hazard report')
          WHEN r.status = 'REJECTED' THEN 'Report rejected — ' || COALESCE(r.title, c.name, 'hazard report')
          ELSE 'Report reviewed'
        END AS title,
        COALESCE(r.reviewed_at, r.updated_at) AS timestamp,
        CASE WHEN r.status = 'APPROVED' THEN 'approval' ELSE 'report' END AS type,
        CASE 
          WHEN r.status = 'REJECTED' AND r.rejection_reason IS NOT NULL THEN 'Reason: ' || r.rejection_reason
          ELSE 'Reviewed by moderator'
        END AS description
      FROM hazard_reports r
      LEFT JOIN hazard_categories c ON r.category_id = c.id
      WHERE r.user_id = $1 AND r.reviewed_at IS NOT NULL

      UNION ALL

      SELECT 
        'journey-' || j.id::text AS id,
        CASE 
          WHEN j.status = 'COMPLETED' THEN 
            'Completed a ' || CASE WHEN j.distance_km > 0 THEN ROUND(j.distance_km::numeric, 1) || 'km ' ELSE '' END || LOWER(j.transport_mode) || ' journey' || CASE WHEN j.destination_name IS NOT NULL AND j.destination_name <> '' THEN ' to ' || j.destination_name ELSE '' END
          WHEN j.status = 'ACTIVE' THEN 
            'Started a ' || LOWER(j.transport_mode) || ' journey'
          ELSE 
            'Cancelled ' || LOWER(j.transport_mode) || ' journey'
        END AS title,
        COALESCE(j.ended_at, j.started_at, j.created_at) AS timestamp,
        'journey' AS type,
        COALESCE(j.title, 'Trip') AS description
      FROM journeys j
      WHERE j.user_id = $1

      UNION ALL

      SELECT 
        'audit-' || a.id::text AS id,
        CASE 
          WHEN a.action = 'UPDATE_USER_STATUS_SUSPENDED' THEN 'Account suspended by admin'
          WHEN a.action = 'UPDATE_USER_STATUS_ACTIVE' THEN 'Account reactivated by admin'
          ELSE 'Account action: ' || a.action
        END AS title,
        a.created_at AS timestamp,
        CASE 
          WHEN a.action = 'UPDATE_USER_STATUS_SUSPENDED' THEN 'report'
          WHEN a.action = 'UPDATE_USER_STATUS_ACTIVE' THEN 'approval'
          ELSE 'join'
        END AS type,
        'Administrative audit record' AS description
      FROM activity_logs a
      WHERE (a.entity_type = 'USER' AND a.entity_id = $1)
         OR (a.actor_type = 'USER' AND a.actor_id = $1)
    `;

    const countSql = `SELECT COUNT(*) AS count FROM (${baseSql}) AS sub`;
    const countRes = await query(countSql, [userId]);
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    const dataSql = `
      SELECT * FROM (${baseSql}) AS sub
      ORDER BY timestamp DESC
      LIMIT $2 OFFSET $3
    `;
    const dataRes = await query<UserActivityTimelineItem>(dataSql, [userId, limit, offset]);

    return { activities: dataRes.rows, total };
  }

  async getUserDetail(userId: string | number): Promise<AdminUserDetail | null> {
    const userRes = await query(
      `SELECT id, email, name, first_name, last_name, phone, profile_image,
              transport_mode, status, notification_enabled, location_enabled,
              role, last_login_at, created_at, updated_at
       FROM users
       WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    if (userRes.rows.length === 0) {
      return null;
    }

    const user = userRes.rows[0];

    const countsRes = await query(
      `SELECT 
        (SELECT COUNT(*) FROM journeys WHERE user_id = $1 AND status = 'COMPLETED') AS journeys_completed,
        (SELECT COUNT(*) FROM journeys WHERE user_id = $1) AS total_journeys,
        (SELECT COUNT(*) FROM hazard_reports WHERE user_id = $1) AS reports_submitted,
        (SELECT COUNT(*) FROM hazard_reports WHERE user_id = $1 AND status = 'APPROVED') AS reports_approved`,
      [userId]
    );

    const counts = countsRes.rows[0] || {};
    const { activities } = await this.getUserActivityTimeline(userId, { page: 1, limit: 30 });

    return {
      ...user,
      journeysCompleted: parseInt(counts.journeys_completed || '0', 10),
      totalJourneys: parseInt(counts.total_journeys || '0', 10),
      reportsSubmitted: parseInt(counts.reports_submitted || '0', 10),
      reportsApproved: parseInt(counts.reports_approved || '0', 10),
      activityTimeline: activities,
    };
  }

  // --- Dashboard Activity Stream ---
  async getDashboardRecentActivity(options?: {
    page?: number;
    limit?: number;
  }): Promise<{ activities: UserActivityTimelineItem[]; total: number }> {
    const page = Math.max(1, options?.page || 1);
    const limit = Math.max(1, Math.min(100, options?.limit || 10));
    const offset = (page - 1) * limit;

    const baseSql = `
      -- 1. Hazard reports submitted by users
      SELECT
        'report-' || r.id::text AS id,
        COALESCE(u.name, 'Citizen') || ' reported ' || COALESCE(c.name, 'a hazard') || CASE WHEN r.address IS NOT NULL AND r.address <> '' THEN ' on ' || r.address ELSE '' END AS title,
        r.created_at AS timestamp,
        'report' AS type,
        COALESCE(r.description, r.title, '') AS description
      FROM hazard_reports r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN hazard_categories c ON r.category_id = c.id

      UNION ALL

      -- 2. Reports approved by admin
      SELECT
        'approval-' || r.id::text AS id,
        'Admin (You) approved ' || COALESCE(c.name, 'hazard') || ' report' || CASE WHEN r.address IS NOT NULL AND r.address <> '' THEN ' on ' || r.address ELSE '' END AS title,
        COALESCE(r.reviewed_at, r.updated_at) AS timestamp,
        'approval' AS type,
        COALESCE(r.title, 'Verified community hazard') AS description
      FROM hazard_reports r
      LEFT JOIN admins a ON r.reviewed_by = a.id
      LEFT JOIN hazard_categories c ON r.category_id = c.id
      WHERE r.status = 'APPROVED' AND r.reviewed_at IS NOT NULL

      UNION ALL

      -- 3. Reports rejected by admin
      SELECT
        'rejection-' || r.id::text AS id,
        'Admin (You) rejected report' || CASE WHEN r.address IS NOT NULL AND r.address <> '' THEN ' on ' || r.address ELSE '' END || COALESCE(' (' || r.rejection_reason || ')', '') AS title,
        COALESCE(r.reviewed_at, r.updated_at) AS timestamp,
        'rejection' AS type,
        COALESCE(r.rejection_reason, 'Rejected by moderator') AS description
      FROM hazard_reports r
      LEFT JOIN admins a ON r.reviewed_by = a.id
      LEFT JOIN hazard_categories c ON r.category_id = c.id
      WHERE r.status = 'REJECTED' AND r.reviewed_at IS NOT NULL

      UNION ALL

      -- 4. Dataset imports
      SELECT
        'import-' || d.id::text AS id,
        'County dataset import completed — ' || d.filename || ' (' || d.imported_rows || ' records added)' AS title,
        d.created_at AS timestamp,
        'import' AS type,
        'Import status: ' || d.status AS description
      FROM dataset_imports d
      WHERE d.status = 'IMPORTED'

      UNION ALL

      -- 5. New user registrations
      SELECT
        'user-' || u.id::text AS id,
        u.name || ' registered as ' || LOWER(u.transport_mode) AS title,
        u.created_at AS timestamp,
        'registration' AS type,
        'New user: ' || u.email AS description
      FROM users u
      WHERE u.deleted_at IS NULL AND u.role <> 'admin'
    `;

    const countSql = `SELECT COUNT(*) AS count FROM (${baseSql}) AS sub`;
    const countRes = await query(countSql);
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    const dataSql = `
      SELECT * FROM (${baseSql}) AS sub
      ORDER BY timestamp DESC
      LIMIT $1 OFFSET $2
    `;
    const dataRes = await query<UserActivityTimelineItem>(dataSql, [limit, offset]);

    return { activities: dataRes.rows, total };
  }
}

export default new AdminRepository();
