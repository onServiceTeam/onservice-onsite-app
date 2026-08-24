# E04 — Provider has no in-app way to respond to disputes

**Discovered:** 2026-05-05, Phase 144 deep audit pass
**Status:** PARTIALLY RESOLVED 2026-08-24 — contest response shipped; direct settlement held by E18/E24
**Severity:** HIGH (provider unfairly loses 100% of payment when dispute auto-resolves against them)

## What's missing

The dispute lifecycle is:
1. Customer files dispute → `POST /api/v1/disputes` (mobile screen exists at `apps/mobile/app/customer/booking/dispute.tsx`)
2. Provider has 48 hours to respond → `POST /api/v1/disputes/:id/provider-response`
3. **NO MOBILE SCREEN EXISTS for step 2.**
4. If no response in 48 hours → dispute auto-resolves in customer's favor (full refund, escrow refunded, provider receives nothing)

The API endpoint at line 119-117 of `packages/api/src/routes/dispute.routes.ts` exists and is fully tested. The validator at `packages/api/src/validators/dispute.validators.ts:26-38` accepts:
- `response`: string min(20) max(2000)
- `action`: 'accept' | 'contest' | 'partial_offer'
- `partialOfferAmount`: positive integer (required if action=partial_offer)

But the mobile provider app has no screen to fill in this form. Verification:
- Grep `provider-response` across `apps/mobile/`: 0 hits
- Grep `addProviderResponse` across `apps/mobile/`: 0 hits
- `apps/mobile/app/provider/job/[id].tsx` (506 lines) shows status="disputed" as a red badge but has NO "Respond to Dispute" CTA
- `apps/mobile/app/provider/notifications.tsx` routes `dispute_opened` notifications to `/provider/job/{bookingId}` — which is the dead-end above

## Impact

For a v1.0 Boracay launch, every dispute filed against any provider:
- Provider gets a push notification
- Provider taps it → lands on job detail screen
- No action available — back-button is the only choice
- 48 hours later: full refund issued to customer; escrow refunded; provider receives zero pesos
- Provider has no recourse except phoning admin

That's a 100% loss-of-payment scenario for any provider on the receiving end of even a frivolous dispute. Word-of-mouth in a 7km island like Boracay is fast — providers will refuse to take jobs once this becomes known.

## Why this slipped through earlier audits

Phase 14 D04/D05/D11/D12 all touched the dispute flow but focused on the customer-side filing UI and the admin-side resolution UI. The provider response screen was a blind spot — not in the customer-facing critical path, not in the admin-facing critical path, but provider-facing and money-path-adjacent.

Same blind-spot pattern as Phase 121 (provider monthly summary route had no UI — caught by the audit because the API existed but no consumer did).

## Three fix options

### Option A: Build the screen (recommended for v1.0)

**Scope:** ~4-6 hours of focused work
- Add `Routes.PROVIDER.DISPUTE_RESPOND = '/provider/dispute/[id]'`
- Create `apps/mobile/app/provider/dispute/[id].tsx`:
  - Fetch `GET /api/v1/disputes/:id` (need to verify endpoint exists or add)
  - Display dispute type, description, evidence photos, customer info
  - Three action buttons: Accept (red, full refund), Contest (yellow, admin review), Partial Offer (orange, with amount input)
  - Response textarea (>=20 chars, <=2000)
  - Conditional partial-offer amount input (when partial_offer selected)
  - Submit → POST `/api/v1/disputes/:id/provider-response` → success → back to job detail
- Update `apps/mobile/app/provider/notifications.tsx`: route `dispute_opened` and `dispute_update` (when ticket is open and provider hasn't responded) to `/provider/dispute/{id}`
- Update `apps/mobile/app/provider/job/[id].tsx`: when `booking.status === 'disputed'`, show "Respond to Dispute" CTA linking to `/provider/dispute/{disputeId}` (need to fetch dispute id from booking)
- Add a notification.service emit for `dispute_filed` to provider when customer files (verify existing emit; add if missing)

**Risk:** v1.0 launch slip if implementation reveals API gaps (e.g., GET /disputes/:id may not return everything mobile needs)

### Option B: Email/SMS workaround (fastest but partial)

- Email/SMS the provider with admin contact info when a dispute is filed
- Provider phones/emails admin to file response
- Admin records the response on the provider's behalf via existing admin tools

**Risk:** doesn't scale; bottleneck on admin; provider may miss the 48-hour window if support hours are limited

### Option C: Document as v1.1, ship v1.0 with grace period

- Mobile gap is documented as known limitation
- Server temporarily extends auto-resolution window from 48h → 14 days
- Admin proactively phones every disputed-job provider during the window
- v1.1 ships the proper screen

**Risk:** still requires admin operational lift; provider experience is poor

## Recommendation

**Option A.** A v1.0 launch where providers can't defend themselves against disputes is a scaled-up reputation risk. The 4-6 hours of build work is comparable to a single Phase fix in this audit pass. Building it removes a real risk that no operational workaround fully mitigates.

If timeline is the binding constraint, **Option C** with explicit grace-period extension to 7 days is the next-best fallback — preserves the provider's right to respond while admin coverage scales.

## Continuation

This escalation does NOT block continued auditing. Ken's call between A/B/C can land in parallel with the rest of the bug-remediation work. The mobile screen — if Ken picks Option A — would be a separate dedicated commit on top of the current audit chain.

Phase 144 in the audit pass closes out as: real feature gap found, escalated to Ken, no code change.

## 2026-08-24 continuation

Ken's instruction to fix discovered issues authorized the recommended in-app
case work. Customer and provider dispute inboxes, shared case detail, evidence,
booking linkage, provider contest response, notification destinations, profile
entry points, and tablet/desktop workspaces are now implemented. A provider can
no longer land on a dead-end job screen after a dispute notification.

The money-path trace found E24 while exposing the remaining two response types.
Direct provider acceptance and partial-refund settlement are therefore held in
production, while contesting moves the response into the admin review queue.
This closes the unfair no-response gap without enabling an unsafe direct refund.

The original 2026-05-05 description above is point-in-time evidence and no
longer describes the worker's current non-response behavior. The current worker
auto-escalates an unanswered case to tier 3 for staff review; it does not
auto-resolve a refund. Active app and operations wording now reflects that
behavior.
