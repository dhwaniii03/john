import { Resend } from 'resend';
import { env } from '../config/env.js';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface SendOtpEmailOptions {
  to: string;
  otp: string;
  purpose?: string;
  expiryMinutes?: number;
}

export interface SendPasswordResetEmailOptions {
  to: string;
  otp: string;
  expiryMinutes?: number;
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface IEmailService {
  sendEmail(options: SendEmailOptions): Promise<EmailSendResult>;
  sendOtpEmail(options: SendOtpEmailOptions): Promise<EmailSendResult>;
  sendPasswordResetEmail(options: SendPasswordResetEmailOptions): Promise<EmailSendResult>;
}

/**
 * Mask email address for safe logging without exposing PII.
 */
function maskEmail(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const [name, domain] = parts;
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}***@${domain}`;
}

/**
 * Generates HTML and Plain Text templates for RoadLife authentication.
 */
export const emailTemplates = {
  otpVerification: (otp: string, purpose: string, expiryMinutes: number) => {
    const formattedPurpose =
      purpose === 'REGISTRATION'
        ? 'Account Registration'
        : purpose.replace(/_/g, ' ').toLowerCase();

    const text = `RoadLife - Verification Code

Your verification code for ${formattedPurpose} is: ${otp}

This code will expire in ${expiryMinutes} minutes.

Security Notice: Never share this code with anyone. RoadLife support will never ask for your code.
If you did not request this verification code, please disregard this email.

© RoadLife Team`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RoadLife Verification Code</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
      background-color: #f6f9fc;
      color: #333333;
    }
    .wrapper {
      max-width: 560px;
      margin: 30px auto;
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
      border: 1px solid #eef2f6;
    }
    .header {
      background: #0f172a;
      padding: 24px;
      text-align: center;
    }
    .header h1 {
      color: #ffffff;
      font-size: 24px;
      font-weight: 700;
      margin: 0;
      letter-spacing: 0.5px;
    }
    .header p {
      color: #94a3b8;
      font-size: 13px;
      margin: 4px 0 0;
    }
    .content {
      padding: 32px 28px;
    }
    .content h2 {
      font-size: 20px;
      font-weight: 600;
      color: #1e293b;
      margin-top: 0;
      margin-bottom: 12px;
    }
    .content p {
      font-size: 15px;
      line-height: 1.6;
      color: #475569;
      margin-top: 0;
      margin-bottom: 20px;
    }
    .otp-card {
      background: #f8fafc;
      border: 2px dashed #cbd5e1;
      border-radius: 10px;
      padding: 20px;
      text-align: center;
      margin: 24px 0;
    }
    .otp-code {
      font-family: 'SF Pro Display', -apple-system, monospace;
      font-size: 34px;
      font-weight: 700;
      letter-spacing: 8px;
      color: #0f172a;
      margin: 0;
      user-select: all;
    }
    .badge {
      display: inline-block;
      margin-top: 10px;
      background: #e0f2fe;
      color: #0369a1;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 9999px;
    }
    .security-notice {
      background: #fef2f2;
      border-left: 4px solid #ef4444;
      padding: 12px 16px;
      border-radius: 4px;
      margin-top: 24px;
    }
    .security-notice p {
      font-size: 13px;
      line-height: 1.5;
      color: #991b1b;
      margin: 0;
    }
    .footer {
      background: #f8fafc;
      border-top: 1px solid #f1f5f9;
      padding: 20px 24px;
      text-align: center;
      font-size: 12px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>RoadLife</h1>
      <p>Navigate, Ride & Share Safely</p>
    </div>
    <div class="content">
      <h2>Verify your action</h2>
      <p>Please enter the verification code below to proceed with your <strong>${formattedPurpose}</strong>.</p>
      
      <div class="otp-card">
        <div class="otp-code">${otp}</div>
        <div class="badge">Valid for ${expiryMinutes} minutes</div>
      </div>

      <div class="security-notice">
        <p><strong>Security Notice:</strong> Never share this code with anyone. RoadLife staff will never ask for your verification code.</p>
      </div>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} RoadLife. This is an automated message, please do not reply.</p>
    </div>
  </div>
</body>
</html>`;

