import type { FastifyInstance } from 'fastify';
import type { ServiceStatus, SettingItem, SettingsResponse } from '@travelsteps/shared';
import { currentUser, requireAdmin } from '../auth/guard.js';
import { HttpError } from '../errors.js';
import { APP_VERSION } from '../version.js';

/** Secrets are never revealed, not even partially: only whether they are set. */
export function maskSecret(value: string | undefined): string | null {
  return value ? '••••••••' : null;
}

/** Read-only overview of the configuration; changes are made in the add-on configuration. */
export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  const { config, immich, routing, notifications, backups } = app.ctx;
  app.addHook('preHandler', requireAdmin);

  app.get('/', async (req): Promise<SettingsResponse> => {
    const src = (key: string) => config.sources?.[key] ?? 'default';
    const item = (
      key: string,
      label: string,
      value: string | number | boolean | undefined | null,
      secret = false,
    ): SettingItem => ({
      key,
      label,
      value: secret
        ? maskSecret(value === undefined || value === null ? undefined : String(value))
        : value === undefined || value === null || value === ''
          ? null
          : String(value),
      secret,
      source: src(key),
    });

    const settings: SettingItem[] = [
      item('IMMICH_URL', 'Immich URL', config.immichUrl),
      item('ORS_API_KEY', 'OpenRouteService API-sleutel', config.orsApiKey, true),
      item('ORS_URL', 'OpenRouteService URL', config.orsUrl),
      item('PUBLIC_URL', 'Publieke URL', config.publicUrl),
      item('COOKIE_SECURE', 'Veilige cookies (HTTPS)', config.cookieSecure),
      item('TRUST_CLOUDFLARE', 'Cloudflare vertrouwen', config.trustCloudflare),
      item('SESSION_TTL_DAYS', 'Sessieduur (dagen)', config.sessionTtlDays),
      item('DATA_DIR', 'Datamap', config.dataDir),
      item('LOG_LEVEL', 'Logniveau', config.logLevel),
      item('BACKUP_KEEP', 'Aantal back-ups', config.backupKeep ?? 0),
    ];

    // Checked with the admin's own key; every traveller sets their own key in their profile.
    let immichStatus: ServiceStatus = { configured: false, ok: false, detail: null };
    const client = immich.tryClient(currentUser(req).id);
    if (immich.urlConfigured && !client) {
      immichStatus = {
        configured: false,
        ok: false,
        detail: 'Immich URL ingesteld; stel je eigen API-sleutel in bij Profiel.',
      };
    } else if (client) {
      try {
        const version = await client.version();
        immichStatus = { configured: true, ok: true, detail: `Versie ${version}` };
      } catch (err) {
        immichStatus = {
          configured: true,
          ok: false,
          detail: err instanceof HttpError ? err.message : 'Onbekende fout',
        };
      }
    }

    const routingStatus: ServiceStatus = !routing.configured
      ? {
          configured: false,
          ok: false,
          detail: 'Geen sleutel: wandel-, fiets- en autoroutes worden als rechte lijn getekend.',
        }
      : !routing.lastResult
        ? { configured: true, ok: true, detail: 'Sleutel ingesteld; nog geen route berekend.' }
        : routing.lastResult.ok
          ? {
              configured: true,
              ok: true,
              detail: `Laatste route berekend op ${new Date(routing.lastResult.at).toLocaleString('nl-NL')}.`,
            }
          : {
              configured: true,
              ok: false,
              detail: `Laatste route mislukt (${routing.lastResult.detail ?? 'onbekende fout'}); rechte lijn gebruikt.`,
            };

    const b = backups.status();
    const backupStatus: ServiceStatus = !b.enabled
      ? { configured: false, ok: false, detail: 'Uitgeschakeld (backup_keep is 0).' }
      : b.lastError
        ? { configured: true, ok: false, detail: `Laatste back-up mislukt: ${b.lastError}` }
        : b.last
          ? {
              configured: true,
              ok: true,
              detail: `Laatste back-up ${b.last.file} (${(b.last.size / 1024 / 1024).toFixed(1)} MB) op ${new Date(b.last.at).toLocaleString('nl-NL')}; de nieuwste ${b.keep} worden bewaard in ${b.dir}.`,
            }
          : {
              configured: true,
              ok: true,
              detail: `Nog geen back-up; elke nacht na 03:00 wordt er een gemaakt in ${b.dir}.`,
            };

    return {
      version: APP_VERSION,
      mode: config.addonMode ? 'addon' : 'docker',
      settings,
      immich: immichStatus,
      routing: routingStatus,
      backup: backupStatus,
      push: notifications.pushAvailable
        ? { configured: true, ok: true, detail: 'Pushmeldingen beschikbaar.' }
        : { configured: false, ok: false, detail: 'VAPID-sleutels konden niet worden gemaakt.' },
    };
  });
}
