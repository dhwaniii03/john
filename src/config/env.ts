import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3030),
  HOST: z.string().default('localhost'),
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().default('roadlife'),
  DB_SSL: z.boolean().default(false),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  REDIS_TLS: z.boolean().default(false),
  LOCATION_SOCKET_ENABLED: z.boolean().default(false),
  LOCATION_HTTP_USES_REDIS: z.boolean().default(false),
  SOCKET_REDIS_ADAPTER: z.boolean().default(false),
  CORS_ORIGIN: z.string().default('*'),
  HTTP_LOCATION_DEPRECATION_AT: z.string().default('@1800000000'),
  HTTP_LOCATION_SUNSET_AT: z.string().default('Thu, 01 Jul 2027 00:00:00 GMT'),
  JOURNEY_LOCATIONS_RETENTION_DAYS: z.coerce.number().default(60),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('RoadLife <onboarding@resend.dev>'),
  OTP_EXPIRY_MINUTES: z.coerce.number().default(10),
  OTP_COOLDOWN_SECONDS: z.coerce.number().default(60),
  OTP_MAX_VERIFY_ATTEMPTS: z.coerce.number().default(5),
});

const parseBoolean = (val: string | undefined, defaultValue: boolean): boolean => {
  if (val === undefined || val === '') return defaultValue;
  return val.toLowerCase() === 'true' || val === '1';
};

const isTestEnv = process.env.NODE_ENV === 'test';

const rawEnv = {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  HOST: process.env.HOST,
  DATABASE_URL: process.env.DATABASE_URL,
  DB_HOST: process.env.DB_HOST || process.env.HOST,
  DB_PORT: process.env.DB_PORT,
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_NAME:
    isTestEnv && process.env.TEST_DB_NAME
      ? process.env.TEST_DB_NAME
      : process.env.DB_NAME || process.env.DATABASE,
  DB_SSL: parseBoolean(process.env.DB_SSL, false),
  JWT_SECRET:
    process.env.JWT_SECRET ||
    (process.env.NODE_ENV === 'production' ? undefined : 'default_secret_key_change_in_production'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  REDIS_URL:
    isTestEnv && process.env.TEST_REDIS_URL
      ? process.env.TEST_REDIS_URL
      : process.env.REDIS_URL,
  REDIS_TLS: parseBoolean(process.env.REDIS_TLS, false),
  LOCATION_SOCKET_ENABLED: parseBoolean(process.env.LOCATION_SOCKET_ENABLED, false),
  LOCATION_HTTP_USES_REDIS: parseBoolean(process.env.LOCATION_HTTP_USES_REDIS, false),
  SOCKET_REDIS_ADAPTER: parseBoolean(process.env.SOCKET_REDIS_ADAPTER, false),
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  HTTP_LOCATION_DEPRECATION_AT: process.env.HTTP_LOCATION_DEPRECATION_AT || '@1800000000',
  HTTP_LOCATION_SUNSET_AT: process.env.HTTP_LOCATION_SUNSET_AT || 'Thu, 01 Jul 2027 00:00:00 GMT',
  JOURNEY_LOCATIONS_RETENTION_DAYS: process.env.JOURNEY_LOCATIONS_RETENTION_DAYS
    ? Number(process.env.JOURNEY_LOCATIONS_RETENTION_DAYS)
    : 60,
  RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
  EMAIL_FROM: process.env.EMAIL_FROM || 'RoadLife <onboarding@resend.dev>',
  OTP_EXPIRY_MINUTES: process.env.OTP_EXPIRY_MINUTES || 10,
  OTP_COOLDOWN_SECONDS: process.env.OTP_COOLDOWN_SECONDS || 60,
  OTP_MAX_VERIFY_ATTEMPTS: process.env.OTP_MAX_VERIFY_ATTEMPTS || 5,
};

const parsed = envSchema.safeParse(rawEnv);

if (!parsed.success) {
  console.error('❌ Environment configuration validation failed:', parsed.error.format());
  throw new Error('Environment configuration validation failed');
}

export const env = {
  nodeEnv: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  host: parsed.data.HOST,
  databaseUrl: parsed.data.DATABASE_URL,
  dbHost: parsed.data.DB_HOST,
  dbPort: parsed.data.DB_PORT,
  dbUser: parsed.data.DB_USER,
  dbPassword: parsed.data.DB_PASSWORD,
  database: parsed.data.DB_NAME,
  dbSsl: parsed.data.DB_SSL,
  jwtSecret: parsed.data.JWT_SECRET,
  jwtExpiresIn: parsed.data.JWT_EXPIRES_IN,
  upstashRedisRestUrl: parsed.data.UPSTASH_REDIS_REST_URL,
  upstashRedisRestToken: parsed.data.UPSTASH_REDIS_REST_TOKEN,
  redisUrl: parsed.data.REDIS_URL,
  redisTls: parsed.data.REDIS_TLS,
  locationSocketEnabled: parsed.data.LOCATION_SOCKET_ENABLED,
  locationHttpUsesRedis: parsed.data.LOCATION_HTTP_USES_REDIS,
  socketRedisAdapter: parsed.data.SOCKET_REDIS_ADAPTER,
  corsOrigin: parsed.data.CORS_ORIGIN,
  httpLocationDeprecationAt: parsed.data.HTTP_LOCATION_DEPRECATION_AT,
  httpLocationSunsetAt: parsed.data.HTTP_LOCATION_SUNSET_AT,
  journeyLocationsRetentionDays: parsed.data.JOURNEY_LOCATIONS_RETENTION_DAYS,
  resendApiKey: parsed.data.RESEND_API_KEY,
  emailFrom: parsed.data.EMAIL_FROM,
  otpExpiryMinutes: parsed.data.OTP_EXPIRY_MINUTES,
  otpCooldownSeconds: parsed.data.OTP_COOLDOWN_SECONDS,
  otpMaxVerifyAttempts: parsed.data.OTP_MAX_VERIFY_ATTEMPTS,
};
