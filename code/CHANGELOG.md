# Changelog

All notable changes to TravelSteps. Versions follow `major.minor.patch`: a release raises the
major number, a completed phase the minor number and a bug fix the patch number. Screenshots are
in [`docs/changelog`](docs/changelog).

## 1.4.0 – Trusted people and original downloads

- **Download original:** the photo viewer has a **Download original** button that saves the photo
  in full quality with its original file name. It replaces the old author-only "Open original"
  link and is hidden while offline.
- **Trusted people:** travellers can mark people as trusted in Profile → Trusted people. Only people
  who can see at least one of your travels can be added. Trusted people may download the originals
  of your photos, but only in travels they can see. Revoking works immediately.
- **Privacy:** others (also co-writers and viewers) can no longer request originals; originals are
  never stored in the offline cache.

## 1.3.0 – Dutch and English

- **English:** the whole app is now available in English as well as Dutch – every screen, dialog,
  message, editor button and empty state. Dates and numbers follow the language; units stay metric.
- **Choose your language** in Profiel → Taal / Language. The choice is saved with your account, so
  it follows you to every device and after logging in again. Changing it offline works too; it is
  saved as soon as you are back online.
- **Login screen toggle:** a small NL / EN switch on the login screen, remembered on that device.
  Before you choose, the browser language decides (English browsers get English).
- **Notifications in your language:** push notifications are sent in the language of the person
  who receives them.
- **Docs:** the documentation now lives in the main `README.md` (English) and `README.nl.md`
  (Dutch).

## 1.2.9 – Security updates

- **Security:** updated dependencies (`zod` 4, `@fastify/rate-limit` 11) from the automatic
  security fix on GitHub.
- **Fix:** the server builds again with `zod` 4 (the `COOKIE_SECURE` / `TRUST_CLOUDFLARE`
  defaults); behaviour is unchanged.

## 1.2.8 – Faster locations, one-day steps

- **One-day travels:** a step in a travel of one day has no date picker any more – only the time,
  with a hint on which day the step is.
- **Locations feel instant:** a place picked on the map (or via GPS / photos) appears right away;
  its place name is filled in as soon as it is found ("Plaatsnaam zoeken…").
- **Loading overlay on the map** while a place is searched, located, named or the route is
  calculated, so it is clear something is happening.
- **Faster place lookups:** the server gives up on a slow place-name service after 6 seconds
  (was 20) and remembers recent answers, so repeated searches and taps are immediate. The route is
  calculated sooner after a change.
## 1.2.7 – Map stays inside its box

- **Fix:** pressing "Kies op kaart" in the step editor no longer makes the map spill out of its
  card. Switching the pick mode used to remove Leaflet's own styling from the map, so the map tiles
  were no longer clipped.

## 1.2.6 – One-day travels

- **One-day travel:** the travel editor has a "Duur" choice: *Eén dag* or *Meerdere dagen*. With
  *Eén dag* you only pick one date; the travel is saved with the same start and end date.
- One-day travels show a single date (e.g. "9 oktober 2026") instead of a range in the travel
  list, the travel page and the header travel picker.

## 1.2.5 – Date pickers, admin panel and fixes

- **Fix:** an active style button (bold, heading …) in the text editor no longer turns invisible
  when you hover over it.
- **Fix:** "Kies op kaart" now has a map icon, and the green highlight stays inside the map
  instead of sticking out of the card.
- **Fix:** "Aankomst vanaf vorige stap" can only be chosen once the step has a place; until then
  it is disabled with a hint (before, your choice was undone immediately).
- **Pretty date and time pickers:** the step date opens a month calendar and an hour/minute
  chooser; the travel start and end dates use the same calendar (with "Nog bezig" to clear the
  end date).
- **Beheerpaneel:** the admin "Instellingen" menu is now called "Beheerpaneel".
- **Photo integration key:** setting a traveller's Immich API key opens a proper dialog instead
  of a browser prompt, with save and remove buttons.
- **Copy password:** when creating a user (and after creating or resetting) a "Kopiëren" button
  copies the temporary password.
## 1.2.4 – Pretty dropdowns and photo integration

- **Fix:** the step actions button no longer shows its menu all the time; it opens on a tap.
- **Pretty dropdowns everywhere:** every choice list now opens the same app-style list (a bottom
  sheet on phones). The travel in the step editor shows its cover photo, dates and number of
  steps; the arrival and the transport mode between locations under the map show an icon per mode
  (walk, bike, car, train, plane, boat); roles, the travel transfer when deleting a user and the
  invite list show icons or profile pictures.
- **Photo integration:** the "Immich" menu item and labels are now called "Foto-integratie".
## 1.2.3 – Header travel picker, step actions and settings menus

- **Travel filter in the header:** on the timeline and the map the travel choice ("Alle reizen",
  "IJsland 2026" …) is now a picker on the left of the header, opposite your profile picture. It
  shows the cover photo (or map colour), dates and number of steps of every travel.
- **Step actions button:** on a step, the floating button opens a small menu with "Stap bewerken"
  and "Stap verwijderen"; the delete button at the top right is gone.
- **Confirm dialog:** opens and closes with a smooth animation, always has a title (for example
  "Stap verwijderen?"), a coloured icon and icons on the buttons.
