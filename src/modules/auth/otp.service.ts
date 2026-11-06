import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import redis, { isRedisAvailable } from '../../config/redis.js';
import emailService, { type IEmailService } from '../../services/email.service.js';

export interface OtpRecord {
  otp: string;
  expiresAt: Date;
  verified: boolean;
  purpose: string;
  attempts: number;
}

export interface SendOtpOptions {
  identifier: string; // email or phone number
  purpose?: string;
  expiryMinutes?: number;
  forceSecure?: boolean;
  ignoreCooldown?: boolean;
}

export interface VerifyOtpOptions {
  identifier: string;
  otp: string;
  purpose?: string;
  forceSecure?: boolean;
}

export interface SendOtpResult {
  success: boolean;
  message: string;
  expiresInMinutes: number;
  dummyOtp?: string;
}

export interface VerifyOtpResult {
  valid: boolean;
  message?: string;
}

/**
 * Mask identifier for safe logging without exposing PII.
 */
function maskIdentifier(identifier: string): string {
  if (identifier.includes('@')) {
    const parts = identifier.split('@');
    if (parts.length === 2) {
      const [name, domain] = parts;
      const visible = name.slice(0, Math.min(2, name.length));
      return `${visible}***@${domain}`;
    }
  }
  if (identifier.length > 4) {
    return `${identifier.slice(0, 2)}***${identifier.slice(-2)}`;
  }
  return '***';
}

export class OtpService {
  private static instance: OtpService;
  private readonly defaultExpiryMinutes = env.otpExpiryMinutes || 10;
  private readonly cooldownSeconds = env.otpCooldownSeconds || 60;
  private readonly maxVerifyAttempts = env.otpMaxVerifyAttempts || 5;

  // In-memory fallback store when Redis is unavailable
  private readonly inMemoryStore: Map<string, OtpRecord> = new Map();
  private readonly inMemoryCooldowns: Map<string, number> = new Map();

  constructor(private readonly mailService: IEmailService = emailService) {}

  public static getInstance(): OtpService {
    if (!OtpService.instance) {
      OtpService.instance = new OtpService();
    }
    return OtpService.instance;
  }

  /**
   * Resets internal in-memory stores for clean testing.
   */
  public clearMemoryStore(): void {
    this.inMemoryStore.clear();
    this.inMemoryCooldowns.clear();
  }

  private normalizeKey(identifier: string, purpose: string = 'REGISTRATION'): string {
    return `${purpose.trim().toUpperCase()}:${identifier.trim().toLowerCase()}`;
  }

  private getRedisOtpKey(key: string): string {
    return `auth:otp:${key}`;
  }

  private getRedisCooldownKey(key: string): string {
    return `auth:otp:cooldown:${key}`;
  }

