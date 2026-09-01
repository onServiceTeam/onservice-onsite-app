# D-phase200 — B2B contract pricing semantics

**Date:** 2026-05-30
**Author:** AI coder (Phase 200, "do everything next")
**Status:** EXPLICIT TRIGGER APPROVED UNDER E55 OPTION A; B2B LAUNCH HELD BY
E56. The explicit booking link and price snapshot remain the correct direction.
Controlled account, contract, statement, payment-evidence, and read-only
customer-workspace foundations are implemented on the E55 topic branch, but
company booking remains disabled until provider funding and settlement are
approved and verified. The service-fee and add-on semantics below still require
confirmation before B2B launch.

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
   categoryId, subcategoryId, scheduledAt)` — returns the agreed_rate to use, or null,
   only when: the customer is a current member of the account, the account is
   active, a published provider-pool contract covers the scheduled Manila
   service date, and the category matches. Subcategory-specific contract beats
   a category-level one; ties break on most-recent start. Provider-specific
   publication and resolution remain held under E56.
3. `createBooking` accepts an optional `businessAccountId`. When present and an
   eligible contract resolves, the booking is priced at `agreed_rate` and
   stamped with the account + contract. An explicit company selection fails
   closed when the feature flag, permission, terms, contract, service date, or
   credit check is not eligible. Behavior is unchanged only when no company
   account is selected.

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

## Decision status and remaining pricing decisions

1. **Trigger:** APPROVED 2026-09-02 under E55 Option A. Company booking must be
   an explicit customer selection and must fail closed when the account,
   permission, published terms, contract, or funding state is not eligible.
2. **Service fee on contract bookings:** keep it (current), or waive it for
   contracted B2B?
3. **Add-ons on contract bookings:** allowed (current), or contract rate is
   strictly all-in?
4. **Discount authority:** unresolved. There are currently two stored discount
   controls: `business_contracts.discount_percentage` and the published account
   terms `volume_discount_rate`. The controlled statement path applies only the
   account terms discount, and applies it to the contracted service price before
   the separate platform fee. The older generator discounted a wider booking
   total, while the contract discount is displayed but not consumed. These are
   materially different money rules. Do not combine, compound, or silently pick
   one before the commercial policy is approved and its historical-effect rule
   is tested. E55 therefore blocks publication of a draft contract whose
   contract-level discount is non-zero. Published account terms remain the only
   discount authority in the controlled statement prototype.

## Remaining work to make booking user-visible

- Approve and implement the E56 provider funding/payable model. The current
  consumer flow cannot release provider earnings without real held escrow.
- Only after E56 is complete, let an authorized member explicitly select a
  company account in checkout and send `businessAccountId`.
- Optionally surface the contract rate + "billed to [company]" in the
  checkout summary. This is required before launch because the
  payer, funding mode, provider-pay timing, and personal/company distinction
  are material commercial terms.

## 2026-09-02 audit correction

E55 found that the invoice generator still ignores the explicit booking link
described above and selects work through current membership. It can therefore
invoice personal bookings. Booking creation also silently falls back to an
ordinary personal booking when an explicit business selection cannot resolve a
contract. Do not wire the planned mobile selector to the current behavior.
E55 Option A was approved on 2026-09-02. The controlled workflow now selects
only exact booking/account ownership, snapshots prospective terms, separates
statement preparation from finalization, and uses append-only payment,
adjustment, reversal, and void evidence. The production inventory remains
blocked by E32, and `feature_flag.business_contract_booking_enabled` remains
false under E56 until the provider funding path is approved and tested.

## Tests
- `phase200-contract-pricing.test.ts` — resolver returns the agreed rate when
  a matching active contract exists, null otherwise; createBooking applies the
  agreed_rate and skips surge when a contract resolves, and is unchanged when
  no `businessAccountId` is passed.
