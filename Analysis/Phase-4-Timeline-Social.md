# Phase 4 – Timeline, likes & comments

## Goal
Strava-like feed and social interaction.

## Tasks
- SQLite tables: `likes (postId, userId)`, `comments (id, postId, userId, text, createdAt, updatedAt)`.
- Endpoints: like/unlike, list/add/edit/delete comments (author edit/delete, admin delete any).
- Feed endpoint with cursor paging, aggregated like/comment counts and "liked by me".
- Tijdlijn screen: cards with cover, title, date, travel, key stats, mini map placeholder (filled in Phase 5), counts; travel filter; infinite scroll.
- Post detail: gallery, Markdown text, stats block, likes (who liked), comments list + form.
- Dutch relative dates ("2 uur geleden"), metric formatting.

### Improvement 4.1 – richer timeline cards — ✅ done
- **Swipeable photos:** the card shows all photos of the post in a horizontal swipe carousel
  (touch swipe + arrows on desktop, dot indicator "1/5"), instead of only the cover. Lazy-load
  non-visible slides; tapping a photo opens the post detail.
- **Reactions in the overview:**
  - Like button on the card (toggle, optimistic update) + "Vind ik leuk door Oma en 2 anderen".
  - The latest 2 comments under the card (author + text, truncated), plus a
    "Bekijk alle X reacties" link to the post detail.
  - A compact comment field on the card to react directly.
- The feed endpoint returns per post: all asset IDs, the first liker names and the latest 2 comments,
  so no extra request per card is needed.

## Acceptance criteria
- Viewer can like once and unlike; counts update immediately.
- Comment permissions enforced on the server.
- Feed loads fast with many posts (paging).
- (4.1) Photos can be swiped on the card on mobile and desktop; swiping does not trigger navigation.
- (4.1) Liking and commenting are possible directly from the timeline; the card updates immediately.
