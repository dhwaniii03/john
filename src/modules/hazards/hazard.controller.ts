import { type Request, type Response, type NextFunction } from 'express';
import hazardService, { HazardService } from './hazard.service.js';
import uploadService from '../uploads/upload.service.js';
import { sendSuccess, sendError } from '../../utils/response.js';

export class HazardController {
  constructor(private readonly service: HazardService = hazardService) {}

  private formatHazard = (req: Request, h: any) => {
    if (!h) return h;
    return {
      ...h,
      image_url: uploadService.formatUrl(req, h.image_url),
    };
  };

  private formatReport = (req: Request, r: any) => {
    if (!r) return r;
    return {
      ...r,
      image_url: uploadService.formatUrl(req, r.image_url),
    };
  };

  getCategories = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const onlyActive = !(req.query.all === 'true' || req.query.only_active === 'false');
      const categories = await this.service.getCategories(onlyActive);
      sendSuccess(res, 'Hazard categories retrieved successfully', categories, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch categories', 400);
    }
  };

  getAdminCategories = async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const categories = await this.service.getCategories(false);
      sendSuccess(res, 'Hazard categories retrieved successfully', categories, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch categories', 400);
    }
  };

  getCategoryById = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) {
        sendError(res, 'Invalid category ID', 400);
        return;
      }
      const category = await this.service.getCategoryById(id);
      sendSuccess(res, 'Hazard category retrieved successfully', category, 200);
    } catch (error: any) {
      sendError(
        res,
        error.message || 'Failed to fetch category',
        error.message.includes('not found') ? 404 : 400
      );
    }
  };

  createCategory = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const category = await this.service.createCategory(req.body);
      sendSuccess(res, 'Hazard category created successfully', category, 201);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to create category', 400);
    }
  };

  updateCategory = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) {
        sendError(res, 'Invalid category ID', 400);
        return;
      }
      const category = await this.service.updateCategory(id, req.body);
      sendSuccess(res, 'Hazard category updated successfully', category, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to update category', 400);
    }
  };

  deleteCategory = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) {
        sendError(res, 'Invalid category ID', 400);
        return;
      }
      await this.service.deleteCategory(id);
      sendSuccess(res, 'Hazard category deleted successfully', null, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to delete category', 400);
    }
  };

  // --- Image Upload for Hazard ---
  uploadHazardImage = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      let relativePath: string | null = null;
      if (req.file) {
        relativePath = `/uploads/hazards/${req.file.filename}`;
      } else if (req.body.image || req.body.base64 || req.body.file) {
        const raw = req.body.image || req.body.base64 || req.body.file;
        relativePath = uploadService.saveBase64Image(raw, 'hazards');
      } else {
        sendError(res, 'No image file or base64 data provided in request', 400);
        return;
      }

      const fullUrl = uploadService.formatUrl(req, relativePath);
      sendSuccess(
        res,
        'Hazard image uploaded successfully',
        {
          url: fullUrl,
          path: relativePath,
          filename: relativePath.split('/').pop(),
        },
        201
      );
    } catch (error: any) {
      sendError(res, error.message || 'Failed to upload hazard image', 400);
    }
  };

  // --- Hazards ---
  getHazards = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 10;
      const category_id = req.query.category_id
        ? parseInt(String(req.query.category_id), 10)
        : undefined;
      const category_slug = req.query.category_slug ? String(req.query.category_slug) : undefined;
      const severity = req.query.severity ? String(req.query.severity) : undefined;
      const status = req.query.status ? String(req.query.status) : undefined;
      const source = req.query.source ? String(req.query.source) : undefined;
      const search = req.query.search ? String(req.query.search) : undefined;

      const result = await this.service.getHazards({
        page,
        limit,
        category_id,
        category_slug,
        severity,
        status,
        source,
        search,
      });

      const formatted = result.hazards.map((h) => this.formatHazard(req, h));
      sendSuccess(res, 'Hazards retrieved successfully', formatted, 200, result.pagination);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch hazards', 400);
    }
  };

  getNearbyHazards = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const latitude = parseFloat(String(req.query.latitude));
      const longitude = parseFloat(String(req.query.longitude));
      const radiusKm = req.query.radius ? parseFloat(String(req.query.radius)) : 10;
      const status = req.query.status ? String(req.query.status) : 'ACTIVE';
      const severity = req.query.severity ? String(req.query.severity) : undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;

      if (isNaN(latitude) || isNaN(longitude)) {
        sendError(res, 'Valid latitude and longitude query parameters are required', 400);
        return;
      }

      const hazards = await this.service.getNearbyHazards({
        latitude,
        longitude,
        radiusKm,
        status,
        severity,
        limit,
      });

      const formatted = hazards.map((h) => this.formatHazard(req, h));
      sendSuccess(res, 'Nearby hazards retrieved successfully', formatted, 200, {
        count: formatted.length,
        radiusKm,
        center: { latitude, longitude },
      });
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch nearby hazards', 400);
    }
  };

  getHazardById = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);
      const hazard = await this.service.getHazardById(id);
      sendSuccess(res, 'Hazard retrieved successfully', this.formatHazard(req, hazard), 200);
    } catch (error: any) {
      sendError(res, error.message || 'Hazard not found', 404);
    }
  };

  createHazard = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const reported_by = req.user?.id || req.admin?.id;
      const source = req.admin ? 'ADMIN' : 'USER';
      const hazard = await this.service.createHazard({
        ...req.body,
        reported_by,
        source,
      });
      sendSuccess(res, 'Hazard created successfully', this.formatHazard(req, hazard), 201);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to create hazard', 400);
    }
  };

  updateHazard = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);
      const hazard = await this.service.updateHazard(id, req.body);
      sendSuccess(res, 'Hazard updated successfully', this.formatHazard(req, hazard), 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to update hazard', 400);
    }
  };

  updateHazardStatus = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);
      const { status } = req.body;
      const hazard = await this.service.updateHazardStatus(id, status);
      sendSuccess(res, 'Hazard status updated successfully', this.formatHazard(req, hazard), 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to update hazard status', 400);
    }
  };

  deleteHazard = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);
      await this.service.deleteHazard(id);
      sendSuccess(res, 'Hazard deleted successfully', null, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to delete hazard', 400);
    }
  };

  // --- Hazard Reporting ---
  createReport = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        sendError(res, 'Authentication required to report a hazard', 401);
        return;
      }
      const report = await this.service.createReport(req.user.id, req.body);
      sendSuccess(
        res,
        'Hazard report submitted successfully and is pending review',
        this.formatReport(req, report),
        201
      );
    } catch (error: any) {
      sendError(res, error.message || 'Failed to submit hazard report', 400);
    }
  };

  getMyReports = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        sendError(res, 'Authentication required', 401);
        return;
      }
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 10;
      const status = req.query.status ? String(req.query.status) : undefined;

      const result = await this.service.getReports({
        user_id: req.user.id,
        status,
        page,
        limit,
      });

      const formatted = result.reports.map((r) => this.formatReport(req, r));
      sendSuccess(
        res,
        'Your hazard reports retrieved successfully',
        formatted,
        200,
        result.pagination
      );
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch hazard reports', 400);
    }
  };

  getReportById = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);
      const isAdmin =
        !!req.admin || req.user?.role === 'admin' || req.user?.role === 'GLOBAL_ADMIN';
      const report = await this.service.getReportById(id, req.user?.id, isAdmin);
      sendSuccess(res, 'Hazard report retrieved successfully', this.formatReport(req, report), 200);
    } catch (error: any) {
      sendError(res, error.message || 'Hazard report not found', 404);
    }
  };

  // --- Admin Moderation ---
  getAdminReports = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 10;
      const status = req.query.status ? String(req.query.status) : undefined;
      const category_id = req.query.category_id
        ? parseInt(String(req.query.category_id), 10)
        : undefined;
      const category = req.query.category ? String(req.query.category).trim() : undefined;
      const search = req.query.search ? String(req.query.search) : undefined;

      const result = await this.service.getReports({
        status,
        category_id,
        category,
        search,
        page,
        limit,
      });

      const formatted = result.reports.map((r) => this.formatReport(req, r));
      sendSuccess(
        res,
        'Admin reports retrieved successfully',
        formatted,
        200,
        result.pagination
      );
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch admin reports', 400);
    }
  };

  approveReport = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const reportId = parseInt(String(req.params.id), 10);
      const adminId = req.admin?.id || req.user?.id || 1;

      const result = await this.service.approveReport(reportId, adminId, req.body);
      sendSuccess(res, 'Hazard report approved and hazard created', {
        report: this.formatReport(req, result.report),
        hazard: this.formatHazard(req, result.hazard),
      }, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to approve hazard report', 400);
    }
  };

  rejectReport = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const reportId = parseInt(String(req.params.id), 10);
      const adminId = req.admin?.id || req.user?.id || 1;
      const { rejection_reason } = req.body;

      const report = await this.service.rejectReport(reportId, adminId, rejection_reason);
      sendSuccess(res, 'Hazard report rejected', this.formatReport(req, report), 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to reject hazard report', 400);
    }
  };

  // --- Hazard Confirmation & Resolution ---
  confirmHazard = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);
      const userId = req.user?.id ? Number(req.user.id) : req.admin?.id ? Number(req.admin.id) : undefined;
      const hazard = await this.service.confirmHazard(id, userId);
      sendSuccess(res, 'Hazard confirmed successfully', this.formatHazard(req, hazard), 200);
    } catch (error: any) {
      const status = error.message?.includes('already confirmed')
        ? 409
        : error.message?.includes('not found')
          ? 404
          : 400;
      sendError(res, error.message || 'Failed to confirm hazard', status);
    }
  };

  resolveHazard = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);
      const userId = req.user?.id ? Number(req.user.id) : req.admin?.id ? Number(req.admin.id) : undefined;
      const isAdmin =
        !!req.admin || req.user?.role === 'admin' || req.user?.role === 'GLOBAL_ADMIN';
      const hazard = await this.service.resolveHazard(id, userId, isAdmin);
      sendSuccess(
        res,
        hazard.status === 'RESOLVED'
          ? 'Hazard has been marked as resolved'
          : 'Hazard resolution vote recorded',
        this.formatHazard(req, hazard),
        200
      );
    } catch (error: any) {
      const status = error.message?.includes('already submitted')
        ? 409
        : error.message?.includes('not found')
          ? 404
          : 400;
      sendError(res, error.message || 'Failed to resolve hazard', status);
    }
  };
}

export default new HazardController();
