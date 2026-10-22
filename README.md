# TravelSteps

🇬🇧 English · [🇳🇱 Nederlands](README.nl.md)

Travel blog (PWA) with a timeline, map and Immich photos for several travellers. Runs as a single
Docker container (or Home Assistant add-on) on the Home Assistant server and is made publicly
reachable through a Cloudflare Tunnel. The app is available in **Dutch and English**.

Version **1.4.0** – changes per version (with screenshots) in [code/CHANGELOG.md](code/CHANGELOG.md).
Planned extensions: see the [V2 roadmap](V2%20roadmap.md).

| Folder / file                | Contents                                     |
| ---------------------------- | -------------------------------------------- |
| `code/`                      | All source code, Docker and add-on files     |
| `Analysis/`                  | Phase plan for the implementation            |
| `Analysis/V2/`               | Phase plan for V2                            |
| `V2 roadmap.md`              | Overview of the V2 features                  |
| `Functional requirements.md` | Functional requirements                      |
| `Technical requirements.md`  | Technical requirements                       |

## Contents

- [Architecture](#architecture)
- [Installation](#installing-on-the-home-assistant-server)
- [Cloudflare Tunnel](#cloudflare-tunnel)
- [First login](#first-login)
- [Language](#language)
- [Configuration](#configuration)
- [Connecting Immich](#connecting-immich)
- [Routes (OpenRouteService)](#routes-openrouteservice)
- [Backups and restore](#backups-and-restore)
- [Logs and health check](#logs-and-health-check)
- [Upgrading](#upgrading)
- [Development](#development)
- [Releasing a new version](#releasing-a-new-version)

## Architecture

| Folder (in `code/`) | Contents                                                                    |
| ------------------- | --------------------------------------------------------------------------- |
| `shared/`           | Shared types, Zod schemas and constants (server + web)                      |
| `server/`           | Fastify 5 API (Node 22, TypeScript), SQLite (better-sqlite3), Argon2id      |
| `web/`              | React 19 + Vite PWA (Dutch and English, offline writing with IndexedDB)     |
| `docker/`           | Entrypoint script for the container                                         |

One container serves the API (`/api/...`) and the built web app. Photos stay in Immich and are
passed through via `/api/media/...`; routes come from OpenRouteService, map tiles from
OpenStreetMap. Push notifications use Web Push (VAPID).

All data lives in one folder (`DATA_DIR`, `/data` in the container):

| File / folder       | Contents                                                                  |
| ------------------- | ------------------------------------------------------------------------- |
| `travelsteps.db`    | SQLite: users, travels, posts, comments, likes, notifications, sessions   |
| `.session-secret`   | Secret for sessions **and** the encryption of the Immich keys             |
| `.vapid.json`       | Keys for push notifications                                               |
| `uploads/avatars/`  | Profile pictures                                                          |
| `backups/`          | Nightly database backups                                                  |

## Installing on the Home Assistant server

Choose one of the two ways. Option A (add-on from the GitHub repository) updates automatically.

### Option A – Home Assistant add-on (recommended)

1. **Settings → Add-ons → Add-on store → ⋮ → Repositories** and add
   `https://github.com/BertVanBaelen/TravelSteps`.
2. **TravelSteps** appears in the store; install it. Home Assistant downloads a ready-made image
   (`ghcr.io/bertvanbaelen/travelsteps-{arch}`); nothing is built on the server.
3. On the _Configuration_ tab fill in at least `admin_username` and `admin_password` and start the
   add-on. The data goes to `/share/travelsteps` (option `data_dir`).
4. Turn on **Auto update** on the _Info_ tab.

Moving from the old local add-on (`/addons/travelsteps`): write down the configuration, stop the
local add-on, install TravelSteps from the repository, enter the same configuration (the data
folder `/share/travelsteps` simply stays) and start. Then remove the local add-on and the folder
`/addons/travelsteps`.

### Option B – Docker Compose (HA Supervised/Container, or HA OS with SSH/Portainer)

1. Copy the `code` folder to the server, e.g. `/share/travelsteps-src`.
2. Create the configuration:
   ```sh
   cd /share/travelsteps-src
   cp .env.example .env
   nano .env        # at least TRAVELSTEPS_DATA_DIR, PORT, ADMIN_USERNAME and ADMIN_PASSWORD
   ```
3. Build and start:
   ```sh
   docker compose up -d --build
   docker compose logs -f
   ```
4. Check: `curl http://localhost:8080/api/health` → `{"status":"ok","version":"1.4.0"}`.

## Cloudflare Tunnel

1. Install the HA add-on **Cloudflared** or create a tunnel in the Cloudflare Zero Trust dashboard
   (**Networks → Tunnels**).
2. Add a public hostname, e.g. `blog.yourdomain.com` → service `http://<HA-IP>:8080`.
3. Set `public_url` (`PUBLIC_URL`) to `https://blog.yourdomain.com`; it is sent to the push
   services as contact address (VAPID).

- Keep `cookie_secure` (`COOKIE_SECURE`) on `true`: Cloudflare provides HTTPS.
- `trust_cloudflare` (`TRUST_CLOUDFLARE`) makes rate limiting use the real IP
  (`CF-Connecting-IP`). The header is only trusted when the connection comes from localhost or a
  private network; direct connections from the internet cannot fake their IP.
  **Do not open port 8080 in your router.**
- Testing via `http://<HA-IP>:8080` on your LAN without HTTPS? Temporarily set `cookie_secure` to
  `false`, otherwise you cannot log in.

## First login

There is no default account. The first administrator comes from the configuration:

1. Before the first start, fill in `admin_username` and `admin_password` (min. 12 characters)
   (`ADMIN_USERNAME`/`ADMIN_PASSWORD` in `.env`). Without these values the app does not start as
   long as there are no users.
2. Log in; you immediately have to choose a new password.
3. Via the **profile menu (avatar top right) → Manage users** you create users with the role
   **Traveller** (creates travels and steps) or **Viewer** (reads, likes, comments). They get a
   temporary password that they change at their first login.

The admin options are only used when the database is empty; after the first login you may clear
them.

Lost the password of the only administrator? Stop the app, fill in the admin options and delete
`travelsteps.db` (everything is lost), or restore a backup.

## Language

The app is available in **Dutch** (default) and **English**.

- Each user chooses the language in **Profile → Language**. The choice is stored on the server and
  follows the user to every device and after logging in again. Push notifications are sent in the
  language of the recipient.
- Before a choice is made, the browser language is used: English if it starts with `en`, otherwise
  Dutch. The login screen has a small Nederlands/English switch that is remembered per device.
- Dates and numbers follow the language (`nl-NL` / `en-GB`); units stay metric.
- Switching language also works offline; the choice is saved as soon as the device is online again.
- User content (step titles and texts, travel names, comments, custom statistics) is never
  translated. Server-side texts in the admin panel (integration details) stay Dutch.

## Configuration

| Add-on option       | Environment variable               | Default              | Explanation                                                        |
| ------------------- | ---------------------------------- | -------------------- | ------------------------------------------------------------------ |
| –                   | `TRAVELSTEPS_DATA_DIR`             | `/share/travelsteps` | (compose only) folder on the host for all data                     |
| –                   | `PORT`                             | `8080`               | Port of the web server                                             |
| `data_dir`          | `DATA_DIR`                         | `/data`              | Data folder (in the container)                                     |
| `admin_username`, `admin_password` | `ADMIN_USERNAME`, `ADMIN_PASSWORD` | –     | First administrator (only with an empty database, password ≥ 12)   |
| `public_url`        | `PUBLIC_URL`                       | –                    | Public URL (contact address for push services)                     |
| `cookie_secure`     | `COOKIE_SECURE`                    | `true`               | Session cookie over HTTPS only                                     |
| `trust_cloudflare`  | `TRUST_CLOUDFLARE`                 | `true`               | Take the client IP from `CF-Connecting-IP`                         |
| `session_ttl_days`  | `SESSION_TTL_DAYS`                 | `30`                 | Session lifetime (extended on use)                                 |
| –                   | `SESSION_SECRET`                   | generated            | Min. 32 characters; empty = random, stored in `.session-secret`    |
| `immich_url`        | `IMMICH_URL`                       | –                    | Address of Immich (see below)                                      |
| `ors_api_key`       | `ORS_API_KEY`                      | –                    | OpenRouteService key for routes                                    |
| `ors_url`           | `ORS_URL`                          | ORS cloud            | Own OpenRouteService server (optional)                             |
| `log_level`         | `LOG_LEVEL`                        | `info`               | `fatal` … `trace`                                                  |
| `backup_keep`       | `BACKUP_KEEP`                      | `7`                  | Number of nightly backups to keep; `0` = off                       |
| –                   | `TZ`                               | –                    | Time zone (determines when the nightly backup runs)                |

In add-on mode the values come from the add-on options (`/data/options.json`). The active values
and the status of Immich, routes, push and backups are shown in **profile menu → Admin panel**
(read-only, secrets masked).

## Connecting Immich

One Immich address for the whole app; **each traveller has their own API key**.

1. Set `immich_url`: the LAN address of Immich, e.g. `http://192.168.1.10:2283` (without `/api`),
   and restart.
2. Each traveller creates a key in Immich via **Account settings → API keys → New API key**, with
   at least the permissions `asset.read`, `asset.view`, `asset.download`, `album.read` and
   `server.about` (or all permissions).
3. The traveller enters the key in **Profile → Photo integration**, or the administrator via
   **Manage users → Photo integration**. The key is stored encrypted (AES-GCM, derived from
   `.session-secret`).
4. The **Admin panel** must show "Connected" for Immich.

Photos always go through TravelSteps with the key of whoever posted the photo. Viewers have no
access to Immich itself and only see photos from travels they may view.

**Original photos:** the author of a photo and the administrator can download the original via
**Download original** in the photo viewer. A traveller can also mark people as **trusted** in
**Profile → Trusted people**; they may then download the originals of that traveller's photos, but
only in travels they can see. Revoking works immediately. Originals are never cached on the device.

## Routes (OpenRouteService)

1. Create a free account on <https://openrouteservice.org> → **Dashboard → Tokens** and create a
   key (the standard quota is enough).
2. Set `ors_api_key` (`ORS_API_KEY`) and restart.

Walking, cycling and car segments then follow paths and roads; train, plane and boat are straight
lines. Without a key (or when ORS cannot be reached) all segments are straight lines. Calculated
routes are stored in the post.

## Backups and restore

**Automatic:** every night (first check after 03:00 local time, and at start-up if today's backup
is still missing) the app makes a consistent copy of the database in
`<data folder>/backups/travelsteps-YYYY-MM-DD.db`. The newest `backup_keep` (default 7) are kept.
The status is shown in the **Admin panel**.

**Full backup:** copy the whole data folder (e.g. `/share/travelsteps`), including
`.session-secret`, `.vapid.json` and `uploads/`. Include that folder in the Home Assistant backups
(**Settings → System → Backups**, folder _share_) or your own backup system.

> Without `.session-secret` the stored Immich keys can no longer be decrypted and travellers have
> to enter them again. Keep that file together with the database.

**Restore:**

1. Stop the add-on/container.
2. In the data folder: delete `travelsteps.db`, `travelsteps.db-wal` and `travelsteps.db-shm`.
3. Copy the desired backup: `cp backups/travelsteps-2025-06-01.db travelsteps.db`.
4. Start the app and check the content. Everyone has to log in again if the sessions in the backup
   have expired.

## Logs and health check

- Logs (JSON, pino) go to stdout: `docker compose logs -f` or the _Log_ tab of the add-on. Docker
  Compose rotates them (`max-size 10m`, 3 files); the Supervisor manages the logs of the add-on
  itself.
- `GET /api/health` → `{"status":"ok","version":"…"}`; the container has a Docker `HEALTHCHECK`.

## Upgrading

1. Make a backup of the data folder (see above). With _Auto update_ the add-on does not do that
   itself; the nightly database backup in `backups/` does stay.
2. Update:
   - **Add-on (repository):** happens automatically when _Auto update_ is on. Otherwise the update
     appears in **Settings → Updates**. Home Assistant checks the repository every few hours;
     faster via **Add-on store → ⋮ → Check for updates**.
   - **Compose:** copy the new `code` folder over the old one (keep `.env`) and run
     `docker compose up -d --build`.
3. Database migrations run automatically at start-up. Check the log and the **Admin panel**
   (version).

Options that no longer exist (such as `immich_api_key` from before 1.0) are dropped by the
Supervisor during the update. An Immich key that was still in that option is entered in
**Profile → Photo integration**.

Is your installation from before 0.4 or was it still called **BertSteps**? That is handled
automatically at the first start too: `bertsteps.db` is renamed to `travelsteps.db` and Markdown
travels from `<data folder>/travels/` are put in the database (the folder becomes
`travels.migrated/`). You do have to rename the old default folder `/share/bertsteps` to
`/share/travelsteps` yourself (or point `data_dir` to it); the add-on has a different name, so
install TravelSteps as a new add-on, enter the configuration again and then remove the old one.

## Development

Requires Node 22+. Run the commands in the `code/` folder.

```sh
npm install
npm run dev        # API on :8080, Vite on :5173 (proxy to /api)
npm test           # integration and unit tests (vitest, server + web)
npm run typecheck
npm run lint
npm run build && npm start   # local production build
```

Running locally without Docker: set `DATA_DIR=./data` and `COOKIE_SECURE=false`.

UI texts live in `code/web/src/i18n/locales/` (`nl.ts` is the base, `en.ts` must have the same
keys – a missing key is a type error and a unit test checks it). Push texts are in
`code/server/src/notifications/messages.ts`.

## Releasing a new version

1. Increase `version` in `code/config.yaml` and `APP_VERSION` in `code/server/src/version.ts`
   (equal; a test and the workflow check that). Add a section to `code/CHANGELOG.md` (with
   screenshots in `code/docs/changelog/<version>/` when the UI changes).
2. Push to `main`. The workflow `.github/workflows/release.yml` tests the code, builds the images
   for amd64 and aarch64, puts them on `ghcr.io/bertvanbaelen/travelsteps-{arch}:<version>` and
   creates a GitHub release `v<version>`.
3. Home Assistant sees the new `version` in the repository and updates the add-on.

A push without a new version only tests the code and builds nothing. So only change the version
when you really want to roll out.

**Once after the first release:** the GHCR packages `travelsteps-amd64` and `travelsteps-aarch64`
are private by default. Set them to **Public** on GitHub (profile → **Packages** → package →
**Package settings → Change visibility**), otherwise Home Assistant cannot download them.
