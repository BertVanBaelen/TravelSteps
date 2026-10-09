# Phase 2 – Travels & posts (storage)

## Goal
Admin can create travels and posts that are persisted as Markdown files.

## Tasks
- Content repository module: read/write `travel.md` and post `.md` files with frontmatter (gray-matter), atomic writes, slug generation, in-memory index rebuilt at startup.
- Zod schemas in `shared/` for Travel, Post, Stats (fixed: afstand, hoogtemeters, maxHoogte, temperatuur, duur + custom list), Location, Segment.
- Travel endpoints: list, get, create, update, delete, `POST /api/travels/:id/activate` (only one active).
- Post endpoints: list (filter by travel, paging), get, create, update, delete. Posts default to active travel.
- Stable IDs (UUID) independent of file names; moving a post to another travel moves its file.
- Markdown rendering on client with sanitization (react-markdown, no raw HTML).
- Frontend (admin): travel form, post editor (title, date, description, stats editor with fixed + custom stats). Photos and locations come in later phases (placeholders).

## Acceptance criteria
- Created travels/posts appear as readable `.md` files in `/data/travels/...`.
- Restart rebuilds the index and shows the same content.
- Only one travel is active at any time.
- Viewers cannot call write endpoints (403).
