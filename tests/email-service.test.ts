import { describe, it, expect, beforeEach } from 'vitest';
import emailService, { EmailService, emailTemplates } from '../src/services/email.service.js';
import { env } from '../src/config/env.js';

describe('EmailService & Transactional Templates', () => {
  beforeEach(() => {
    emailService.clearTestEmails();
  });

  describe('Transactional Templates', () => {
    it('generates registration OTP template with prominent OTP and expiry', () => {
      const { html, text } = emailTemplates.otpVerification('654321', 'REGISTRATION', 10);

      expect(text).toContain('654321');
      expect(text).toContain('Account Registration');
      expect(text).toContain('10 minutes');
      expect(text).toContain('Never share this code with anyone');

      expect(html).toContain('654321');
      expect(html).toContain('RoadLife');
      expect(html).toContain('Valid for 10 minutes');
      expect(html).toContain('Security Notice');
    });

    it('generates password reset template with prominent OTP, expiry, and warning', () => {
      const { html, text } = emailTemplates.passwordReset('987654', 15);

      expect(text).toContain('987654');
      expect(text).toContain('Password Reset');
      expect(text).toContain('15 minutes');
      expect(text).toContain('If you DID NOT request a password reset, you can safely ignore this email');

      expect(html).toContain('987654');
      expect(html).toContain('RoadLife');
      expect(html).toContain('Expires in 15 minutes');
      expect(html).toContain("Didn't request this?");
    });
  });

  describe('EmailService in Test / Mock Environment', () => {
    it('safely captures sent emails without making external network calls in test mode', async () => {
      const result = await emailService.sendOtpEmail({
        to: 'cyclist@example.com',
        otp: '123987',
        purpose: 'REGISTRATION',
        expiryMinutes: 10,
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(emailService.sentEmails.length).toBe(1);
      expect(emailService.sentEmails[0].to).toBe('cyclist@example.com');
      expect(emailService.sentEmails[0].subject).toContain('123987');
      expect(emailService.sentEmails[0].text).toContain('123987');
    });

    it('dispatches password reset email with proper recipient and subject', async () => {
      const result = await emailService.sendPasswordResetEmail({
        to: 'driver@example.com',
        otp: '888999',
        expiryMinutes: 15,
      });

      expect(result.success).toBe(true);
      expect(emailService.sentEmails.length).toBe(1);
      expect(emailService.sentEmails[0].to).toBe('driver@example.com');
      expect(emailService.sentEmails[0].subject).toBe('Reset your RoadLife password');
      expect(emailService.sentEmails[0].html).toContain('888999');
    });
  });

  describe('Production Configuration Guards', () => {
    it('returns error when Resend API key is missing in production mode', async () => {
      // Temporarily simulate production mode with missing key
      const originalNodeEnv = env.nodeEnv;
      const originalKey = env.resendApiKey;

      try {
        (env as any).nodeEnv = 'production';
        (env as any).resendApiKey = undefined;

        const prodService = new EmailService();
        prodService.setTestMode(false);
        const result = await prodService.sendEmail({
          to: 'test@example.com',
          subject: 'Test Subject',
          html: '<p>Test</p>',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Transactional email provider is not configured');
      } finally {
        (env as any).nodeEnv = originalNodeEnv;
        (env as any).resendApiKey = originalKey;
      }
    });

    it('handles provider error responses safely without leaking sensitive information', async () => {
      const testService = new EmailService();
      // Inject mock client that returns error from Resend SDK
      testService.setTestMode(false);
      (testService as any).resendClient = {
        emails: {
          send: async () => ({
            data: null,
            error: {
              name: 'validation_error',
              message: 'Domain not verified. Please verify domain in Resend dashboard.',
            },
          }),
        },
      };

      const result = await testService.sendEmail({
        to: 'user@external.com',
        subject: 'Verification',
        html: '<p>Code</p>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Domain not verified');
    });

    it('catches and handles unexpected network exceptions gracefully', async () => {
      const testService = new EmailService();
      testService.setTestMode(false);
      (testService as any).resendClient = {
        emails: {
          send: async () => {
            throw new Error('ENOTFOUND api.resend.com');
          },
        },
      };

      const result = await testService.sendEmail({
        to: 'user@external.com',
        subject: 'Verification',
        html: '<p>Code</p>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('unexpected error occurred');
    });
  });
});
