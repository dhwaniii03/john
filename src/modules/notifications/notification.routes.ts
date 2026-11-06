import express from 'express';
import notificationController from './notification.controller.js';
import { authenticate, authorize } from '../../middleware/auth.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middleware/validation.middleware.js';
import {
  createNotificationSchema,
  updateNotificationSchema,
  notificationIdParamSchema,
  notificationQuerySchema,
} from './notification.validation.js';

const router = express.Router();

router.use(authenticate);

router.get('/', validateQuery(notificationQuerySchema), notificationController.getNotifications);
router.get(
  '/:id',
  validateParams(notificationIdParamSchema),
  notificationController.getNotificationById
);
router.post(
  '/',
  authorize('admin', 'GLOBAL_ADMIN'),
  validateBody(createNotificationSchema),
  notificationController.createNotification
);
router.put(
  '/:id',
  authorize('admin', 'GLOBAL_ADMIN'),
  validateParams(notificationIdParamSchema),
  validateBody(updateNotificationSchema),
  notificationController.updateNotification
);
router.patch('/read-all', notificationController.markAllAsRead);
router.patch(
  '/:id/read',
  validateParams(notificationIdParamSchema),
  notificationController.markAsRead
);
router.delete(
  '/:id',
  validateParams(notificationIdParamSchema),
  notificationController.deleteNotification
);

export default router;
