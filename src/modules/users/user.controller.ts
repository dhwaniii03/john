import { type Request, type Response, type NextFunction } from 'express';
import userService, { UserService } from './user.service.js';
import uploadService from '../uploads/upload.service.js';
import { sendSuccess, sendError } from '../../utils/response.js';

export class UserController {
  constructor(private readonly service: UserService = userService) {}

  private formatUser = (req: Request, user: any) => {
    if (!user) return user;
    return {
      ...user,
      profile_image: uploadService.formatUrl(req, user.profile_image),
    };
  };

  getUsers = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 10;
      const search = req.query.search ? String(req.query.search) : undefined;
      const role = req.query.role ? String(req.query.role) : undefined;
      const status = req.query.status ? String(req.query.status) : undefined;
      const transport_mode = req.query.transport_mode ? String(req.query.transport_mode) : undefined;

      const result = await this.service.getUsers({
        page,
        limit,
        search,
        role,
        status,
        transport_mode,
      });

      const formattedUsers = result.users.map((u) => this.formatUser(req, u));
      sendSuccess(res, 'Users retrieved successfully', formattedUsers, 200, result.pagination);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch users', 400);
    }
  };

  getMyProfile = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        sendError(res, 'Unauthorized', 401);
        return;
      }
      const user = await this.service.getUserById(req.user.id);
      const stats = await this.service.getUserStats(req.user.id);
      sendSuccess(
        res,
        'Profile retrieved successfully',
        { ...this.formatUser(req, user), stats },
        200
      );
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch profile', 400);
    }
  };

  getMyStats = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        sendError(res, 'Unauthorized', 401);
        return;
      }
      const stats = await this.service.getUserStats(req.user.id);
      sendSuccess(res, 'User statistics retrieved successfully', stats, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to fetch statistics', 400);
    }
  };

  updateMyProfile = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        sendError(res, 'Unauthorized', 401);
        return;
      }
      const updatedUser = await this.service.updateProfile(req.user.id, req.body);
      sendSuccess(res, 'Profile updated successfully', this.formatUser(req, updatedUser), 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to update profile', 400);
    }
  };

  uploadProfilePhoto = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        sendError(res, 'Unauthorized', 401);
        return;
      }
      let relativePath: string | null = null;
      if (req.file) {
        relativePath = `/uploads/profiles/${req.file.filename}`;
      } else if (req.body.image || req.body.base64 || req.body.file) {
        const raw = req.body.image || req.body.base64 || req.body.file;
        relativePath = uploadService.saveBase64Image(raw, 'profiles');
      } else {
        sendError(res, 'No image file or base64 data provided', 400);
        return;
      }

      const updatedUser = await this.service.updateProfile(req.user.id, {
        profile_image: relativePath,
      });

      sendSuccess(
        res,
        'Profile photo uploaded and updated successfully',
        this.formatUser(req, updatedUser),
        200
      );
    } catch (error: any) {
      sendError(res, error.message || 'Failed to upload profile photo', 400);
    }
  };

  updateTransportMode = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        sendError(res, 'Unauthorized', 401);
        return;
      }
      const updatedUser = await this.service.updateTransportMode(req.user.id, req.body);
      sendSuccess(res, 'Transport mode updated successfully', this.formatUser(req, updatedUser), 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to update transport mode', 400);
    }
  };

  deleteMyAccount = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        sendError(res, 'Unauthorized', 401);
        return;
      }
      await this.service.deleteAccount(req.user.id);
      sendSuccess(res, 'Account deleted successfully', null, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to delete account', 400);
    }
  };

  getUserById = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const userId = String(req.params.id);
      const user = await this.service.getUserById(userId);
      sendSuccess(res, 'User retrieved successfully', this.formatUser(req, user), 200);
    } catch (error: any) {
      sendError(res, error.message || 'User not found', 404);
    }
  };

  updateUser = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const userId = String(req.params.id);
      if (req.user && String(req.user.id) !== String(userId) && req.user.role !== 'admin' && req.user.role !== 'GLOBAL_ADMIN') {
        sendError(res, 'Forbidden: You can only update your own profile', 403);
        return;
      }

      const updatedUser = await this.service.updateProfile(userId, req.body);
      sendSuccess(res, 'User updated successfully', this.formatUser(req, updatedUser), 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to update user', 400);
    }
  };

  deleteUser = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const userId = String(req.params.id);
      await this.service.deleteUser(userId);
      sendSuccess(res, 'User deleted successfully', null, 200);
    } catch (error: any) {
      sendError(res, error.message || 'Failed to delete user', 400);
    }
  };
}

export default new UserController();