    return { html, text };
  },

  passwordReset: (otp: string, expiryMinutes: number) => {
    const text = `RoadLife - Password Reset Request

We received a request to reset your RoadLife account password.

Your Password Reset OTP is: ${otp}

This code will expire in ${expiryMinutes} minutes.

If you made this request, enter this code on the reset password screen to proceed.
If you DID NOT request a password reset, you can safely ignore this email. Your account remains secure.

Security Notice: Never share this OTP with anyone.

© RoadLife Team`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your RoadLife Password</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
      background-color: #f6f9fc;
      color: #333333;
    }
    .wrapper {
      max-width: 560px;
      margin: 30px auto;
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
      border: 1px solid #eef2f6;
    }
    .header {
      background: #0f172a;
      padding: 24px;
      text-align: center;
    }
    .header h1 {
      color: #ffffff;
      font-size: 24px;
      font-weight: 700;
      margin: 0;
      letter-spacing: 0.5px;
    }
    .header p {
      color: #94a3b8;
      font-size: 13px;
      margin: 4px 0 0;
    }
    .content {
      padding: 32px 28px;
    }
    .content h2 {
      font-size: 20px;
      font-weight: 600;
      color: #1e293b;
      margin-top: 0;
      margin-bottom: 12px;
    }
    .content p {
      font-size: 15px;
      line-height: 1.6;
      color: #475569;
      margin-top: 0;
      margin-bottom: 20px;
    }
    .otp-card {
      background: #fef3c7;
      border: 2px dashed #f59e0b;
      border-radius: 10px;
      padding: 20px;
      text-align: center;
      margin: 24px 0;
    }
    .otp-code {
      font-family: 'SF Pro Display', -apple-system, monospace;
      font-size: 34px;
      font-weight: 700;
      letter-spacing: 8px;
      color: #78350f;
      margin: 0;
      user-select: all;
    }
    .badge {
      display: inline-block;
      margin-top: 10px;
      background: #fffbeb;
      color: #b45309;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 9999px;
    }
    .security-notice {
      background: #f8fafc;
      border-left: 4px solid #64748b;
      padding: 12px 16px;
      border-radius: 4px;
      margin-top: 24px;
    }
    .security-notice p {
      font-size: 13px;
      line-height: 1.5;
      color: #475569;
      margin: 0;
    }
    .footer {
      background: #f8fafc;
      border-top: 1px solid #f1f5f9;
      padding: 20px 24px;
      text-align: center;
      font-size: 12px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>RoadLife</h1>
      <p>Navigate, Ride & Share Safely</p>
    </div>
    <div class="content">
      <h2>Password Reset Request</h2>
      <p>We received a request to reset your RoadLife password. Use the verification code below to set a new password:</p>
      
      <div class="otp-card">
        <div class="otp-code">${otp}</div>
        <div class="badge">Expires in ${expiryMinutes} minutes</div>
      </div>

      <div class="security-notice">
        <p><strong>Didn't request this?</strong> If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
      </div>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} RoadLife. This is an automated message, please do not reply.</p>
    </div>
  </div>
</body>
</html>`;

    return { html, text };
  },
};

export class EmailService implements IEmailService {
  private resendClient: Resend | null = null;
  private isTestMode: boolean;
  public readonly sentEmails: Array<{
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
  }> = [];

  constructor() {
    this.isTestMode = env.nodeEnv === 'test';
    if (env.resendApiKey) {
      this.resendClient = new Resend(env.resendApiKey);
    }
  }

  /**
   * Resets sentEmails recorded during tests.
   */
  public clearTestEmails(): void {
    this.sentEmails.length = 0;
  }

  public setTestMode(enabled: boolean): void {
    this.isTestMode = enabled;
  }

  /**
   * Core email sending method.
   */
  async sendEmail(options: SendEmailOptions): Promise<EmailSendResult> {
    const { to, subject, html, text, replyTo } = options;
    const recipientStr = Array.isArray(to) ? to.join(', ') : to;

    // Test mode bypass to avoid real network calls during automated testing
    if (this.isTestMode) {
      this.sentEmails.push({ to, subject, html, text });
      return {
        success: true,
        messageId: `test-mock-msg-${Date.now()}`,
      };
    }

    if (!env.resendApiKey || !this.resendClient) {
      const isProd = env.nodeEnv === 'production';
      const warningMsg = `Resend API key is not configured (${isProd ? 'PRODUCTION' : 'DEVELOPMENT'}). Email dispatch skipped.`;
      console.warn(`[EmailService] ${warningMsg} (Target: ${maskEmail(recipientStr)})`);

      if (isProd) {
        return {
          success: false,
          error: 'Transactional email provider is not configured.',
        };
      }

      // In local dev without key, log simulation success
      return {
        success: true,
        messageId: `simulated-dev-msg-${Date.now()}`,
      };
    }

    try {
      const response = await this.resendClient.emails.send({
        from: env.emailFrom,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text,
        replyTo,
      });

      if (response.error) {
        console.error(
          `[EmailService] Resend API error for ${maskEmail(recipientStr)}:`,
          response.error.name,
          response.error.message
        );
        return {
          success: false,
          error: response.error.message || 'Failed to dispatch email via provider',
        };
      }

      return {
        success: true,
        messageId: response.data?.id,
      };
    } catch (err: any) {
      console.error(
        `[EmailService] Unexpected failure dispatching email to ${maskEmail(recipientStr)}:`,
        err.message
      );
      return {
        success: false,
        error: 'An unexpected error occurred while transmitting email',
      };
    }
  }

  /**
   * Sends transactional OTP email for registration or account verification.
   */
  async sendOtpEmail(options: SendOtpEmailOptions): Promise<EmailSendResult> {
    const { to, otp, purpose = 'REGISTRATION', expiryMinutes = env.otpExpiryMinutes } = options;
    const { html, text } = emailTemplates.otpVerification(otp, purpose, expiryMinutes);

    return this.sendEmail({
      to,
      subject: `Your RoadLife Verification Code: ${otp}`,
      html,
      text,
    });
  }

  /**
   * Sends password reset OTP email.
   */
  async sendPasswordResetEmail(options: SendPasswordResetEmailOptions): Promise<EmailSendResult> {
    const { to, otp, expiryMinutes = env.otpExpiryMinutes } = options;
    const { html, text } = emailTemplates.passwordReset(otp, expiryMinutes);

    return this.sendEmail({
      to,
      subject: 'Reset your RoadLife password',
      html,
      text,
    });
  }
}

export default new EmailService();
