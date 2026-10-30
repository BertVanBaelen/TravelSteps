# Phase V3-6 – Notifications & day reminder

Status: ⏳ planned (target 2.6.0) – needs rest days from V3-5

Mockup board: *Notifications*.

## Goal
A notification list that scans at a glance, and a gentle reminder when a travel day stays empty.

## Tasks

### List (`NotificationsPage.tsx`)
- Top bar: **Terug**, title Meldingen, **Alles gelezen**.
- Groups: **Vandaag · N nieuw**, **Deze week**, **Eerder** (in the user's time zone).
- Each row: actor avatar with an **icon badge per type** (heart = like, speech bubble = comment,
  footprints = new step, envelope = invitation, calendar = reminder), **one short line**
  ("Marleen reageerde op *Henningsvær en het voetbalveld*"), the comment text when there is one,
  relative time ("10 minuten geleden", then the date), and the **step's photo** as a thumbnail on
  the right. Unread rows are tinted, not only bold.
- **Likes combined** per step and day: "Jonas en Marleen vinden *…* leuk" with an avatar stack.

### Server
- `AppNotification` gains `photoAssetId: string | null` (first photo of the step, through the
  existing media proxy and permission check) and, for grouped likes, `actors: UserRef[]` +
  `ids: number[]` (marking a group read marks all its ids).
- Grouping of likes is done in the list query (same post, same calendar day, all unread or all
  read); push notifications are **not** grouped (unchanged).

### Day reminder (behaviour change)
- New type `reminder`: "**Dag 5 vergeten?** Woensdag 8 juli heeft nog geen stap in Lofoten &
  Senja. Een paar zinnen en één foto is genoeg." with two actions:
  **Stap schrijven** (→ new step for that travel and date) and **Het was een rustdag** (marks the
  rest day, V3-5). Footer: "Je krijgt dit om 21:00 als een reisdag leeg blijft. *Aanpassen*"
  (→ Profiel › Meldingen).
- Who gets it: every user who **may post** in a travel that is ongoing on that day, when that day
  has **no step** in the travel and is **not a rest day**. One reminder per user, travel and day.
- When: at the user's chosen time (default **21:00**) in the user's **time zone**.
  - Migration: `users.reminder_enabled INTEGER NOT NULL DEFAULT 1`,
    `users.reminder_time TEXT NOT NULL DEFAULT '21:00'`, `users.time_zone TEXT` (IANA, sent by
    the app from `Intl.DateTimeFormat().resolvedOptions().timeZone` on login and when it changes;
    fallback `TZ`).
  - Table `reminders_sent (user_id, travel_id, day, PRIMARY KEY …)` to prevent duplicates after a
    restart.
  - Scheduler: a 5-minute interval next to the hourly housekeeping in `app.ts`, picking users
    whose local time just passed their reminder time. Missed runs (server down) are not sent
    afterwards.
- Delivery: in-app notification **and** Web Push in the recipient's language (`messages.ts`).
  Push actions (`Stap schrijven`, `Rustdag`) via the service worker's `notificationclick`
  `action`; browsers without actions open the notification page.
- If a step for that day is published later, the reminder is marked read automatically.
- **Profiel › Meldingen**: switch "Herinnering bij een lege reisdag" + time picker (existing
  `TimePicker`), only shown to travellers.

## Compatibility
- Notification type `reminder` is new: older clients must render unknown types with a generic
  row instead of crashing (check `NotificationsPage` and the SW before release; ship the
  tolerant renderer in this phase).
- Existing notifications keep their ids; grouping is a view, not a data change.
- User deletion removes `reminders_sent` rows (cascade).

## Acceptance criteria
- Reminder sent exactly once per user/travel/empty day at the chosen local time; not for rest
  days, not for viewers, not after the travel ended, not when switched off (scheduler unit tests
  with a fake clock and several time zones).
- "Het was een rustdag" from the notification marks the day and removes the reminder.
- List grouping and combined likes correct; marking a group read marks every id.
- Typecheck, lint, tests and build pass; push tested on Android Chrome and iOS PWA.
