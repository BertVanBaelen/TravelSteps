# Phase V2-1 – Steps & UX polish

Status: ✅ done (v1.1.0, layout fixes in v1.2.1)

## Goal
More uniform and prettier UI: call a post a **step** ("stap"), give the "whose blog" selector a
proper look with profile pictures, and use the same components and wording everywhere.

## Decisions (from Q&A)
- Rename is **UI wording only**: "post" → "stap" (nl) / "step" (en, after V2-3). Code names
  (`posts`, `PostCard`, `/api/posts`), database tables and URLs (`/post/:id`, `/posts/nieuw`,
  `/posts/:id/bewerken`) stay unchanged.
- Profile pictures are shown wherever a person is shown.

## Tasks

### Wording "stap"
- Replace all user-visible "post"/"posts" in `web/src/i18n/nl.ts` by "stap"/"stappen"
  (e.g. "Nieuwe stap", "Stap bewerken", "Stap verwijderen?", "Aantal stappen" in travel stats).
- Server-generated texts: push titles in `server/src/notifications/service.ts`
  ("… plaatste een nieuwe stap", "… vindt je stap leuk", "… reageerde op je stap") and any
  user-facing `HttpError` messages that mention "post".
- Offline/sync labels ("Concept", "Wacht op verbinding", "Gepubliceerd") stay; only the noun changes.
- Check docs: `Functional requirements.md` uses "stap" from now on (keep "post" in technical docs
  where it refers to code/API).

### Blog selector ("whose blog")
- Replace the native `<select>` in `BlogBar.tsx` by a custom dropdown (desktop) / bottom sheet
  (phone) with: avatar, display name, "(jij)" badge, number of visible travels; "Iedereen" with a
  group icon at the top. Keyboard and screen-reader accessible (listbox role, arrow keys, Esc).
- Selected traveller shown as avatar + name in the bar; subscribe bell keeps its current behaviour
  (hidden for "Iedereen" and for your own blog).
- Same data source as today (travellers with ≥1 visible travel); remembered choice in
  `localStorage` keeps working (same key and value format).

### Profile pictures everywhere
- `Avatar.tsx` gets sizes (xs/s/m/l) and an initials fallback with a stable colour per user id.
- Show avatars on: step cards and detail (already), comments, like list, notifications, travel
  members/viewers/invitations, user management, blog selector, header profile button.
- Deleted users ("Verwijderde gebruiker") get a neutral placeholder avatar.

### Uniform components
- Design tokens in `styles.css` (colours, spacing, radius, shadows, font sizes) and use them
  everywhere instead of ad-hoc values.
- Shared components: `Button` (primary/secondary/danger/ghost), `Card`, `EmptyState`
  (icon + text + optional action), `Skeleton` loaders, `Sheet`/`Menu`.
- Consistent empty states (timeline, map, photos, travels, notifications) and loading skeletons
  instead of plain "Laden…".
- Consistent icons (one set in `icons.tsx`), consistent page titles and back buttons.

## Status – ✅ implemented (v1.1.0)
- Wording: all Dutch UI texts, push titles and user-facing server errors say "stap"/"stappen";
  code names, API routes, DB and URLs unchanged.
- Blog selector: custom listbox (`BlogBar.tsx`) – dropdown on desktop, bottom sheet ≤ 600 px –
  with avatar, "jij" badge and travel count (new `Traveller.travelCount` from
  `GET /api/travellers`); arrow keys, Home/End, Enter, Esc; same `localStorage` key.
- `Avatar.tsx`: sizes xs/s/m/l, initials with a stable colour per user id, neutral placeholder for
  deleted users; new `AvatarStack` next to "Vind ik leuk door …"; avatars on the users page.
- Shared components `Button`, `Card`, `EmptyState`, `Skeleton*`, `Sheet`, `Menu` (avatar menu now
  uses `Menu`); design tokens (colours, spacing, radius, shadows, text sizes) in `styles.css`.
- Skeleton loaders and empty states replace "Laden…" on all list/detail pages.
- Phase X overlap: header icon and avatar menu were already done in v1.0.0.
- v1.2.1: bottom sheet now covers the bottom nav/FAB, users page and step header wrap correctly.
- Screenshots: `code/CHANGELOG.md`.
## Feedback iteration (v1.2.2)
User feedback after testing v1.2.1:
- Use **floating action buttons** for adding and editing instead of the small white buttons at the
  top right (new travel, new step, edit travel, edit step).
- Use **icons on action buttons** so they look livelier while staying clear (icon + text).

Status – ✅ implemented (v1.2.2): `Fab`/`FabStack` component (extended FAB with label, small white
secondary FAB). Timeline and travel page: "Nieuwe stap" (pre-selects the travel via `?reis=`);
travel page: edit FAB; travels page: "Nieuwe reis"; step page: edit FAB. Delete/leave stay in the
header with icon + red tint. New icons (pencil, trash, leave, send, save, key, ban, image-add,
user-plus, refresh, search, pin) on the action buttons across the app.
## Feedback iteration 2 (v1.2.3)
User feedback after testing v1.2.2:
- The travel filter dropdown (timeline, map) is not nice: move it into the app header, on the
  opposite side of the user menu.
- Step detail page: an **expanding FAB** with edit and delete instead of the delete button at the
  top right.
