# Phase 1 – Authentication & users

## Goal
Secure login; nothing is visible without a session.

## Tasks
- SQLite setup (better-sqlite3) with migrations: `users`, `sessions`, `login_attempts`.
- Seed `admin`/`admin` on first start with `mustChangeCredentials = true`.
- Argon2id password hashing; password policy (min. 10 chars).
- Endpoints: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/change-credentials`, `POST /api/auth/change-password`.
- Session cookie: HttpOnly, Secure, SameSite=Lax, sliding 30-day expiry; server-side session store.
- Auth guard middleware on all `/api/*` (except login) and on media; role guard (`admin`, `viewer`).
- Block all calls except change-credentials while `mustChange*` flag is set.
- CSRF: require custom header (`X-Requested-With`) + SameSite cookie.
- Rate limiting + lockout on login, using `CF-Connecting-IP`.
- Admin user management: `GET/POST/PATCH/DELETE /api/users` (add, disable, reset password → `mustChangePassword`).
- Frontend: Inloggen screen, forced "Gegevens wijzigen" screen, Beheer → Gebruikers screen, route guards.

## Acceptance criteria
- Unauthenticated requests to any content/API return 401; frontend shows login.
- First login as admin/admin forces new username + password.
- Admin can create a viewer who must change password on first login.
- Brute-force attempts are throttled.
