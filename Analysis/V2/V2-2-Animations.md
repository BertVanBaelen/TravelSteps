# Phase V2-2 – Event animations

Status: ⏳ planned

## Goal
Small, playful animations that celebrate the user's own actions.

Part of the **front-end block** together with [V2-1](V2-1-Steps-UX.md): done right after it, reusing
its design tokens and components. Animations contain no visible text (`aria-hidden`), so nothing
needs translating in V2-3.

## Decisions (from Q&A)
| Event | Animation |
|-------|-----------|
| Publishing a new step | Footprints walking across the screen |
| Creating a new travel | A plane flying across the screen |
| Liking a step | Heart burst from the like button |
| Accepting a travel invitation | Confetti |

- Short (≤ 1.5 s), never blocking: `pointer-events: none`, `aria-hidden`, no layout shift.
- Disabled when the OS setting **reduce motion** (`prefers-reduced-motion: reduce`) is on.
- Only for the user's **own action** on this device, not for incoming notifications.

## Tasks
- `CelebrationLayer` component mounted once in `Layout.tsx` (above the routes) with a
  `celebrate(kind)` function exposed via context, so the animation survives the navigation that
  happens right after saving (v0.4.1 fix: the editor navigates immediately).
- Implement with inline SVG + CSS / Web Animations API; **no** heavy animation library (bundle
  size, offline precache). Styled with the design tokens from V2-1.
- Triggers:
  - step: on publish, also when the step is queued in the offline outbox (not on edit, not when a
    queued draft syncs later in the background);
  - travel: on create (not on edit);
  - like: on like (not on unlike), anchored to the button position;
  - invitation: on **Accepteren** (not on decline).
- Respect `prefers-reduced-motion` (check with `matchMedia`, also listen for changes).

## Compatibility
- Pure front-end; no API/DB change.
- Must not delay saving, navigation or the outbox; a failed animation is silently ignored.
- Works offline (bundled assets).

## Acceptance criteria
- Each of the four events shows its animation once; nothing for edits/unlike/decline.
- With reduce motion enabled no animation is shown.
- No measurable delay in publish → navigate; bundle size increase < 15 kB gzip.
