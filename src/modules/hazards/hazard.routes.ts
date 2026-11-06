import express from 'express';
import hazardController from './hazard.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middleware/validation.middleware.js';
import {
  createHazardSchema,
  updateHazardSchema,
  hazardIdParamSchema,
  hazardQuerySchema,
  nearbyHazardQuerySchema,
} from './hazard.validation.js';
import { uploadMiddleware } from '../uploads/upload.service.js';

const router = express.Router();

// Public / General endpoints
router.get('/categories', hazardController.getCategories);
router.get('/nearby', validateQuery(nearbyHazardQuerySchema), hazardController.getNearbyHazards);
router.get('/', validateQuery(hazardQuerySchema), hazardController.getHazards);
router.get('/:id', validateParams(hazardIdParamSchema), hazardController.getHazardById);

// Authenticated endpoints
router.use(authenticate);

router.post('/upload-image', uploadMiddleware.single('file'), hazardController.uploadHazardImage);
router.post('/upload', uploadMiddleware.single('file'), hazardController.uploadHazardImage);
router.post('/', validateBody(createHazardSchema), hazardController.createHazard);
router.post(
  '/:id/confirm',
  validateParams(hazardIdParamSchema),
  hazardController.confirmHazard
);
router.post(
  '/:id/resolve',
  validateParams(hazardIdParamSchema),
  hazardController.resolveHazard
);
router.put(
  '/:id',
  validateParams(hazardIdParamSchema),
  validateBody(updateHazardSchema),
  hazardController.updateHazard
);
router.delete('/:id', validateParams(hazardIdParamSchema), hazardController.deleteHazard);

export default router;
