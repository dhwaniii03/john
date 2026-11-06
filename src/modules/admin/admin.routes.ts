import express from 'express';
import adminController from './admin.controller.js';
import authController from '../auth/auth.controller.js';
import hazardController from '../hazards/hazard.controller.js';
import { uploadMiddleware } from '../uploads/upload.service.js';
import { authenticateAdmin } from '../../middleware/auth.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middleware/validation.middleware.js';
import { adminLoginSchema } from '../auth/auth.validation.js';
import {
  createHazardSchema,
  updateHazardSchema,
  hazardStatusSchema,
  hazardIdParamSchema,
  hazardQuerySchema,
  reportIdParamSchema,
  reportQuerySchema,
  approveReportSchema,
  rejectReportSchema,
  categoryIdParamSchema,
  createHazardCategorySchema,
  updateHazardCategorySchema,
} from '../hazards/hazard.validation.js';
import { userIdParamSchema, userQuerySchema } from '../users/user.validation.js';

const router = express.Router();

// 1. Admin Authentication (Public Login)
router.post('/auth/login', validateBody(adminLoginSchema), authController.adminLogin);
router.post('/auth/logout', authController.adminLogout);

// All subsequent admin routes require Admin Authentication
router.use(authenticateAdmin);

// 2. Admin Profile
router.get('/auth/me', authController.adminMe);

// 3. Dashboard & Analytics
router.get('/dashboard/summary', adminController.getDashboardSummary);
router.get('/dashboard/hazards', adminController.getHazardAnalytics);
router.get('/dashboard/users', adminController.getUserAnalytics);
router.get('/dashboard/journeys', adminController.getJourneyAnalytics);
router.get('/dashboard/reports', adminController.getReportAnalytics);
router.get('/dashboard/activity', adminController.getDashboardActivity);

// 4. User Management
router.get('/users', validateQuery(userQuerySchema), adminController.getUsers);
router.get('/users/:id', validateParams(userIdParamSchema), adminController.getUserById);
router.get('/users/:id/activity', validateParams(userIdParamSchema), adminController.getUserActivity);
router.patch(
  '/users/:id/status',
  validateParams(userIdParamSchema),
  adminController.updateUserStatus
);
router.delete('/users/:id', validateParams(userIdParamSchema), adminController.deleteUser);

// 5. Hazard Management
router.post('/hazards/upload-image', uploadMiddleware.single('file'), hazardController.uploadHazardImage);
router.get('/hazards', validateQuery(hazardQuerySchema), hazardController.getHazards);
router.get('/hazards/:id', validateParams(hazardIdParamSchema), hazardController.getHazardById);
router.post('/hazards', validateBody(createHazardSchema), hazardController.createHazard);
router.put(
  '/hazards/:id',
  validateParams(hazardIdParamSchema),
  validateBody(updateHazardSchema),
  hazardController.updateHazard
);
router.patch(
  '/hazards/:id/status',
  validateParams(hazardIdParamSchema),
  validateBody(hazardStatusSchema),
  hazardController.updateHazardStatus
);
router.delete('/hazards/:id', validateParams(hazardIdParamSchema), hazardController.deleteHazard);

// Hazard Categories Management
router.get('/hazard-categories', hazardController.getAdminCategories);
router.get(
  '/hazard-categories/:id',
  validateParams(categoryIdParamSchema),
  hazardController.getCategoryById
);
router.post(
  '/hazard-categories',
  validateBody(createHazardCategorySchema),
  hazardController.createCategory
);
router.put(
  '/hazard-categories/:id',
  validateParams(categoryIdParamSchema),
  validateBody(updateHazardCategorySchema),
  hazardController.updateCategory
);
router.delete(
  '/hazard-categories/:id',
  validateParams(categoryIdParamSchema),
  hazardController.deleteCategory
);

// 6. Hazard Report Moderation
router.get('/hazard-reports', validateQuery(reportQuerySchema), hazardController.getAdminReports);
router.get(
  '/hazard-reports/:id',
  validateParams(reportIdParamSchema),
  hazardController.getReportById
);
router.patch(
  '/hazard-reports/:id/approve',
  validateParams(reportIdParamSchema),
  validateBody(approveReportSchema),
  hazardController.approveReport
);
router.patch(
  '/hazard-reports/:id/reject',
  validateParams(reportIdParamSchema),
  validateBody(rejectReportSchema),
  hazardController.rejectReport
);

// 7. Content Management
router.get('/content', adminController.getAllContent);
router.post('/content', adminController.createContent);
router.put('/content/:id', adminController.updateContent);
router.delete('/content/:id', adminController.deleteContent);

// 8. Settings
router.get('/settings', adminController.getAllSettings);
router.get('/settings/:key', adminController.getSettingByKey);
router.put('/settings/:key', adminController.updateSetting);

// 9. Activity Logs
router.get('/activity-logs', adminController.getActivityLogs);

// 10. Dataset Imports
router.post('/datasets/upload', adminController.uploadDataset);
router.post('/datasets/:id/validate', adminController.validateDataset);
router.get('/datasets/:id/preview', adminController.previewDataset);
router.post('/datasets/:id/import', adminController.importDataset);
router.put('/datasets/:id/rows/:rowNumber', adminController.updateDatasetRow);
router.delete('/datasets/:id', adminController.deleteDataset);
router.get('/datasets/history', adminController.getDatasetHistory);

export default router;
