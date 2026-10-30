# TravelSteps – V3 roadmap

V3 is a design overhaul of v2.0.0, based on the design mockup
["TravelSteps — as is (v1.4.0)", page *Improvements*](https://claude.ai/code/artifact/e054cb08-390d-44e5-b521-642bb1c127f5).
Most of it is visual, but a few changes add behaviour (rest days, a "forgotten day" reminder,
travel colours, previous/next step, step creation from photos). The detailed plan, decisions and
compatibility rules are in **[Analysis/V3/README.md](Analysis/V3/README.md)**, with one file per
phase.

| # | Phase | Summary | Plan |
|---|-------|---------|------|
| 1 | Design foundation "Reisdagboek" | Warm palette, Bricolage Grotesque + Atkinson Hyperlegible Next, rem type scale (17 px body, 15 px minimum), 48 px targets, 4.5:1 contrast, a colour per travel (chosen in the editor), route-line styles per transport mode, warmer map | [V3-1](Analysis/V3/V3-1-Design-Foundation.md) |
| 2 | App shell & "Wat wil je zien?" | Four tabs + notification bell in the top bar; em-based breakpoints with a tablet rail and desktop sidebar; one context bar and one sheet replace the travel and blog pickers | [V3-2](Analysis/V3/V3-2-App-Shell.md) |
| 3 | Timeline | Photo-first step cards with day badge, icon chips and labelled Leuk / Reageer; route line between cards; comment box moves to the step page; two columns on tablet, feed + live map on desktop | [V3-3](Analysis/V3/V3-3-Timeline.md) |
| 4 | Step page | Reading column, visible Bewerken button, Vorige / Volgende stap, labelled comment field; two panels on tablet landscape | [V3-4](Analysis/V3/V3-4-Step-Page.md) |
| 5 | Travel as a journey | Steps on one route line with day numbers and transport legs, empty days with Stap toevoegen, **rest days**, clearer totals (Op eigen kracht / Totaal onderweg); list + map on desktop | [V3-5](Analysis/V3/V3-5-Journey.md) |
| 6 | Notifications & day reminder | Grouped by day, icon badge per type, step photo, likes combined; **new reminder** "Dag 5 vergeten?" at 21:00 (adjustable) with Stap schrijven / Het was een rustdag | [V3-6](Analysis/V3/V3-6-Notifications-Reminder.md) |
| 7 | New step from photos | Three-part editor: photos first, then where/when (suggested from the photos), then story; finished parts fold up; sticky Verder / Bewaar als concept | [V3-7](Analysis/V3/V3-7-New-Step.md) |
| 8 | Photos | Photos grouped per step (or per date), large thumbnails, a slideshow | [V3-8](Analysis/V3/V3-8-Photos.md) |
| X | Release v3.0.0 | Large-text and contrast audit, upgrade test from 2.0.0, security review, docs | [V3-X](Analysis/V3/V3-X-Release.md) |

Still postponed: anonymous share link and admin statistics ([VX](Analysis/VX/README.md)).
