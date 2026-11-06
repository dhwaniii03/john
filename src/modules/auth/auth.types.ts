import type { UserStats } from '../users/user.types.js';

export type TransportMode = 'DRIVER' | 'CYCLIST' | 'WALKER';
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';
export type AdminRole = 'GLOBAL_ADMIN';
export type AdminStatus = 'ACTIVE' | 'SUSPENDED';

export interface UserAuthData {
  id: number;
  email: string;
  name: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  profile_image?: string;
  transport_mode: TransportMode;
  status: UserStatus;
  notification_enabled: boolean;
  location_enabled: boolean;
  role: string;
  last_login_at?: Date;
  created_at?: Date;
  stats?: UserStats;
}

export interface AdminAuthData {
  id: number;
  email: string;
  name: string;
  role: string;
  status: AdminStatus;
  last_login_at?: Date;
  created_at?: Date;
}

export interface AuthTokens {
  accessToken: string;
  expiresIn?: string | number;
}

export interface AuthResponse {
  user: UserAuthData;
  tokens: AuthTokens;
}

export interface AdminAuthResponse {
  admin: AdminAuthData;
  tokens: AuthTokens;
}

export interface RegisterDTO {
  email: string;
  password: string;
  otp: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  transport_mode?: TransportMode;
}

export interface SendOtpDTO {
  email?: string;
  phone?: string;
  purpose?: string;
}

export interface VerifyOtpDTO {
  email?: string;
  phone?: string;
  otp: string;
  purpose?: string;
}

export interface OtpResponse {
  message: string;
  expiresInMinutes: number;
  dummyOtp?: string;
}

export interface VerifyOtpResponse {
  message: string;
  verified: boolean;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface ForgotPasswordDTO {
  email: string;
}

export interface ResetPasswordDTO {
  email: string;
  otp: string;
  newPassword: string;
}

export interface AdminLoginDTO {
  email: string;
  password: string;
}

