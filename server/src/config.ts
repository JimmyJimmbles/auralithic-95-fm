import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (!Number.isInteger(nodeMajor) || nodeMajor < 20) {
  console.error('Node.js 20 or newer is required');
  process.exit(1);
}

const loadEnvFile = (file: string) => {
  if (!existsSync(file)) return;
  const text = readFileSync(file, 'utf8');
  for (const rawLine of text.split('\n')) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trim();
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2)
      || (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
};

loadEnvFile(path.resolve(process.cwd(), '.env'));

const present = (): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    env[key] = trimmed;
  }
  return env;
};

const optionalInt = z.preprocess(
  (value) => (value === undefined || value === '' ? undefined : value),
  z.coerce.number().int().min(1).max(65535).optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']),
  PORT: z.preprocess(
    (value) => (value === undefined || value === '' ? undefined : value),
    z.coerce.number().int().min(1).max(65535).default(3001),
  ),
  HOST: z.string().min(1).default('0.0.0.0'),
  DATABASE_URL: z.string().refine(
    (value) => value.startsWith('postgres://') || value.startsWith('postgresql://'),
    'must be a postgres URL',
  ),
  MEDIA_DRIVER: z.enum(['disk', 'r2']).optional(),
  MEDIA_ROOT: z.string().min(1).optional(),
  R2_ACCOUNT_ID: z.string().regex(/^[a-f0-9]{32}$/i, 'must be a 32 character account id').optional(),
  R2_ACCESS_KEY_ID: z.string().regex(/^\S+$/, 'must not contain whitespace').optional(),
  R2_SECRET_ACCESS_KEY: z.string().regex(/^\S+$/, 'must not contain whitespace').optional(),
  R2_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, 'must be a bucket name').optional(),
  R2_PUBLIC_BASE_URL: z.string().min(1).optional(),
  ADMIN_EMAIL: z.string().email(),
  SESSION_SECRET: z.string().min(32),
  APP_ORIGIN: z.string().min(1),
  ADMIN_ORIGIN: z.string().min(1).optional(),
  MAIL_MODE: z.enum(['log', 'smtp', 'off']).optional(),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: optionalInt,
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  MAIL_FROM: z.string().email().optional(),
  TRUST_PROXY: z.enum(['true', 'false']).optional(),
});

type DiskMedia = { driver: 'disk'; root: string; masterRoot: string };
type R2Media = {
  driver: 'r2';
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
};
type LogMail = { mode: 'log' };
type OffMail = { mode: 'off' };
type SmtpMail = { mode: 'smtp'; host: string; port: number; user: string; pass: string; from: string };

export type Config = {
  nodeEnv: 'development' | 'production';
  isProduction: boolean;
  port: number;
  host: string;
  databaseUrl: string;
  sessionSecret: string;
  adminEmail: string;
  appOrigin: string;
  adminOrigin: string;
  trustProxy: boolean;
  mail: LogMail | OffMail | SmtpMail;
  media: DiskMedia | R2Media;
};

const fail = (lines: string[]): never => {
  console.error(`Invalid environment:\n${lines.map((line) => `- ${line}`).join('\n')}`);
  process.exit(1);
};

const parseOrigin = (value: string): string | null => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) return null;
  if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) return null;
  return url.origin;
};

const parsePublicBase = (value: string): string | null => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
  const pathname = url.pathname.replace(/\/$/, '');
  return `${url.origin}${pathname === '/' ? '' : pathname}`;
};

