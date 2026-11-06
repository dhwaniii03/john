import express from 'express';
import journeyController from './journey.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  validateBody,
  validateQuery,
} from '../../middleware/validation.middleware.js';
import {
  updateLocationSchema,
  nearbyLocationQuerySchema,
} from './journey.validation.js';

const router = express.Router();

router.use(authenticate);

router.post('/start', validateBody(updateLocationSchema), journeyController.startLocationSharing);
router.post('/update', validateBody(updateLocationSchema), journeyController.updateLocation);
router.post('/stop', journeyController.stopLocationSharing);
router.get('/nearby', validateQuery(nearbyLocationQuerySchema), journeyController.getNearbyLocations);
router.get('/awareness', journeyController.getDriverAwareness);

export default router;
