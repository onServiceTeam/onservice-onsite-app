# D27 Phase 4 — Hourly pricing: keep deferred, or build it now?

Status: OPEN — needs Ken
Date: 2026-06-29
Author: AI coder

## Background

D27 Phase 4 is "pricing models (per-sqm/per-unit; hourly decision)". The
per-unit half is built and shipped (see below). Hourly is a separate question
because it was deliberately deferred earlier.

- `service_subcategories.pricing_type` already allows `'hourly'` (migration 003).
- But `booking.service.createBooking` throws `subcategory_pricing_type_unsupported`
  for an hourly subcategory, with the comment "LAUNCH-LIMITATIONS §24 — hourly
  deferred to v1.1+." So today an admin can mark a service "Hourly" but a
  customer cannot actually book it.

So "hourly" is a label with no working booking path. Turning it on is not a
small wiring change — it needs a money-path design.

## What per-unit shipped (for contrast)

A `per_unit` subcategory advertises a rate (e.g. ₱50 / sqm) and routes through
the existing custom-quote flow. The provider measures and confirms the real
amount via quote line items. No auto-charge on a self-reported quantity, so no
new money risk. That is why I built per-unit autonomously and am escalating
hourly.

## Why hourly is a real decision, not a default

Hourly billing introduces questions the spec is silent on, each with money/
dispute implications:

1. **Who logs the hours, and how are they verified?** Provider self-reports?
   Timer in-app from "start service" to "complete"? Customer confirms hours
   before payment? Each has abuse and dispute surface.
2. **Escrow/auth model.** Fixed and quote bookings authorize a known amount up
   front. Hourly is open-ended — do we pre-authorize a cap (estimated hours ×
   rate), then settle actual? What happens if actual exceeds the cap?
3. **Minimums and rounding.** Minimum billable (1 hour?), rounding (15-min
   increments?), travel time billable or not.
4. **Cancellation / no-show interaction** with the existing cancellation
   bracket policy.
5. **Commission + service-fee** computed on actual hours, which aren't known at
   booking time — affects the payout and fee math everywhere those are shown.

These are policy calls, not implementation details.

## Options

- **A. Keep hourly deferred (recommended for now).** Per-unit covers the
  common "priced by measure" case (sqm, rooms, panels) through quotes. Leave the
  hourly label rejected at booking with the existing clear error. Revisit
  post-launch. Lowest risk; nothing half-built in the money path.
- **B. Build hourly as a capped pre-authorization.** Customer books with an
  estimated-hours cap (cap = est_hours × rate, authorized up front like a fixed
  price). Provider logs actual hours via the existing start/complete timestamps;
  final settles to min(actual, cap). Needs Ken to set the policy in items 1–5
  above. Medium build, real money-path testing.
- **C. Build hourly as provider-quoted hours.** Treat hourly like quote: the
  provider quotes "X hours × ₱rate" as a line item after seeing the job. This is
  essentially what per-unit + quote line items already do, so hourly would add
  little over what shipped. Smallest build; arguably redundant.

## Recommendation

Option A for launch. If Ken wants hourly before launch, Option B with Ken's
answers to items 1–5. I will not build B/C without those answers, because the
hours-verification and escrow-cap policy are money-path decisions.

## What I need from Ken

1. Keep hourly deferred for v1.0, or build it now?
2. If build now: which model (B capped-preauth, or C provider-quoted), and the
   answers to verification / cap / minimums / rounding.
