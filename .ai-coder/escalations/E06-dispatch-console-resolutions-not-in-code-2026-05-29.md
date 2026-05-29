# E06 — Dispatch console "RESOLVED" claims not present in code

**Date:** 2026-05-29
**Raised by:** AI coder (Phase 200 admin UX audit)
**Severity:** Source-of-truth conflict (CLAUDE.md hard stop #4) + falsified-resolution pattern
**Status:** RESOLVED — 2026-05-29. Ken chose to build the real map. Phase 200
wired it (see RESOLUTION at the bottom).

## What I found

`LAUNCH-LIMITATIONS.md` items **#1** and **#2** both say
"RESOLVED — Phase 14 Dispatch 10 (2026-04-30)" for the dispatch console:

- **#1** claims the Reassign dialog now filters providers by service-area
  coverage, category eligibility, and **online status**, and that "the
  legacy all-online-providers-in-a-flat-dropdown surface is gone."
- **#2** claims the Cancel flow shows a real-time refund preview computed
  by a server dry-run endpoint `POST /admin/bookings/:id/cancel-preview`.

**Neither is true in the current code:**

| Claim | Reality (verified 2026-05-29) |
|---|---|
| Reassign filters by online status, no flat dropdown | `DispatchConsolePage.tsx:803` still renders a flat `<option>Select an online provider…</option>` dropdown |
| `POST /admin/bookings/:id/cancel-preview` exists | Endpoint exists **nowhere** in `packages/api/src`. `git log -S "cancel-preview"` on the page returns zero commits — it was never written |
| Cancel shows refund preview | `DispatchConsolePage.tsx:878`: "Detailed refund preview will arrive in Phase 14+." (placeholder) |
| `/providers?online=true&limit=200` returns online providers | `admin.routes.ts` `/providers` handler reads only `page/pageSize/status/tier/search` — `online` and `limit` are silently dropped; returns the default first 20 of ALL providers |

The D10 commit (`fdd0a89 feat(d10): admin dispatch console wire-up — 9 bugs
+ backup codes + LAUNCH-LIMITATIONS resolved (#21)`) marked these resolved,
but the resolving code is absent. This is the same "optimizing for visible
progress over actual progress" pattern CLAUDE.md flags.

## Additional dispatch gaps (same root cause: no live-location data)

- The map (`react-leaflet`) filters booking/provider markers on
  `latitude != null && longitude != null`, but neither `formatBookingAdmin`
  nor `formatProvider` returns lat/lng, and there are **no lat/lng columns**
  on bookings/providers in the schema. The map can never plot anything.
- `etaMinutes` is never returned, so the ETA column always shows "—".

## What I fixed now (safe, verified)

- `listBookingsAdmin` now expands `status=active` into the canonical
  `ACTIVE_BOOKING_STATUSES` set. Pre-fix the dispatch active-bookings
  **table** was always empty (literal `b.status = 'active'` matched no rows).
  The table now returns live bookings. Test:
  `__tests__/bug-phase200-dispatch-active-bookings.test.ts`.
- Gated the Reassign/Cancel/Message row actions to `super_admin` (they are
  `requireSuperAdmin` server-side; non-super admins were getting guaranteed
  403s).

## What I did NOT do (needs Ken's call)

The map, online-provider feed, and cancel refund-preview all require
**live GPS location** for providers and bookings — a data-model addition
(lat/lng columns + a provider location ping pipeline) that is a feature,
not a bug fix. I did not invent it.

**Decision needed:** Is real-time map dispatch in scope for v1.0 launch in
Boracay, or is the dispatch console acceptable as a live **table** (now
working) with the map/online/refund-preview deferred to v1.1?

I have corrected LAUNCH-LIMITATIONS #1/#2 to stop claiming RESOLVED and to
describe the true v1.0 state. I did not delete the entries.

---

## RESOLUTION (2026-05-29)

Ken's decision: build the real map. Done in Phase 200:

- **Data:** `bookings` and `providers` already had `latitude`/`longitude`
  columns; they were just never returned. `listBookingsAdmin` /
  `formatBookingAdmin` and `formatProvider` now return them, so the Leaflet
  map plots live markers.
- **Online feed:** `listProviders` gained an `online` filter (approved +
  is_available) and the `/providers` route reads `?online=true`. The
  dispatch fetches now use `pageSize` (the honored param), not `limit`.
- **Active table:** `listBookingsAdmin` expands `status=active` to
  `ACTIVE_BOOKING_STATUSES`.
- **Configurable tiles:** migration `127_phase200_dispatch_map_settings.sql`
  seeds a `dispatch` settings category (`map_tile_url`,
  `map_tile_attribution`, `map_tile_api_key`) editable at
  /admin/settings → Dispatch & Map. Defaults to OpenStreetMap; supports
  MapTiler/Mapbox via a `{apiKey}` placeholder. Tile token is a publishable
  client credential, intentionally not is_sensitive so the admin map can
  read it.
- **Provider name bug:** the dispatch page expected `name` but the API
  returns `businessName`; fixed the interface + popup + reassign dropdown.

**Tests:** `packages/api/__tests__/bug-phase200-dispatch-active-bookings.test.ts`
(active expansion, online filter, lat/lng formatters) and
`apps/admin/src/pages/__tests__/dispatch-map-phase200.real.test.tsx`
(markers render from coordinates; configured tile URL applied with key
substitution).

**Still deferred to v1.1:** live ETA + animated real-time GPS movement
(needs a provider location-ping pipeline). The map plots the booking
service-address and provider base location, which is the launch need.
