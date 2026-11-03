# Phase V3-X – Release v3.0.0

Status: ⏳ planned – always last

## Goal
Ship V3-1 … V3-8 as **3.0.0** after checking the guardrails across the whole app, the upgrade
from 2.0.0 and the new server behaviour.

## Tasks

### Accessibility and large text
- Every screen at **100, 130, 160, 200 %** text on phone (390 px), tablet portrait (834 px),
  tablet landscape (1194 px) and desktop (1440 px): no clipped text, no horizontal scroll, layout
  steps back as designed (em breakpoints).
- Contrast check of all token pairs and of text on travel colours (automated test).
- Keyboard-only and screen-reader pass (VoiceOver iOS, TalkBack Android) on: context sheet, step
  card buttons, comment field, rest-day actions, reminder actions, step editor sections,
  slideshow.
- Tap targets ≥ 48 px (spot-check with the dev overlay).

### Upgrade test from 2.0.0
- Restore a 2.0.0 database with users, travels, steps, likes, comments, notifications, push
  subscriptions and trusted grants; start 3.0.0: migrations run (travel colour, rest days,
  reminder prefs, time zone, reminders_sent), travel colours look the same as before.
- Installed 2.0.0 PWA with offline drafts in the outbox: update, drafts open in the new editor
  and sync.
- Old notification links (`/post/:id`, `/reizen/:id`, `/meldingen`) work.

### Security review
- New endpoints: rest days (permission = may post), reminder settings (own user only), step
  neighbours (visibility), notification photo (media permission), post counts (no leak of
  steps from invisible travels).
- Scheduler: no duplicate or cross-user reminders; time-zone input validated as IANA name.
- Fonts self-hosted; CSP unchanged (no Google Fonts host).

### Docs and release
- `Functional requirements.md`, `Technical requirements.md`, `README.md` + `README.nl.md`
  (reminder, rest days, travel colour), `V3 roadmap.md` and this README marked ✅.
- `code/CHANGELOG.md` section **3.0.0 – TravelSteps 3** with screenshots in
  `code/docs/changelog/3.0.0/`.
- Bump `code/config.yaml` and `APP_VERSION` to 3.0.0; push to `main`.
- Manual check on Home Assistant: add-on updates, data kept, reminder arrives at 21:00.

## Acceptance criteria
- All checks above done and noted here; typecheck, lint, tests and build pass; release workflow
  green; 3.0.0 runs on the Home Assistant server.
