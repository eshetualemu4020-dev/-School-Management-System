import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const readEnv = (key: string, fallback?: string): string | undefined => {
  const value = process.env[key];
  if (value !== undefined && value.trim() !== '') {
    return value.trim();
  }

  return fallback;
};

export const env = {
  NODE_ENV: readEnv('NODE_ENV', 'development') ?? 'development',
  PORT: Number(readEnv('PORT', '5000') ?? '5000'),
  CORS_ORIGINS: (readEnv('CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173') ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  MYSQL_SERVER: readEnv('MYSQL_SERVER', 'localhost') ?? 'localhost',
  MYSQL_PORT: Number(readEnv('MYSQL_PORT', '3306') ?? '3306'),
  MYSQL_USER: readEnv('MYSQL_USER', 'root') ?? 'root',
  MYSQL_PASSWORD: readEnv('MYSQL_PASSWORD', '') ?? '',
  MYSQL_DB: readEnv('MYSQL_DB', 'school_erp') ?? 'school_erp',
  JWT_SECRET: readEnv('JWT_SECRET', '') ?? '',
  FRONTEND_URL: readEnv('FRONTEND_URL', 'http://localhost:5173') ?? 'http://localhost:5173',
  SMTP_HOST: readEnv('SMTP_HOST', '') ?? '',
  SMTP_PORT: Number(readEnv('SMTP_PORT', '587') ?? '587'),
  SMTP_SECURE: readEnv('SMTP_SECURE', 'false') === 'true',
  SMTP_USER: readEnv('SMTP_USER', '') ?? '',
  SMTP_PASSWORD: readEnv('SMTP_PASSWORD', '') ?? '',
  SMTP_FROM: readEnv('SMTP_FROM', '') ?? ''
};

export const getJwtSecret = (): string => {
  const secret = env.JWT_SECRET;

  if (!secret || secret.trim() === '') {
    throw new Error('JWT_SECRET is not configured. Set a real secret in your environment before starting the server.');
  }

  return secret;
};

export const validateRuntimeEnv = (): void => {
  if (!env.JWT_SECRET || env.JWT_SECRET.trim() === '') {
    throw new Error('JWT_SECRET is required. Configure a real secret in the environment before running the app.');
  }

  if (!env.MYSQL_PASSWORD || env.MYSQL_PASSWORD.trim() === '') {
    throw new Error('MYSQL_PASSWORD is required. Configure your real database password before running the app.');
  }
};
