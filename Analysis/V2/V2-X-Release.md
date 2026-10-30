# Phase V2-X – Hardening & release (v2.0.0)

Status: ✅ implemented (2.0.0) – manual checks on the HA server and Playwright smoke still open

## Goal
All V2 features secure, tested, documented, and released as **v2.0.0** without data loss.

v2.0.0 ships [V2-1](V2-1-Steps-UX.md) … [V2-4](V2-4-Trusted-Download.md). The share link and admin
statistics (formerly V2-5 / V2-6) were moved to [VX](../VX/README.md) on 2026-10-30; their security,
Playwright and docs tasks moved with them.

## Tasks
- Security review focused on the V2 surface:
  - original download authorization matrix and no service worker caching;
  - auth guard: enumerate all routes and assert only the whitelisted ones are public;
  - dependency audit.
- Upgrade test: install the latest v1.x with real data incl. offline outbox drafts on a phone →
  update to v2.0.0 → all data, sessions, push subscriptions and drafts still work.
- Both languages complete (key check + manual pass on all screens).
- Playwright smoke extended: switch language, trust a user + download original, like animation
  present / absent with reduced motion.
- Docs: `Functional requirements.md`, `Technical requirements.md`, the root `README.md` + `README.nl.md` (new
  options), Home Assistant `config.yaml` options cleaned up.
- Version **2.0.0** in `code/config.yaml` and `code/server/src/version.ts` (equal).

## Acceptance criteria
- No high/critical findings open.
- Update from v1 to v2 on the HA server without data loss, verified with a restore from backup.
- Add-on shows version 2.0.0 and updates from the previous version.

## Progress
- ✅ **Scope:** V2-5 / V2-6 moved to `Analysis/VX/` (VX-1 share link, VX-2 admin statistics); V2
  README, roadmap, requirements links and READMEs updated.
- ✅ **Original download review** (`routes/immich.ts`, `trust/permissions.ts`): no findings.
  Originals are only served when `canUseAuthorRights` holds for a visible source (403 when visible
  but not allowed, 404 when not visible – no existence leak), fetched with the owner's key,
  `attachment` + sanitized file name, `private, no-store`, `nosniff`, audit log line. Without a
  visible source only a traveller's own Immich key is used (own library), viewers get 404. Workbox
  uses `NetworkOnly` for `/api/media/*/original`. Covered by the existing integration matrix
  ("vertrouwde personen") and unit tests.
- ✅ **Public route whitelist:** the app records every registered `/api` route (`app.apiRoutes`);
  `auth.test.ts` asserts that only `GET|HEAD /api/health`, `POST /api/auth/login` and
  `POST /api/auth/logout` are public and that every other route returns 401 without a session.
- ✅ **Dependency audit:** `npm audit fix` – fastify 5.12.7 (header validation bypass, low) and
  fast-uri 3.1.9 / 4.2.3 (moderate); production dependencies: 0 vulnerabilities. Remaining: 4 low
  in build-only tooling (`vite-plugin-pwa` → `workbox-build` → `deepmerge`), fix is a breaking
  major – accepted, not shipped to the browser or server.
- ✅ **Languages:** key-completeness test passes; every server error code has a text in both
  languages; no hard-coded UI strings found. Fixed the trusted-people explanation that still said
  "berichten" / "posts" instead of "stappen" / "steps". Known deviations from V2-3 stay (route URLs,
  PWA manifest description, admin service details and zod messages are Dutch).
- ✅ **HA options:** all options in `config.yaml` are read by `server/src/config.ts`; nothing to
  clean up.
- ✅ **Docs:** README / README.nl link VX; Technical requirements list the public whitelist.
- ✅ **Version 2.0.0** in `config.yaml`, `version.ts`, all `package.json` files, the lockfile and
  both READMEs (2026-10-30, at the user's request before the manual checks below). A push to `main`
  publishes the add-on update.
- ⏳ **Manual (on the HA server / a phone):** upgrade test from the latest 1.x with offline drafts,
  restore from backup, manual language pass on all screens.
- ⏳ **Playwright smoke:** still not added (no browser available in this environment; same as v1).
