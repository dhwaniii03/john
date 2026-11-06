import { query } from '../../config/database.js';
import type { SearchHistory, CreateSearchHistoryDTO } from './search-history.types.js';

export class SearchHistoryRepository {
  async getRecentSearches(userId: number, limit = 5): Promise<SearchHistory[]> {
    const safeLimit = Math.max(1, Math.min(50, limit));
    const result = await query<SearchHistory>(
      `SELECT id, user_id, title, subtitle, place_id, latitude, longitude, created_at, updated_at
       FROM search_histories
       WHERE user_id = $1
       ORDER BY updated_at DESC
       LIMIT $2`,
      [userId, safeLimit]
    );
    return result.rows;
  }

  async saveSearch(userId: number, data: CreateSearchHistoryDTO): Promise<SearchHistory> {
    const title = data.title.trim();
    const subtitle = data.subtitle ? data.subtitle.trim() : null;
    const placeId = data.placeId || data.place_id || null;
    const lat = data.latitude !== undefined && data.latitude !== null ? Number(data.latitude) : null;
    const lng = data.longitude !== undefined && data.longitude !== null ? Number(data.longitude) : null;

    // Check if place already exists for user (match by place_id if present, else by exact title and subtitle)
    let existingQuery = '';
    let existingParams: any[] = [];

    if (placeId) {
      existingQuery = `SELECT id FROM search_histories WHERE user_id = $1 AND place_id = $2 LIMIT 1`;
      existingParams = [userId, placeId];
    } else {
      existingQuery = `SELECT id FROM search_histories WHERE user_id = $1 AND LOWER(title) = LOWER($2) AND (subtitle = $3 OR ($3 IS NULL AND subtitle IS NULL)) LIMIT 1`;
      existingParams = [userId, title, subtitle];
    }

    const existingResult = await query<{ id: number }>(existingQuery, existingParams);

    if (existingResult.rows.length > 0) {
      const existingId = existingResult.rows[0].id;
      const updateResult = await query<SearchHistory>(
        `UPDATE search_histories
         SET title = $1,
             subtitle = COALESCE($2, subtitle),
             place_id = COALESCE($3, place_id),
             latitude = COALESCE($4, latitude),
             longitude = COALESCE($5, longitude),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $6 AND user_id = $7
         RETURNING id, user_id, title, subtitle, place_id, latitude, longitude, created_at, updated_at`,
        [title, subtitle, placeId, lat, lng, existingId, userId]
      );
      return updateResult.rows[0];
    }

    const insertResult = await query<SearchHistory>(
      `INSERT INTO search_histories (user_id, title, subtitle, place_id, latitude, longitude, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id, user_id, title, subtitle, place_id, latitude, longitude, created_at, updated_at`,
      [userId, title, subtitle, placeId, lat, lng]
    );

    return insertResult.rows[0];
  }

  async deleteById(userId: number, id: number): Promise<boolean> {
    const result = await query(
      `DELETE FROM search_histories WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async clearAll(userId: number): Promise<number> {
    const result = await query(
      `DELETE FROM search_histories WHERE user_id = $1`,
      [userId]
    );
    return result.rowCount ?? 0;
  }
}

export const searchHistoryRepository = new SearchHistoryRepository();
export default searchHistoryRepository;

