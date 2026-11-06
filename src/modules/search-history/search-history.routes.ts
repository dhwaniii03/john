import express from 'express';
import searchHistoryController from './search-history.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middleware/validation.middleware.js';
import {
  createSearchHistorySchema,
  searchHistoryIdParamSchema,
  searchHistoryQuerySchema,
} from './search-history.validation.js';

const router = express.Router();

router.use(authenticate);

router.get('/', validateQuery(searchHistoryQuerySchema), searchHistoryController.getRecentSearches);
router.post('/', validateBody(createSearchHistorySchema), searchHistoryController.createSearch);
router.delete('/', searchHistoryController.clearHistory);
router.delete('/:id', validateParams(searchHistoryIdParamSchema), searchHistoryController.deleteSearchItem);

export default router;

