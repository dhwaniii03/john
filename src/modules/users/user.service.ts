import userRepository, { UserRepository } from './user.repository.js';
import type { User, UserStats, UpdateProfileDTO, UpdateTransportModeDTO, UserFilterOptions } from './user.types.js';
import { getPaginationMeta } from '../../utils/pagination.js';

export class UserService {
  constructor(private readonly repo: UserRepository = userRepository) {}

  async getUserById(id: string | number): Promise<User> {
    const user = await this.repo.findById(id);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  async getUserStats(id: string | number): Promise<UserStats> {
    return this.repo.getUserStats(id);
  }

  async getUsers(options: UserFilterOptions) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 10));

    const { users, total } = await this.repo.findAll({ ...options, page, limit });
    const pagination = getPaginationMeta(total, page, limit);

    return { users, pagination };
  }

  async updateProfile(id: string | number, data: UpdateProfileDTO): Promise<User> {
    const payload = { ...data };
    if (
      payload.profile_image &&
      typeof payload.profile_image === 'string' &&
      (payload.profile_image.startsWith('data:image/') || payload.profile_image.length > 500)
    ) {
      try {
        const uploadServiceModule = await import('../uploads/upload.service.js');
        payload.profile_image = uploadServiceModule.default.saveBase64Image(
          payload.profile_image,
          'profiles'
        );
      } catch (err) {
        console.warn('Failed to save base64 profile image:', err);
      }
    }

    const user = await this.repo.update(id, payload);
    if (!user) {
      throw new Error('User not found or update failed');
    }
    return user;
  }

  async updateTransportMode(id: string | number, data: UpdateTransportModeDTO): Promise<User> {
    const user = await this.repo.updateTransportMode(id, data);
    if (!user) {
      throw new Error('User not found or transport mode update failed');
    }
    return user;
  }

  async deleteAccount(id: string | number): Promise<void> {
    const deleted = await this.repo.softDelete(id);
    if (!deleted) {
      throw new Error('User not found or already deleted');
    }
  }

  async deleteUser(id: string | number): Promise<void> {
    return this.deleteAccount(id);
  }
}

export default new UserService();
