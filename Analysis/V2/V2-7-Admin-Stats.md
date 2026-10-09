# Phase V2-7 – Admin statistics

Status: ⏳ planned

## Goal
Give the admin an overview of usage and storage.

## Decisions (from Q&A)
New page **Beheer → Statistieken** (admin only) with:
- **Users:** total, per role (admin/traveller/viewer), disabled, **active in the last 30 days**,
  Google-linked (after V2-6).
- **Content:** travels (ongoing / finished), steps, photos referenced, likes, comments, active share
  links (after V2-5), push subscriptions.
- **Storage:** `/data` disk usage split into database, avatars, backups and other; free disk space
  of the volume.
- **Immich:** total size of photos referenced by TravelSteps (per traveller + total), and how many
  could not be measured (missing key / deleted asset).

## Tasks

### Server
- Migration: `users.last_active_at` – updated by the auth guard at most once per hour per user
  (cheap write). Existing users start with `NULL` (shown as "nog niet gemeten").
- Migration: `asset_sizes (asset_id, owner_id, bytes, fetched_at)` cache.
- Background job (start-up + every 24h): for each referenced asset without a fresh size, read the
  file size from Immich with the owner's key (asset info / EXIF `fileSizeInByte`), throttled.
  Removed keys/assets are counted as "onbekend".
- `GET /api/admin/stats` (admin only) – counts via SQL; disk usage by walking `DATA_DIR`
  (cached for 10 minutes); `fs.statfs` for free space.
- Optional "Opnieuw berekenen" action (`POST /api/admin/stats/refresh`).

### Web
- Statistieken page with cards per section, using the V2-1 components; byte sizes formatted per
  language (V2-3). Link from the Beheer menu.
- Not cached for offline (shows "alleen online beschikbaar").

## Compatibility
- Read-only page; the only writes are `last_active_at` and the size cache.
- Immich is only read, never written; photos are still never copied.
- Asset size job must not overload Immich (sequential, small batches) and is skipped when no Immich
  URL is configured.
- User deletion: `asset_sizes` rows of that owner removed.

## Acceptance criteria
- Numbers match the database (unit tests on a seeded DB).
- Non-admins get 403 on the endpoint and don't see the menu item.
- Page loads in < 1 s on the HA server after the first computation.
