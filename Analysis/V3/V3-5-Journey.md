# Phase V3-5 – Travel as a journey

Status: ⏳ planned (target 2.5.0)

Mockup boards: *Travel as a journey*, *Desktop · travel as a journey*.

## Goal
A travel page that shows the trip as one route, day by day, with totals that say what they
count, and **rest days** so empty days are either filled or explained.

## Tasks

### Header and totals (`TravelDetailPage.tsx`, `TravelStats.tsx`)
- Top bar: back to Reizen and a visible **Bewerken** button (replaces the edit FAB; phone keeps
  the "Nieuwe stap" FAB).
- Cover (travel-colour ring), name, "4 – 16 juli 2026 · 13 dagen", members with avatars,
  description.
- Totals as large-number tiles:
  - **Op eigen kracht** – walking + cycling km (sum of segments with mode `lopen`/`fietsen`).
  - **Totaal onderweg** – all modes, incl. car, boat, train, plane.
  - **Geklommen** – sum of ascent, sub line "hoogste punt 639 m" (max of `maxHoogte`).
  - **N stappen** – sub line "13 foto's en 3 wafels" (photo count + custom stats).
- This replaces the confusing "Afgelegd" (route) next to "Afstand" (stat). Server:
  `TravelSummary.distanceByGroup: { ownPower: number; total: number }`; keep `distanceKm`
  (= total) for old clients.
- Legend for line styles (Op eigen kracht · Auto · Boot).

### "De tocht" – the route list
- Summary line: "7 dagen met een stap · 2 rustdagen · 4 nog leeg".
- One vertical route line with, in date order:
  - **Step rows**: day ("Dag 2 · zo 5 juli"), photo, title, meta ("Wandelen · 3,2 km · 448 m");
    newest step dot in Sunset. Tap → step page.
  - **Leg rows** between steps: transport icon + "Met de auto · 23 km" (arrival segment).
  - **Empty days** as dashed rows "Dag 3 · ma 6 juli – Nog geen stap" with **Stap toevoegen**
    (users who may post; opens the new step for that travel and date) and **Rustdag** (mark as
    rest day). Consecutive empty days are grouped ("Dag 7 en 8").
  - **Rest days** as dashed rows "Rustdagen, bewust leeg gelaten" (no add button; an "Ongedaan
    maken" in the row menu for users who may post).
- Days run from start date to end date; for an ongoing travel (no end date or end in the future)
  only up to today.

### Rest days (behaviour change)
- Migration: `CREATE TABLE travel_rest_days (travel_id TEXT NOT NULL REFERENCES travels(id) ON
  DELETE CASCADE, day TEXT NOT NULL /* YYYY-MM-DD */, marked_by TEXT REFERENCES users(id) ON
  DELETE SET NULL, created_at TEXT NOT NULL, PRIMARY KEY (travel_id, day))`.
- API: `PUT /api/travels/:id/rest-days/:day` and `DELETE …` – allowed for users who may post in
  the travel (`canPost`) and the admin; `day` must lie within the travel dates. Returned in the
  travel DTO as `restDays: string[]`.
- A day with a step is never shown as rest day (the step wins); the mark stays stored.
- Offline: marking queues in the outbox like other writes, or is disabled offline with a message
  (decide in the phase; disabled is simpler).
- User deletion: `marked_by` becomes NULL; travel deletion cascades.

### Desktop (≥ 68.75 em)
- Route list on the left (totals on top), **large map** on the right with all steps.
- The selected step is highlighted in both (Sunset border in the list, Sunset marker) with a
  **preview card** on the map: "Stap 3 · Dag 4 · di 7 juli – Fietsen langs de E10 naar Haukland –
  48 km · 620 m geklommen – Open stap".

## Compatibility
- Additive migration and fields; `distanceKm` keeps its meaning (total).
- The old travel feed view on this page is replaced by the route list; the timeline filtered on
  the travel still gives the full feed.

## Acceptance criteria
- Totals add up: Op eigen kracht ≤ Totaal onderweg; matches the sum of segments (unit test).
- Empty/rest/step days correct for one-day travels, ongoing travels, steps outside the travel
  dates (shown at their date, outside the day list) and time zones.
- Only users who may post can mark/unmark rest days (integration tests incl. viewer and admin).
- Typecheck, lint, tests and build pass.
