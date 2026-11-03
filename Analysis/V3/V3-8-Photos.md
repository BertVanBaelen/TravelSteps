# Phase V3-8 – Photos

Status: ⏳ planned (target 2.8.0)

Mockup board: *Desktop · photos* (phone/tablet follow the same structure with fewer columns).

## Goal
Every picture with its story: photos grouped per step, large thumbnails, and a slideshow to watch
the whole trip.

## Tasks

### Page (`LibraryPage.tsx`)
- Header: "Foto's", context bar line "Lofoten & Senja · 13 foto's · iedereen".
- Toggle **Per stap** (default) / **Per datum** (segmented control, 48 px).
- **Per stap**: one group per step with day badge, step title (link to the step) and "3 foto's";
  thumbnails in a grid. **Per datum**: groups per calendar day (current behaviour, restyled).
- Large thumbnails: column count from the container width in **em** (so columns drop as the text
  grows): phone 2, tablet 3, desktop 4–5. Square crops with 20 px radius; alt text "Open foto:
  …" from the step title.
- Tapping a photo opens the existing gallery/lightbox (with Download original).

### Slideshow – "Diavoorstelling"
- Full-screen viewer over the current selection, in step order: photo, and below it (never on
  top) the day badge and step title.
- Controls: previous / pause-play / next / close (48 px, labelled), arrow keys, space, Esc;
  swipe on touch. Auto-advance every ~5 s; "reduce motion" disables fades.
- Uses the preview-size media (not originals); preloads the next photo only.

### Server
- `LibraryPhoto` gains `postTitle` (if not present) so groups need no extra requests; grouping
  happens in the client from the existing list (already has `postId`, `date`).

## Compatibility
- Same endpoint (`/api/library`), fields added only. Offline: cached thumbnails as today; the
  slideshow shows only cached photos offline.

## Acceptance criteria
- Per stap and Per datum show the same photos; groups in the right order.
- Slideshow fully usable with keyboard and screen reader; stops at the end.
- Typecheck, lint, tests and build pass.
