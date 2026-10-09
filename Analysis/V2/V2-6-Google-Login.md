# Phase V2-6 – Google login

Status: ⏳ planned

## Goal
Let existing users sign in with their Google account instead of typing a password.

## Decisions (from Q&A)
- **Extra option** on the login screen ("Inloggen met Google"); username/password stays.
- Only **existing** users can use it, after they **linked** their Google account in Profiel while
  logged in normally. Unknown Google accounts are refused ("Dit Google-account is niet gekoppeld aan
  een TravelSteps-account"). No self-registration, no automatic account creation.
- Optional feature: only active when configured.

## Tasks

### Configuration
- New optional env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; Home Assistant options
  `google_client_id` (str?) and `google_client_secret` (password?) in `code/config.yaml` +
  entrypoint mapping. Requires `PUBLIC_URL` (redirect URI = `PUBLIC_URL/api/auth/google/callback`).
- Without client ID: no Google button, no Google section in Profiel, endpoints return 404.
- Docs: how to create the OAuth client in Google Cloud Console (authorized redirect URI).

### Server
- Migration: `user_identities (user_id, provider, subject, email, created_at, UNIQUE(provider, subject))`,
  FK `user_id → users ON DELETE CASCADE`. One Google identity per user.
- OpenID Connect authorization code flow with **PKCE**, `state` and `nonce` (e.g. `openid-client`):
  - `GET /api/auth/google/start?mode=login|link` – sets a short-lived signed HttpOnly cookie with
    state/nonce/verifier/mode, redirects to Google (`scope=openid email`).
  - `GET /api/auth/google/callback` – validates state, exchanges code, verifies ID token (issuer,
    audience, nonce, expiry, `email_verified`).
    - `mode=login`: look up `subject` → user. Not found / disabled → redirect to login with error code.
      Found → create session exactly like password login (same cookie, sliding expiry).
    - `mode=link`: requires a logged-in session; stores the identity; fails if already linked to
      another user.
  - `DELETE /api/profile/google` – unlink.
- Login throttle/lockout also applies to failed Google callbacks (per IP).
- Forced credential change stays: a user with `mustChangePassword` / `mustChangeCredentials` still
  gets the forced screen after Google login (guard unchanged).
- Start/callback are GET routes marked `config.public`; CSRF protected by `state` instead of the
  custom header.

### Web
- Login screen: "Inloggen met Google" button (Google branding guidelines) when enabled.
- Profiel: **Google-account koppelen** / show linked e-mail + **Ontkoppelen**.
- Beheer → Gebruikers: column "Google gekoppeld" and an admin **Ontkoppelen** action.
- Hidden offline.

## Compatibility
- Password login, sessions, roles and the forced change are unchanged.
- Disabled users cannot log in with Google either.
- User deletion removes the identity (cascade).
- CSP: no Google scripts are loaded (pure redirect flow), so CSP doesn't need Google domains.
- Session cookie `SameSite=Lax` works because the callback is a top-level GET navigation.

## Risks / open points
- **iOS home-screen PWA:** the Google redirect can leave the PWA and finish in Safari, which has a
  separate cookie jar → user ends up logged in in Safari, not in the PWA. Test on a real iPhone;
  if it fails, hide the Google button in iOS standalone mode and keep password login.
- Google OAuth consent screen needs to be published (or users added as test users).

## Acceptance criteria
- A linked user logs in with Google and lands on the timeline; an unlinked Google account is refused.
- Link/unlink works from Profiel; admin sees and can remove the link.
- Without config the app looks and behaves exactly like before.
- Tests: callback validation (bad state, wrong audience, unverified e-mail, unknown subject,
  disabled user).
