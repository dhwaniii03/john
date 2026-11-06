import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character (!@#$%^&* etc.)');

export const registerSchema = z.object({
  email: z.string().email('Please provide a valid email address'),
  password: passwordSchema,
  otp: z.string().min(1, 'Verification code is required'),
  name: z.string().min(2, 'Name must be at least 2 characters long').optional(),
  first_name: z.string().min(1, 'First name is required').optional(),
  last_name: z.string().optional(),
  phone: z.string().optional(),
  transport_mode: z.enum(['DRIVER', 'CYCLIST', 'WALKER']).optional().default('DRIVER'),
});

export const sendOtpSchema = z
  .object({
    email: z.string().email('Please provide a valid email address').optional(),
    phone: z.string().optional(),
    purpose: z.string().optional().default('REGISTRATION'),
  })
  .refine((data) => !!(data.email || data.phone), {
    message: 'Either email or phone is required to send OTP',
    path: ['email'],
  });

export const verifyOtpSchema = z
  .object({
    email: z.string().email('Please provide a valid email address').optional(),
    phone: z.string().optional(),
    otp: z.string().min(1, 'Verification code is required'),
    purpose: z.string().optional().default('REGISTRATION'),
  })
  .refine((data) => !!(data.email || data.phone), {
    message: 'Either email or phone is required to verify OTP',
    path: ['email'],
  });

export const loginSchema = z.object({
  email: z.string().email('Please provide a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Please provide a valid email address'),
});

export const resetPasswordSchema = z.object({
  email: z.string().email('Please provide a valid email address'),
  otp: z.string().min(1, 'Verification code is required'),
  newPassword: passwordSchema,
});

export const adminLoginSchema = z.object({
  email: z.string().email('Please provide a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type SendOtpInput = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

