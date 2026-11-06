import express from 'express';
import userController from './user.controller.js';
import { uploadMiddleware } from '../uploads/upload.service.js';
import { authenticate, authorize } from '../../middleware/auth.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middleware/validation.middleware.js';
import {
  updateProfileSchema,
  updateTransportModeSchema,
  userIdParamSchema,
  userQuerySchema,
} from './user.validation.js';

const router = express.Router();

router.use(authenticate);

// User self profile & settings management
router.get('/profile', userController.getMyProfile);
router.get('/stats', userController.getMyStats);
router.put('/profile', validateBody(updateProfileSchema), userController.updateMyProfile);
router.post('/profile/image', uploadMiddleware.single('file'), userController.uploadProfilePhoto);
router.post('/profile/photo', uploadMiddleware.single('file'), userController.uploadProfilePhoto);
router.patch(
  '/transport-mode',
  validateBody(updateTransportModeSchema),
  userController.updateTransportMode
);
router.delete('/account', userController.deleteMyAccount);

// General/Admin endpoints
router.get('/', validateQuery(userQuerySchema), userController.getUsers);
router.get('/:id', validateParams(userIdParamSchema), userController.getUserById);
router.put(
  '/:id',
  validateParams(userIdParamSchema),
  validateBody(updateProfileSchema),
  userController.updateUser
);
router.delete(
  '/:id',
  authorize('admin', 'GLOBAL_ADMIN'),
  validateParams(userIdParamSchema),
  userController.deleteUser
);

export default router;
