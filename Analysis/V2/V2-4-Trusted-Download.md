# Phase V2-4 – Trusted users & original photo download

Status: ✅ done (1.4.0)

## Goal
Not everyone may download full-resolution photos. A traveller decides per other user who is
**trusted** ("Vertrouwd"); trusted users can download that traveller's photos in original quality.
The same grant is reused for share links in V2-5.

## Decisions (from Q&A)
- Grant is **per user pair**: traveller A marks user B as trusted.
- Covers **all photos A added** (step photos and travel covers where A is the cover owner), but
  only in travels B may see (existing visibility rule).
- Download: **single photo only** (no ZIP).
- Name: **"Vertrouwd"** (nl) / **"Trusted"** (en).
- The author can always download their own originals; the admin can download everything.
- Travel owners are not automatically trusted for other members' photos.

## Tasks

### Server
- Migration: table `trusted_users (owner_id, trusted_id, created_at, PRIMARY KEY(owner_id, trusted_id))`
  with `ON DELETE CASCADE` on both user FKs.
- Repository + endpoints:
  - `GET /api/profile/trusted` – users I trust.
  - `PUT /api/profile/trusted/:userId` / `DELETE /api/profile/trusted/:userId` (travellers/admin only;
    cannot trust yourself).
  - Expose per photo/step whether the current user `canDownloadOriginal` (computed server-side).
- Helper `canUseAuthorRights(requester, authorId, travelId)`:
  `requester.isAdmin || requester.id === authorId || (trusted(authorId, requester.id) && maySeeTravel(requester, travelId))`.
  Reused by V2-5.
- Media proxy (`routes/immich.ts`): `original` size today only serves the requester's own library.
  Extend: allowed when the asset is referenced in a step/travel the requester may see **and**
  `canUseAuthorRights` holds for the asset owner. Fetch with the **owner's** Immich key (same as
  thumb/preview).
- Response: `Content-Disposition: attachment; filename="<original file name>"`,
  `Cache-Control: private, no-store`. Missing/removed owner key → 404 with code (client shows
  "niet beschikbaar").
- Audit log line (pino) per original download: requester, owner, asset id.

### Web
- Profiel → section **Vertrouwde personen**: list with avatars, add (search users who can see at least
  one of my travels), remove. Short explanation of what trust allows.
- Lightbox/gallery: **"Download origineel"** button when `canDownloadOriginal`; replaces the current
  author-only "Origineel openen" link (author keeps the ability).
- Button hidden/disabled offline.

### Service worker
- Exclude `/api/media/*/original` from all runtime caches (`NetworkOnly`).

## Compatibility
- Existing behaviour for the author (opening own originals) keeps working through the same rule.
- Thumbnail/preview access is unchanged for everyone.
- User deletion: grants removed by cascade; with **Overdragen** the travel owner changes, but photo
  ownership (post author) doesn't, so existing grants keep applying to the same photos.
- If a trusted user loses visibility of a travel, downloads from that travel stop immediately.

## Acceptance criteria
- A viewer who is not trusted gets 403 on `/original`, even with a valid asset id from a visible step.
- A trusted user can download originals of the author's photos in visible travels only.
- Revoking trust takes effect on the next request.
- Originals never appear in the service worker cache.
- Unit tests for the permission helper; integration test for the media route matrix.

## Solution
- Table `trusted_users` (migration 8, cascade on both users), `server/src/trust/repository.ts` and `trust/permissions.ts` (`canUseAuthorRights` with injectable deps, wired as `ctx.canUseAuthorRights`).
- Endpoints `GET/PUT/DELETE /api/profile/trusted[/:userId]` (travellers/admin, uuid check, `TRUST_SELF` 400, unknown/disabled 404) return `{ trusted, candidates }`; candidates = audience of travels I author (admins excluded, they already have all rights).
- `canDownloadOriginal` on post (permissions), travel (cover) and library photo DTOs.
- Media route: original → 403 when the asset is in a visible travel but not allowed, 404 when not visible (no existence leak), 404 `ORIGINAL_UNAVAILABLE` without owner key; own unpublished library assets keep working with own key.
- Web: Profiel → Vertrouwde personen, lightbox button `<a download>` (hidden offline), Workbox `NetworkOnly` for originals.
- Deviation: trusted user without visibility gets 404 (not 403), consistent with the existing visibility rule.

## Bugs (user testing)
- _none reported yet_
