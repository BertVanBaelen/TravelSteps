# Phase V2-2 – Event animations

Status: ✅ done (v1.2.0)

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

## Status – ✅ implemented (v1.2.0)
- `Celebration.tsx`: `CelebrationProvider` + `useCelebrate()` mounted in `Layout.tsx`; inline SVG
  icons + CSS keyframes, `pointer-events: none`, `aria-hidden`, errors swallowed.
- Reduced motion checked with `matchMedia` (listens for changes); CSS also disables the keyframes.
- Triggers: LikeButton (like only, anchored), PostEditorPage (new step, online and queued),
  TravelEditorPage (create only), TravelDetailPage and NotificationsPage (accept only).
- Bundle: main chunk 142 → 144.9 kB gzip (+2.9 kB for V2-1 and V2-2 together).
- Screenshots: `code/CHANGELOG.md`.
## Feedback iteration (v1.2.2)
User feedback after testing v1.2.1:
- More **full-screen** animations.
- Creating a travel: a **big plane flies across the whole screen for 1 second, and only then is the
  travel created**. Same for creating a step (footprints across the screen first, then publish).

Status – ✅ implemented (v1.2.2): `celebrate()` returns a promise. Travel: big plane with contrail
and clouds across a tinted sky (1 s, then create). Step: big footprints walking diagonally across
the screen (1 s, then publish, also offline). Like: big heart in the centre plus the burst.
Invite: denser full-screen confetti. Reduced motion skips the wait.
## Feedback iteration 2 (v1.2.3)
- Opening (and closing) the delete/confirm dialog gets a smoother animation.

Status – ✅ implemented (v1.2.3): backdrop fade + blur, the dialog springs in and scales out (180 ms
closing state), the icon pops in; all disabled with "reduce motion". Settings sub pages slide in.
## Compatibility
- Pure front-end; no API/DB change.
- Must not delay saving, navigation or the outbox; a failed animation is silently ignored.
- Works offline (bundled assets).

## Acceptance criteria
- Each of the four events shows its animation once; nothing for edits/unlike/decline.
- With reduce motion enabled no animation is shown.
- No measurable delay in publish → navigate; bundle size increase < 15 kB gzip.
