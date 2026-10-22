# Phase 9 – Rename to TravelSteps

Status: ✅ done (v0.4.0)

## Goal
Rename the application **BertSteps → TravelSteps** everywhere: UI, packages, code identifiers,
Docker, Home Assistant add-on (incl. `slug`), file names, data folder, environment variables and
docs. Only user data must survive (database, avatars, unsynced offline drafts).

## Decisions
- **Everything is renamed**, also technical names. No long-term fallbacks to the old names.
- The Home Assistant add-on **slug changes** to `travelsteps`. It's accepted that Home Assistant
  shows this as a new add-on: the old add-on is uninstalled and the new one installed (see
  *Upgrade procedure*).

## Tasks

### Rename
- UI: `web/src/i18n/nl.ts` (`appName`, install text, add-on settings hint), `web/index.html`
  (`<title>`, `apple-mobile-web-app-title`), PWA manifest `name`/`short_name` in `web/vite.config.ts`.
- Packages: root `package.json` (`name`, `description`), `@bertsteps/shared|server|web` →
  `@travelsteps/*` (all imports, `package.json` dependencies; regenerate `package-lock.json` with
  `npm install`).
- Server: startup log message, routing `USER_AGENT`, password timing dummy string.
- CSRF header value `BertSteps` → `TravelSteps` (`shared/src/auth.ts`, tests).
- Database file `bertsteps.db` → `travelsteps.db`.
- IndexedDB name `bertsteps` → `travelsteps`; service worker caches `bertsteps-*` → `travelsteps-*`.
- Docker: `Dockerfile` comment, `docker-compose.yml` service/image/container name,
  `BERTSTEPS_DATA_DIR` → `TRAVELSTEPS_DATA_DIR`, default host folder `/share/travelsteps`;
  `.env.example`, `docker/entrypoint.sh`.
- Home Assistant add-on `config.yaml`: `name: TravelSteps`, `slug: travelsteps`, default
  `data_dir: /share/travelsteps`, install path `/addons/travelsteps`; bump `version`.
- Docs: root `README.md`, `code/README.md` (since 1.3.0 merged into the root `README.md` / `README.nl.md`), requirements, `Analysis/*` (titles; historical phase
  content may keep the old name).
- Tests: CSRF header value and temp dir prefix.
- Outside the code: project folder / repository name `BertSteps` → `TravelSteps`.

### Keep user data (best effort, one-time migrations)
Data loss during the rename is **acceptable** (pre-v1); the migrations below are best effort and
must never block startup – on failure, log a warning and continue with a fresh database/store.
- **Database:** the file is renamed `bertsteps.db` → `travelsteps.db`. At startup, if
  `bertsteps.db` exists and `travelsteps.db` does not, rename it (incl. `-wal`/`-shm`). Sessions
  stay valid, so users stay logged in.
- **Offline drafts:** on first load, try to copy drafts/outbox from the old IndexedDB `bertsteps`
  into `travelsteps`, then delete the old database.
- **Caches:** delete old `bertsteps-*` caches when the new service worker activates.
- **Old clients:** an already-open old PWA sends the old CSRF value and gets 403 until it reloads;
  the service worker update reloads the app. Acceptable (no dual value).

### Upgrade procedure (documented in the root `README.md` / `README.nl.md`)
- **Home Assistant add-on:**
  1. Stop the BertSteps add-on and note its configuration (Immich URL, ORS key, …).
  2. Rename the data folder `/share/bertsteps` → `/share/travelsteps` (or set `data_dir` to the old
     folder).
  3. Copy the code to `/addons/travelsteps`, refresh the add-on store, install **TravelSteps**,
     re-enter the configuration, start it.
  4. Verify, then uninstall the old BertSteps add-on and remove `/addons/bertsteps`.
- **Docker Compose:** stop the old container, rename the host folder (or set
  `TRAVELSTEPS_DATA_DIR` to it), rename the variable in `.env`, `docker compose up -d --build`,
  remove the old `bertsteps` container/image.
- Cloudflare Tunnel: port stays 8080; only update the target if the container name/host changed.
- Installed phone apps: Android updates the name with the manifest; on iPhone remove the old
  home-screen icon and add it again to see the new name.

## Acceptance criteria
- No "BertSteps"/"bertsteps" left anywhere (code, config, Docker, add-on, docs), except the
  one-time migration code and historical phase notes.
- Home Assistant shows the add-on as **TravelSteps**; following the upgrade procedure normally keeps
  all travels, posts, users, comments, likes and avatars (data loss is acceptable but should not
  happen in the normal case).
- An existing `/data` with `bertsteps.db` starts as `travelsteps.db`; a failed migration doesn't
  prevent the app from starting.
- Typecheck, lint, tests and build pass.
