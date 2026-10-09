import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** Home Assistant add-on options are written here by the Supervisor. */
export const ADDON_OPTIONS_FILE = '/data/options.json';

export interface AppConfig {
  port: number;
  host: string;
  dataDir: string;
  publicUrl?: string;
  cookieSecure: boolean;
  trustCloudflare: boolean;
  sessionTtlDays: number;
  sessionSecret: string;
  webDistDir: string | null;
  immichUrl?: string;
  orsApiKey?: string;
  /** OpenRouteService base URL (default: the public API; can point to a self-hosted ORS). */
  orsUrl?: string;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  /** Number of nightly database backups to keep in `<data>/backups`; 0 = no backups. */
  backupKeep?: number;
  /** Running as Home Assistant add-on (options.json present). */
  addonMode?: boolean;
  /**
   * First admin account, only used when the database has no users yet. Removed from the config
   * object right after the account is created.
   */
  initialAdmin?: { username: string; password: string };
  /** Where each env-style setting came from (for the settings page). */
  sources?: Record<string, 'addon' | 'env' | 'default'>;
}

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  HOST: z.string().default('0.0.0.0'),
  DATA_DIR: z.string().default('/data'),
  PUBLIC_URL: z.string().url().optional(),
  COOKIE_SECURE: bool.default('true'),
  TRUST_CLOUDFLARE: bool.default('true'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET moet minstens 32 tekens zijn').optional(),
  WEB_DIST_DIR: z.string().optional(),
  IMMICH_URL: z.string().url().optional(),
  ORS_API_KEY: z.string().optional(),
  ORS_URL: z.string().url().optional(),
  ADMIN_USERNAME: z.string().trim().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  BACKUP_KEEP: z.coerce.number().int().min(0).max(365).default(7),
});

/** Maps Home Assistant add-on option keys to environment variable names. */
const ADDON_OPTION_TO_ENV: Record<string, string> = {
  data_dir: 'DATA_DIR',
  public_url: 'PUBLIC_URL',
  cookie_secure: 'COOKIE_SECURE',
  trust_cloudflare: 'TRUST_CLOUDFLARE',
  session_ttl_days: 'SESSION_TTL_DAYS',
  immich_url: 'IMMICH_URL',
  ors_api_key: 'ORS_API_KEY',
  ors_url: 'ORS_URL',
  admin_username: 'ADMIN_USERNAME',
  admin_password: 'ADMIN_PASSWORD',
  log_level: 'LOG_LEVEL',
  backup_keep: 'BACKUP_KEEP',
};

function readAddonOptions(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {};
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const envName = ADDON_OPTION_TO_ENV[key];
    if (envName && value !== null && value !== undefined) result[envName] = String(value);
  }
  return result;
}

function loadOrCreateSessionSecret(dataDir: string): string {
  const file = path.join(dataDir, '.session-secret');
  if (fs.existsSync(file)) {
    const secret = fs.readFileSync(file, 'utf8').trim();
    if (secret.length >= 32) return secret;
  }
  const secret = crypto.randomBytes(48).toString('base64url');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

function defaultWebDistDir(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidate = path.resolve(here, '../../web/dist');
  return fs.existsSync(path.join(candidate, 'index.html')) ? candidate : null;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  addonOptionsFile = ADDON_OPTIONS_FILE,
): AppConfig {
  const addonOptions = readAddonOptions(addonOptionsFile);
  const merged: Record<string, string> = {};
  const sources: Record<string, 'addon' | 'env' | 'default'> = {};
  for (const key of Object.keys(envSchema.shape)) sources[key] = 'default';
  for (const [source, values] of [
    ['env', env],
    ['addon', addonOptions],
  ] as const) {
    for (const [key, value] of Object.entries(values)) {
      // Treat empty values (e.g. `IMMICH_URL=` in .env) as not set.
      if (value === undefined || value === '') continue;
      merged[key] = value;
      if (key in sources) sources[key] = source;
    }
  }

  const parsed = envSchema.safeParse(merged);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Ongeldige configuratie: ${issues}`);
  }
  const e = parsed.data;

  const dataDir = path.resolve(e.DATA_DIR);
  fs.mkdirSync(dataDir, { recursive: true });

  // Keep the plaintext admin password out of the process environment once read.
  if (env === process.env) delete process.env.ADMIN_PASSWORD;
  const initialAdmin =
    e.ADMIN_USERNAME || e.ADMIN_PASSWORD
      ? { username: e.ADMIN_USERNAME ?? '', password: e.ADMIN_PASSWORD ?? '' }
      : undefined;

  return {
    port: e.PORT,
    host: e.HOST,
    dataDir,
    publicUrl: e.PUBLIC_URL,
    cookieSecure: e.COOKIE_SECURE,
    trustCloudflare: e.TRUST_CLOUDFLARE,
    sessionTtlDays: e.SESSION_TTL_DAYS,
    sessionSecret: e.SESSION_SECRET ?? loadOrCreateSessionSecret(dataDir),
    webDistDir: e.WEB_DIST_DIR ? path.resolve(e.WEB_DIST_DIR) : defaultWebDistDir(),
    immichUrl: e.IMMICH_URL,
    orsApiKey: e.ORS_API_KEY,
    orsUrl: e.ORS_URL,
    logLevel: e.LOG_LEVEL,
    backupKeep: e.BACKUP_KEEP,
    addonMode: fs.existsSync(addonOptionsFile),
    initialAdmin,
    sources,
  };
}
