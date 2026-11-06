import authRepository, { AuthRepository } from './auth.repository.js';
import otpService, { OtpService } from './otp.service.js';
import userRepository from '../users/user.repository.js';
import { hashPassword, comparePassword, validatePasswordStrength } from '../../utils/password.js';
import { generateToken } from '../../utils/jwt.js';
import type {
  RegisterDTO,
  LoginDTO,
  AuthResponse,
  UserAuthData,
  AdminLoginDTO,
  AdminAuthResponse,
  AdminAuthData,
  SendOtpDTO,
  VerifyOtpDTO,
  OtpResponse,
  VerifyOtpResponse,
  ResetPasswordDTO,
} from './auth.types.js';

export class AuthService {
  constructor(
    private readonly repo: AuthRepository = authRepository,
    private readonly otp: OtpService = otpService
  ) {}

  async register(data: RegisterDTO): Promise<AuthResponse> {
    const existingUser = await this.repo.findByEmail(data.email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Verify OTP (accepts dummy '1234' or active generated OTP)
    const otpVerification = await this.otp.verifyOtp({
      identifier: data.email,
      otp: data.otp,
      purpose: 'REGISTRATION',
    });

    if (!otpVerification.valid) {
      throw new Error(otpVerification.message || 'Invalid or expired verification code');
    }

    const passCheck = validatePasswordStrength(data.password);
    if (!passCheck.valid) {
      throw new Error(passCheck.message);
    }

    const passwordHash = await hashPassword(data.password);
    const fullName =
      data.name ||
      [data.first_name, data.last_name].filter(Boolean).join(' ') ||
      data.email.split('@')[0];

    const newUser = await this.repo.createUser({
      email: data.email,
      passwordHash,
      name: fullName,
      first_name: data.first_name || data.name?.split(' ')[0] || fullName,
      last_name: data.last_name || data.name?.split(' ').slice(1).join(' ') || undefined,
      phone: data.phone,
      transport_mode: data.transport_mode || 'DRIVER',
    });

    // Clear OTP record after successful registration
    await this.otp.clearOtp(data.email, 'REGISTRATION');

    const token = generateToken({
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role,
    });

    const stats = await userRepository.getUserStats(newUser.id);

    return {
      user: {
        id: Number(newUser.id),
        email: newUser.email,
        name: newUser.name,
        first_name: newUser.first_name,
        last_name: newUser.last_name,
        phone: newUser.phone,
        profile_image: newUser.profile_image,
        transport_mode: newUser.transport_mode,
        status: newUser.status,
        notification_enabled: newUser.notification_enabled,
        location_enabled: newUser.location_enabled,
        role: newUser.role,
        created_at: newUser.created_at,
        stats,
      },
      tokens: {
        accessToken: token,
      },
    };
  }

  async login(data: LoginDTO): Promise<AuthResponse> {
    const user = await this.repo.findByEmail(data.email);
    if (!user || !user.password) {
      throw new Error('Invalid email or password');
    }

    if (user.status && user.status.toUpperCase() === 'SUSPENDED') {
      throw new Error('Account has been suspended. Please contact support.');
    }

    const isValid = await comparePassword(data.password, user.password);
    if (!isValid) {
      throw new Error('Invalid email or password');
    }

    await this.repo.updateLastLogin(user.id);

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const stats = await userRepository.getUserStats(user.id);

    return {
      user: {
        id: Number(user.id),
        email: user.email,
        name: user.name,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        profile_image: user.profile_image,
        transport_mode: user.transport_mode,
        status: user.status,
        notification_enabled: user.notification_enabled,
        location_enabled: user.location_enabled,
        role: user.role,
        last_login_at: user.last_login_at,
        created_at: user.created_at,
        stats,
      },
      tokens: {
        accessToken: token,
      },
    };
  }

  async adminLogin(data: AdminLoginDTO): Promise<AdminAuthResponse> {
    // Check admins table
    const admin = await this.repo.findAdminByEmail(data.email);
    if (admin) {
      if (admin.status && admin.status.toUpperCase() === 'SUSPENDED') {
        throw new Error('Admin account has been suspended');
      }

      const isValid = await comparePassword(data.password, admin.password_hash);
      if (!isValid) {
        throw new Error('Invalid admin email or password');
      }

      await this.repo.updateAdminLastLogin(admin.id);

      const token = generateToken({
        userId: admin.id,
        email: admin.email,
        role: admin.role,
      });

      return {
        admin: {
          id: Number(admin.id),
          email: admin.email,
          name: admin.name,
          role: admin.role,
          status: admin.status,
          last_login_at: admin.last_login_at,
          created_at: admin.created_at,
        },
        tokens: {
          accessToken: token,
        },
      };
    }

    // Fallback: check users table for user with admin role
    const userAdmin = await this.repo.findByEmail(data.email);
    if (
      userAdmin &&
      (userAdmin.role === 'admin' || userAdmin.role === 'GLOBAL_ADMIN') &&
      userAdmin.password
    ) {
      if (userAdmin.status && userAdmin.status.toUpperCase() === 'SUSPENDED') {
        throw new Error('Admin account has been suspended');
      }

      const isValid = await comparePassword(data.password, userAdmin.password);
      if (!isValid) {
        throw new Error('Invalid admin email or password');
      }

      await this.repo.updateLastLogin(userAdmin.id);

      const token = generateToken({
        userId: userAdmin.id,
        email: userAdmin.email,
        role: 'GLOBAL_ADMIN',
      });

      return {
        admin: {
          id: Number(userAdmin.id),
          email: userAdmin.email,
          name: userAdmin.name,
          role: 'GLOBAL_ADMIN',
          status: 'ACTIVE',
          last_login_at: userAdmin.last_login_at,
          created_at: userAdmin.created_at,
        },
        tokens: {
          accessToken: token,
        },
      };
    }

    throw new Error('Invalid admin credentials or insufficient permissions');
  }

  async forgotPassword(
    email: string
  ): Promise<{ message: string; dummyOtp?: string; expiresInMinutes?: number }> {
    const user = await this.repo.findByEmail(email);
    if (!user) {
      // Do not reveal email existence to prevent user enumeration
      return {
        message:
          'If this email is registered in our system, password reset instructions have been sent.',
      };
    }

    const otpResult = await this.otp.sendOtp({
      identifier: user.email,
      purpose: 'PASSWORD_RESET',
    });

    return {
      message:
        'If this email is registered in our system, password reset instructions have been sent.',
      dummyOtp: otpResult.dummyOtp,
      expiresInMinutes: otpResult.expiresInMinutes,
    };
  }

  async resetPassword(data: ResetPasswordDTO): Promise<{ message: string }> {
    const verification = await this.otp.verifyOtp({
      identifier: data.email,
      otp: data.otp,
      purpose: 'PASSWORD_RESET',
    });

    if (!verification.valid) {
      throw new Error(verification.message || 'Invalid or expired verification code');
    }

    const user = await this.repo.findByEmail(data.email);
    if (!user) {
      throw new Error('User associated with email not found');
    }

    const passCheck = validatePasswordStrength(data.newPassword);
    if (!passCheck.valid) {
      throw new Error(passCheck.message);
    }

    const passwordHash = await hashPassword(data.newPassword);
    await this.repo.updatePassword(user.id, passwordHash);

    // Clear OTP record after password reset
    await this.otp.clearOtp(data.email, 'PASSWORD_RESET');

    return { message: 'Password has been successfully updated. You may now log in.' };
  }

  async getProfile(userId: string | number): Promise<UserAuthData> {
    const user = await this.repo.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    const stats = await userRepository.getUserStats(userId);
    return {
      id: Number(user.id),
      email: user.email,
      name: user.name,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      profile_image: user.profile_image,
      transport_mode: user.transport_mode,
      status: user.status,
      notification_enabled: user.notification_enabled,
      location_enabled: user.location_enabled,
      role: user.role,
      last_login_at: user.last_login_at,
      created_at: user.created_at,
      stats,
    };
  }

  async getAdminProfile(adminId: string | number): Promise<AdminAuthData> {
    const admin = await this.repo.findAdminById(adminId);
    if (admin) {
      return {
        id: Number(admin.id),
        email: admin.email,
        name: admin.name,
        role: admin.role,
        status: admin.status,
        last_login_at: admin.last_login_at,
        created_at: admin.created_at,
      };
    }

    const userAdmin = await this.repo.findById(adminId);
    if (userAdmin && (userAdmin.role === 'admin' || userAdmin.role === 'GLOBAL_ADMIN')) {
      return {
        id: Number(userAdmin.id),
        email: userAdmin.email,
        name: userAdmin.name,
        role: 'GLOBAL_ADMIN',
        status: 'ACTIVE',
        last_login_at: userAdmin.last_login_at,
        created_at: userAdmin.created_at,
      };
    }

    throw new Error('Admin profile not found');
  }

  async sendOtp(data: SendOtpDTO): Promise<OtpResponse> {
    const identifier = data.email || data.phone;
    if (!identifier) {
      throw new Error('Email or phone is required to send OTP');
    }

    const result = await this.otp.sendOtp({
      identifier,
      purpose: data.purpose || 'REGISTRATION',
    });

    return {
      message: result.message,
      expiresInMinutes: result.expiresInMinutes,
      dummyOtp: result.dummyOtp,
    };
  }

  async verifyOtp(data: VerifyOtpDTO): Promise<VerifyOtpResponse> {
    const identifier = data.email || data.phone;
    if (!identifier) {
      throw new Error('Email or phone is required to verify OTP');
    }

    const result = await this.otp.verifyOtp({
      identifier,
      otp: data.otp,
      purpose: data.purpose || 'REGISTRATION',
    });

    if (!result.valid) {
      throw new Error(result.message || 'Invalid or expired OTP');
    }

    return {
      message: 'OTP verified successfully',
      verified: true,
    };
  }
}

export default new AuthService();
