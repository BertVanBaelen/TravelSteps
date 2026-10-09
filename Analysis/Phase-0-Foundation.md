# Phase 0 – Foundation

## Goal
A running skeleton: backend serves frontend on one port inside Docker, data folder mounted from the host.

## Tasks
- Monorepo (npm workspaces): `server/`, `web/`, `shared/` (shared TS types + Zod schemas).
- Server: Fastify + TypeScript, `/api/health`, serves built `web/dist` as static files with SPA fallback.
- Web: React + Vite + TypeScript, router (React Router), Dutch base layout with bottom navigation (Tijdlijn, Kaart, Foto's, Reizen, Profiel).
- Config loader from env (`PORT`, `DATA_DIR`, ...), validated with Zod, fail fast on missing secrets.
- Multi-stage `Dockerfile` (build → slim Node runtime, non-root user), `docker-compose.yml` with volume `/share/travelsteps:/data` and port mapping.
- Linting (ESLint + Prettier), Vitest setup, `README.md` with run instructions.
- i18n approach: Dutch strings centralised in `web/src/i18n/nl.ts`.

### Improvement 0.1 – page title in the app banner — ✅ done
- Remove the `<h1>` page titles at the top of every page (Tijdlijn, Reizen, Foto's, Kaart, Profiel,
  post/travel detail and editors, admin pages, password pages, …).
- The app banner (`app-header` in `Layout.tsx`) shows the current page title instead, e.g.
  "Reizen", "Gebruikers", or the post/travel title on detail pages. On the Tijdlijn the banner
  keeps showing "TravelSteps".
- Sub-pages (detail, editor, admin) get a back arrow (←) on the left of the banner.
- Page actions that sat next to the old title (e.g. "+ Nieuwe reis", "Bewerken") move to the
  right side of the banner.
- Implementation: a small `usePageTitle(title, { back?, actions? })` hook/context that pages call;
  also sets `document.title` ("Reizen – TravelSteps").
- Long titles are truncated with an ellipsis; the banner height stays the same.
- Pages outside the layout (login, forced password change) get the same banner style.

## Acceptance criteria
- `docker compose up` on the HA host serves the app on the configured port.
- Cloudflare Tunnel to that port shows the app.
- Files written to `/data` survive container restart/recreate.
- (0.1) No page shows a separate title at the top; the banner always shows the right title.
