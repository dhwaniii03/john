import { type Request, type Response, type NextFunction } from 'express';
import notificationService, { NotificationService } from './notification.service.js';
import { sendSuccess, sendError } from '../../utils/response.js';

export class NotificationController {
  constructor(private readonly service: NotificationService = notificationService) {}

  getNotifications = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        sendError(res, 'Authentication required', 401);
        return;
      }
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 10;
      const is_read =
        req.query.is_read !== undefined
          ? String(req.query.is_read) === 'true'
          : undefined;
      const type = req.query.type ? String(req.query.type) : undefined;
      const status = req.query.status ? String(req.query.status) : undefined;
      const isAdmin =
        req.user?.role === 'admin' ||
        req.user?.role === 'GLOBAL_ADMIN' ||
        Boolean((req as any).admin);

      const result = await this.service.getNotifications({
        user_id: req.user.id,
        isAdmin,
        is_read,
        type,
        status,
        page,
        limit,
      });

      sendSuccess(
        res,
        'Notifications retrieved successfully',
        result.notifications,
        200,
        {
          ...result.pagination,
          unreadCount: result.unreadCount,
        }
      );
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch notifications', 400);
    }
  };

  getNotificationById = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);
      const isAdmin =
        req.user?.role === 'admin' ||
        req.user?.role === 'GLOBAL_ADMIN' ||
        Boolean(req.admin);
      const notification = await this.service.getNotificationById(
        id,
        req.user?.id,
        isAdmin
      );
      sendSuccess(res, 'Notification retrieved successfully', notification, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Notification not found', 404);
    }
  };

  createNotification = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const payload = {
        ...req.body,
        user_id: req.body.user_id || req.user?.id || 1,
      };
      const notification = await this.service.createNotification(payload);
      sendSuccess(res, 'Notification created successfully', notification, 201);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to create notification', 400);
    }
  };

  updateNotification = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);
      const updated = await this.service.updateNotification(id, req.body);
      sendSuccess(res, 'Notification updated successfully', updated, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to update notification', 400);
    }
  };

  markAsRead = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        sendError(res, 'Authentication required', 401);
        return;
      }
      const id = String(req.params.id);
      const notification = await this.service.markAsRead(id, req.user.id);
      sendSuccess(res, 'Notification marked as read', notification, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to mark notification as read', 400);
    }
  };

  markAllAsRead = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        sendError(res, 'Authentication required', 401);
        return;
      }
      const result = await this.service.markAllAsRead(req.user.id);
      sendSuccess(res, 'All notifications marked as read', result, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to mark all notifications as read', 400);
    }
  };

  deleteNotification = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        sendError(res, 'Authentication required', 401);
        return;
      }
      const id = String(req.params.id);
      const isAdmin =
        req.user?.role === 'admin' ||
        req.user?.role === 'GLOBAL_ADMIN' ||
        Boolean(req.admin);
      await this.service.deleteNotification(id, req.user.id, isAdmin);
      sendSuccess(res, 'Notification deleted successfully', null, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to delete notification', 400);
    }
  };
}

export default new NotificationController();
