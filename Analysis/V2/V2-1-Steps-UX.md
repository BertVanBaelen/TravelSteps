# Phase V2-1 – Steps & UX polish

Status: ⏳ planned

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
