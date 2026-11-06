import { type Request, type Response, type NextFunction } from 'express';
import adminService, { AdminService } from './admin.service.js';
import userService from '../users/user.service.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import type { DashboardFilterOptions } from './admin.types.js';

export class AdminController {
  constructor(private readonly service: AdminService = adminService) {}

  // --- Dashboard & Analytics ---
  getDashboardSummary = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const options: DashboardFilterOptions = {
        period: req.query.period ? (String(req.query.period) as any) : undefined,
        startDate: req.query.startDate ? String(req.query.startDate) : undefined,
        endDate: req.query.endDate ? String(req.query.endDate) : undefined,
      };
      const summary = await this.service.getDashboardSummary(options);
      sendSuccess(res, 'Dashboard summary statistics retrieved', summary, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch dashboard summary', 400);
    }
  };

  getHazardAnalytics = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const options: DashboardFilterOptions = {
        period: req.query.period ? (String(req.query.period) as any) : undefined,
        startDate: req.query.startDate ? String(req.query.startDate) : undefined,
        endDate: req.query.endDate ? String(req.query.endDate) : undefined,
      };
      const analytics = await this.service.getHazardAnalytics(options);
      sendSuccess(res, 'Hazard analytics retrieved', analytics, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch hazard analytics', 400);
    }
  };

  getUserAnalytics = async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const analytics = await this.service.getUserAnalytics();
      sendSuccess(res, 'User analytics retrieved', analytics, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch user analytics', 400);
    }
  };

  getJourneyAnalytics = async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const analytics = await this.service.getJourneyAnalytics();
      sendSuccess(res, 'Journey analytics retrieved', analytics, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch journey analytics', 400);
    }
  };

  getReportAnalytics = async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const analytics = await this.service.getReportAnalytics();
      sendSuccess(res, 'Report trends retrieved', analytics, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch report analytics', 400);
    }
  };

  getDashboardActivity = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 10;
      const result = await this.service.getDashboardActivity({ page, limit });
      sendSuccess(res, 'Dashboard recent activity retrieved successfully', result.activities, 200, result.pagination);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch dashboard activity', 400);
    }
  };

  // --- Admin User Management ---
  getUsers = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 10;
      const search = req.query.search ? String(req.query.search) : undefined;
      const role = req.query.role ? String(req.query.role) : undefined;
      const status = req.query.status ? String(req.query.status) : undefined;
      const transport_mode = req.query.transport_mode ? String(req.query.transport_mode) : undefined;

      const result = await userService.getUsers({
        page,
        limit,
        search,
        role,
        status,
        transport_mode,
      });

      sendSuccess(res, 'Admin users retrieved successfully', result.users, 200, result.pagination);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch users', 400);
    }
  };

  getUserById = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const userId = String(req.params.id);
      const user = await this.service.getUserDetail(userId);
      sendSuccess(res, 'User details retrieved successfully', user, 200);
    } catch (error: any) {
      sendError(res, error.message || 'User not found', 404);
    }
  };

  getUserActivity = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const userId = String(req.params.id);
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;

      const result = await this.service.getUserActivityTimeline(userId, { page, limit });
      sendSuccess(res, 'User activities retrieved successfully', result.activities, 200, result.pagination);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch user activities', 400);
    }
  };

  updateUserStatus = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const userId = String(req.params.id || req.params.userId);
      const { status } = req.body;
      const adminId = req.admin?.id || req.user?.id;

      if (!status || !['ACTIVE', 'SUSPENDED'].includes(status.toUpperCase())) {
        sendError(res, "Status must be 'ACTIVE' or 'SUSPENDED'", 400);
        return;
      }

      const updated = await this.service.updateUserStatus(userId, status.toUpperCase() as any, adminId);
      sendSuccess(res, `User status updated to ${status}`, updated, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to update user status', 400);
    }
  };

  deleteUser = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const userId = String(req.params.id);
      await userService.deleteUser(userId);
      sendSuccess(res, 'User successfully deleted (soft delete)', null, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to delete user', 400);
    }
  };

  // --- Content Management ---
  getPublicContent = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const slug = String(req.params.slug);
      const page = await this.service.getContentBySlug(slug);
      sendSuccess(res, 'Content page retrieved successfully', page, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Content page not found', 404);
    }
  };

  getAllContent = async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const pages = await this.service.getAllContent(false);
      sendSuccess(res, 'Content pages retrieved successfully', pages, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch content pages', 400);
    }
  };

  createContent = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const adminId = req.admin?.id || req.user?.id;
      const created = await this.service.createContent(req.body, adminId);
      sendSuccess(res, 'Content page created successfully', created, 201);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to create content page', 400);
    }
  };

  updateContent = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);
      const adminId = req.admin?.id || req.user?.id;
      const updated = await this.service.updateContent(id, req.body, adminId);
      sendSuccess(res, 'Content page updated successfully', updated, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to update content page', 400);
    }
  };

  deleteContent = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);
      const adminId = req.admin?.id || req.user?.id;
      await this.service.deleteContent(id, adminId);
      sendSuccess(res, 'Content page deleted successfully', null, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to delete content page', 400);
    }
  };

  // --- Settings ---
  getPublicSettings = async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const settings = await this.service.getAllSettings();
      sendSuccess(res, 'Public settings retrieved', settings, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch settings', 400);
    }
  };

  getAllSettings = async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const settings = await this.service.getAllSettings();
      sendSuccess(res, 'All settings retrieved successfully', settings, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch settings', 400);
    }
  };

  getSettingByKey = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const key = String(req.params.key);
      const setting = await this.service.getSettingByKey(key);
      sendSuccess(res, 'Setting retrieved successfully', setting, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Setting not found', 404);
    }
  };

  updateSetting = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const key = String(req.params.key);
      const adminId = req.admin?.id || req.user?.id;
      const { value, description } = req.body;
      const updated = await this.service.updateSetting(key, value, description, adminId);
      sendSuccess(res, `Setting '${key}' updated successfully`, updated, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to update setting', 400);
    }
  };

  // --- Activity Logs ---
  getActivityLogs = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
      const actor_type = req.query.actor_type ? String(req.query.actor_type) : undefined;
      const actor_id = req.query.actor_id ? parseInt(String(req.query.actor_id), 10) : undefined;
      const entity_type = req.query.entity_type ? String(req.query.entity_type) : undefined;
      const action = req.query.action ? String(req.query.action) : undefined;

      const result = await this.service.getActivityLogs({
        actor_type,
        actor_id,
        entity_type,
        action,
        page,
        limit,
      });

      sendSuccess(res, 'Activity logs retrieved successfully', result.logs, 200, result.pagination);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch activity logs', 400);
    }
  };

  // --- Dataset Imports ---
  uploadDataset = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const adminId = req.admin?.id || req.user?.id || 1;
      const { filename, csvContent } = req.body;

      if (!csvContent || typeof csvContent !== 'string') {
        sendError(res, 'csvContent string is required in request body', 400);
        return;
      }

      const result = await this.service.uploadAndValidateDataset(
        adminId,
        filename || 'dataset.csv',
        csvContent
      );
      sendSuccess(res, 'Dataset uploaded and validated successfully', result, 201);
    } catch (error: any) {
      sendError(res, error.message || 'Dataset upload and validation failed', 400);
    }
  };

  validateDataset = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);
      const dataset = await this.service.previewDataset(id);
      sendSuccess(res, 'Dataset validation report retrieved', dataset, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to validate dataset', 400);
    }
  };

  previewDataset = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);
      const dataset = await this.service.previewDataset(id);
      sendSuccess(res, 'Dataset preview retrieved successfully', dataset, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Dataset not found', 404);
    }
  };

  importDataset = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);
      const adminId = req.admin?.id || req.user?.id || 1;
      const dataset = await this.service.executeDatasetImport(adminId, id);
      sendSuccess(res, 'Dataset records imported into hazards successfully', dataset, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Dataset import failed', 400);
    }
  };

  getDatasetHistory = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 10;
      const result = await this.service.getDatasetImportHistory(page, limit);
      sendSuccess(res, 'Dataset import history retrieved', result.imports, 200, result.pagination);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch dataset history', 400);
    }
  };

  updateDatasetRow = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);
      const rowNumber = parseInt(String(req.params.rowNumber), 10);
      const updated = await this.service.updateDatasetRow(id, rowNumber, req.body);
      sendSuccess(res, 'Dataset row updated and validated successfully', updated, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to update dataset row', 400);
    }
  };

  deleteDataset = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);
      await this.service.deleteDatasetImport(id);
      sendSuccess(res, 'Dataset record deleted successfully', null, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to delete dataset', 400);
    }
  };
}

export default new AdminController();
