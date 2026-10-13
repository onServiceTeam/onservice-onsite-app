# E83: Quote job time feeds money rules (customer no-show, dispute auto-refund)

**Date:** 2026-10-14
**Severity:** Money/compliance (CLAUDE.md hard stop 1)
**Status:** Open for Ken. Interim default in place (below). Nothing in the no-show or dispute code is changed by D38 work.
**Found during:** Milestone 2 design review of D38 (request-first booking, first-response dispatch)

## Bad news first

D38's "confirm, then pay" step sets a quote booking's job time (`bookings.scheduled_at`) from the time the provider proposed (a date plus a morning, afternoon or evening window, or ASAP) instead of today's invented "now plus 4 hours" (`createJobRequest`). A single `scheduled_at` is a moment, but the customer was promised a window. Three money rules read that moment:

1. **Customer no-show.** `POST /api/v1/bookings/:id/report-no-show` cancels the booking as a customer no-show and runs the cancellation money step with `customerNoShow=true` once `NOW() - scheduled_at >= provider_noshow_minutes` (`packages/api/src/routes/booking.routes.ts` around lines 1427-1460). With a morning window (08:00 to 12:00) stored as 08:00, a provider could record the customer as absent at 08:30, although the customer was promised "morning". The `provider_noshow_minutes` setting is already held under E60.
2. **Dispute auto-refund.** A dispute is auto-resolved as a full refund when `completed_at - scheduled_at` is under 30 minutes (`packages/api/src/services/dispute.service.ts` around lines 350-400, held under E59). An ASAP job finished soon after its time could trigger it.
3. **Refund tier at cancellation and the wallet's "time has passed" refusal** (`booking-cancel.service.ts:77-86`, `payment.routes.ts:42-43,80-85`) also key on `scheduled_at`. These are made safer, not riskier, by the change: today's invented time often lies in the past by the time a quote is accepted, which makes the booking unpayable.

## Interim default (applied in Milestone 2 until Ken decides)

- Job time on accept = the later of the window start and "confirmation time + `request_slot_lead_minutes`" (default 60). For ASAP, confirmation time + lead. A window that has already ended cannot be confirmed (409, nothing written). A quote with no slot keeps its time, but never earlier than confirmation + lead.
- The window is stored next to the time (`bookings.scheduled_window`) so screens and staff can show "Morning (8 AM to 12 PM)".
- The confirm screen tells the customer: "Be available from {window start}."
- **The no-show and dispute auto-refund code is not changed.** Changing what those rules read would be a money decision.

## Decision needed from Ken

1. For window bookings, should the customer no-show clock start at the **window start** (today's behaviour with the interim default) or at the **window end**?
2. Should the dispute auto-refund rule ignore quote bookings with a window, or measure from the window start?
3. Is the 60-minute lead time after confirmation right?

## What is not authorized by this record

- Changing `report-no-show`, the dispute auto-resolve rule, or the E59/E60 settings.
- Rewriting `scheduled_at` on existing live bookings.
