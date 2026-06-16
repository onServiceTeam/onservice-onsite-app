# Tester feedback — triage and response (round 1, 2026-06-16)

First batch of real UX-tester feedback pulled from the live database and acted on.

## What came in

Two submissions, both verified intact in the database (row counts and JSONB
payloads match the typed columns; both screenshots stored and viewable):

- **#1 — hanna ween (customer, NPS 10/10, 0 logged bugs).** Happy but thin:
  one-word answers ("receipt", "carwash", "its convenient"), and every price
  slider parked at the same value — a hint the price sliders weren't clear to her.
- **#2 — Jenico Polo De Leon (customer, NPS 8/10, 1 logged bug, 2 screenshots).**
  Detailed and specific. Most of the actionable signal is here, and two of her
  reports are backed by screenshots.

## What I fixed and shipped (with tests)

All three are real code defects confirmed against the source, fixed, and covered
by new behavioral tests. Full mobile suite stayed green (690 passed) and the app
typechecks clean.

1. **Address search said "Location Not Recognized" for a valid Cebu City address.**
   The search matcher had its string check reversed, so any real street address
   resolved to no city and Confirm blocked. This blocked address entry on web
   entirely (on web the map tap does nothing, so the search box is the only input).
   - Fix: `apps/mobile/src/utils/ph-regions.ts` (`matchRegionForQuery`) + a clearer
     "try the city name" hint instead of the dead-end modal.
   - Test: `apps/mobile/__tests__/utils/address-search.test.ts`.

2. **"Add Photo → Camera" opened the photo library on web.** On a desktop browser
   there is no camera, so the Camera button silently fell back to the file picker
   and confused the tester. Now on web the picker goes straight to the library with
   no misleading Camera option. Native phones are unchanged.
   - Fix: `apps/mobile/src/hooks/useImagePicker.ts`.
   - Test: `apps/mobile/__tests__/hooks/useImagePicker-web.test.tsx`.

3. **Low-contrast text ("make the font more visible").** The light-gray caption /
   placeholder color failed accessibility contrast. Darkened it to a readable gray
   that passes WCAG AA.
   - Fix: `apps/mobile/src/config/theme.ts` (`textTertiary`).
   - Test: `apps/mobile/__tests__/utils/theme-contrast.test.ts`.

## Re-surfaced launch blocker (needs Ken) — booking error on Pay

Jenico's biggest report: "submitting a booking goes to an error, but the booking
actually went through" and "tapping Pay says it's on request status." Her home
screenshot shows the bookings were created server-side despite the error screen.

This is **not new** — it is escalation **E03 (2026-05-05)**, a CRITICAL launch
blocker that was raised, paused for Ken's decision, and never resolved. A real
tester just reproduced it 6 weeks later. The booking is created as `requested`,
but the payment step is blocked because the booking-state machine forbids paying
before a provider is matched, while the checkout screen tries to pay immediately.

It touches the money path (escrow), so I am not fixing it on my own. See E03 for
the three options; my recommendation is **Option A** (let a `requested` booking be
paid — the instant-pay model customers expect from Grab/Lalamove), which is a
near one-line change. **This needs your yes/no.**

## Decisions for Ken (product / pricing — not code bugs)

These are genuine product calls, not things I should invent:

- **Address autocomplete provider** — see `.ai-coder/decisions/D24`. The city-level
  search fix is in; real street-level typeahead needs a provider choice (Google
  Places vs free OSM vs expand the offline list). Recommended: Google Places.
- **Service catalog grouping** — testers (both #1 implicitly and #2 explicitly)
  want services grouped, e.g. **Indoor / Outdoor**. Today the catalog is a flat
  grid and there is no grouping column in the database. Needs a taxonomy decision
  + a schema change + admin editing. Your call on the grouping scheme.
- **Extra booking-detail fields** — Jenico wants structured fields: number of
  people needed, what the provider should bring, pets present, who to contact on
  arrival. Today there's only a free-text notes box. Real fields = schema + API +
  provider-side display. Quick interim: prompt for these in the notes field.
- **New services requested** — welding (mentioned twice), pet grooming, grass
  cutting, tree cutting, pool cleaning, laptop repair, car wash. Adding services
  is data (admin), but which ones to launch with is your call.
- **Pricing signals** — Jenico thinks aircon cleaning is priced too cheap (expects
  ≥₱500, scaled by location/time) and suggested a rush fee of ₱150–300. hanna's
  flat price-slider answers suggest the sliders need clearer labels.
- **Chat / live support** — Jenico's #1 ask, mentioned ~5 times. This is a build
  decision (in-app chat to support, or a 3rd-party widget, or defer to phone/email
  for launch).
- **Payment trust signal** — wants a visible "secured by PayMongo" badge/logo. The
  text already exists as fine print; a small lock-icon badge is a cheap win, but
  showing the actual PayMongo logo is a brand/trademark permission question.
- **Complaint / get-help discoverability** — "didn't show me where I can file a
  complaint." A Help screen and a dispute flow exist, but the dispute flow needs an
  active booking and isn't discoverable. A "Report a problem" entry is a cheap nav
  win.

## Recommended quick wins I can land on your go (low risk)

- Add a "Payments secured by PayMongo" lock badge on checkout (text + icon, no logo
  image).
- Add a "Report a problem / Get help" entry that's reachable without an active
  booking.
- Clearer labels on the price-feedback sliders on the feedback form itself.

Say the word and I'll land these with tests.
