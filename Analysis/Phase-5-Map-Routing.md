# Phase 5 – Locations, routing & map

**Status:** ✅ done

## Goal
Posts have locations, routes between them, and a map screen.

## Tasks
- Location editor in post form: add via current GPS, map tap, place search (geocoding via backend proxy), or EXIF GPS of selected photos; reorder; name per point.
- Segments: transport mode per segment (lopen, fietsen, auto, trein, vliegtuig, boot).
- Routing service in backend (OpenRouteService, `ORS_API_KEY`):
  - foot-hiking / cycling-regular / driving-car → routed geometry + distance (+ elevation gain if available).
  - vliegtuig / boot / trein → straight geodesic line (dashed on the map).
  - Cache geometry in post frontmatter; recalc only when points/mode change; graceful fallback to straight line on API failure.
- Route between posts: connect the last point of a post to the first point of the next post in the same travel (mode chosen on the next post's first segment).
- Pre-fill afstand/hoogtemeters stats from routing result (editable).
- Map screen (Leaflet + OSM): filter active travel (default) / all travels (colour per travel) / specific travel; markers + polylines; popup with post preview → open post.
- Mini map on timeline cards and post detail.

## Acceptance criteria
- Walking/cycling segments follow trails/roads; flights are straight lines.
- Map filter works and tapping a marker opens the post.
- Routing API not called again when viewing (cached geometry).

## Implementation notes
- Without `ORS_API_KEY` (or on ORS failure) walking/cycling/car segments fall back to a straight
  line; the editor shows this. Place search uses ORS geocoding, with Nominatim as fallback.
- Route geometry, distance and ascent are cached per segment in the post frontmatter, keyed on the
  two points + mode; viewing and unchanged saves never call ORS.
- Arrival segment ("Aankomst vanaf vorige post") is stored on the next post as `arrival` and can be
  set to "geen" to not connect posts.
- Map popups and mini maps are read-only; mini maps don't draw the arrival segment.
