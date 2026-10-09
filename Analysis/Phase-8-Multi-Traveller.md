# Phase 8 – Multiple travellers, sharing, notifications & rich editor

Status: ✅ done (v0.4.0) – Web Push, the install banner and the editor still need a test on a real iPhone/Android

## Goal
Let several people blog about (shared) travels, let viewers choose whose blog they see,
notify people about new activity, and give the post editor real text formatting.

## Decisions (from Q&A)

### Storage
- **Posts and travels move from Markdown files to SQLite.** One-time automatic migration at
  startup when `travels/` exists and the database has no travels: existing travels/posts become
  owned/authored by the admin, `IMMICH_API_KEY` is copied to the admin's account and the folder is
  renamed to `travels.migrated/`. **No export** to Markdown/JSON afterwards; backup = `/data`
  (`travelsteps.db`, avatars, secrets).
- Reason: authorship, travel membership, per-travel visibility, subscriptions and notifications are
  relational and need queries/transactions that the file store + in-memory index can't do cleanly.

### Roles
| Role | Can do |
|------|--------|
| **Admin** | Everything; is also a traveller; sees all travels |
| **Traveller** | Create travels, post in travels they're a member of, like/comment |
| **Viewer** | View travels they're allowed to see, like/comment, subscribe |
- The admin sets the role (adds a user to the travellers group).

### Travels, membership & visibility
- Any traveller can create a travel → becomes its **owner**.
- Owner invites other travellers as **members**; invitations must be **accepted**.
- Members add/edit/delete **their own** posts. Owner (and admin) edit travel details, member list,
  viewer list, and can delete any post in the travel.
- **Visibility is per travel:** each travel has its own viewer list managed by the owner.
  New travels start with **no viewers**; members always see it; non-member travellers are treated
  like viewers. Admin sees everything.
- The **"active travel" concept is removed.** New posts default to the author's most recent ongoing
  travel.

### "Whose blog" selector (header)
- Dropdown for everyone: list of travellers + **"Iedereen"** (combined). It's a view filter, not
  account switching.
- Default: last choice remembered per device; first use → travellers see their own blog, viewers
  see "Iedereen".
- A traveller's blog = all posts (by anyone) in travels that traveller is a member of, limited to
  travels the current user may see. Applies to Tijdlijn, Kaart, Foto's and Reizen.
- Dropdown only lists travellers with at least one travel visible to the current user (assumption).
- Post cards/detail show the author (avatar + name).
- Map default: the selected blog's most recent travel, with an "alle reizen" option.

### Immich
- One shared Immich URL (settings/env); **API key per traveller**, set by the admin (user management)
  or by the traveller (Profiel).
- Global `IMMICH_API_KEY` is **dropped**; on migration it is moved to the admin's account.
- Media proxy loads a photo with the key of the user who added it (post author; travel cover → owner).
  Access check: the asset must be referenced in a travel/post the requester may see.
- Keys stored encrypted at rest, never returned to the client (only "set / not set" + status test).

### Notifications
- Delivery: **Web Push** (PWA) + **in-app list** as a new **bottom-bar page** with unread badge.
- Subscribe: bell icon next to the traveller dropdown toggles a subscription to that traveller;
  **hidden when "Iedereen" is selected**. Subscriptions also manageable in Profiel (assumption).
- Events:
  - new post by a subscribed traveller (only if the travel is visible to you),
  - new post by a co-member in a shared travel (automatic, no subscription needed),
  - travel invitation,
  - like / comment on your own post.
- Only on first publish (incl. offline drafts synced later), not on edits.
- **Install banner on phones:** on iPhone and Android, when the app is not running as an installed
  PWA (`display-mode: standalone` / `navigator.standalone` false), show a bar at the top:
  "Je ontvangt geen meldingen zolang de app niet op je beginscherm staat" with an
  **"Installeren"** button next to it.
  - Android/Chrome: button triggers the `beforeinstallprompt` install dialog (reuse `lib/install.ts`).
  - iPhone/Safari (no install API): button opens short instructions (Deel → "Zet op beginscherm").
  - Not shown on desktop or once installed. Dismissible for the current session (assumption).

### Deleting a user who owns travels
The admin's delete action opens a popup when the user owns travels, with three choices:
1. **Verwijderen** – delete the user's travels, including all posts in them (also co-members' posts).
2. **Overdragen** – transfer ownership of each travel to another accepted member (picked per travel);
   a travel without other members can only be deleted (or the user disabled).
   The user's posts stay, attributed to "Verwijderde gebruiker".
3. **Uitschakelen** – don't delete; disable the user instead. Travels and posts keep existing, the
   user can't log in anymore.
