# Phase V3-7 – New step from photos

Status: ⏳ planned (target 2.7.0)

Mockup board: *New step from photos*.

## Goal
Replace the 2,500 px form with every field open by a short, guided editor that starts from the
photos and fills in what it can.

## Tasks

### Structure (`PostEditorPage.tsx`)
- Top bar: **Annuleren**, title "Nieuwe stap" / "Stap bewerken".
- Progress: **1 · Foto's → 2 · Waar, wanneer → 3 · Verhaal**. One section open at a time;
  finished sections **fold up with a tick** and a one-line summary ("Foto's · 2 gekozen ·
  Wijzigen").
- Sticky bottom bar, always visible: **Bewaar als concept** (secondary) and **Verder** (primary;
  "Publiceren" in the last section).
- Edit mode: same sections, all folded with their summary; any can be opened; "Opslaan" instead of
  Verder. Verwijderen sits at the bottom (moved from the step page, V3-4).

### 1 · Foto's
- Existing `PhotoPicker` (Immich), shown first. "Overslaan" for a step without photos, and
  offline (photo picking needs the network; the message says so).

### 2 · Waar, wanneer – suggestions from the photos
- Info line: "Ingevuld uit je foto's: datum, tijd en twee plaatsen. Kijk even na of het klopt."
- **Reis**: travel picker (cover + colour); suggested from the photo date (travel whose dates
  contain it), else today's default as now.
- **Datum** and **Tijd** on **separate full-width rows** ("dinsdag 7 juli 2026 · dag 4", "16:20"),
  so nothing is cut off; suggested from the earliest photo's `takenAt`. One-day travel: date fixed
  (as v1.2.8).
- **Plaatsen**: suggested from photo GPS (reuse `LocationEditor`'s "from photos" logic): photos in
  time order, clustered by distance (e.g. > 500 m apart = new place), reverse-geocoded name, with
  "uit foto IMG_4102". Between places: **"Hoe ging je verder?"** with Wandelen / Fietsen / Auto /
  Boot (+ Trein / Vliegtuig behind "Meer") as 48 px chips. **Plaats toevoegen** (search / map /
  current location as today).

### 3 · Verhaal
- Title and story (existing rich-text editor), then **Cijfers · optioneel** folded by default:
  "Afstand en hoogte komen uit de route" – distance and ascent prefilled from the route preview
  (already returned as `distanceKm` / `ascentM`), editable; temperature, duration and custom
  stats as today.

### Drafts (decision: local only)
- **Bewaar als concept** saves to the existing offline outbox (IndexedDB) as a draft that is not
  sent; the outbox list (Profiel › Concepten en wachtrij) opens it in this editor at the section
  where it was left. No server change.

### Server
- No new endpoints expected: photo metadata (`takenAt`, `lat`, `lng`, file name) is already in the
  Immich asset DTO; add the original file name if missing.

## Compatibility
- Same `postInputSchema`, same API; outbox entries from 2.x open in the new editor (old entries
  without a "section" open at section 1 with everything filled).
- Routes `/posts/nieuw` and `/posts/:id/bewerken` unchanged; `?reis=` and the new `?datum=`
  (from the journey and the reminder) prefill travel and date.

## Acceptance criteria
- Picking 2 photos with GPS and time fills travel, date, time and 2 places; changing anything
  manually is never overwritten by a later suggestion.
- Works fully offline without photos; drafts survive closing the app.
- At 200 % text: date and time rows readable, bottom bar does not cover the focused field.
- Typecheck, lint, tests (clustering + suggestion unit tests) and build pass.
