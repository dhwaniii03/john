import { type Request, type Response, type NextFunction } from 'express';
import authService, { AuthService } from './auth.service.js';
import { sendSuccess, sendError } from '../../utils/response.js';

export class AuthController {
  constructor(private readonly service: AuthService = authService) {}

  register = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.register(req.body);
      sendSuccess(res, 'User registered successfully', result, 201);
    } catch (error: any) {
      sendError(res, error.message || 'Registration failed', 400);
    }
  };

  sendOtp = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.sendOtp(req.body);
      sendSuccess(res, result.message, result, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to send OTP', 400);
    }
  };

  verifyOtp = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.verifyOtp(req.body);
      sendSuccess(res, result.message, result, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to verify OTP', 400);
    }
  };


  login = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.login(req.body);
      sendSuccess(res, 'Login successful', result, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Login failed', 401);
    }
  };

  forgotPassword = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.forgotPassword(req.body.email);
      sendSuccess(res, result.message, result, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Forgot password request failed', 400);
    }
  };

  resetPassword = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.resetPassword(req.body);
      sendSuccess(res, result.message, result, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Password reset failed', 400);
    }
  };

  logout = async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {
    // Client-side discards the JWT token. Backend provides standard confirmation.
    sendSuccess(res, 'Successfully logged out', null, 200);
  };

  me = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        sendError(res, 'Unauthorized', 401);
        return;
      }
      const profile = await this.service.getProfile(req.user.id);
      sendSuccess(res, 'Profile retrieved successfully', profile, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch profile', 400);
    }
  };

  // Admin Authentication handlers
  adminLogin = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.adminLogin(req.body);
      sendSuccess(res, 'Admin login successful', result, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Admin login failed', 401);
    }
  };

  adminLogout = async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {
    sendSuccess(res, 'Admin successfully logged out', null, 200);
  };

  adminMe = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const adminId = req.admin?.id || req.user?.id;
      if (!adminId) {
        sendError(res, 'Admin authentication required', 401);
        return;
      }
      const profile = await this.service.getAdminProfile(adminId);
      sendSuccess(res, 'Admin profile retrieved successfully', profile, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch admin profile', 400);
    }
  };
}

export default new AuthController();
