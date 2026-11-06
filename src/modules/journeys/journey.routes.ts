import express from 'express';
import journeyController from './journey.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middleware/validation.middleware.js';
import {
  startJourneySchema,
  endJourneySchema,
  journeyIdParamSchema,
  journeyQuerySchema,
} from './journey.validation.js';

const router = express.Router();

router.use(authenticate);

router.post('/start', validateBody(startJourneySchema), journeyController.startJourney);
router.post(
  '/:id/end',
  validateParams(journeyIdParamSchema),
  validateBody(endJourneySchema),
  journeyController.endJourney
);
router.post(
  '/:id/cancel',
  validateParams(journeyIdParamSchema),
  journeyController.cancelJourney
);
router.get('/active', journeyController.getActiveJourney);
router.get('/history', validateQuery(journeyQuerySchema), journeyController.getJourneyHistory);
router.get('/:id', validateParams(journeyIdParamSchema), journeyController.getJourneyById);
router.delete('/:id', validateParams(journeyIdParamSchema), journeyController.deleteJourney);
router.get('/', validateQuery(journeyQuerySchema), journeyController.getJourneys);

export default router;
