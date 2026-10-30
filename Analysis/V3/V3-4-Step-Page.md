# Phase V3-4 – Step page

Status: ⏳ planned (target 2.4.0)

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
