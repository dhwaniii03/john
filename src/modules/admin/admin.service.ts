import adminRepository, { AdminRepository } from './admin.repository.js';
import userRepository from '../users/user.repository.js';
import hazardRepository from '../hazards/hazard.repository.js';
import { pool } from '../../config/database.js';
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
  ActivityLogFilterOptions,
  DatasetImport,
  DashboardFilterOptions,
  AdminUserDetail,
} from './admin.types.js';
import { getPaginationMeta } from '../../utils/pagination.js';

export class AdminService {
  constructor(private readonly repo: AdminRepository = adminRepository) {}

  // --- Dashboard & Analytics ---
  async getDashboardSummary(options?: DashboardFilterOptions): Promise<DashboardSummary> {
    return this.repo.getDashboardSummary(options);
  }

  async getHazardAnalytics(options?: DashboardFilterOptions): Promise<HazardAnalytics> {
    return this.repo.getHazardAnalytics(options);
  }

  async getUserAnalytics(): Promise<UserAnalytics> {
    return this.repo.getUserAnalytics();
  }

  async getJourneyAnalytics(): Promise<JourneyAnalytics> {
    return this.repo.getJourneyAnalytics();
  }

  async getReportAnalytics(): Promise<ReportAnalytics> {
    return this.repo.getReportAnalytics();
  }

  async getDashboardActivity(options?: { page?: number; limit?: number }) {
    const page = Math.max(1, options?.page || 1);
    const limit = Math.max(1, Math.min(100, options?.limit || 10));
    const { activities, total } = await this.repo.getDashboardRecentActivity({ page, limit });
    const pagination = getPaginationMeta(total, page, limit);
    return { activities, pagination };
  }

  // --- Admin User Management ---
  async getUserDetail(userId: string | number): Promise<AdminUserDetail> {
    const user = await this.repo.getUserDetail(userId);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  async getUserActivityTimeline(
    userId: string | number,
    options?: { page?: number; limit?: number }
  ) {
    const page = Math.max(1, options?.page || 1);
    const limit = Math.max(1, Math.min(100, options?.limit || 50));
    const { activities, total } = await this.repo.getUserActivityTimeline(userId, { page, limit });
    const pagination = getPaginationMeta(total, page, limit);
    return { activities, pagination };
  }

  async updateUserStatus(
    userId: string | number,
    status: 'ACTIVE' | 'SUSPENDED',
    adminId?: number
  ) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const { pool } = await import('../../config/database.js');
    await pool.query('UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2', [
      status.toUpperCase(),
      userId,
    ]);

    if (adminId) {
      await this.repo.createActivityLog(
        'ADMIN',
        adminId,
        `UPDATE_USER_STATUS_${status.toUpperCase()}`,
        'USER',
        Number(userId),
        { previous_status: user.status, new_status: status }
      );
    }

    return userRepository.findById(userId);
  }

  // --- Content Management ---
  async getContentBySlug(slug: string): Promise<ContentPage> {
    const page = await this.repo.findContentBySlug(slug);
    if (!page) {
      throw new Error('Content page not found');
    }
    return page;
  }

  async getAllContent(onlyPublished = false): Promise<ContentPage[]> {
    return this.repo.getAllContent(onlyPublished);
  }

  async createContent(data: CreateContentPageDTO, adminId?: number): Promise<ContentPage> {
    const created = await this.repo.createContent(data);
    if (adminId) {
      await this.repo.createActivityLog(
        'ADMIN',
        adminId,
        'CREATE_CONTENT_PAGE',
        'CONTENT',
        created.id,
        {
          slug: created.slug,
        }
      );
    }
    return created;
  }

  async updateContent(
    id: string | number,
    data: UpdateContentPageDTO,
    adminId?: number
  ): Promise<ContentPage> {
    const updated = await this.repo.updateContent(id, data);
    if (!updated) {
      throw new Error('Content page not found');
    }
    if (adminId) {
      await this.repo.createActivityLog(
        'ADMIN',
        adminId,
        'UPDATE_CONTENT_PAGE',
        'CONTENT',
        updated.id,
        {
          slug: updated.slug,
        }
      );
    }
    return updated;
  }

  async deleteContent(id: string | number, adminId?: number): Promise<void> {
    const deleted = await this.repo.deleteContent(id);
    if (!deleted) {
      throw new Error('Content page not found or already deleted');
    }
    if (adminId) {
      await this.repo.createActivityLog(
        'ADMIN',
        adminId,
        'DELETE_CONTENT_PAGE',
        'CONTENT',
        Number(id)
      );
    }
  }

  // --- Settings ---
  async getAllSettings(): Promise<Record<string, any>> {
    const settingsList = await this.repo.getAllSettings();
    const result: Record<string, any> = {};
    for (const setting of settingsList) {
      result[setting.key] = setting.value;
    }
    return result;
  }

