# Technical requirements – TravelSteps

## Hosting
- Runs as a **Docker container** on the Home Assistant server (no Nginx add-on is used).
- The container exposes **one HTTP port** (default `8080`, configurable) that serves both the API and the frontend. This port is published to the host so a **Cloudflare Tunnel** can expose it publicly. TLS is terminated by Cloudflare.
- All persistent data is stored in a **host-mounted volume** (e.g. `/share/travelsteps` → `/data` in the container), so it survives restarts and container updates.
- Delivered with a `Dockerfile` and `docker-compose.yml`; configuration via environment variables.

## Stack
| Part | Choice |
|------|--------|
| Backend | Node.js (LTS) + TypeScript, Fastify (or Express), Zod validation |
| Frontend | React + TypeScript + Vite, `vite-plugin-pwa` (Workbox) |
| Map | Leaflet + OpenStreetMap tiles |
| Routing | OpenRouteService API (profiles: foot-hiking, cycling-regular, driving-car); straight lines for plane/boat |
| Geocoding | OpenRouteService / Nominatim search |
| Offline storage | IndexedDB (e.g. Dexie) for drafts and cached content |
| Database | SQLite (better-sqlite3) for all data: users, sessions, travels, posts, members, viewers, comments, likes, subscriptions, notifications |
| Rich text editor | WYSIWYG editor with Markdown storage (TipTap + tiptap-markdown, lazy-loaded chunk, bundled for offline use) |
| Push | Web Push (VAPID, e.g. `web-push` package) |
| Tests | Vitest (unit), Playwright (e2e smoke) |

## Storage layout (`/data`)
```
/data
  travelsteps.db                 # SQLite: all application data
  .session-secret              # generated when SESSION_SECRET is not set
  .vapid.json                  # generated VAPID key pair for Web Push
  uploads/avatars/             # uploaded profile pictures (only non-Immich files)
```
Main tables: `users` (+ `role` admin/traveller/viewer, encrypted Immich key), `travels` (+ `owner_id`), `travel_members` (status invited/accepted), `travel_viewers`, `posts` (+ `author_id`; locations, segments incl. cached route geometry, arrival, stats and photo asset IDs as JSON columns; photo owner = post author), `likes`, `comments`, `subscriptions`, `notifications`, `push_subscriptions`.
- Schema changes via the existing append-only migration list (`PRAGMA user_version`).
- **One-time migration** of the former Markdown store (`travels/<slug>/travel.md`, `posts/*.md`): at startup, if the `travels/` folder exists and the database has no travels, all travels/posts are imported (owner/author = the admin), the global `IMMICH_API_KEY` is copied to the admin's account, and the folder is renamed to `travels.migrated/`. No Markdown export afterwards.
- Route geometry is cached in the post row so routing is only called on change.

## Authorization model
- Role checks on the server for every endpoint.
- A user **may see** a travel if: admin, owner, accepted member, or on the travel's viewer list. Every content query (feed, post, map, library, travels, media proxy) is filtered by this rule.
- **Post**: create only in travels where the user is owner/accepted member; edit only own posts; delete own posts, or any post as travel owner/admin.
- **Travel**: edit details, members and viewers only as owner/admin.
- **Comments**: delete as comment author, post author, travel owner or admin.
- Blog filter (`?traveller=<userId>` or all): posts in travels where that user is owner/accepted member, intersected with the visibility rule.

## Immich integration
- Immich runs on the same HA server; one shared URL (env `IMMICH_URL`). **Each traveller has their own API key**, set by the admin or by the traveller in the profile. `IMMICH_API_KEY` is no longer used (migrated to the admin account).
- Keys are stored **encrypted** in SQLite (AES-256-GCM, key derived from the session secret) and never returned to the client (only "set" + connection test).
- Images are **never stored twice**: only asset IDs are saved, together with the user whose key was used (post author; travel cover → owner).
- The backend proxies thumbnails and previews (`/api/media/:assetId/thumb|preview`) using that owner's key, only for **assets referenced in a post/travel the requester may see**, or any asset in the requester's own library (for picking). Responses are cached with HTTP cache headers. Missing/removed key → placeholder.
- Photo picker: browse/search the traveller's own Immich timeline and albums; read EXIF GPS for location suggestion.

## Notifications
- `notifications` table drives the in-app list (unread count via `read_at`).
- Web Push with VAPID; key pair generated at first start and stored in `/data/.vapid.json`. Browser subscriptions stored per user/device; expired endpoints (404/410) are removed.
- Events: new post (subscribers of the author + co-members, filtered by visibility), invitation, like/comment on own post. Sent on first publish only (`published_at`), not on edits. Sending is asynchronous and must not block the request.
- Service worker handles `push` and `notificationclick` (opens the related post/travel).
- Install banner: shown on iOS/Android when not in `display-mode: standalone` (iOS: `navigator.standalone`); Android uses `beforeinstallprompt`, iOS shows instructions. iOS supports Web Push only for home-screen PWAs (16.4+).

## Authentication & security
- Passwords hashed with **Argon2id**.
- Session-based auth: random session ID in an **HttpOnly, Secure, SameSite=Lax** cookie, stored server-side in SQLite, sliding expiry (e.g. 30 days for the PWA).
- CSRF protection for state-changing requests (SameSite + custom header / token).
- **Rate limiting** and incremental lockout on login.
- First admin from configuration (`ADMIN_USERNAME`/`ADMIN_PASSWORD`) with a forced password change; all API calls except the change are blocked until done.
- New users get `mustChangePassword`.
- Authorization per endpoint as described above. All content endpoints require login.
- Security headers (CSP, HSTS via Cloudflare, X-Content-Type-Options, Referrer-Policy). Markdown rendered sanitized (no raw HTML), also for editor output.
- Secrets (ORS key, session secret) only via environment variables; per-user Immich keys encrypted in the database; never in the repo.
- Trust proxy headers from Cloudflare (`CF-Connecting-IP`) for rate limiting.

## PWA / offline
- Installable (manifest, icons, Dutch name), service worker with:
  - app shell precache,
  - runtime cache for API reads and media thumbnails (stale-while-revalidate),
  - offline map tiles for recently viewed area (best effort).
- Drafts stored in IndexedDB per user; an outbox queue (for all travellers) syncs on reconnect (`online` event + Background Sync where supported). Conflict rule: last write wins, with `updatedAt` check and a warning.
- The selected blog ("whose blog") is stored in `localStorage` per device.
- GPS via Geolocation API.

## Configuration (env)
`PORT`, `DATA_DIR`, `IMMICH_URL`, `ORS_API_KEY`, `ORS_URL`, `SESSION_SECRET`, `PUBLIC_URL`, `TZ`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`. (`IMMICH_API_KEY` only read once for the migration to the admin account.)

## Backup
- Everything needed is in `/data` (SQLite + avatars + secrets). Include in Home Assistant backups or a periodic copy; SQLite backup via online backup API.
