import { describe, it, expect, beforeEach, vi } from 'vitest';
import otpService from '../src/modules/auth/otp.service.js';
import emailService from '../src/services/email.service.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import type { AuthRepository } from '../src/modules/auth/auth.repository.js';
import { env } from '../src/config/env.js';
import { comparePassword } from '../src/utils/password.js';

describe('OTP Service & Auth Resend Integration', () => {
  beforeEach(() => {
    emailService.clearTestEmails();
    otpService.clearMemoryStore();
  });

  describe('OTP Service Core Behaviors', () => {
    it('generates a 6-digit cryptographically secure OTP', () => {
      for (let i = 0; i < 20; i++) {
        const otp = otpService.generateSecureOtp();
        expect(otp).toMatch(/^\d{6}$/);
        const num = Number(otp);
        expect(num).toBeGreaterThanOrEqual(100000);
        expect(num).toBeLessThan(1000000);
      }
    });

    it('generates, delivers via email service mock, and verifies secure OTP successfully', async () => {
      const email = 'driver_secure@roadlife.test';
      const sendRes = await otpService.sendOtp({
        identifier: email,
        purpose: 'REGISTRATION',
        forceSecure: true,
        ignoreCooldown: true,
      });

      expect(sendRes.success).toBe(true);
      expect(emailService.sentEmails.length).toBe(1);

      // Extract the OTP from the captured email
      const capturedOtp = emailService.sentEmails[0].text?.match(/\b\d{6}\b/)?.[0];
      expect(capturedOtp).toBeDefined();

      // Verify with the extracted OTP
      const verifyRes = await otpService.verifyOtp({
        identifier: email,
        otp: capturedOtp!,
        purpose: 'REGISTRATION',
        forceSecure: true,
      });

      expect(verifyRes.valid).toBe(true);
    });

    it('rejects incorrect OTP and counts attempts', async () => {
      const email = 'attempts_test@roadlife.test';
      await otpService.sendOtp({
        identifier: email,
        purpose: 'REGISTRATION',
        forceSecure: true,
        ignoreCooldown: true,
      });

      // Try wrong OTP
      const fail1 = await otpService.verifyOtp({
        identifier: email,
        otp: '000000',
        purpose: 'REGISTRATION',
        forceSecure: true,
      });

      expect(fail1.valid).toBe(false);
      expect(fail1.message).toContain('attempt(s) remaining');

      // Exhaust remaining attempts (max 5)
      for (let i = 0; i < 3; i++) {
        await otpService.verifyOtp({
          identifier: email,
          otp: '000000',
          purpose: 'REGISTRATION',
          forceSecure: true,
        });
      }

      // Final attempt should trigger lock/wipe
      const finalFail = await otpService.verifyOtp({
        identifier: email,
        otp: '000000',
        purpose: 'REGISTRATION',
        forceSecure: true,
      });

      expect(finalFail.valid).toBe(false);
      expect(finalFail.message).toContain('Maximum verification attempts exceeded');
    });

    it('enforces purpose binding (REGISTRATION OTP cannot be verified for PASSWORD_RESET)', async () => {
      const email = 'purpose_binding@roadlife.test';
      await otpService.sendOtp({
        identifier: email,
        purpose: 'REGISTRATION',
        forceSecure: true,
        ignoreCooldown: true,
      });

      const capturedOtp = emailService.sentEmails[0].text?.match(/\b\d{6}\b/)?.[0];
      expect(capturedOtp).toBeDefined();

      // Attempt to verify with purpose PASSWORD_RESET
      const res = await otpService.verifyOtp({
        identifier: email,
        otp: capturedOtp!,
        purpose: 'PASSWORD_RESET',
        forceSecure: true,
      });

      expect(res.valid).toBe(false);
      expect(res.message).toMatch(/No verification code was requested|does not match/);
    });

    it('enforces resend cooldown to prevent email flooding', async () => {
      const email = 'cooldown@roadlife.test';

      // First send succeeds
      const first = await otpService.sendOtp({
        identifier: email,
        purpose: 'REGISTRATION',
        ignoreCooldown: false,
      });
      expect(first.success).toBe(true);

      // Immediate second send fails with cooldown error
      await expect(
        otpService.sendOtp({
          identifier: email,
          purpose: 'REGISTRATION',
          ignoreCooldown: false,
        })
      ).rejects.toThrow(/Please wait \d+ seconds before requesting a new verification code/);
    });

    it('invalidates OTP after consumption (clearOtp) preventing replay', async () => {
      const email = 'replay_prevent@roadlife.test';
      await otpService.sendOtp({
        identifier: email,
        purpose: 'REGISTRATION',
        forceSecure: true,
        ignoreCooldown: true,
      });

      const capturedOtp = emailService.sentEmails[0].text?.match(/\b\d{6}\b/)?.[0];
      expect(capturedOtp).toBeDefined();

      // Consume OTP
      await otpService.clearOtp(email, 'REGISTRATION');

      // Attempt to verify after consumption
      const res = await otpService.verifyOtp({
        identifier: email,
        otp: capturedOtp!,
        purpose: 'REGISTRATION',
        forceSecure: true,
      });

      expect(res.valid).toBe(false);
      expect(res.message).toContain('No verification code was requested');
    });
  });

  describe('AuthService Password Reset Flow with Resend', () => {
    // In-memory mock repository for authentication flows
    const mockUser = {
      id: 99,
      email: 'john_reset@roadlife.test',
      password: '',
      name: 'John Reset',
      transport_mode: 'DRIVER' as const,
      status: 'ACTIVE' as const,
      notification_enabled: true,
      location_enabled: true,
      role: 'user',
      created_at: new Date(),
    };

    const mockRepo: Partial<AuthRepository> = {
      findByEmail: vi.fn(async (email: string) => {
        if (email.toLowerCase() === mockUser.email.toLowerCase()) {
          return { ...mockUser } as any;
        }
        return null;
      }),
      updatePassword: vi.fn(async (_id: any, newHash: string) => {
        mockUser.password = newHash;
      }),
    };

    const authService = new AuthService(mockRepo as AuthRepository, otpService);

    it('returns a generic message when requested for non-existent account without sending email', async () => {
      const res = await authService.forgotPassword('nonexistent@roadlife.test');

      expect(res.message).toContain('If this email is registered in our system');
      expect(emailService.sentEmails.length).toBe(0);
    });

    it('sends password reset OTP via Resend for existing account and does not leak OTP in production', async () => {
      const originalNodeEnv = env.nodeEnv;
      try {
        (env as any).nodeEnv = 'production';

        const res = await authService.forgotPassword('john_reset@roadlife.test');

        expect(res.message).toContain('If this email is registered in our system');
        expect(res.dummyOtp).toBeUndefined(); // Zero OTP leakage in production
        expect(emailService.sentEmails.length).toBe(1);
        expect(emailService.sentEmails[0].to).toBe('john_reset@roadlife.test');
        expect(emailService.sentEmails[0].subject).toBe('Reset your RoadLife password');
      } finally {
        (env as any).nodeEnv = originalNodeEnv;
      }
    });

    it('successfully resets password with valid OTP and prevents reuse', async () => {
      // 1. Send reset OTP
      await authService.forgotPassword('john_reset@roadlife.test');
      const resetOtp = emailService.sentEmails[emailService.sentEmails.length - 1].text?.match(/\b\d{6}\b/)?.[0] || '1234';

      // 2. Perform password reset
      const resetResult = await authService.resetPassword({
        email: 'john_reset@roadlife.test',
        otp: resetOtp,
        newPassword: 'BrandNewSecurePassword#2026',
      });

      expect(resetResult.message).toContain('successfully updated');
      expect(mockRepo.updatePassword).toHaveBeenCalled();

      // Verify that the password was hashed
      const isMatch = await comparePassword('BrandNewSecurePassword#2026', mockUser.password);
      expect(isMatch).toBe(true);

      // 3. Attempt replay of the same OTP should fail
      await expect(
        authService.resetPassword({
          email: 'john_reset@roadlife.test',
          otp: resetOtp,
          newPassword: 'AnotherPassword#999',
        })
      ).rejects.toThrow(/No verification code was requested|Invalid or expired/);
    });

    it('refuses to reset password when OTP verification fails', async () => {
      const previousPassword = mockUser.password;

      await expect(
        authService.resetPassword({
          email: 'john_reset@roadlife.test',
          otp: '000000',
          newPassword: 'HackerAttempt#123',
        })
      ).rejects.toThrow(/No verification code was requested|Invalid/);

      expect(mockUser.password).toBe(previousPassword);
    });

    it('enforces password complexity rules on reset password', async () => {
      await authService.forgotPassword('john_reset@roadlife.test');
      const resetOtp = emailService.sentEmails[emailService.sentEmails.length - 1].text?.match(/\b\d{6}\b/)?.[0] || '1234';

      // Too short (< 8 chars)
      await expect(
        authService.resetPassword({
          email: 'john_reset@roadlife.test',
          otp: resetOtp,
          newPassword: 'Short1!',
        })
      ).rejects.toThrow(/at least 8 characters/);

      // Missing uppercase
      await expect(
        authService.resetPassword({
          email: 'john_reset@roadlife.test',
          otp: resetOtp,
          newPassword: 'nouppercase123!',
        })
      ).rejects.toThrow(/uppercase letter/);

      // Missing number
      await expect(
        authService.resetPassword({
          email: 'john_reset@roadlife.test',
          otp: resetOtp,
          newPassword: 'NoNumbersHere!@#',
        })
      ).rejects.toThrow(/at least one number/);

      // Missing special character
      await expect(
        authService.resetPassword({
          email: 'john_reset@roadlife.test',
          otp: resetOtp,
          newPassword: 'NoSpecialChar123',
        })
      ).rejects.toThrow(/special character/);
    });
  });
});