  async getSettingByKey(key: string): Promise<SystemSetting> {
    const setting = await this.repo.getSettingByKey(key);
    if (!setting) {
      throw new Error(`Setting '${key}' not found`);
    }
    return setting;
  }

  async updateSetting(
    key: string,
    value: any,
    description?: string,
    adminId?: number
  ): Promise<SystemSetting> {
    const setting = await this.repo.upsertSetting(key, value, description, adminId);
    if (adminId) {
      await this.repo.createActivityLog('ADMIN', adminId, 'UPDATE_SETTING', 'SETTING', setting.id, {
        key,
      });
    }
    return setting;
  }

  // --- Activity Logs ---
  async getActivityLogs(options: ActivityLogFilterOptions) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 20));

    const { logs, total } = await this.repo.getActivityLogs({ ...options, page, limit });
    const pagination = getPaginationMeta(total, page, limit);

    return { logs, pagination };
  }

  // --- Dataset Import Workflow ---
  async uploadAndValidateDataset(
    adminId: number,
    filename: string,
    csvContent: string
  ): Promise<DatasetImport> {
    const lines = csvContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      throw new Error('CSV must contain a header row and at least one data row');
    }

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/['"]/g, ''));
    const requiredColumns = ['latitude', 'longitude'];
    const hasRequired = requiredColumns.every((col) => headers.includes(col));

    if (!hasRequired) {
      throw new Error(
        `CSV must contain at least 'latitude' and 'longitude' columns. Found: ${headers.join(', ')}`
      );
    }

    const parsedRows: any[] = [];
    const errors: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (!line) continue;
      const cols = line.split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));

      const rowObj: Record<string, any> = {};
      headers.forEach((h, index) => {
        rowObj[h] = cols[index] || '';
      });

      const lat = parseFloat(rowObj['latitude']);
      const lng = parseFloat(rowObj['longitude']);
      const isInvalidCoords = isNaN(lat) || lat < -90 || lat > 90 || isNaN(lng) || lng < -180 || lng > 180;

      if (isInvalidCoords) {
        errors.push({
          row: i,
          rowNumber: i,
          title: rowObj['title'] || rowObj['name'] || rowObj['hazard_type'] || `Row #${i}`,
          category: rowObj['category'] || rowObj['category_slug'] || 'other',
          address: rowObj['address'] || null,
          error: `Invalid coordinates: lat=${rowObj['latitude']}, lng=${rowObj['longitude']}`,
          reason: `Invalid coordinates: lat=${rowObj['latitude']}, lng=${rowObj['longitude']}`,
        });
      }

      parsedRows.push({
        rowNumber: i,
        title: rowObj['title'] || rowObj['name'] || rowObj['hazard_type'] || `Hazard #${i}`,
        description: rowObj['description'] || rowObj['details'] || null,
        latitude: isNaN(lat) ? null : lat,
        longitude: isNaN(lng) ? null : lng,
        raw_latitude: rowObj['latitude'] || '',
        raw_longitude: rowObj['longitude'] || '',
        severity: (rowObj['severity'] || 'MEDIUM').toUpperCase(),
        status: isInvalidCoords ? 'ERROR' : (rowObj['status'] || 'ACTIVE').toUpperCase(),
        category: rowObj['category'] || rowObj['category_slug'] || 'other',
        address: rowObj['address'] || null,
        hasError: isInvalidCoords,
        error: isInvalidCoords ? `Invalid coordinates: lat=${rowObj['latitude']}, lng=${rowObj['longitude']}` : null,
      });
    }

    const datasetImport = await this.repo.createDatasetImport({
      admin_id: adminId,
      filename,
      file_size: Buffer.byteLength(csvContent, 'utf8'),
      total_rows: parsedRows.length,
      raw_preview: parsedRows,
    });

    if (errors.length > 0) {
      await this.repo.updateDatasetImport(datasetImport.id, {
        failed_rows: errors.length,
        error_summary: errors,
      });
    }

    return this.repo.findDatasetImportById(datasetImport.id) as Promise<DatasetImport>;
  }

  async previewDataset(importId: string | number): Promise<DatasetImport> {
    const dataset = await this.repo.findDatasetImportById(importId);
    if (!dataset) {
      throw new Error('Dataset import record not found');
    }
    return dataset;
  }

  async executeDatasetImport(adminId: number, importId: string | number): Promise<DatasetImport> {
    const dataset = await this.repo.findDatasetImportById(importId);
    if (!dataset) {
      throw new Error('Dataset import record not found');
    }

    if (dataset.status === 'IMPORTED') {
      throw new Error('This dataset has already been imported');
    }

    const categories = await hazardRepository.getCategories();
    const categoryMap = new Map<string, number>();
    categories.forEach((c) => {
      categoryMap.set(c.slug.toLowerCase(), c.id);
      categoryMap.set(c.name.toLowerCase(), c.id);
    });

    const rowsToImport = dataset.raw_preview || [];
    let importedCount = 0;
    let failedCount = dataset.failed_rows || 0;
    const errors = dataset.error_summary ? [...dataset.error_summary] : [];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const row of rowsToImport) {
        if (row.status === 'ERROR' || row.hasError) {
          continue;
        }
        const lat = typeof row.latitude === 'number' ? row.latitude : parseFloat(row.latitude);
        const lng = typeof row.longitude === 'number' ? row.longitude : parseFloat(row.longitude);
        if (isNaN(lat) || lat < -90 || lat > 90 || isNaN(lng) || lng < -180 || lng > 180) {
          continue;
        }

        try {
          const categoryId =
            categoryMap.get(String(row.category || '').toLowerCase()) ||
            categoryMap.get('other') ||
            null;

          await client.query(
            `INSERT INTO hazards (
              category_id, title, description, latitude, longitude, severity, status, source, address
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'OFFICIAL_DATASET', $8)`,
            [
              categoryId,
              row.title,
              row.description,
              lat,
              lng,
              row.severity || 'MEDIUM',
              row.status || 'ACTIVE',
              row.address || null,
            ]
          );
          importedCount++;
        } catch (err: any) {
          failedCount++;
          errors.push({ rowData: row, error: err.message });
        }
      }

      await client.query('COMMIT');

      await this.repo.updateDatasetImport(importId, {
        status: 'IMPORTED',
        imported_rows: importedCount,
        failed_rows: failedCount,
        error_summary: errors,
      });

      await this.repo.createActivityLog(
        'ADMIN',
        adminId,
        'IMPORT_DATASET',
        'DATASET_IMPORT',
        Number(importId),
        { importedCount, failedCount, filename: dataset.filename }
      );

      return (await this.repo.findDatasetImportById(importId)) as DatasetImport;
    } catch (error) {
      await client.query('ROLLBACK');
      await this.repo.updateDatasetImport(importId, {
        status: 'FAILED',
        error_summary: [{ error: 'Transaction failed during batch insert' }],
      });
      throw error;
    } finally {
      client.release();
    }
  }

  async updateDatasetRow(
    importId: string | number,
    rowNumber: number,
    updatedData: {
      title?: string;
      latitude: number;
      longitude: number;
      severity?: string;
      category?: string;
      address?: string;
      description?: string;
    }
  ): Promise<DatasetImport> {
    const dataset = await this.repo.findDatasetImportById(importId);
    if (!dataset) {
      throw new Error('Dataset import record not found');
    }

    const rows: any[] = dataset.raw_preview || [];
    const rowIndex = rows.findIndex((r: any) => r.rowNumber === rowNumber);

    const lat = typeof updatedData.latitude === 'number' ? updatedData.latitude : parseFloat(String(updatedData.latitude));
    const lng = typeof updatedData.longitude === 'number' ? updatedData.longitude : parseFloat(String(updatedData.longitude));

    if (isNaN(lat) || lat < -90 || lat > 90 || isNaN(lng) || lng < -180 || lng > 180) {
      throw new Error(`Invalid coordinates: lat=${updatedData.latitude}, lng=${updatedData.longitude}`);
    }

    const updatedRow = {
      rowNumber,
      title: updatedData.title || (rowIndex >= 0 ? rows[rowIndex].title : `Hazard #${rowNumber}`),
      description: updatedData.description ?? (rowIndex >= 0 ? rows[rowIndex].description : null),
      latitude: lat,
      longitude: lng,
      raw_latitude: String(lat),
      raw_longitude: String(lng),
      severity: (updatedData.severity || (rowIndex >= 0 ? rows[rowIndex].severity : 'MEDIUM')).toUpperCase(),
      status: 'ACTIVE',
      category: updatedData.category || (rowIndex >= 0 ? rows[rowIndex].category : 'other'),
      address: updatedData.address ?? (rowIndex >= 0 ? rows[rowIndex].address : null),
      hasError: false,
      error: null,
    };

    if (rowIndex >= 0) {
      rows[rowIndex] = updatedRow;
    } else {
      rows.push(updatedRow);
      rows.sort((a, b) => (a.rowNumber || 0) - (b.rowNumber || 0));
    }

    const updatedErrors = (dataset.error_summary || []).filter(
      (e: any) => e.rowNumber !== rowNumber && e.row !== rowNumber
    );

    const updated = await this.repo.updateDatasetImport(importId, {
      raw_preview: rows,
      error_summary: updatedErrors,
      failed_rows: updatedErrors.length,
      status: updatedErrors.length === 0 ? 'VALIDATED' : dataset.status,
    });

    return (updated || (await this.repo.findDatasetImportById(importId))) as DatasetImport;
  }

  async getDatasetImportHistory(page = 1, limit = 10) {
    const { imports, total } = await this.repo.getDatasetImports(page, limit);
    const pagination = getPaginationMeta(total, page, limit);
    return { imports, pagination };
  }

  async deleteDatasetImport(importId: string | number): Promise<boolean> {
    return this.repo.deleteDatasetImport(importId);
  }
}

export default new AdminService();
