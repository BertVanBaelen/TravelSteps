# Phase X – Hardening & release (v1.0.0)

## Goal
Production-ready, secure, maintainable. **This is always the last phase before v1**: new feature
phases are numbered before it (8, 9, …) and this phase stays "X".

## Tasks
- Security review: auth flows, authorization on every endpoint, media whitelist, CSRF, CSP, input validation, Markdown sanitization, dependency audit.
- Security headers (helmet), cookie flags verified behind Cloudflare Tunnel.
- Backups: documented host folder backup; optional nightly SQLite online backup into `/data/backups`.
- Logging (pino) with log rotation; health check in Docker.
- Tests: unit tests for content repository, stats summing, auth; Playwright smoke (login, create post, like, comment, map).
- Performance: image lazy loading, gzip/brotli, bundle size check.
- Documentation: install on Home Assistant (docker compose), Cloudflare Tunnel setup, env variables, Immich API key creation, ORS key, upgrade procedure.
- Version **1.0.0**: set in `code/config.yaml` (`version`, used by the Home Assistant add-on store to offer the update) and `code/server/src/version.ts` (`APP_VERSION`); both must be equal. Optionally add a test that checks this.
- cleanup the readme. add a roadmap voor v2. ask the user for this roadmap. the readme does not need info about all the phases but it needs technical info.
  (V2 roadmap ✅ prepared: `V2 roadmap.md` + `Analysis/V2/`; only link it from the README.)
- cleanup the config settings for home assistant. there are unused config settings now
- add the icon on the top left of the app header
- profile tab is not necessary, add the settings to the profile picture button at the top right with a menu

## Acceptance criteria
- No high/critical findings open.
- Fresh install from README works end-to-end on the HA server.
- Data restore from backup verified.
- Add-on shows version 1.0.0 in Home Assistant and updates from the previous version without data loss.

## Status – ✅ implemented (v1.0.0)
- Pending improvement from NEXT-ITERATION: notifications are more descriptive (comment text,
  post/travel excerpt in the list and in push messages).
- Security review: no critical/high/medium findings. Fixed the low finding (notifications of
  travels the user can no longer see are removed, so titles/excerpts don't leak) and restricted
  push endpoints to public HTTPS hosts. `npm audit`: `@fastify/static` 8 → 10 (high advisories),
  vitest 3 → 5 and `npm audit fix` for dev tools; now 0 vulnerabilities.
- Backups: nightly SQLite online backup into `<data>/backups` (after 03:00 or at start when today's
  is missing), newest `backup_keep` (default 7, 0 = off) kept; status on the Instellingen page;
  restore procedure in the README.
- Logging: pino to stdout; log rotation via docker compose (`json-file`, 10 MB × 3); Docker
  HEALTHCHECK on `/api/health`.
- Tests: backups, version check (`config.yaml` = `APP_VERSION`), compression, static serving/SPA
  fallback, notification access, push endpoint validation (56 tests). **Playwright smoke not
  added** (no browser available in this environment).
- Performance: gzip/brotli via `@fastify/compress`; lazy loading of thumbnails; less-used pages
  (editors, map, photos, profile, admin) code-split – main chunk 514 → 468 kB (142 kB gzip).
- README rewritten as technical documentation (install, Cloudflare Tunnel, configuration, Immich
  and ORS keys, backups/restore, logs, upgrade, release) with a link to the V2 roadmap.
- HA config: unused `immich_api_key` removed; `backup_keep` added.
- Header: app icon top left; Profiel tab replaced by the avatar menu (profile, admin, logout).
- Version 1.0.0 in `config.yaml`, `version.ts` and all `package.json` files.

**Still to verify manually on the HA server:** fresh install from the README, restore from a
backup, and the update from 0.4.3 → 1.0.0 without data loss.
