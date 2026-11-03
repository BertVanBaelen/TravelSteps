# Phase V3-4 – Step page

Status: ✅ implemented (2.4.0)

Mockup boards: *Step page*, *Tablet landscape · step*.

## Goal
A step reads like a diary page: a calm reading column, visible actions, and a way to read the
diary in order.

## Tasks

### Layout (`PostDetailPage.tsx`)
- Top bar: back to the travel ("‹ Lofoten & Senja") and a visible **Bewerken** button (only with
  edit permission). The three-dot **FabMenu is removed**; **Verwijderen** moves to the bottom of
  the step editor (danger zone with the existing confirm dialog).
- Header: day badge "Dag 4 · di 7 juli · 16:20", "door Lies" with avatar, title, place line.
- Photo gallery (existing lightbox and Download original stay).
- **Stats as labelled tiles** with a verb that fits the transport mode: "48 km gefietst",
  "620 m geklommen", "4:05 uur onderweg", "17 °C temperatuur", custom stats with "eigen cijfer".
  The verb comes from the step's dominant mode (most km): gewandeld / gefietst / gereden /
  gevaren / gevlogen / met de trein; fallback "afstand".
- Story in an **18 px (1.125rem) reading column**, max ~36 em wide, line-height 1.6.
- Map block: "3 plaatsen · fietsroute" + **Grote kaart** link → `/kaart?post=:id` (map page
  focuses that step).
- Likes summary + **Leuk** / **Reageer** buttons (48 px).
- **Reacties (2)**: list with avatars; the comment field has a real label "Jouw reactie aan Lies"
  and a big **Versturen** button. Anchor `#reageren` for the timeline's Reageer button.
- **Vorige stap / Volgende stap** cards at the bottom (day + title), in the travel's order.

### Server
- `PostDetail.neighbours: { previous: {id, title, date} | null, next: … | null }` – the steps
  before/after in the **same travel** by date, only among steps the user may see. Computed in
  `content/store.ts` with one indexed query each.

### Tablet landscape / desktop
- Two panels: **photo + story** on the left; **facts** on the right (stats, map, likes, next step).
  Each block keeps its own white card, so text never sits on the page background.

## Compatibility
- URL `/post/:id` unchanged; `neighbours` is an additional field.
- Deleting a step keeps the same API and confirm dialog, only the entry point moves.
- Offline: a cached step page without `neighbours` hides the previous/next block.

## Acceptance criteria
- Edit and delete reachable for author/admin/travel manager exactly as today; viewers see neither.
- Previous/next never leaks a step the user may not see (integration test with a viewer).
- Comment field reachable from the timeline via `#reageren`, labelled for screen readers.
- Typecheck, lint, tests and build pass.

## Status – ✅ implemented (2.4.0)
- Server: `ContentStore.neighbours(id)` (in-memory sorted list of the travel, same order as the
  feed) and `PostDetail.neighbours { previous, next }` with `{ id, title, date, coverAssetId }`
  (cover added for the thumbnails in the mockup). Whoever may see the step may see its whole
  travel, so nothing can leak; integration test with a viewer, a hidden travel in between and an
  outsider (404).
- `PostDetailPage.tsx` rewritten: header "‹ <travel>" via `usePageTitle(…, { backLabel })` and a
  **Bewerken** button in `PageActions` (edit right only); `FabMenu` removed from the page.
  `Gallery thumbnails` (thumbnail row, `aria-current`, lightbox + Download original unchanged),
  `DayBadge time`, "door Lies", `FigureTiles` (verb from `dominantMode`, "eigen cijfer"), story
  card (`--text-story`, max 36 em, line-height 1.65), map card with "3 plaatsen · fietsroute" and
  **Grote kaart** → `/kaart?reis=<travel>&post=<id>` (the existing `?reis=` handling selects the
  travel; `MapPage` focuses `?post=`), likes card, `Comments` and neighbours.
- `Comments.tsx`: conversation layout, labelled field "Jouw reactie aan Lies" (`#reageren`),
  big **Versturen**; scrolls to `#reageren` / `#reacties` once the comments are loaded.
- Phone: one column in mockup order (CSS `order` with `display: contents` columns); from 56 em two
  panels (story left, facts right, every block its own card).
- **Delete** moved to a danger zone at the bottom of `PostEditorPage` (same confirm dialog and API;
  shown with `canDelete`, also when a local draft is open; goes to the travel page afterwards).
- Offline/old cache without `neighbours`: the block is hidden.
- 160 % text on a 390 px phone checked: the header shows only "‹ <travel>" and **Bewerken**
  (bell and avatar hidden on these pages on phones, bar text capped at 125 %); tiles, story,
  likes, comments and neighbours wrap without overlap.

### Not done / to check
- Check at 130 % and 200 % on a real phone/tablet; changelog screenshots for 2.4.0.
