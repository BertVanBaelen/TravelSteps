# Functional requirements – TravelSteps

A blog-style application to track vacations ("reizen") and share them with family and friends, with a Strava-like experience. The main feature is creating blog entries – called **steps** ("stappen") – during a trip. Several travellers can blog, alone or together in a shared travel.

## Language

The user interface is in **Dutch** or **English** (labels, messages, dates, number formats `nl-NL` / `en-GB`, units always metric). Each user chooses the language in Profiel (stored on the server, so it follows the user to every device); before a choice the browser language is used (`en*` → English, otherwise Dutch), and the login screen has a small NL/EN toggle remembered per device. Push notifications use the recipient's language. User content (titles, texts, comments) is never translated. Documentation: root `README.md` (English) and `README.nl.md` (Dutch).

## Users and roles

| Role | Can do |
|------|--------|
| **Admin** (exactly 1) | Everything; is also a traveller; sees all travels; manages users (incl. their Immich key); deletes any step or comment |
| **Traveller** | Create travels (becomes owner), add steps in travels they're a member of, set own Immich key, like/comment |
| **Viewer** | View travels they're allowed to see, like steps, add comments, edit/delete own comments, subscribe to travellers, edit own profile |
| Anonymous | Only sees the login screen |

- **Login is required to view anything.** Only travellers (incl. the admin) can add steps.
- On first start one admin account is created from the configuration. On first login the admin is forced to change the password before anything else.
- The admin can add users (username, display name, role, temporary password). New users must change their password on first login.
- The admin can change a user's role (adding them to the travellers group), disable users, reset their password and delete them.

### Deleting a user
- A user without travels: simple confirmation.
- A user who owns travels: a popup offers three choices:
  1. **Verwijderen** – delete the user and their travels, including all steps in them (also steps by co-members).
  2. **Overdragen** – delete the user and transfer each travel to another accepted member (chosen per travel); if a travel has no other member, the admin chooses a traveller as new owner. The user's remaining steps stay, shown as "Verwijderde gebruiker".
  3. **Uitschakelen** – the user is not deleted but disabled: travels and steps keep existing, the user can no longer log in.
- Deleting a user removes their memberships, viewer access, subscriptions, notifications and Immich key (their photos then show a placeholder).

## Travels (Reizen)

- A travel has: name, description (formatted text), start date, end date (optional while ongoing), cover photo (from Immich), an **owner**, **members** and **viewers**.
- Any traveller can create a travel and becomes its **owner**.
- Every step belongs to exactly one travel and has one **author**.
- New steps default to the author's most recent ongoing travel (there is no global "active travel").

### Members (shared travels)
- The owner invites other travellers as members. An invitation must be **accepted** before the member can add steps; the invitee gets a notification and can accept or decline.
- Members add, edit and delete **their own** steps.
- The owner (and admin) edit the travel details, the member list and the viewer list, and can delete any step in the travel. The owner can delete the travel.
- A shared travel and all its steps appear in the blog of every member.

### Visibility (viewers)
- Each travel has its **own viewer list**, managed by the owner. A new travel starts with **no viewers**.
- Members always see the travel. Other travellers are treated like viewers (they must be on the viewer list).
- The admin sees all travels.
- Someone who can't see a travel doesn't see its steps, photos, map routes or stats anywhere.

### Screen: Reizen
- List of the selected blog's visible travels (newest first) with cover, dates, owner/members and **summed stats** of all steps (e.g. total afstand, total hoogtemeters, number of steps, number of photos). Only numeric stats with the same label + unit are summed.
- Travellers: create travels; owner: edit, delete, manage members and viewers.
- Pending invitations are shown with **Accepteren** / **Weigeren**.
- Tapping a travel opens the travel page.