  public isEmail(identifier: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim());
  }

  /**
   * Generates a cryptographically secure 6-digit numeric OTP.
   */
  public generateSecureOtp(): string {
    return crypto.randomInt(100000, 1000000).toString();
  }

  /**
   * Checks whether the request is currently in cooldown.
   */
  private async checkCooldown(normalizedKey: string): Promise<{ inCooldown: boolean; remainingSeconds: number }> {
    if (isRedisAvailable()) {
      try {
        const ttl = await redis.ttl(this.getRedisCooldownKey(normalizedKey));
        if (ttl > 0) {
          return { inCooldown: true, remainingSeconds: ttl };
        }
      } catch (err: any) {
        console.warn('[OTP Service] Redis cooldown check fallback to in-memory:', err.message);
      }
    }

    const expiresAt = this.inMemoryCooldowns.get(normalizedKey);
    if (expiresAt && expiresAt > Date.now()) {
      const remainingSeconds = Math.ceil((expiresAt - Date.now()) / 1000);
      return { inCooldown: true, remainingSeconds };
    }

    return { inCooldown: false, remainingSeconds: 0 };
  }

  /**
   * Sets the cooldown window after an OTP is generated.
   */
  private async setCooldown(normalizedKey: string): Promise<void> {
    if (isRedisAvailable()) {
      try {
        await redis.set(
          this.getRedisCooldownKey(normalizedKey),
          '1',
          'EX',
          this.cooldownSeconds
        );
      } catch (err: any) {
        console.warn('[OTP Service] Redis cooldown set fallback to in-memory:', err.message);
      }
    }

    this.inMemoryCooldowns.set(normalizedKey, Date.now() + this.cooldownSeconds * 1000);
  }

  /**
   * Persists an OTP record in Redis or in-memory fallback.
   */
  private async saveOtpRecord(normalizedKey: string, record: OtpRecord, ttlSeconds: number): Promise<void> {
    if (isRedisAvailable()) {
      try {
        const payload = JSON.stringify({
          otp: record.otp,
          expiresAt: record.expiresAt.toISOString(),
          verified: record.verified,
          purpose: record.purpose,
          attempts: record.attempts,
        });
        await redis.set(this.getRedisOtpKey(normalizedKey), payload, 'EX', ttlSeconds);
      } catch (err: any) {
        console.warn('[OTP Service] Redis save fallback to in-memory:', err.message);
      }
    }

    this.inMemoryStore.set(normalizedKey, record);
  }

  /**
   * Retrieves an OTP record from Redis or in-memory fallback.
   */
  private async getOtpRecord(normalizedKey: string): Promise<OtpRecord | null> {
    if (isRedisAvailable()) {
      try {
        const raw = await redis.get(this.getRedisOtpKey(normalizedKey));
        if (raw) {
          const parsed = JSON.parse(raw);
          return {
            otp: parsed.otp,
            expiresAt: new Date(parsed.expiresAt),
            verified: Boolean(parsed.verified),
            purpose: parsed.purpose,
            attempts: Number(parsed.attempts || 0),
          };
        }
      } catch (err: any) {
        console.warn('[OTP Service] Redis get fallback to in-memory:', err.message);
      }
    }

    const localRecord = this.inMemoryStore.get(normalizedKey);
    return localRecord || null;
  }

  /**
   * Deletes an OTP record from Redis and in-memory store.
   */
  private async deleteOtpRecord(normalizedKey: string): Promise<void> {
    if (isRedisAvailable()) {
      try {
        await redis.del(this.getRedisOtpKey(normalizedKey));
      } catch (err: any) {
        console.warn('[OTP Service] Redis delete fallback to in-memory:', err.message);
      }
    }

    this.inMemoryStore.delete(normalizedKey);
  }

  /**
   * Generates and dispatches a cryptographically secure OTP.
   * If identifier is an email, sends via Resend email service.
   */
  async sendOtp(options: SendOtpOptions): Promise<SendOtpResult> {
    const {
      identifier,
      purpose = 'REGISTRATION',
      expiryMinutes = this.defaultExpiryMinutes,
      forceSecure = false,
      ignoreCooldown = false,
    } = options;

    const cleanIdentifier = identifier.trim().toLowerCase();
    const cleanPurpose = purpose.trim().toUpperCase();
    const normalizedKey = this.normalizeKey(cleanIdentifier, cleanPurpose);

    // 1. Enforce Resend cooldown unless explicitly bypassed (e.g., in unit tests)
    if (!ignoreCooldown) {
      const cooldown = await this.checkCooldown(normalizedKey);
      if (cooldown.inCooldown) {
        throw new Error(
          `Please wait ${cooldown.remainingSeconds} seconds before requesting a new verification code.`
        );
      }
    }

    // 2. Generate OTP:
    // Production always enforces cryptographic generation.
    // Non-production uses secure generation if forceSecure is requested,
    // or falls back to development convenience OTP (e.g. DUMMY_OTP or '1234')
    const isProd = env.nodeEnv === 'production';
    let otp: string;

    if (process.env.DUMMY_OTP && !isProd && !forceSecure) {
      otp = process.env.DUMMY_OTP;
    } else {
      otp = this.generateSecureOtp();
    }

    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
    const ttlSeconds = expiryMinutes * 60;

    const record: OtpRecord = {
      otp,
      expiresAt,
      verified: false,
      purpose: cleanPurpose,
      attempts: 0,
    };

    // 3. Persist record & set cooldown
    await this.saveOtpRecord(normalizedKey, record, ttlSeconds);
    await this.setCooldown(normalizedKey);

    console.log(
      `[OTP Service] Dispatching OTP for [${maskIdentifier(cleanIdentifier)}] (Purpose: ${cleanPurpose})`
    );

    // 4. Dispatch via Email if identifier is an email address
    if (this.isEmail(cleanIdentifier)) {
      let emailResult;
      if (cleanPurpose === 'PASSWORD_RESET') {
        emailResult = await this.mailService.sendPasswordResetEmail({
          to: cleanIdentifier,
          otp,
          expiryMinutes,
        });
      } else {
        emailResult = await this.mailService.sendOtpEmail({
          to: cleanIdentifier,
          otp,
          purpose: cleanPurpose,
          expiryMinutes,
        });
      }

      if (!emailResult.success) {
        await this.deleteOtpRecord(normalizedKey);
        throw new Error(
          emailResult.error || 'Failed to dispatch verification email. Please try again later.'
        );
      }
    }

    return {
      success: true,
      message: `Verification code sent successfully to ${cleanIdentifier}`,
      expiresInMinutes: expiryMinutes,
      // Only return dummyOtp if DUMMY_OTP was explicitly set in environment
      dummyOtp: process.env.DUMMY_OTP && !isProd && !forceSecure ? otp : undefined,
    };
  }

  /**
   * Verifies the supplied OTP against the stored record.
   * Enforces expiry, attempt limits, and purpose binding.
   */
  async verifyOtp(options: VerifyOtpOptions): Promise<VerifyOtpResult> {
    const { identifier, otp, purpose = 'REGISTRATION', forceSecure = false } = options;
    const isProd = env.nodeEnv === 'production';

    if (!otp) {
      return { valid: false, message: 'Verification code is required' };
    }

    const cleanIdentifier = identifier.trim().toLowerCase();
    const cleanPurpose = purpose.trim().toUpperCase();
    const normalizedKey = this.normalizeKey(cleanIdentifier, cleanPurpose);

    const record = await this.getOtpRecord(normalizedKey);

    if (!record) {
      return {
        valid: false,
        message: 'No verification code was requested for this account or it has expired.',
      };
    }

    // Verify purpose binding
    if (record.purpose !== cleanPurpose) {
      return {
        valid: false,
        message: 'Verification code does not match the requested purpose.',
      };
    }

    // Check expiry
    if (new Date() > record.expiresAt) {
      await this.deleteOtpRecord(normalizedKey);
      return {
        valid: false,
        message: 'Verification code has expired. Please request a new code.',
      };
    }

    // Development fallback for fixed dummy OTP (STRICTLY when DUMMY_OTP is set and requires active record)
    const allowDummy = !isProd && !forceSecure && Boolean(process.env.DUMMY_OTP);
    const defaultDummyOtp = process.env.DUMMY_OTP;

    if (allowDummy && defaultDummyOtp && otp === defaultDummyOtp) {
      record.verified = true;
      await this.saveOtpRecord(normalizedKey, record, 300);
      return { valid: true };
    }

    // Check attempt limits
    if (record.attempts >= this.maxVerifyAttempts) {
      await this.deleteOtpRecord(normalizedKey);
      return {
        valid: false,
        message: 'Maximum verification attempts exceeded. Please request a new code.',
      };
    }

    // Increment attempt count
    record.attempts += 1;

    // Verify OTP match
    if (record.otp !== otp.trim()) {
      const remainingAttempts = this.maxVerifyAttempts - record.attempts;
      const ttlRemaining = Math.max(1, Math.ceil((record.expiresAt.getTime() - Date.now()) / 1000));

      if (remainingAttempts <= 0) {
        await this.deleteOtpRecord(normalizedKey);
        return {
          valid: false,
          message: 'Maximum verification attempts exceeded. Please request a new code.',
        };
      }

      await this.saveOtpRecord(normalizedKey, record, ttlRemaining);
      return {
        valid: false,
        message: `Invalid verification code. You have ${remainingAttempts} attempt(s) remaining.`,
      };
    }

    // Code is valid - mark as verified and retain for short consumption window (e.g. 5 mins)
    record.verified = true;
    await this.saveOtpRecord(normalizedKey, record, 300);

    return { valid: true };
  }

  /**
   * Consumes and clears the OTP record after successful registration or password reset.
   */
  async clearOtp(identifier: string, purpose: string = 'REGISTRATION'): Promise<void> {
    const cleanIdentifier = identifier.trim().toLowerCase();
    const cleanPurpose = purpose.trim().toUpperCase();
    const normalizedKey = this.normalizeKey(cleanIdentifier, cleanPurpose);
    await this.deleteOtpRecord(normalizedKey);
  }
}

export default OtpService.getInstance();
