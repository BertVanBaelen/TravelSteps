# Phase V3-1 – Design foundation "Reisdagboek"

Status: ✅ implemented (released together with V3-2 as 2.2.0)

Mockup boards: *Design language · Reisdagboek*, *Improvements · overview* (points 1 and 4).

## Goal
Replace the cool grey "admin tool" look by the **Reisdagboek** design language – warm paper,
forest green, a sunset accent, characterful headings, a route-line motif – and make the app
ready for large text. At the end of this phase every existing screen uses the new tokens and
components with its **current layout**; later phases change the layouts.

## Tasks

### Tokens (`web/src/styles.css :root`)
- Colours (old token → new value; keep token names where the meaning is the same so existing
  rules follow automatically):

  | Token | New | Use |
  |-------|-----|-----|
  | `--bg` | `#FAF6EF` Paper | page ground |
  | `--card` | `#FFFFFF` | cards, sheets |
  | `--border` | `#E7DFD2` Line | borders, dividers |
  | `--text` | `#1D2421` Ink (14.7:1) | text |
  | `--muted` | `#4B5651` Ink 2 (7.1:1) | meta text |
  | `--brand` / `--brand-dark` | `#1B6B45` Forest / `#154F34` | buttons, active (white 6.5:1) |
  | new `--brand-tint` | `#DDF1E4` | selected rows, active nav |
  | new `--accent` | `#EF6B3A` Sunset | "now", "new", likes – shapes only |
  | new `--accent-ink` / `--accent-tint` | `#B03A0A` / `#FFE6D9` | day badges (5.1:1) |
  | `--like` | Sunset `#EF6B3A` | heart |
  | `--danger`, `--success`, `--info-bg` | re-checked against Paper for 4.5:1 | |

- Radii: cards and photos **20 px**, buttons **14 px**, chips/pills full. Spacing scale unchanged.
- Type scale in **rem**: page title 1.875rem, step title 1.375rem, story 1.125rem, body/buttons
  1.0625rem (17 px), meta/nav 0.9375rem (15 px). Remove every `--text-xs` / 12 px use; 15 px is the
  minimum.
- Replace all remaining `px` font sizes and fixed heights that hold text by rem/em
  (`--nav-height`, `--blog-bar-height`, buttons, inputs, chips) so nothing is cut off at 200 %.

### Fonts
- Add `@fontsource-variable/bricolage-grotesque` (headings and big numbers, 600–800) and
  `@fontsource/atkinson-hyperlegible-next` (text and controls, 400/600/700); import only the
  Latin subsets. Self-hosted, cached by the service worker, no CSP change.
- `font-display: swap`; system-ui stays the fallback stack.

### Components
- `Button`: primary (Forest), secondary (white + Line border), ghost, danger; min-height 48 px,
  14 px radius, icon + word.
- New `Chip` / `StatChip`: icon + value + unit, full radius, wraps onto the next line.
- New `DayBadge`: "Dag 4 · di 7 juli" on Sunset tint (component only; the day number logic comes
  in V3-3).
- New `RouteLine` SVG motif (dashed line with day dots) for empty states and the login screen.
- `Card`, `Sheet`, `Menu`, `Listbox`, `ConfirmDialog`, `EmptyState`, `Skeleton`, form fields:
  restyle with the tokens; inputs 48 px high with a visible label above.
- Restyle login, change password, profile hub, admin pages with tokens only (no mockup for those;
  layouts unchanged).

### Travel colour (behaviour change)
- Named palette in `shared`: Forest `#1B6B45`, Fjord `#2F6FB3`, Sunset `#E2553A`, Heather
  `#8A4FA8`, plus four more that pass 3:1 against the map and Paper (to replace the eight colours
  in `web/src/lib/map.ts`).
- Migration: `ALTER TABLE travels ADD COLUMN color TEXT` (nullable). `Travel.color` in the DTO is
  always filled: stored value, else the colour the travel shows today (same derivation as
  `lib/map.ts`), so nothing changes visually at the upgrade.
- `travelInputSchema.color`: optional, must be one of the palette keys.
- Travel editor: a colour row (swatch + **name**, radio group, 48 px). Default for a new travel:
  the first palette colour not used by the owner's other travels.
- Used for: the travel's map line, the ring around its cover, its chip in pickers.

### Map styling
- Route line styles per transport mode (icon + style, not colour alone):
  walk/bike **thick solid** (travel colour), car **thinner and lighter**, boat/train/plane
  **dashed in Fjord blue**. Applies to every `MapView` (mini map, map page, step page, editor).
  Legend component "Op eigen kracht · Auto · Boot" for the map page.
- Warmer base map: CSS filter on the tile pane only (e.g. `sepia(.25) saturate(.8)
  brightness(1.03)`, tuned so labels stay readable); routes and markers are not filtered.
- Markers: step dots Forest with white ring; newest step Sunset.

### Large-text checks
- Add a dev-only page or Storybook-like route `/dev/tekst` (only in `npm run dev`) showing the
  components at 100/130/160/200 % to check wrapping quickly.

## Compatibility
- Only additive migration (`travels.color`); old clients ignore the field and still render.
- No URL or API shape changes besides the new optional field.
- Offline: fonts are precached; first load after the update downloads them once.

## Acceptance criteria
- No text below 15 px at 100 %; no clipped text or horizontal scroll at 200 % on a 390 px phone.
- All text pairs pass 4.5:1 (checked with an automated contrast test on the token pairs).
- Every tappable element is ≥ 48 px high.
- Travel colour can be chosen, is shown on the map and in pickers, and existing travels keep
  their current colour.
- Typecheck, lint, tests and build pass; CHANGELOG with before/after screenshots.

## Status – ✅ implemented (2.2.0)
- Tokens: the Reisdagboek palette in `:root` (old token names kept as aliases), rem type scale
  with `--text-meta` (15 px) as minimum, `--tap` (48 px) on buttons, inputs, pickers, menu rows,
  icon buttons and calendar/time cells; radii 14/20/full; warm shadows. Input and control outlines
  use `--control-border` (3:1 against white) instead of the light line colour.
- Fonts self-hosted via `@fontsource-variable/*` 5.3.0 (Latin + Latin Extended, `web/src/fonts.css`,
  ~113 kB, precached). Theme colour of the PWA manifest and `index.html` updated.
- Travel colour: `travels.color` + migration (existing travels get the colour the map gave them,
  by start date), optional `color` in `travelInputSchema`, the owner's first unused colour for a
  new travel, colour row (named swatches, radio group) in the travel editor, cover ring and map
  colours from the stored value. Palette: Forest, Fjord, Sunset, Heather, Ochre, Lagoon, Slate,
  Berry (all 3:1 against paper and white).
- Map: `lineStyle()` per transport mode, `LineLegend` under the map, CSS filter on the tile pane.
- `RouteLine` motif on the login screen.
- `web/src/styles.test.ts`: contrast of token pairs and travel colours, no rem font size below
  15 px (exceptions: avatar initials, numbers in fixed-size map markers, the bell's count).

### Moved / not done
- `StatChip`, `DayBadge` and the photo-first card move to **V3-3**, where they are first used
  (no unused components now). The `--accent-*` tokens for the day badge are in place.
- The dev-only `/dev/tekst` page was not built; large-text checks are part of each page phase and
  V3-X. The em breakpoints were checked at 390/834/1440 px at 100 %; a browser text size of
  130–200 % still has to be checked on a real device.
- No changelog screenshots in `code/docs/changelog/2.2.0/` yet.
