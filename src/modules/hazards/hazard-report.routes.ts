import express from 'express';
import hazardController from './hazard.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  validateBody,
  validateParams,
} from '../../middleware/validation.middleware.js';
import {
  createHazardReportSchema,
  reportIdParamSchema,
} from './hazard.validation.js';
import { uploadMiddleware } from '../uploads/upload.service.js';

const router = express.Router();

router.use(authenticate);

router.post('/upload-image', uploadMiddleware.single('file'), hazardController.uploadHazardImage);
router.post('/', validateBody(createHazardReportSchema), hazardController.createReport);
router.get('/my', hazardController.getMyReports);
router.get('/:id', validateParams(reportIdParamSchema), hazardController.getReportById);

export default router;
