# D24 — Address autocomplete / geocoding provider

**Date:** 2026-06-16
**Raised by:** AI coder, from UX-tester feedback (Jenico Polo De Leon, 2026-06-16)
**Status:** OPEN — needs Ken. Not blocking; a partial fix already shipped.
**Severity:** Medium (UX quality on the core booking step). Not a launch blocker
on its own, but the address step is the weakest-rated part of booking (tester
scored "address on map was easy" 2/5).

## Background

The customer Address Picker has no real geocoder. The Google Maps keys in the
app only render map tiles — there is no Places/Geocoding/autocomplete call
anywhere. The "search" box just substring-matches the typed text against a
hardcoded ~31-city list and snaps the pin to that city's center.

The tester said:
> "When typing an address it doesn't show suggested addresses. it doesn't have a
> field where you can type in the city or country for more accurate search
> results."

Two separate problems came out of this:

1. **A real bug — already fixed (2026-06-16).** The city match had its
   `.includes` arguments reversed, so any real street address resolved to no
   city and the Confirm step blocked with "Location Not Recognized." Fixed in
   `apps/mobile/src/utils/ph-regions.ts` (`matchRegionForQuery`) + a behavioral
   test. This unblocks city-level search now.

2. **A missing capability — this decision.** Even after the fix, search only
   resolves to a city center, not a real street address, and there are no
   type-as-you-go suggestions. On web the map tap is a no-op (the web map stub
   ignores taps), so the search box is the only address-input path on web — which
   makes precise addresses impossible on web until a real provider is wired.

## Options

### Option A — Google Places Autocomplete + Geocoding
Wire Google Places Autocomplete (typeahead suggestions) + Geocoding (resolve to
exact lat/lng + components). We already have Google Maps keys for tiles.
- **Pros:** Best PH coverage and accuracy; real street-level pins; the UX the
  tester expects. Same vendor as the map.
- **Cons:** Paid per request (Autocomplete is billed per keystroke-session +
  the geocode); needs an API key with Places enabled, usage caps, and a small
  backend proxy so the key isn't shipped in the web bundle. Ongoing cost scales
  with usage.

### Option B — OpenStreetMap / Nominatim (free)
Use a free geocoder (Nominatim, or a hosted OSM provider like Photon/Geoapify
free tier).
- **Pros:** No per-request cost (or a generous free tier). No vendor lock-in.
- **Cons:** PH street-level coverage is weaker than Google, especially for
  subdivisions/barangays and informal addresses; public Nominatim has a strict
  usage policy (needs self-hosting or a paid host for production volume).

### Option C — Expand the offline list + add a city/country field (no new vendor)
Keep it provider-free: grow the static city/barangay list, add an explicit
"City" picker + "Province" field so the resolved area is always correct, and let
the customer fine-tune the pin on the map (and fix the web map so taps work).
- **Pros:** No new dependency, no cost, no key handling. Ships fast.
- **Cons:** Still no true street-level autocomplete; accuracy depends on the
  customer dragging the pin; more manual. Mostly a stopgap.

## Recommendation

**Option A (Google Places)** for launch quality, since address accuracy directly
affects whether a provider can find the job, and we already use Google for the
map. Gate it behind a tiny backend proxy + a usage cap so cost is bounded. If
cost is the deciding worry for a pre-revenue launch, **Option C now + Option A
later** is a reasonable sequence — the city-match fix already shipped makes C
usable in the interim.

## What I'm NOT doing

- Not adding a paid external dependency or API-key handling without Ken's call.
- Not picking a default. The city-level search fix is already in; this decision
  only governs the upgrade to real autocomplete/geocoding.
