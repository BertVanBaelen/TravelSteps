# Phase 6 – Picture library, travels overview & profile

**Status:** ✅ done

## Goal
Complete remaining screens.

## Tasks
- Fotobibliotheek: endpoint returning all photos used in posts (assetId, date, travel, postId); views grouped **by date** and **by travel**; full-screen viewer with link to post.
- Reizen screen: list travels with cover, dates, active badge and summed stats (sum numeric stats with identical key/label + unit; counts of posts and photos; total route distance). Admin: create/edit/delete/activate.
- Travel detail: travel header + filtered timeline + map.
- Profiel: display name, profile picture (upload → `/data/uploads/avatars`, resized; admin may also choose from Immich), change password, logout.

## Acceptance criteria
- Library only shows photos referenced in posts.
- Summed stats on Reizen match the sum of the posts' stats.
- Profile changes reflect in comments and header.

## Implementation notes
- Summing rules: numeric stats are summed per key (custom stats per label + unit); `temperatuur`
  is not summed and `maxHoogte` takes the maximum. "Afgelegd" = sum of all route segments.
- Travel detail lives at `/reizen/:id` (header, stats, map, filtered feed).
- Avatars are stored as 256 px JPEG in `<data>/uploads/avatars` and served via `/api/avatars/:userId`.
