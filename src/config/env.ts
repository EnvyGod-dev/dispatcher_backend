import 'dotenv/config';
import { z } from 'zod';

console.log('🔐 Loading environment variables...');

const serverSchema = z.object({
  // Node
  NODE_ENV: z.string(),
  // Database
  DATABASE_URL: z.string().min(1),

  // Supabase
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  FRONTEND_URL: z.string(),
  COOKIE_SUBDOMAIN: z.string(),
  SMTP_HOST: z.string(),
  SMTP_PORT: z.string(),
  SMTP_USER: z.string(),
  SMTP_PASSWORD: z.string(),
  SMTP_FROM_EMAIL: z.string(),
  SMTP_FROM_NAME: z.string(),
  APP_URL: z.string(),
});

const _serverEnv = serverSchema.safeParse(process.env);

if (!_serverEnv.success) {
  console.error('❌ Invalid environment variables:\n');
  _serverEnv.error.issues.forEach((issue) => {
    console.error(issue);
  });
  throw new Error('Invalid environment variables');
}

const {
  NODE_ENV,
  DATABASE_URL,
  SUPABASE_SERVICE_ROLE,
  SUPABASE_URL,
  SENTRY_DSN,
  FRONTEND_URL,
  COOKIE_SUBDOMAIN,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASSWORD,
  SMTP_FROM_EMAIL,
  SMTP_FROM_NAME,
  APP_URL,
} = _serverEnv.data;

export const env = {
  NODE_ENV,
  DATABASE_URL,
  SUPABASE_SERVICE_ROLE,
  SUPABASE_URL,
  SENTRY_DSN,
  FRONTEND_URL,
  COOKIE_SUBDOMAIN,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASSWORD,
  SMTP_FROM_EMAIL,
  SMTP_FROM_NAME,
  APP_URL,
};

console.log('✅ Environment variables loaded');
