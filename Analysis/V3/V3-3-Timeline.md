# Phase V3-3 – Timeline

Status: ⏳ planned (target 2.3.0)

Mockup boards: *Timeline*, *Timeline · 160 % text*, *Tablet portrait · timeline*,
*Desktop · feed + map*.

## Goal
Step cards that lead with the photo and read like a diary, a route line that shows how the
travellers moved between steps, and layouts that use tablet and desktop width.

## Tasks

### Step card (`PostCard.tsx`)
- Order: **photo** (20 px radius, no text on top; photo count badge when > 1) → **day badge**
  "Dag 6 · do 9 juli" → author avatar + "Bert · 19:00" → **title** (Bricolage 1.375rem) → place
  line ("Ramberg → Leknes → Haukland strand") → excerpt (3 lines) → **stat chips** (icon + value,
  wrapping) → likes summary (avatar stack + "Marleen, Jonas en Lies vinden dit leuk") →
  **Leuk · 3** and **Reageer · 1** buttons (48 px, labelled).
- **Remove the comment box and latest comments** from the card. "Reageer" opens the step page
  scrolled to the comment field (`/post/:id#reageren`).
- Mini map only when the step has a **route** (≥ 2 points or segments); a single-point step shows
  no map (it was often an empty zoomed-in area).
- Steps without photos: card starts with the day badge (no grey placeholder).

### Day number
- Shared helper `travelDay(travel, date, timeZone)` → 1-based day number or null (step outside
  the travel dates). Used by cards, step page, journey, notifications.

### Route line between cards
- Between two consecutive cards (same travel, feed sorted by date) show a dashed connector with the
  transport icon and "Met de auto · 35 km · 2 dagen eerder" (mode and distance of the arrival
  segment of the newer step; time gap in days).
- Server: add `arrival: { mode, distanceKm } | null` to `PostSummary` (from the stored arrival
  segment; no new routing calls). Hidden when the feed mixes travels ("Alle reizen") and the
  neighbours belong to different travels.

### Large text
- Chips and buttons wrap; nothing is truncated at 160 % and 200 %. The *Timeline · 160 %* board is
  the reference.

### Tablet (37.5–68.75 em)
- Cards in **two columns** (CSS grid, masonry-like via `grid-auto-flow: dense` or two flex
  columns); from 130 % text they fall back to one column (em container query).
- "Nieuwe stap" in the header (from V3-2).

### Desktop (≥ 68.75 em)
- **Feed and map side by side**: feed column (max ~40 rem) on the left, sticky map on the right.
- The map **follows the step you are reading**: an `IntersectionObserver` on the cards picks the
  card nearest the top third; the map pans/zooms to that step, highlights it (Sunset marker) and
  shows a small label "Henningsvær – De stap die je nu leest". Clicking a marker scrolls the feed
  to that card. Line-style legend under the map.
- Respect "reduce motion": jump instead of animated pan.

### Phone
- "Nieuwe stap" FAB stays (travellers only), above the tab bar.

## Compatibility
- `PostSummary.latestComments` stays in the API (old clients use it); the new card just doesn't
  show it. `arrival` is optional.
- Feed pagination and offline cache unchanged.

## Acceptance criteria
- Card matches the mockup at 100 % and stays readable at 160/200 % without truncation.
- Route connector shows correct mode/distance; hidden across different travels.
- Desktop map follows scrolling smoothly with 50+ steps (observer, no scroll handlers).
- Typecheck, lint, tests (incl. `travelDay` unit tests around time zones) and build pass.