- Users without travels: plain confirm dialog (as today).
- Deleting a user also removes their memberships, viewer entries, subscriptions, notifications and
  push subscriptions; their Immich key is removed, so their photos no longer load (placeholder).

### Comments moderation
- Comment author edits/deletes own comment; **post author and travel owner** can delete comments on
  that post; admin can delete any comment.

### Rich text editor
- **WYSIWYG editor that stores Markdown** (TipTap or Milkdown – to evaluate bundle size/offline).
- Options: bold, italic, headings (2 levels), bullet list, numbered list, quote, link.
- Used for post body **and** travel description. Rendering stays sanitized (no raw HTML).

## Data model sketch (SQLite)
```
users            + role ('admin'|'traveller'|'viewer'), immich_api_key_enc
travels          id, owner_id, name, description, start_date, end_date, cover_asset_id,
                 cover_owner_id, created_at, updated_at
travel_members   travel_id, user_id, status ('invited'|'accepted'), invited_by, created_at
travel_viewers   travel_id, user_id
posts            id, travel_id, author_id, title, date, body, stats_json, locations_json,
                 segments_json, arrival_json, created_at, updated_at, published_at
post_photos      post_id, asset_id, position, owner_id
likes/comments   post_id → FK to posts (cascade)
subscriptions    subscriber_id, traveller_id
notifications    id, user_id, type, actor_id, travel_id, post_id, read_at, created_at
push_subscriptions  id, user_id, endpoint, p256dh, auth, created_at
```
Route geometry stays as JSON in the post row (same as frontmatter today).

## Impact on existing code
- `content/store.ts` (file store + index) → SQLite repository; `content/files.ts` only for migration.
- All content routes: replace `admin` checks by owner/member/viewer permission checks.
- `config.ts`: remove `IMMICH_API_KEY`; Immich client becomes per-user (`client(userKey)`).
- Offline outbox: enabled for travellers (not only admin); post input carries `travelId` membership check.
- Web: header dropdown + bell, new Notifications page, Reizen members/viewers/invitations UI,
  admin users page (role + Immich key), Profiel (Immich key, subscriptions, push opt-in).
- Service worker: `push` + `notificationclick` handlers; VAPID keys generated and stored in `/data`.

## Implementation notes
- Editor: **TipTap** (lazy-loaded chunk), Markdown in and out; shared by post body and travel description.
- Photos stay a JSON list in the post row (no `post_photos` table); the asset owner is the post author
  (travel cover: `cover_owner_id`).
- The `Origineel openen` link in the lightbox is only shown to the author of the photo.
- Deleting a user: per owned travel the admin picks *verwijderen* or *overdragen aan* an accepted member;
  travels without members can only be deleted. `Uitschakelen` keeps everything.
- The blog bar (dropdown + bell) is shown on Tijdlijn, Kaart, Foto's and Reizen; the bell is hidden for
  "Iedereen" and for your own blog. Bottom bar: Tijdlijn, Kaart, Foto's, Reizen, Meldingen, Profiel.
- The phone banner is dismissed per browser session.
- The in-app unread badge refreshes every 60 s, when the app becomes visible and when a push arrives.

## Bug fixes (v0.4.1) – done
- ✅ Publishing stayed on the editor page: the editor now navigates immediately after saving; local
  draft cleanup (IndexedDB) runs in the background and all local storage calls have a timeout.
- ✅ New post editor kept loading: the draft/outbox lookup is time-limited and never blocks the page;
  if the rich-text editor chunk fails to load, a plain textarea is shown.
- ✅ Native `confirm()` popups replaced by an in-app confirm dialog (`ConfirmDialog.tsx`).
- ✅ Push opt-in reported "not accepted" after allowing: permission handling supports both browser APIs,
  re-checks the state, recreates subscriptions with an old VAPID key and shows the real error reason.
  The browser prompt always shows the hostname; the app cannot change that text.
- ✅ (v0.4.2) Android kept showing "blocked" after allowing notifications for the browser app: the
  site permission inside the browser is separate from the app permission. The push card now re-reads
  the permission when the app becomes visible again (plus a *Opnieuw controleren* button) and shows
  platform-specific steps (Android browser / installed Android app / desktop) to unblock the site.
- ✅ (v0.4.3) Notification status-bar icon: new monochrome `badge-96.png` (white "TS" + boot print on
  transparent) instead of the full-colour icon, which Android rendered as a white square. The "Edge"
  attribution can only disappear when the PWA is installed as a WebAPK (e.g. via Chrome "Install app").

## Open points / risks
- iOS only supports Web Push for PWAs installed on the home screen (iOS 16.4+).
- Choice TipTap vs Milkdown: Markdown round-trip fidelity and bundle size.
- Removing a user's Immich key (or deleting the user): photos of that user's posts can no longer
  load – show placeholder.
