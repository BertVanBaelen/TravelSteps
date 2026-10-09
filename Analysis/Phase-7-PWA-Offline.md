# Phase 7 – PWA & offline

**Status:** ✅ done (install on real Android/iOS devices still to be checked)

## Goal
Installable app; admin can write posts on the go and sync when online.

## Tasks
- `vite-plugin-pwa`: manifest (Dutch name, icons, theme colour, standalone), service worker.
- Caching: precache app shell; stale-while-revalidate for feed/post API reads and thumbnails; limited tile cache for maps.
- IndexedDB (Dexie): drafts store + outbox queue.
- Offline post editor: title, description, stats, locations (GPS works offline), segment modes; photo picker disabled with message "Foto's kiezen kan alleen online".
- Sync engine: on `online` / app start / Background Sync, push outbox items; routing calculated server-side on save; status badges (Concept, Wacht op verbinding, Gepubliceerd, Fout).
- Conflict handling: send `updatedAt`; server rejects stale updates (409) → user chooses keep mine / take server version.
- Session longevity for PWA (30-day sliding session); handle expired session during sync (prompt login, keep drafts).
- Install prompt hint (Android) and iOS instructions on Profiel.

## Acceptance criteria
- App installs on Android and iOS home screen.
- In airplane mode a post can be drafted and is published automatically after reconnect.
- Previously viewed timeline is readable offline.

## Implementation notes
- The service worker is registered via an external `registerSW.js` because the CSP forbids inline scripts.
- Runtime caches: `/api/posts|travels|library` NetworkFirst (6 s timeout), media thumbnails/previews
  CacheFirst, avatars StaleWhileRevalidate, OSM tiles CacheFirst (max 800). `/api/auth` is never cached;
  the API cache is cleared on logout.
- The Background Sync API is not used (no iOS support); the outbox syncs on `online`, app start,
  visibility change and every 60 s.
- Offline start-up uses the last known user from `localStorage`.
- Post ids are generated client-side so a retried create is idempotent.
- Editor drafts autosave to IndexedDB; a local draft/outbox version wins over the server version on
  load (with a "discard local" option). On 401 during sync, items stay queued and the login page
  shows how many are waiting.
