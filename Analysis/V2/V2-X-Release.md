# Phase V2-X – Hardening & release (v2.0.0)

Status: ⏳ planned – always the last V2 phase

## Goal
All V2 features secure, tested, documented, and released as **v2.0.0** without data loss.

## Tasks
- Security review focused on the V2 surface:
  - public share endpoints (token entropy, hash storage, scoping, rate limit, no data leaks, noindex);
  - original download authorization matrix and no service worker caching;
  - admin stats endpoint authorization;
  - auth guard: enumerate all routes and assert only the whitelisted ones are public.
- Upgrade test: install the latest v1.x with real data incl. offline outbox drafts on a phone →
  update to v2.0.0 → all data, sessions, push subscriptions and drafts still work.
- Both languages complete (key check + manual pass on all screens).
- Playwright smoke extended: switch language, trust a user + download original, create/open/revoke
  share link (anonymous context), like animation present / absent with reduced motion, admin stats.
- Docs: `Functional requirements.md`, `Technical requirements.md`, `code/README.md` (new
  options), Home Assistant `config.yaml` options cleaned up.
- Version **2.0.0** in `code/config.yaml` and `code/server/src/version.ts` (equal).

## Acceptance criteria
- No high/critical findings open.
- Update from v1 to v2 on the HA server without data loss, verified with a restore from backup.
- Add-on shows version 2.0.0 and updates from the previous version.
