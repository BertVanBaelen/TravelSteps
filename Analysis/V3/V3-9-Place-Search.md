# Phase V3-9 – Search places when adding a step

Status: ⏳ proposed (analysis; not implemented)

## Goal
Let people find a real-world place while adding or editing a step, select it, and use its suggested name and coordinates as a location. Keep manual entry and the existing map/current-location/photo suggestions available.

## User experience

### Add a place
- In V3-7's **Plaatsen** section, **Plaats toevoegen** opens a place picker with a labelled search field.
- Typing shows online autocomplete suggestions once the query is useful (suggested default: 3 characters), with a short debounce and cancellation of stale requests.
- Suggestions show the place name and enough context (such as locality, region/country, or address) to distinguish similarly named results. Results are keyboard- and screen-reader-accessible; tapping targets are at least 48 px.
- Selecting a result adds a location to the route with its coordinates and suggests the place title from the provider's display name. The title remains editable; selecting a result must not lock or continually overwrite it.
- If there are multiple locations, search adds a new place by default. Editing an existing location uses an explicit replace/change action. This is the initial interpretation of “depends” and needs confirmation (see Open questions).
- Offer **Use this name** / manual editing independently from the provider result; users can keep a provider's coordinates but choose a shorter or personal title.
- Preserve the existing map picker and current-location option; photo-derived locations from V3-7 remain unchanged.

### States and resilience
- Loading, no results, provider/network error, and retry states have clear localized text.
- Search requires a connection. If offline, explain that search is unavailable and keep manual name entry, map selection from cached/available map data, and other existing options usable as they are today.
- Do not submit a query for every keystroke: debounce, enforce a minimum query length, cancel/ignore out-of-order responses, and limit displayed results (suggested default: 5).
- Do not silently use a result without the user's selection. The location name and coordinates change only on explicit selection; later typing/editing never changes coordinates.

## Provider options

These are candidates, not a provider decision. Verify current pricing, terms, attribution, quotas and data-retention rules before implementation; vendor plans and public endpoints can change.

1. **Photon (OSM-based)** – Designed for search-as-you-type and aligns with the existing OpenStreetMap mapping direction. The public demo endpoint is convenient for a prototype, but is community-operated and should not be treated as a guaranteed production service. Options: use it for a low-volume proof of concept with strict debouncing/caching and visible attribution, or self-host Photon for control and predictable capacity (with operational and data-update work).
2. **Geoapify** – Hosted OSM-derived autocomplete/geocoding, with a managed service and a free/paid quota model. Likely the simplest managed option if Photon’s public endpoint is not suitable; requires API key management, attribution/plan review, and cost monitoring.
3. **Mapbox Search** – Managed autocomplete with strong developer tooling and global search. Check billing, token restrictions and, especially, rules about storing selected results and displaying them outside Mapbox maps; those rules matter because TravelSteps stores a step's selected place.
4. **Google Places** – Broad POI/business coverage and polished autocomplete. Consider only if rich business/venue matching is important; review billing, attribution, session-token requirements, and restrictions on persisting place data before choosing it.
5. **Self-hosted Photon or another OSM geocoder** – More control over privacy, availability and limits, avoiding dependence on a shared public endpoint. Requires hosting, monitoring, storage, and regular OSM-data updates; probably more operational work than this feature warrants initially.
6. **Nominatim** – Not recommended on the public Nominatim endpoint for autocomplete: its usage policy is restrictive and public search is not intended for keystroke-by-keystroke requests. Self-hosting is possible but operationally heavier; a managed provider built on OSM is a more practical alternative.

### Suggested rollout
- **Recommended starting point:** build a provider-neutral client interface and start with Photon only if its public service terms/availability are acceptable for this app's expected traffic; otherwise choose a managed provider such as Geoapify. Keep the provider behind configuration so it can be replaced without changing location UI or stored step data.
- Before production, confirm the provider permits storing the selected display name and coordinates indefinitely as part of user-authored travel content. Persist only the app's required fields (display name, latitude, longitude, and optional provider ID/source); avoid copying unnecessary metadata.
- Never expose a secret server-side API key in the browser. If a provider requires a secret, proxy requests through the app server with rate limiting and abuse protection. Public/client tokens must be restricted where supported.
- Add attribution in the picker or app map credits as required by the selected provider and underlying data licences.

## Data and compatibility
- Use the existing location representation if it already supports a display name and latitude/longitude. Do not add a schema/API change unless inspection of the current implementation shows it is necessary.
- Keep provider-specific IDs and metadata optional. Existing manual, map, current-location, photo-derived and offline-outbox locations must continue to work without them.
- A provider result is a suggestion, not a new canonical location entity; no server lookup is needed to render an already-saved step.
- Preserve route ordering and transport-mode relationships between multiple places.

## Accessibility, privacy and localization
- Search field has a visible label, combobox/listbox semantics, keyboard navigation, announced result count/loading state, and a clear way to dismiss suggestions.
- Include Dutch and English labels/messages (Dutch is the base locale), meeting V3 type-size, contrast, target-size and responsive guardrails.
- Tell users that queries are sent to the chosen search provider. Send only the typed query and the minimum context required; do not attach user identity or travel content.
- Provider locale/biasing: prefer the device/app locale and optionally bias to the map viewport or user's current location only after permission; do not require location permission for text search.

## Acceptance criteria
- Typing a place query offers useful autocomplete results, with no request before the minimum length and with debouncing/stale-response handling.
- Selecting a result adds the location with the selected coordinates and a suggested, editable place title.
- Adding a new location and replacing an existing one are distinct, deliberate actions; users can also cancel without changing route data.
- Manual location naming remains possible if search is unavailable or the user wants a custom name.
- Search errors and offline mode do not block saving a step or using existing location tools.
- Multiple locations retain their order and route/transport relationships.
- Keyboard, screen-reader, mobile, and 100/130/160/200% text-size checks pass; labels are localized in Dutch and English.
- Tests cover debounce/minimum length, request cancellation/order, selection mapping, editable title, adding versus replacing, empty/error/offline states, and no accidental coordinate changes.
- Typecheck, lint, tests and build pass.

## Open questions for discussion
1. **Provider:** start with Photon’s public endpoint (prototype/low traffic), self-host Photon, or use a managed provider (Geoapify / Mapbox / Google)? Is low operational overhead or fully open-data alignment more important?
2. **Place title:** should the suggested title be the venue/POI name when available, or a concise locality/area name? Should the full address be shown only as context?
3. **“Depends” for multiple places:** when adding a location to a route, should the search always append a new stop, insert before/after a chosen stop, or first ask whether to add/replace? Proposed default: **append**, with explicit reorder and explicit change-place controls.
4. **Coordinates:** should a selected place always set a map pin, even if the user later edits the title? Proposed default: yes, keep coordinates until the user explicitly changes/removes the location.
5. **Search scope:** should results include businesses and attractions (cafes, hotels, landmarks), or prioritize cities, regions and addresses?
6. **Geographic bias:** should results be biased toward the current map area, current location (permission required), selected travel, or remain global by default?
7. **Privacy/retention:** are you comfortable sending search text to an external provider and storing selected result coordinates/name in the step? Which privacy policy or attribution wording should be shown?

## Decisions captured so far
- Search is online; offline manual entry remains available.
- A selected result sets coordinates and suggests the **place title** (not the step title).
- Autocomplete while typing is desired; Photon is an option to evaluate, not yet a final provider choice.
- Multiple-location add-versus-replace interaction is unresolved; proposed default is append for add, explicit replacement for edit.
