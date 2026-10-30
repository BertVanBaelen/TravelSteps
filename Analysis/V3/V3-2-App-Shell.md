# Phase V3-2 – App shell & "Wat wil je zien?"

Status: ✅ implemented (2.2.0)

Mockup boards: *Breakpoints · phone, tablet, desktop*, *Wat wil je zien?*, the top bar and
navigation of *Timeline*, *Tablet portrait · timeline* and *Desktop · feed + map*.

## Goal
One app, three layouts: only the navigation and the number of columns change. And one clear
"what am I looking at" instead of two stacked pickers (travel + blog).

## Tasks

### Navigation (`Layout.tsx`)
- **Four tabs**: Tijdlijn, Kaart, Foto's, Reizen. Meldingen leaves the tab bar and becomes a
  **bell with a count** in the top bar (next to the avatar). `/meldingen` keeps its route and gets
  a Terug button.
- Breakpoints in **em** (container widths follow the text size):
  - **Phone** < 37.5 em: one column, bottom tab bar, bell top right.
  - **Tablet** 37.5–68.75 em: a **rail on the left with labels** (Tijdlijn … Reizen, then
    Meldingen with count); "Nieuwe stap" as a header button instead of a FAB.
  - **Desktop** ≥ 68.75 em: a **sidebar** with app name/icon, the four items + Meldingen,
    a primary **Nieuwe stap** button and the user at the bottom ("Bert · Profiel en
    instellingen", opening the existing user menu).
- Nav labels scale with the text up to 125 % and then stop (`min()` on font-size), so the four
  words always fit. Icons get a word everywhere.
- The current `max-width: 720px` content column becomes a per-page choice: pages opt into
  wide layouts in their own phase; until then they stay centred.
- Replace the `@media (max-width: 600px)` / `(min-width: 601px)` rules with the em breakpoints.

### Context bar + sheet "Wat wil je zien?"
- Replace `TravelPicker` (header) and `BlogBar` (blog selector) on the timeline, map and photos
  pages by one **context bar**: travel cover (with travel-colour ring), travel name in Bricolage,
  sub line "Dag 6 · Bert en Lies" (day of an ongoing travel / date range, and whose diary).
  Tapping it opens the sheet. On desktop the bar has a "Wijzigen" button.
- **Sheet "Wat wil je zien?"** (bottom sheet on phone, dialog on tablet/desktop):
  - *Van wie*: Iedereen (group icon) + each traveller with avatar, "(jij)" for yourself.
  - *Welke reis*: Alle reizen (count) + each travel with cover, colour ring and a status line:
    "Nu bezig · dag 5" (Sunset ink) for an ongoing travel, else date range + step count.
  - Real radio groups (`fieldset`/`legend`), 60–64 px rows, current choice tinted.
  - One main button **"Toon N stappen"** with the number of steps for the chosen combination.
- The subscribe bell of the blog bar moves into the sheet next to a traveller's row (same
  behaviour: hidden for Iedereen and yourself).
- Keep the same `localStorage` keys and values for the chosen travel and blog.
- The travels page keeps its own list; it only uses the blog filter (as today).

### Server
- Step count for the sheet: extend `GET /api/travellers` and the travel summaries with
  `postCountByAuthor` **or** add `GET /api/posts/count?travelId=&author=` (decide in the phase;
  the first avoids an extra request per choice).
- "Nu bezig · dag 5" is computed **in the client** from the travel dates and the device time
  zone (shared `travelDay` helper, see V3-3); no server field needed. The server-side time zone
  only arrives in V3-6 for the reminder.

## Compatibility
- `/meldingen` and all other routes unchanged; the old `BlogBar`/`TravelPicker` are removed only
  after the sheet covers all their uses (timeline, map, photos).
- API: only new optional fields / a new read-only endpoint.

## Acceptance criteria
- At 834 px width and 160 % text the app shows the phone layout; at 1280 px and 160 % the tablet
  layout (em breakpoints work).
- Sheet: keyboard (Tab, arrows within a group, Esc), focus trap, screen-reader labels; remembers
  the choice like today.
- Unread count on the bell matches the old tab badge; works offline (cached count).
- Typecheck, lint, tests and build pass; screenshots phone/tablet/desktop in CHANGELOG.

## Status – ✅ implemented (2.2.0)
- `Layout.tsx`: one `<nav>` that CSS turns into the bottom tabs (phone), a labelled rail
  (tablet, 6.5 rem) or a sidebar (desktop, 15.5 rem) with app name, Meldingen + count,
  "Nieuwe stap" (or "Nieuwe reis" when the user cannot post anywhere) and the user menu opening
  upwards. Phone: bell with count and avatar in the top bar; the timeline FAB stays phone-only;
  tablet: "Nieuwe stap" as a header button. Breakpoints `37.5em` / `68.75em`; nav labels capped
  at 125 % with `min()`.
- `ContextBar.tsx`: context bar + "Wat wil je zien?" sheet as a native modal `<dialog>` (focus
  trap, Esc, backdrop click), radio groups in fieldsets, "Toon N stappen", follow toggle under the
  chosen traveller. On `/reizen` the bar only chooses whose travels (`whoOnly`).
- `BlogContext` now also loads all visible travels once (`GET /api/travels`) and keeps the chosen
  travel (`travelsteps.travel.<userId>`); the blog key is unchanged. Timeline, map and photos read
  diary and travel from the context; old `?reis=` links (also `?reis=alle`) set the travel and
  switch to "Iedereen" when the travel is outside the chosen diary.
- `BlogBar` and the header `TravelPicker` (`PageStart` slot) are removed; `TravelThumb` and
  `travelOption` stay for the step editor.
- **No server change was needed** for the step count: the `traveller=` filter means "all steps in
  that traveller's travels", so the count is the sum of `postCount` of those travels, computed in
  the app (`isAuthorOf` mirrors the server rule).
- "Nu bezig · dag 5" / "Dag 6" via `travelDay()` in `web/src/lib/travel.ts` (device time zone,
  unit tests incl. daylight saving).

### Not done / to check
- The feed itself is still the v2 card in a centred column; wide layouts per page come in V3-3+.
- Check on a real phone and tablet with system text size 130–200 % (em breakpoints switch with the
  browser's default font size; the mockup board *Breakpoints* is the reference).
