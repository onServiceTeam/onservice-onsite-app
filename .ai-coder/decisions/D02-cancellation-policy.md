# D02 — Cancellation policy tiers

Decision date: PENDING
Decided by: Ken

Status: **HALTED — autonomous mode paused.** D02 cannot proceed past
migration `071_cancellation_policy.sql` until you pick the tier values
that get seeded as version 1.

Phase 14 dispatch branch: `phase/14-d02-cross-source-of-truth`
Reference: PART-5-KEN-HANDBOOK.md §3 ("Decision points reference"); PART-3
DISPATCHES-01-02.md §"Bug 1170 + 1198".

---

## Why this is a Ken decision

Cancellation policy is currently defined in **four** drifted places — server
pricing engine, mobile terms screen, mobile help screen, migration 050 +
test fixture. None of them agree. The values today are unknowable to a
customer, a provider, or even a developer reading the codebase.

D02's structural fix is to **make the server the single source of truth** —
one `cancellation_policies` table, one server endpoint, every client and
every server pricing path reads from there. That part the AI coder can
land without you.

The values that get seeded as **version 1** of the policy are a product
decision: stricter favors providers (less wasted travel), looser favors
customers (more bookings). This is the kind of decision Master Brief §3
and Part 5 §1 reserve for you ("the AI coder is bad at making product
decisions — every time it tries, it produces lukewarm consensus answers").
So: pick.

---

## Two candidate policies

The detailed spec and the handbook propose two different starting points.
Both are reasonable. Differences below.

### Option A — 7-tier (from PART-3 Bug 1170 spec)

The Phase 14 spec literally pre-seeds this in `migrations/071_cancellation_policy.sql`:

| Tier | When customer cancels | Refund | Customer fee |
|---|---|---|---|
| 1 | 48+ hours before scheduled time | 100% | 0% |
| 2 | 24–48 hours before | 100% | 0% |
| 3 | 12–24 hours before | 90% | 10% |
| 4 | 6–12 hours before | 75% | 25% |
| 5 | 2–6 hours before | 50% | 50% |
| 6 | Under 2 hours before | 25% | 75% |
| 7 | After scheduled time / no-show | 0% | 100% |

**Bias:** medium. The 24+ window is generous to customers; the 0–2h tier
still gives 25% back, which is actually pretty soft. No-show is a 100%
charge. No provider-no-show side defined here.

### Option B — 4-tier (PART-5 §3 recommendation)

| Tier | When customer cancels | Refund | Customer fee |
|---|---|---|---|
| 1 | ≥24 hours before | 100% | 0% |
| 2 | 12–24 hours before | 75% | 25% |
| 3 | 4–12 hours before | 50% | 50% |
| 4 | <4 hours, OR after provider en route | 0% | 100% |

Plus an explicit symmetric provider-side rule:

| Provider event | What happens |
|---|---|
| Provider no-show | 100% refund to customer + ₱200 platform-funded credit |

**Bias:** simpler customer comprehension (4 buckets, not 7); slightly
stricter (no 25% return inside the 0–2h window) but adds the
provider-no-show counterbalance.

### Option C — your own values

If neither A nor B feel right, write your own table below. The shape the
schema needs is `min_hours_before` / `max_hours_before` / `refund_percent`
/ `fee_percent` / `label` for each row.

---

## My recommendation

**Option B (4-tier + provider no-show clause).**

Reasoning:
- Customer comprehension. A 7-tier policy is hard to explain in a help
  screen. 4 tiers fit on a phone in one screen without scrolling.
- Symmetry. The provider-no-show clause matters for trust on the customer
  side. Option A is silent on this and we'd end up adding a separate
  policy later, drifting again.
- Boracay-tourist demographic. Most cancellations will happen in the
  12–24h window when a flight gets delayed or weather flips. A 75% refund
  there is industry-standard for spa/cleaning bookings (TaskRabbit,
  Tujia, Booking.com Activities all sit near this number).
- Strictness on <4h. Once a provider is committed to the trip, the
  platform either pays them out of refunded fees or absorbs it. Cleaner
  to say "0% refund inside 4h" than to dribble back 25%.

If you'd prefer Option A or a custom variant, fine — the implementation
work is identical, only the seed values change.

---

## Side decisions tied to this one

If you pick A or B as-is, the following are inferred. If you want to
override, say so in your decision below:

1. **Refund destination.** Refunded amount returns to original payment
   method (Stripe / PayMongo) within 5–10 business days. Service fees
   and taxes are non-refundable except for the 100%-refund tiers.
2. **Provider compensation on customer cancellations.** Provider receives
   the customer-paid fee × `provider_share` for any tier where the
   customer is charged anything (i.e., the platform doesn't keep the
   full fee even on a 100% customer charge). Default split is the same
   as a completed booking.
3. **Recurring booking cancellations.** Cancellation of a single
   occurrence vs. the whole series — same tiers apply per-occurrence;
   "cancel the series" is treated as one cancellation event for the
   *next* upcoming occurrence and a free cancellation for all later
   occurrences.

---

## Your decision

```
Pick:    [ ] Option A   [ ] Option B   [ ] Option C (write your own)

Side decisions:
  Refund destination:                 [ ] default (above)   [ ] override: ___________
  Provider comp on cust cancellations: [ ] default (above)   [ ] override: ___________
  Recurring cancellations:             [ ] default (above)   [ ] override: ___________

Notes / rationale (optional):
  ___________________________________________________________
```

When you fill this in, save the file and the AI coder resumes D02 from
exactly this point — seeds the chosen policy as version 1 in
migration 071, wires `calculateCancellation()`, and proceeds with the
remaining D02 bugs (brand color, founding tier, routes registry,
mobile axios fetch wrapper, etc.).
