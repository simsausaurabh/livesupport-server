import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import { z } from 'zod';

// ── Load .env manually ─────────────────────────────────────────────
function loadEnvFile() {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../.env'),
    resolve(process.cwd(), '../../.env'),
  ];

  for (const envPath of candidates) {
    if (existsSync(envPath)) {
      const lines = readFileSync(envPath, 'utf-8').split('\n');

      for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith('#')) continue;

        const eqIdx = trimmed.indexOf('=');

        if (eqIdx === -1) continue;

        const key = trimmed.slice(0, eqIdx).trim();

        let val = trimmed.slice(eqIdx + 1).trim();

        // Remove wrapping quotes
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }

        if (!(key in process.env)) {
          process.env[key] = val;
        }
      }

      console.log(`📄 Loaded env from: ${envPath}`);
      return;
    }
  }

  console.warn('⚠️ No .env file found — using existing process.env');
}

loadEnvFile();

// ── Schema ─────────────────────────────────────────────────────────
const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  PORT: z.coerce.number().default(4000),

  // Required
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),

  JWT_EXPIRES_IN: z.string().default('7d'),

  // Redis
  REDIS_URL: z.string().optional(),

  // Optional
  ANTHROPIC_API_KEY: z.string().default(''),

  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  STRIPE_TEAM_PRICE_ID: z.string().default(''),
  STRIPE_BUSINESS_PRICE_ID: z.string().default(''),

  RESEND_API_KEY: z.string().default(''),
  EMAIL_FROM: z.string().default('support@livesupport.app'),

  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),

  // CORS
  WEB_APP_URL: z.string().default('http://localhost:3000'),
  WIDGET_CDN_URL: z.string().default('http://localhost:3001'),
});

function validateEnv() {
  const result = schema.safeParse(process.env);

  if (!result.success) {
    console.error('\n❌ Missing / invalid environment variables:\n');

    for (const [field, errors] of Object.entries(
      result.error.flatten().fieldErrors
    )) {
      console.error(`   ${field}: ${(errors as string[]).join(', ')}`);
    }

    console.error('\nCheck your .env file.\n');

    process.exit(1);
  }

  const data = result.data;

  const optionalKeys = [
    'ANTHROPIC_API_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'RESEND_API_KEY',
    'GOOGLE_CLIENT_ID',
  ] as const;

  const missing = optionalKeys.filter(
    (k) => !data[k] || data[k].includes('placeholder')
  );

  if (missing.length > 0) {
    if (data.NODE_ENV === 'production') {
      console.error(
        `❌ These env vars must be set in production: ${missing.join(', ')}`
      );

      process.exit(1);
    } else {
      console.warn(
        `⚠️ Placeholder env vars detected (allowed in dev): ${missing.join(', ')}`
      );
    }
  }

  return data;
}

export const env = validateEnv();

export type Env = z.infer<typeof schema>;