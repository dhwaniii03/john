import express from 'express';
import authController from './auth.controller.js';
import { validateBody } from '../../middleware/validation.middleware.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  registerSchema,
  sendOtpSchema,
  verifyOtpSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './auth.validation.js';

const router = express.Router();

router.post('/send-otp', validateBody(sendOtpSchema), authController.sendOtp);
router.post('/verify-otp', validateBody(verifyOtpSchema), authController.verifyOtp);
router.post('/register', validateBody(registerSchema), authController.register);
router.post('/login', validateBody(loginSchema), authController.login);
router.post('/forgot-password', validateBody(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', validateBody(resetPasswordSchema), authController.resetPassword);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);

export default router;