- **Profile and settings menus:** the profile page is now a clear menu – name and profile photo,
  password, Immich, notifications, app installation, admin and log out – each opening its own
  page. The admin settings are split the same way into general, services and values. The profile
  menu at the top right shows icons.

## 1.2.2 – Floating buttons, icons and full-screen animations

- **Floating action buttons:** adding and editing no longer hide behind small white buttons at
  the top right. "Nieuwe reis" (travels), "Nieuwe stap" (timeline and travel page – the travel is
  pre-selected) and "Bewerken" (travel and step) are now big floating buttons above the bottom
  navigation.
- **Icons on buttons:** edit, delete, leave, accept/decline, save, publish, send, invite, cover
  photo, location search and the admin actions show an icon next to their label. Delete and leave
  have a red tint.
- **Full-screen animations:** creating a travel first shows a big plane flying across the screen
  for one second, creating a step shows big footprints walking across it; only then is it saved.
  A like shows a big heart in the middle of the screen, accepting an invitation a full-screen
  confetti rain. With "reduce motion" there are no animations and no waiting.

## 1.2.1 – Layout fixes

- **Blog selector on phones:** the bottom sheet was drawn underneath the bottom navigation and the
  "+" button, so the last travellers in the list could not be tapped. The sheet now covers both.
- **Users page (admin):** with the new avatars the name column was squeezed next to the buttons;
  the buttons now wrap onto their own line when space is short.
- **Step header:** on narrow screens the author, travel and date no longer squeeze into narrow
  columns; the date moves to its own line.

| Blog selector on a phone | Users page |
| --- | --- |
| <img src="docs/changelog/1.1.0/blog-sheet-phone.png" width="260" alt="Blog selector as bottom sheet"> | <img src="docs/changelog/1.1.0/admin-users-desktop.png" width="480" alt="Users page with avatars"> |

## 1.2.0 – Animations (V2 phase 2)

Small, cheerful animations for the moments that matter. They play once, never block the page,
and are skipped entirely when the device asks for reduced motion.

- **Like:** a burst of hearts around the heart button (only when liking, not when un-liking).
- **New step:** footprints walk across the screen after publishing a step (also when it is saved
  offline and sent later).
- **New travel:** a plane flies across the screen after creating a travel.
- **Invitation accepted:** confetti when you join a travel, from the travel page or from
  Meldingen.

| Like | Invitation accepted | New travel |
| --- | --- | --- |
| <img src="docs/changelog/1.2.0/like-burst-phone.png" width="240" alt="Heart burst after liking"> | <img src="docs/changelog/1.2.0/invite-confetti-phone.png" width="240" alt="Confetti after accepting an invitation"> | <img src="docs/changelog/1.2.0/new-travel-plane-phone.png" width="240" alt="Plane after creating a travel"> |

## 1.1.0 – Steps & UX (V2 phase 1)

- **"Posts" are now "stappen":** every text in the app, the push notifications and the error
  messages talks about *stappen* ("Nieuwe stap", "Er zijn nog geen stappen", …). Links and saved
  data are unchanged.
- **Avatars everywhere:** every person gets a round avatar with their initials and a fixed
  colour (or their photo). They appear on steps, comments, travels, the users page and as a small
  stack next to "Vind ik leuk door …".
- **New blog selector:** choose whose blog you see from a list with avatars, "(jij)" for yourself
  and the number of travels per traveller. A dropdown on a computer, a bottom sheet on a phone;
  fully usable with the keyboard.
- **Avatar menu:** the menu behind your avatar (profile, admin, log out) got the same new style.
- **Loading and empty pages:** instead of "Laden…" you see grey placeholders in the shape of the
  content, and empty pages show an icon with a short explanation and, where useful, a button.
- **More consistent look:** shared colours, spacing, rounded corners and shadows across all pages.

| Timeline | Blog selector (computer) | Avatar menu |
| --- | --- | --- |
| <img src="docs/changelog/1.1.0/timeline-phone.png" width="240" alt="Timeline with avatars"> | <img src="docs/changelog/1.1.0/blog-dropdown-desktop.png" width="400" alt="Blog selector dropdown"> | <img src="docs/changelog/1.1.0/user-menu-desktop.png" width="400" alt="Avatar menu"> |

| Step with likes and comments | Loading | Empty page |
| --- | --- | --- |
| <img src="docs/changelog/1.1.0/step-detail-phone.png" width="240" alt="Step detail"> | <img src="docs/changelog/1.1.0/skeleton-phone.png" width="240" alt="Skeleton placeholders while loading"> | <img src="docs/changelog/1.1.0/empty-state-phone.png" width="240" alt="Empty photo library"> |

## 1.0.0 – First release

- Security review fixes, `npm audit` clean.
- Nightly database backups (`backup_keep`), status on the Instellingen page and a restore
  procedure in the README.
- More descriptive notifications (comment text, step/travel excerpt).
- Compression, lazy-loaded thumbnails and code-split pages for faster loading.
- App icon in the header; the Profiel tab is replaced by the avatar menu.

## 0.4.x and earlier

Development versions (phases 1–9): see the phase files in the `Analysis` folder.