- Confirm dialog: a title and icons in the buttons.
- Profile and settings: split into **sub-menus** so it is clear which settings exist.

Status – ✅ implemented (v1.2.3): generic `Listbox` (shared with the blog selector); `TravelPicker`
in the new left header slot (`PageStart`) on timeline and map, with cover/colour, dates and counts.
`FabMenu` speed dial on the step page (edit + delete, scrim, staggered labelled mini buttons).
Confirm dialog always has a title, a coloured icon and icons on both buttons. `/profiel` is a hub
(account, password, Immich, notifications, app install, admin, log out) with sub pages
`/profiel/:section`; `/beheer/instellingen` is a hub (general, services, values) with sub pages
`/beheer/instellingen/:section`. The avatar menu items have icons.
## Feedback iteration 3 (v1.2.4)
User feedback after testing v1.2.3:
- The expanding FAB on the step detail page is always open (bug).
- The travel dropdown when creating a step and the dropdown under the map are ugly: make **all**
  dropdowns pretty.
- Rename the "Immich" label to photo integration.

Status – ✅ implemented (v1.2.4): the speed-dial items are hidden until the FAB is opened (CSS
`display` overrode the `hidden` attribute). All native `<select>`s are replaced by the app
`Listbox`, which now has three variants: `pill` (header, blog bar), `field` (form input, used by
`SelectField`) and `compact` (inline, e.g. the transport mode per segment and the user role). The
travel choice in the step editor shows cover, dates and counts; transport modes have icons (walk,
bike, car, train, plane, boat); roles, travel transfer and invitees show icons/avatars. The
profile row, its page (`/profiel/fotos`), the admin badge/button and the services list say
"Foto-integratie"; the explanation still mentions Immich.
## Feedback iteration 4 (v1.2.5)
User feedback after testing v1.2.4:
- Rich-text style buttons: an active button becomes invisible on hover.
- "Kies op kaart" looks weird; the map highlight goes outside its borders.
- Make the date and time selection pretty.
- Disable the arrival (route) option while no place is selected (it was reset immediately).
- Rename the admin's second settings menu to "admin panel".
- A pretty modal for the Immich API key (admin).
- A copy button for the password when creating a new user.

Status – ✅ implemented (v1.2.5): hover rule for `.rte-btn.active`; map-pick button with icon and
an inside border instead of an outline; new `DateTimePicker` (`DatePicker`, `TimePicker`,
`DateField`, `DateTimeField`) used by the step and travel editors; arrival `Listbox` disabled
with a hint until there is a place; "Beheerpaneel" in the profile hub, avatar menu and page
title; `ImmichKeyDialog` in user admin; `CopyButton` (Clipboard API with fallback for http) next
to the temporary password and in the created/reset notice.
## Feedback iteration 5 (v1.2.6)
User feedback: make it possible that a new travel is only for 1 day, so a second date is not needed.

Status – ✅ implemented (v1.2.6): "Duur" segmented toggle (*Eén dag* / *Meerdere dagen*) in
`TravelEditorPage`; one-day hides the end date and saves `endDate = startDate` (no schema change);
an existing travel with equal dates reopens in one-day mode; `formatRange` shows a single date
when start and end are equal.

## Feedback iteration 6 (v1.2.7)
User feedback: pressing "Kies op kaart" in create step still makes the map go out of its borders.

Status – ✅ fixed (v1.2.7): the `map-adding` class was set through React's `className`, which
overwrote the classes Leaflet adds to the container (`leaflet-container` clips the tiles). The
class is now toggled with `classList` in an effect, and `.editor-map` also has `overflow: hidden`.

## Feedback iteration 7 (v1.2.8)
User feedback:
- When the travel is only one day, the create step screen should not show a date selector.
- Selecting a location in the create step screen looks like nothing happens because it takes some
  time: add a loading screen (or make it faster).

Status – ✅ implemented (v1.2.8): `DateTimeField` got `fixedDay`/`hint`; `PostEditorPage` pins the
step date to the travel day when `endDate === startDate` and only shows the time picker.
`LocationEditor` adds points immediately and looks up names in the background (row placeholder
"Plaatsnaam zoeken…"; a name typed meanwhile is kept); a `.map-loading` overlay with spinner shows
while locating, searching, reading photos, naming or routing; route debounce 700 → 400 ms; the
route response no longer overwrites names that arrived meanwhile. Server `RoutingService`:
geocoding timeout 6 s (was 20 s) and an in-memory LRU cache (500 entries) for search and reverse.
## Overlap with Phase X (v1)
Phase X still contains "app icon top-left in the header" and "profile tab replaced by a menu under
the profile picture (top right)". If not done yet when V2-1 starts, do them **in this phase** (the new
header avatar menu uses the new `Menu` component) and tick them in Phase X.

## Compatibility
- No API, database or URL changes → old clients, outbox drafts and notification links keep working.
- Existing notifications in the database store type + ids, not text, so they show the new wording
  automatically.
- `localStorage` key for the selected blog unchanged.
- Visual regression check on phone and desktop for all pages; offline editor still works.

## Acceptance criteria
- No user-visible "post" left in the Dutch UI or push notifications (grep the UI texts).
- Blog selector shows avatars, works with keyboard and on a phone, remembers the choice.
- Every place that shows a person shows an avatar (or initials fallback).
- Typecheck, lint, tests and build pass.