### Screen: one travel ("de tocht")
- Top bar: "‹ Reizen" and a visible **Bewerken** button for whoever manages the travel; on a phone the "Nieuwe stap" button stays at the bottom.
- Header: cover (in the travel's colour), name, dates with the number of days ("4 – 16 juli 2026 · 13 dagen"; ongoing: "nu bezig · Dag 9"), the travellers and the description.
- **Totals** that say what they count: **Op eigen kracht** (walking + cycling km of the routes), **Totaal onderweg** (all transport modes, e.g. "ook auto en boot"), **Geklommen** (summed hoogtemeters, "hoogste punt 639 m"), and the number of steps and photos with up to two custom totals ("en 3 wafels"). Without routes the summed afstand stat is shown instead.
- Map of all steps with the line-style legend.
- **De tocht:** every day from the start date to the end date (an ongoing travel: up to today), in date order on one route line, with the summary "7 dagen met een stap · 2 rustdagen · 4 nog leeg":
  - a **step** row: day ("Dag 2 · zo 5 juli"), photo, title and "Lopen · 3,2 km · 448 m"; the newest step has a sunset dot; tapping opens the step;
  - a **leg** row before a step: how the travellers got there ("Met de auto · 23 km", from the step's arrival segment);
  - **empty days** ("Dag 3 · ma 6 juli – Nog geen stap") with **Stap toevoegen** (a new step on that day) and **Rustdag**; consecutive empty days are grouped ("Dag 7 en 8");
  - **rest days** ("Rustdagen, bewust leeg gelaten") with **Ongedaan maken**.
  - Steps outside the travel dates keep their place by date, marked "buiten de reisdatums".
- **Rest days** can be marked and unmarked by everyone who may post in the travel and by the admin; everyone who can see the travel sees them. A step on that day always wins. Only online (a message explains this offline).
- Computer: the list on the left and a large map on the right. Clicking a step chooses it (sunset border in the list, sunset on the map, a preview card with "Open stap"); clicking it again or "Open stap" opens it. Clicking a step on the map chooses it in the list.
- The complete feed of a travel is on the Tijdlijn (choose the travel in the context bar).

## Steps ("stappen")

A step consists of:
- Author (shown with avatar and name on cards and detail)
- Title
- Description (formatted text, stored as Markdown)
- **Multiple photos** from the author's own Immich library (gallery/carousel); the first photo is the cover. Photos are referenced, never copied.
- Date/time
- Travel (default: the author's most recent ongoing travel; only travels the author is a member of)
- One or more **locations**
- **Stats**
- Likes and comments

### Stats
- Fixed set (all optional): **afstand** (km), **hoogtemeters** (m), **max hoogte** (m), **temperatuur** (°C), **duur** (h:mm).
- Free custom stats: label + value + unit (e.g. "IJsjes gegeten: 3").
- Afstand can be pre-filled from the computed route of the step (editable).

### Locations
Each location can be added via:
- current GPS position,
- tapping on a map,
- searching a place name (geocoding),
- the EXIF GPS data of a selected photo.

Locations are ordered. Per segment (between two consecutive points) a **transport mode** is chosen: lopen, fietsen, auto, trein, vliegtuig, boot.
- lopen / fietsen / auto: route calculated via a routing service along roads/trails.
- vliegtuig / boot (and trein if no routing available): straight (dashed) line.

### Likes & comments
- A logged-in user can like/unlike a step once.
- Comments are plain text, no threading. The comment author can edit/delete their own comment; the **step author** and the **travel owner** can delete comments on that step; the admin can delete any comment.

### Text formatting
- The step description and the travel description use a **WYSIWYG editor** (formatting visible while typing), saved as Markdown.
- Options: **bold**, *italic*, headings (2 levels), bullet list, numbered list, quote, link.
- The editor also works offline. Rendering is sanitized (no raw HTML).

### Create/edit (travellers)
- Works **offline** in the PWA: title, description, stats, locations and transport modes can be written offline and saved as a draft on the device.
- Photos from Immich can only be picked when online, and only with an Immich key set. A draft without photos can be published; or photos are added once online.
- Drafts are synced/uploaded automatically when the connection returns. Sync status is visible ("Concept", "Wacht op verbinding", "Gepubliceerd").

## Original photos

- In the photo lightbox a **Download origineel / Download original** button is shown when allowed: for the author of the photo, the admin, and users the author trusts (in travels they can see). Single photo only; the file keeps its original name. Hidden while offline.
- Others (incl. viewers and co-writers who are not trusted) get 403; if the author's Immich key is missing the original is "not available".

## Notifications

- Delivered as **push notifications** (installed PWA) and in an in-app list on the **Meldingen** page.
- Events:
  - a new step by a traveller you're **subscribed** to (only for travels you may see),
  - a new step by a **co-member** in a shared travel (automatic, no subscription needed),
  - a **travel invitation**,
  - a **like** or **comment** on your own step.
- Only sent when a step is first published (also when an offline draft is synced later), not on edits.
- **Subscribing:** a bell icon next to the selected traveller in the header toggles the subscription to that traveller. The bell is hidden when "Iedereen" is selected. Subscriptions can also be managed in Profiel.
- **Install banner on phones:** on iPhone and Android, when the app is not installed on the home screen, a bar at the top says "Je ontvangt geen meldingen zolang de app niet op je beginscherm staat" with an **Installeren** button. Android shows the install dialog; iPhone shows short instructions (Deel → "Zet op beginscherm"). Not shown on desktop or when installed; can be dismissed for the current session.

## Screens

### Header: "Wat wil je zien?" (whose blog and which travel)
- One **context bar** at the top of Tijdlijn, Kaart and Foto's shows the chosen travel (cover with its colour ring, name, "Dag 6 · Bert en Lies" for an ongoing travel, otherwise the dates) or "Alle reizen". Tapping it opens one sheet "Wat wil je zien?" (bottom sheet on a phone, dialog on wider screens) with two choices and one button "Toon N stappen":
  - *Van wie*: **"Iedereen"** (all visible travels combined) and every traveller with at least one travel visible to you, with avatar and "(jij)" for yourself. It is a view filter, not account switching.
  - *Welke reis*: "Alle reizen" or one travel of that diary, with cover, colour ring and "Nu bezig · dag 5" or dates and counts.
- On Reizen the bar only chooses whose travels are listed.
- A traveller's blog = all steps (by anyone) in travels that traveller is a member of, limited to the travels you may see.
- The choice applies to Tijdlijn, Kaart, Foto's and Reizen.
- The last choice (diary and travel) is remembered per device. First use: travellers see their own blog, viewers see "Iedereen". Old links with `?reis=` choose that travel.
- In the sheet, under the chosen traveller: the subscribe toggle (see Notifications).

### Tijdlijn (timeline)
- Feed of the selected blog's steps, newest first. Shows the travel chosen in the context bar. Infinite scroll.
- **Step cards, photo first:** photo (dots under it when there are more; no text on the photo) → day badge "Dag 6 · do 9 juli" (only the date outside the travel dates) → author and time (and the travel when the feed shows all travels) → title → places "Ramberg → Leknes → Haukland strand" → three lines of the story → stats as chips with an icon (km with the icon of the main transport mode, hoogtemeters, duur, temperatuur, custom stats as "Wafels 3") → a mini map only when the step has a route (two places or more) → "Marleen, Jonas en Lies vinden dit leuk" → **Leuk · 3** and **Reageer · 1**. A step without photos starts with the day badge.
- **Reageer** opens the step page at the comment field. There is no comment box on the card.
- Between two steps of the same travel a dashed **route line** shows the transport mode, distance and time between them ("Met de auto · 35 km · 2 dagen eerder").
- Tablet: cards in two columns (one column again with large text), without route lines.
- Computer: the feed with a map next to it that **follows the step you are reading** (zooms to it, draws it in sunset, label "De stap die je nu leest"); clicking a step on the map scrolls the feed to its card. With "reduce motion" the map jumps instead of gliding.
- Tap a card to open the step page.

### Step page
- Top bar: "‹ <travel name>" and a visible **Bewerken** button (only with edit rights). **Stap verwijderen** is at the bottom of the step editor (with confirmation) for the author, travel owner and admin.
- Photos with small photos under them to switch, and the full-screen viewer (with Download origineel when allowed).
- Day badge "Dag 4 · di 7 juli · 16:20", "door Lies", title and places.
- **Cijfers** as tiles with a word that fits: "48 km gefietst" (the word follows the transport mode with the most km: gewandeld, gefietst, gereden, met de trein, gevlogen, gevaren), "620 m geklommen", "4:05 u onderweg", "17 °C temperatuur", "hoogste punt"; custom stats are marked "eigen cijfer".
- The story in a calm reading column (18 px text, at most about 36 em wide).
- Map with "3 plaatsen · fietsroute" and **Grote kaart** (opens the map zoomed in on this step).
- Likes: "Marleen en jij vinden dit leuk", **Leuk · 2**, **Reageer**.
- **Reacties** as a conversation (others left, your own right) with a labelled field "Jouw reactie aan Lies" and a **Versturen** button.
- **Vorige stap / Volgende stap** of the same travel (day and title).
- Tablet landscape and computer: story on the left; stats, map, likes and the other steps on the right.

### Kaart (map)
- Map (OpenStreetMap) with the selected blog's step locations, connected with the route per segment.
- Shows the travel chosen in the context bar, or all travels of the diary (each travel in its own colour, with a legend).
- Line style per transport mode, never colour alone: walking and cycling thick and solid, car thinner and lighter, boat/train/plane dashed in blue; a legend under the map. The base map is warmed with a filter so routes stand out.
- Tapping a point shows a popup with the step preview; tapping it opens the step.
- Opened from a step's **Grote kaart**, the map chooses that travel and zooms in on the step (drawn in sunset).
- Zoom buttons (48 px) are at the top right.

### Fotobibliotheek (picture library)
- Shows **only photos used in steps** of the selected blog and travel (context bar).
- Two views: grouped **by date** and grouped **by travel**.
- Tap a photo for full-screen view with a link to its step.

### Profiel
- Change profile picture (upload or – travellers with an Immich key – choose from Immich), display name, password.
- Travellers: set/replace/remove own **Immich API key** (shown as "ingesteld" + connection test, never displayed).
- Travellers/admin: **Vertrouwde personen / Trusted people** – mark users who can see at least one of your travels as trusted, or revoke it. Trusted users may download the **original** of every photo you published (steps and covers you own), but only in travels they can see. Revoking takes effect immediately.
- Manage subscriptions; enable push notifications on this device.
- Logout.

### Meldingen (bell)
- List of notifications, newest first; tapping one opens the step/travel/invitation.
- **Unread count badge** on the bell (top bar on a phone, rail/sidebar on wider screens); mark one or all as read.

### Beheer (admin only)
- User management (add, change role, set Immich key, disable, reset password, delete – see *Deleting a user*).
- Settings: Immich connection status (per traveller key), routing API status.

### Navigation
- Phone (narrower than 37.5 em): four tabs at the bottom (Tijdlijn, Kaart, Foto's, Reizen); the bell and profile picture at the top.
- Tablet (37.5–68.75 em): a rail on the left with labels, Meldingen and the profile picture; "Nieuwe stap" as a header button.
- Computer (68.75 em and wider): a sidebar with the app name, the items with labels, Meldingen with its count, "Nieuwe stap" and the user ("Profiel en instellingen").
- The switch points are in em, so a larger text size falls back to the narrower layout.

### Look and feel
- "Reisdagboek" design: warm paper, forest green, a sunset accent; Bricolage Grotesque for headings, Atkinson Hyperlegible Next for text (both bundled, no external font requests).
- Text follows the device text size; nothing smaller than 15 px, body 17 px; everything tappable at least 48 px high with a word next to the icon; text contrast at least 4.5:1.
- Every travel has a **colour**, chosen in the travel editor from a named palette (a new travel gets one the owner does not use yet). It is always shown together with the travel's name: map line, cover ring, legend.
- Every person is shown with an avatar (profile picture, or initials in a fixed colour per user).
- Loading pages show grey placeholders in the shape of the content; empty pages show an icon, a short explanation and, where useful, an action.
- Short celebration animations for your own actions on this device: footprints after publishing a new step, a plane after creating a travel, a heart burst when liking, confetti when accepting an invitation. Never blocking, and skipped when the device asks for reduced motion.

## Non-functional
- Installable as PWA on a phone (Android/iOS), mobile-first, also usable on desktop.
- Data must survive server restarts and container updates.
