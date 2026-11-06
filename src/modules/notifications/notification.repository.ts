import { query } from '../../config/database.js';
import type {
  Notification,
  CreateNotificationDTO,
  NotificationFilterOptions,
} from './notification.types.js';

export class NotificationRepository {
  async create(data: CreateNotificationDTO): Promise<Notification> {
    const sql = `
      INSERT INTO notifications (user_id, type, title, message, data)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *, (read_at IS NOT NULL) AS is_read
    `;
    const metadata = {
      ...(data.data || {}),
      priority: data.priority || data.data?.priority || 'Normal',
      status: data.status || data.data?.status || 'Sent',
      deliveryType: data.deliveryType || data.data?.deliveryType || 'now',
      sendOn: data.sendOn || data.data?.sendOn,
      scheduledAt: data.scheduledAt || data.data?.scheduledAt,
      audience: data.audience || data.data?.audience,
      targetAudience: data.targetAudience || data.data?.targetAudience,
      relatedHazardId: data.relatedHazardId || data.data?.relatedHazardId,
      relatedHazardTitle: data.relatedHazardTitle || data.data?.relatedHazardTitle,
    };

    const params = [
      data.user_id || 1,
      data.type || 'SYSTEM',
      data.title,
      data.message,
      JSON.stringify(metadata),
    ];
    const result = await query<Notification>(sql, params);
    return result.rows[0];
  }

  async createBroadcast(
    data: CreateNotificationDTO,
    targetModes?: string[]
  ): Promise<Notification> {
    // 1. Create primary master notification record
    const primary = await this.create(data);

    // 2. Also distribute into notifications for all active users so it shows up in their mobile app
    try {
      const payloadData = {
        ...(data.data || {}),
        broadcast_id: primary.id,
        priority: data.priority || data.data?.priority || 'Normal',
        status: data.status || data.data?.status || 'Sent',
        deliveryType: data.deliveryType || data.data?.deliveryType || 'now',
      };

      const queryParams: any[] = [
        data.type || 'SYSTEM',
        data.title,
        data.message,
        JSON.stringify(payloadData),
      ];

      let filterSql = '';
      if (targetModes && targetModes.length > 0 && targetModes.length < 3) {
        queryParams.push(targetModes.map((m) => m.toUpperCase()));
        filterSql = `AND UPPER(transport_mode::text) = ANY($${queryParams.length})`;
      }

      queryParams.push(data.user_id || 1);
      const userExcludeIdx = queryParams.length;

      const sql = `
        INSERT INTO notifications (user_id, type, title, message, data)
        SELECT id, $1, $2, $3, $4
        FROM users
        WHERE deleted_at IS NULL
          AND id != $${userExcludeIdx}
          ${filterSql}
      `;

      await query(sql, queryParams);
    } catch (broadcastErr) {
      console.warn('[Notification Repository] Warning distributing broadcast to users:', broadcastErr);
    }

    return primary;
  }

  async findById(id: string | number): Promise<Notification | null> {
    const sql = `
      SELECT *, (read_at IS NOT NULL) AS is_read
      FROM notifications
      WHERE id = $1
    `;
    const result = await query<Notification>(sql, [id]);
    return result.rows[0] || null;
  }

  async findAll(
    options: NotificationFilterOptions
  ): Promise<{ notifications: Notification[]; total: number; unreadCount: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 10));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (!options.isAdmin) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(options.user_id);
    } else {
      // For Admin: view all master notification broadcasts and system notifications
      // Exclude secondary fan-out rows that have broadcast_id in data JSONB
      conditions.push(`(data->>'broadcast_id' IS NULL)`);
    }

    if (options.is_read !== undefined) {
      if (options.is_read) {
        conditions.push('read_at IS NOT NULL');
      } else {
        conditions.push('read_at IS NULL');
      }
    }

    if (options.type) {
      conditions.push(`type = $${paramIndex++}`);
      params.push(options.type);
    }

    if (options.status) {
      conditions.push(`(data->>'status' = $${paramIndex++} OR ($${paramIndex - 1} = 'Sent' AND data->>'status' IS NULL))`);
      params.push(options.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Total count
    const countQuery = `SELECT COUNT(*) as count FROM notifications ${whereClause}`;
    const countResult = await query(countQuery, params);
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    // Unread count
    let unreadCount = 0;
    if (!options.isAdmin) {
      const unreadResult = await query(
        'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
        [options.user_id]
      );
      unreadCount = parseInt(unreadResult.rows[0]?.count || '0', 10);
    }

    // Data query
    const dataQuery = `
      SELECT *, (read_at IS NOT NULL) AS is_read
      FROM notifications
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const dataResult = await query<Notification>(dataQuery, [...params, limit, offset]);

    return { notifications: dataResult.rows, total, unreadCount };
  }

  async markAsRead(id: string | number, userId: number): Promise<Notification | null> {
    const sql = `
      UPDATE notifications
      SET read_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *, (read_at IS NOT NULL) AS is_read
    `;
    const result = await query<Notification>(sql, [id, userId]);
    return result.rows[0] || null;
  }

  async markAllAsRead(userId: number): Promise<number> {
    const sql = `
      UPDATE notifications
      SET read_at = NOW()
      WHERE user_id = $1 AND read_at IS NULL
    `;
    const result = await query(sql, [userId]);
    return result.rowCount ?? 0;
  }

  async update(
    id: string | number,
    data: Partial<CreateNotificationDTO> & Record<string, any>
  ): Promise<Notification | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const title = data.title !== undefined ? data.title : existing.title;
    const message = data.message !== undefined ? data.message : existing.message;
    const type = data.type !== undefined ? data.type : existing.type;

    // Merge existing json data with new payload
    const existingData =
      typeof existing.data === 'object' && existing.data !== null ? existing.data : {};
    const payloadData =
      typeof data.data === 'object' && data.data !== null ? data.data : {};

    const mergedData = {
      ...existingData,
      ...payloadData,
      ...data,
    };
    // Clean top-level columns from JSON data to avoid redundancy
    delete mergedData.title;
    delete mergedData.message;
    delete mergedData.type;
    delete mergedData.id;
    delete mergedData.data;

    const sql = `
      UPDATE notifications
      SET title = $1,
          message = $2,
          type = $3,
          data = $4
      WHERE id = $5
      RETURNING *, (read_at IS NOT NULL) AS is_read
    `;
    const result = await query<Notification>(sql, [
      title,
      message,
      type,
      JSON.stringify(mergedData),
      id,
    ]);
    return result.rows[0] || null;
  }

  async delete(id: string | number, userId?: number, isAdmin?: boolean): Promise<boolean> {
    let sql = 'DELETE FROM notifications WHERE id = $1';
    const params: any[] = [id];

    if (!isAdmin && userId !== undefined) {
      sql += ' AND user_id = $2';
      params.push(userId);
    }

    const result = await query(sql, params);
    return (result.rowCount ?? 0) > 0;
  }
}

export default new NotificationRepository();
