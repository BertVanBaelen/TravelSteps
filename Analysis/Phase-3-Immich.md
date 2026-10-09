# Phase 3 – Immich integration

## Goal
Admin picks photos from Immich; everyone sees them via the backend proxy, without duplicating files.

## Tasks
- Immich client in backend (`IMMICH_URL`, `IMMICH_API_KEY`): verify connection, list timeline/albums, search, get asset metadata (incl. EXIF GPS + date).
- Admin picker endpoints: `GET /api/immich/assets?...`, `GET /api/immich/albums`, `GET /api/immich/assets/:id`.
- Media proxy: `GET /api/media/:assetId/thumbnail|preview|original`.
  - Viewers: only assets referenced by a post or travel cover (whitelist from index).
  - Admin: any asset (for picking).
  - Stream responses, forward content-type, set `Cache-Control: private, max-age=...` and ETag.
- Post editor: photo picker (grid, multi-select, reorder by drag, first = cover); travel cover picker.
- Post detail: gallery/carousel with full-screen view.
- Beheer: Immich connection status.
- Beheer: settings page to see all settings of the application, like the immich url, api key but also possible future settings.

## Acceptance criteria
- No image files are written to `/data` for Immich photos (only asset IDs).
- A viewer cannot fetch an arbitrary Immich asset ID.
- Picker works smoothly on phone (lazy loading thumbnails).
