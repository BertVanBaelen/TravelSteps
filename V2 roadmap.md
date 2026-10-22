# TravelSteps – V2 roadmap

V2 builds on v1 (see [Analysis/README.md](Analysis/README.md)) without breaking any existing
feature or data. The detailed plan, decisions, compatibility rules and permission matrix are in
**[Analysis/V2/README.md](Analysis/V2/README.md)**, with one file per feature.

| # | Feature | Summary | Plan |
|---|---------|---------|------|
| 1 | Steps & UX polish | "Post" is called **"stap"** in the UI (code/API/URLs unchanged); prettier blog selector with profile pictures; avatars everywhere; uniform buttons, cards, empty states and loaders | [V2-1](Analysis/V2/V2-1-Steps-UX.md) |
| 2 | Event animations | Footprints on a new step, plane on a new travel, heart burst on a like, confetti on accepting an invitation; off with "reduce motion" | [V2-2](Analysis/V2/V2-2-Animations.md) |
| 3 | Multi-language | Dutch + English, chosen per user (default from browser, fallback Dutch); push notifications in the recipient's language | [V2-3](Analysis/V2/V2-3-I18n.md) |
| 4 | Trusted users & original download | A traveller marks other users as **Vertrouwd**; they may download that traveller's photos in full resolution (single photo) | [V2-4](Analysis/V2/V2-4-Trusted-Download.md) |
| 5 | Anonymous share link | Author, trusted users and admin can share one step via a link to a separate card (title, date, text, photos, stats, map – no author/comments/likes); expires after 24h, revocable | [V2-5](Analysis/V2/V2-5-Share-Link.md) |
| 6 | Admin statistics | Beheer → Statistieken: users (per role, active 30d), travels, steps, photos, likes, comments, `/data` storage, size of referenced Immich photos | [V2-6](Analysis/V2/V2-6-Admin-Stats.md) |
| X | Release v2.0.0 | Security review, upgrade test from v1, docs | [V2-X](Analysis/V2/V2-X-Release.md) |

## Original wishes (input for this roadmap)
- ~~i want to use google login implementation~~ (removed from V2 on 2026-10-22)
- i want to use multi language
- i want animations for events. i am thinking about like a footprint that comes onto the screen when posting a post. a plane that comes across the screen when making a new travel, ...
- i want more uniformity and ux prettieness. for example instead of a post, call it a step
- make the person select blog more pretty, add profile pictures, ...
- add an admin panel to see stats. users, posts, storage being used, ...
- photo download option in full res, a role that can be given to a user so that he can download the original quality (not everyone has to be able to do this)
- sharing functionallity. share a post to a annonymous person as a viewer. for privacy reasons this generates a new page with a custom card with only the post on it. after 24h it is no longer usable.
