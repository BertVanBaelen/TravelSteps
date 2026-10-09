# Phase V2-5 – Anonymous share link (24h)

Status: ⏳ planned

## Goal
Share one step with someone without an account. For privacy the link opens a separate page with a
card showing only that step, and it stops working after 24 hours.

## Decisions (from Q&A)
- Who can create: **step author**, users **trusted** by the author (V2-4) who may see the step, and
  the **admin**.
- Card shows: **title, date, text, photos (preview size), stats and route map**.
  Not shown: author name/avatar, comments, likes, travel, other steps, links into the app.
- Lifetime: **fixed 24h**. Revocable early by the **creator**, the **step author** and the **admin**.
  After expiry/revocation the page shows "Deze link is verlopen".

## Tasks

### Server
- Migration: table `share_links (id, token_hash, post_id, created_by, created_at, expires_at, revoked_at)`
  with FK `post_id → posts ON DELETE CASCADE`, `created_by → users ON DELETE CASCADE`.
- Token: 32 random bytes, base64url; only the **SHA-256 hash** is stored. The full URL
  (`PUBLIC_URL/s/<token>`) is returned once on creation.
- Authenticated endpoints:
  - `POST /api/posts/:id/shares` – checks `canUseAuthorRights` (V2-4) → returns `{ url, expiresAt }`.
  - `GET /api/posts/:id/shares` – active links (author/admin: all; others: own).
  - `DELETE /api/shares/:id` – revoke (creator, author, admin).
- Public endpoints (whitelisted with `config.public` in the auth guard, GET only):
  - `GET /api/public/shares/:token` – step DTO limited to the fields above; 410 when expired/revoked,
    404 when unknown.
  - `GET /api/public/shares/:token/media/:assetId/preview` – only for assets of that step, fetched
    with the author's key; `preview` size only (no original, no thumbnails of other assets).
- Every public request re-validates: not expired, not revoked, step still exists, author still has an
  Immich key (else photos show placeholder), and the creator still has the right to share (trust not
  revoked, still may see the travel). Otherwise treat as revoked.
- Content is **live**: edits to the step within the 24h are visible; deleting the step kills the link.
- Separate, stricter rate limit for `/api/public/*` (per `CF-Connecting-IP`); lookup by hash.
- Headers for public responses: `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`,
  `Referrer-Policy: no-referrer`.
- Generic Open Graph tags for `/s/*` HTML (TravelSteps name + logo only) so chat previews never leak
  content.
- In-app notification to the step author when someone else creates a share link (new notification
  type `share`; respects language from V2-3).
- Nightly cleanup of share links expired > 7 days.

### Web
- Step detail: **"Delen"** action (only when allowed and online) → creates link → native share sheet
  (`navigator.share`) or copy-to-clipboard; shows expiry time and the list of active links with
  **Intrekken**.
- Public route `/s/:token` rendered **outside** the login gate: minimal layout, TravelSteps logo,
  step card (reuse `Gallery`, `StatsView`, `MapView`, `Markdown`), language from browser, no header,
  no bottom bar, no install banner. Expired/revoked/unknown → friendly message.
- Lazy-loaded chunk so the share page stays small.

### Service worker
- Exclude `/api/public/*` from runtime caches (`NetworkOnly`) so expiry/revocation is always
  respected; `/s/*` may use the app shell fallback.

## Compatibility
- Auth guard: only the explicit public routes bypass login; everything else stays 401 for anonymous
  users (add a test that enumerates routes).
- Uses existing map/route geometry stored in the post row; no extra routing calls.
- User deletion: links created by or for the user's steps are removed by cascade; on **Overdragen**
  the author's steps stay, so their links stay valid until expiry.
- CSP unchanged (OSM tiles and own origin already allowed).

## Acceptance criteria
- Anonymous visitor sees exactly the allowed fields; no author, comments, likes, travel or other ids
  in the JSON.
- Link returns 410 after 24h or after revoke, also when the page was opened earlier (refresh).
- Photo URLs of the share page don't work for assets outside that step or with another token.
- Non-trusted viewer cannot create a link (403).
- Tests: token hashing, expiry, revoke permissions, public DTO whitelist, media scoping.