const loadConfig = (): Config => {
  const parsed = envSchema.safeParse(present());
  if (!parsed.success) {
    throw fail(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`));
  }
  const env = parsed.data;
  const problems: string[] = [];
  const nodeEnv = env.NODE_ENV;
  const driver = env.MEDIA_DRIVER ?? (nodeEnv === 'development' ? 'disk' : undefined);
  if (!driver) problems.push('MEDIA_DRIVER: set disk or r2');

  let mailMode = env.MAIL_MODE;
  if (nodeEnv === 'production') {
    if (mailMode === 'log') problems.push('MAIL_MODE: log is not allowed in production');
    if (!mailMode) mailMode = 'off';
  } else if (!mailMode) {
    mailMode = 'log';
  }

  const appOrigin = parseOrigin(env.APP_ORIGIN);
  if (!appOrigin) problems.push('APP_ORIGIN: must be an http(s) origin without a path');
  const adminOrigin = env.ADMIN_ORIGIN ? parseOrigin(env.ADMIN_ORIGIN) : appOrigin;
  if (env.ADMIN_ORIGIN && !adminOrigin) problems.push('ADMIN_ORIGIN: must be an http(s) origin without a path');

  const masterRoot = path.resolve(process.cwd(), 'var/masters');
  let media: Config['media'] | undefined;
  if (driver === 'disk') {
    if (nodeEnv === 'production' && !env.MEDIA_ROOT) {
      problems.push('MEDIA_ROOT: required when MEDIA_DRIVER=disk');
    } else {
      const root = path.resolve(process.cwd(), env.MEDIA_ROOT ?? '../public/media');
      const overlaps = root === masterRoot
        || root.startsWith(`${masterRoot}${path.sep}`)
        || masterRoot.startsWith(`${root}${path.sep}`);
      if (overlaps) problems.push('MEDIA_ROOT: master storage must stay outside the public media directory');
      else media = { driver: 'disk', root, masterRoot };
    }
  } else if (driver === 'r2') {
    const accountId = env.R2_ACCOUNT_ID;
    const accessKeyId = env.R2_ACCESS_KEY_ID;
    const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
    const bucket = env.R2_BUCKET;
    const publicBaseUrl = env.R2_PUBLIC_BASE_URL ? parsePublicBase(env.R2_PUBLIC_BASE_URL) : null;
    if (!accountId) problems.push('R2_ACCOUNT_ID: required when MEDIA_DRIVER=r2');
    if (!accessKeyId) problems.push('R2_ACCESS_KEY_ID: required when MEDIA_DRIVER=r2');
    if (!secretAccessKey) problems.push('R2_SECRET_ACCESS_KEY: required when MEDIA_DRIVER=r2');
    if (!bucket) problems.push('R2_BUCKET: required when MEDIA_DRIVER=r2');
    if (!env.R2_PUBLIC_BASE_URL) problems.push('R2_PUBLIC_BASE_URL: required when MEDIA_DRIVER=r2');
    else if (!publicBaseUrl) problems.push('R2_PUBLIC_BASE_URL: must be an https URL');
    if (accountId && accessKeyId && secretAccessKey && bucket && publicBaseUrl) {
      media = { driver: 'r2', accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
    }
  }

  let mail: Config['mail'] | undefined;
  if (mailMode === 'off') mail = { mode: 'off' };
  if (mailMode === 'log' && nodeEnv !== 'production') mail = { mode: 'log' };
  if (mailMode === 'smtp') {
    const port = env.SMTP_PORT;
    if (!env.SMTP_HOST) problems.push('SMTP_HOST: required when MAIL_MODE=smtp');
    if (!port) problems.push('SMTP_PORT: required when MAIL_MODE=smtp');
    if (!env.SMTP_USER) problems.push('SMTP_USER: required when MAIL_MODE=smtp');
    if (!env.SMTP_PASS) problems.push('SMTP_PASS: required when MAIL_MODE=smtp');
    if (!env.MAIL_FROM) problems.push('MAIL_FROM: required when MAIL_MODE=smtp');
    if (env.SMTP_HOST && port && env.SMTP_USER && env.SMTP_PASS && env.MAIL_FROM) {
      mail = {
        mode: 'smtp',
        host: env.SMTP_HOST,
        port,
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
        from: env.MAIL_FROM.toLowerCase(),
      };
    }
  }

  if (!appOrigin || !adminOrigin || !media || !mail || problems.length > 0) {
    if (problems.length === 0) problems.push('env: incomplete configuration');
    throw fail(problems);
  }

  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port: env.PORT,
    host: env.HOST,
    databaseUrl: env.DATABASE_URL,
    sessionSecret: env.SESSION_SECRET,
    adminEmail: env.ADMIN_EMAIL.toLowerCase(),
    appOrigin,
    adminOrigin,
    trustProxy: env.TRUST_PROXY === 'true',
    mail,
    media,
  };
};

export const config = loadConfig();
