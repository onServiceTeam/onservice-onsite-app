# D-phase200 — B2B contract pricing semantics

**Date:** 2026-05-30
**Author:** AI coder (Phase 200, "do everything next")
**Status:** FOUNDATION RETAINED; B2B LAUNCH HELD BY E55. The explicit booking
link and price snapshot remain the correct direction, but the surrounding
invoice, lifecycle, payment, and customer-workspace controls are not safe to
operate. The pricing semantics below still require confirmation before B2B
launch.

## Context

Ken asked to "wire contract agreed-rates into member bookings." Today:
- Bookings carry no link to a business account or contract.
- `createBooking` always prices from the catalog (`service_subcategories.base_price`).
- A booking is only "B2B" because its customer happens to be a member of a
  business account; the monthly invoice rolls up ALL such bookings.
- Contracts (`business_contracts`) hold a negotiated `agreed_rate` per
  category (optionally per subcategory) but nothing consumed it.

## The decision

I built the **engine + rails**, triggered **explicitly**, not by fuzzy
inference:

1. New nullable `bookings.business_account_id` + `bookings.contract_id`
   (migration 129) — audit/reconciliation link. Null for every normal booking.
2. `businessService.resolveBookingContract(customerId, businessAccountId,
   categoryId, subcategoryId)` — returns the agreed_rate to use, or null,
   only when: the customer is a current member of the account, the account is
   active, a contract is active and within its dates, and the category
   matches. Subcategory-specific contract beats a category-level one; ties
   break on most-recent start.
3. `createBooking` accepts an optional `businessAccountId`. When present AND a
   contract resolves, the booking is priced at `agreed_rate` and stamped with
   the account + contract. Otherwise behavior is **100% unchanged**.

### Pricing rules for a contract-priced booking (my conservative choice)
- `agreed_rate` **replaces** the catalog base price.
- **No surge** (the rate is a fixed negotiated price).
- **No promo codes** (the rate is final).
- **Add-ons still apply** on top (a contracted clean can still add an extra).
- **Platform service fee still applies** (unchanged earning model).

## Why opt-in, not automatic

The trigger is an explicit `businessAccountId` on the booking. **No current
client sends it**, so this is inert until the mobile app adds a "book for
[business account]" selector at checkout. That is deliberate:

- Auto-applying a contract rate to *every* booking by anyone who is a business
  member would silently reprice a member's personal bookings too, and pick
  among multiple accounts/contracts by guesswork. That is a money decision I
  should not make silently.
- Explicit selection is unambiguous and auditable.

## What Ken needs to decide (before/at B2B launch)

1. **Trigger:** explicit "book for business" selection (what I built), or
   auto-apply to all member bookings? I recommend explicit.
2. **Service fee on contract bookings:** keep it (current), or waive it for
   contracted B2B?
3. **Add-ons on contract bookings:** allowed (current), or contract rate is
   strictly all-in?

## Remaining work to make it user-visible (v1.1)

- Mobile checkout: let a business member choose to book for their business
  account (sends `businessAccountId`).
- Optionally surface the contract rate + "billed to [company]" in the
  checkout summary.

## 2026-09-02 audit correction

E55 found that the invoice generator still ignores the explicit booking link
described above and selects work through current membership. It can therefore
invoice personal bookings. Booking creation also silently falls back to an
ordinary personal booking when an explicit business selection cannot resolve a
contract. Do not wire the planned mobile selector to the current behavior.
Follow E55 Option A only after the production inventory and authority decision.

## Tests
- `phase200-contract-pricing.test.ts` — resolver returns the agreed rate when
  a matching active contract exists, null otherwise; createBooking applies the
  agreed_rate and skips surge when a contract resolves, and is unchanged when
  no `businessAccountId` is passed.
