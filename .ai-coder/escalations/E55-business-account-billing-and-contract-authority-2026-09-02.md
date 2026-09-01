# E55 - Business-account billing and contract authority is not launch-safe

**Date:** 2026-09-02
**Status:** OPEN
**Hard stop:** business-account pricing, invoice generation, payment recording,
credit terms, and production history
**Related:** E14 external payments, E22 Philippine invoice/tax design, E32
production access, D-phase200 contract pricing, D28 proof-to-close

## Bad news

The Business Account 360 screen is materially better linked than the original
admin table, but the underlying commercial workflow is not safe to operate.
Several older findings were still present behind newer UI copy that implied the
controls were audited and ready.

### 1. Invoice generation can include a member's personal bookings

`invoice.service.ts` selects bookings by joining the account to its current
`business_members` and then matching `bookings.customer_id`. It does not require
`bookings.business_account_id` to equal the invoiced account. A normal personal
booking made by any current member can therefore be included in a company
invoice. A person who belongs to two businesses can be included in both.

This contradicts migration 129, D-phase200, Admin Booking Operations, and the
Business Account 360 copy, all of which define the explicit booking
`business_account_id` as the canonical commercial relationship.

### 2. Membership changes can alter later invoice selection

The generator uses current membership and does not filter soft-deleted member
rows. It can therefore bill work based on a relationship that did not exist at
service time, include a removed member, or omit an explicitly linked commercial
booking after a membership change. Invoice eligibility must come from the
immutable booking/account snapshot, not today's membership table.

### 3. Selecting a business account can silently fall back to a personal price

Booking creation accepts `businessAccountId`, but if no active matching
contract resolves it silently continues as an ordinary catalog-priced booking
and stores both business and contract links as null. A future enterprise screen
could tell a member they are booking for a company while the server creates a
personal booking instead. An explicit commercial selection must fail closed
with an actionable reason when the account, permission, or contract is not
eligible.

### 4. Commercial pricing and lifecycle writes are under-governed

- An ordinary `admin` API caller can change the volume discount and monthly
  credit limit even though the UI hides the control from ordinary admins and
  the money-operations policy requires super-admin authority.
- The discount/credit update accepts no reason, can accept a no-op body, writes
  no transactional admin action, has no stale-record guard, and sends no
  business notice.
- Account approval and suspension are ordinary-admin direct updates. Approval
  has no decision reason or admin action. Suspension stores its reason in the
  general account notes field, writes no admin action, and sends no notice even
  though the UI says it does.
- Contract activation/cancellation accepts no reason, writes no lifecycle audit,
  has no version check, and permits transitions from any current state.
- The database permits zero and negative contract rates; service code rejects
  negative values but accepts zero while the route's `!agreedRate` check rejects
  zero. There is no one authoritative contract validation layer.

### 5. Invoice generation is immediate, not previewed or approved

The Admin button immediately creates a row with status `sent` for the previous
month. There is no candidate-work preview, proof/readiness gate, exception
queue, operator reason, immutable generation manifest, or separate finalization
decision. The UI's idempotency statement only means a second invoice for the
same account and period is skipped. It does not prove the first invoice contains
the right bookings or amounts.

The account-level discount is read at generation time. Existing invoice totals
are preserved after generation, but there is no versioned evidence showing
which account terms were approved and effective for the billed work.

### 6. “Mark paid” is an unsupported financial override

Any ordinary admin can enter any non-empty text and change a sent/overdue
invoice to paid. The operation does not verify a gateway or bank record, amount,
currency, invoice metadata, payment date, evidence, or duplicate reference. It
writes no transactional admin action and has no reason or stale-state guard.
The UI incorrectly says the reference becomes part of an audit trail.

This is the still-open CRIT-40 / MED-108 finding from the 2026-05-01 audit.

### 7. The customer enterprise workspace does not exist

Business API clients and a Zustand store exist, but all eight former business
route constants were removed because no corresponding screens existed. There
is no routed customer workspace for accounts, members, contracts, company
booking selection, consolidated history, or invoice detail. No current app
screen sends `businessAccountId` during checkout. The backend foundation is
therefore not an end-to-end customer capability.

### 8. Provider and support context remains incomplete

Admin can reach a provider, customer, booking, invoice line, support queue, and
dispute from explicit business bookings, which is useful. It cannot manage a
contract lifecycle, see contract-version evidence, inspect invoice-readiness
exceptions, or distinguish an off-platform payment claim from verified payment.
Properties/sites, service plans, visits, and proof-package readiness remain the
D28 staged roadmap, not implemented records.

## Why this is a hard stop

A direct code correction to select only `bookings.business_account_id` is
necessary, but deployment without a production inventory could suddenly
exclude bookings that operators previously expected the legacy generator to
bill. Existing invoice items may already point to bookings whose explicit
business account is null or different. They must be preserved and reviewed,
not silently deleted, reassigned, or regenerated.

E22 also blocks representing current records as authorized Philippine
principal invoices. E14 means an external payment reference is not gateway
verification. E32 currently prevents the required production inventory.

## Required production inventory

Before a B2B code migration or operational launch, privately inspect and retain
counts and identifiers for:

1. business accounts by status, owner, manager, payment terms, discount, and
   credit limit;
2. active and historical members, including removal dates and roles;
3. contracts by status, scope, provider, dates, rate, discount, and references
   from bookings;
4. bookings with and without `business_account_id` / `contract_id`, including
   account-contract mismatches;
5. invoice items whose booking is null, explicitly linked to the same account,
   explicitly linked to another account, or has no account link;
6. invoice/payment states and reused or untraceable payment references;
7. any real customer or operator use of the business APIs.

Do not include private row data in this public repository. Record only reviewed
aggregate conclusions and a remediation classification here.

## Decision required

### Option A - Contain B2B money writes and rebuild the controlled workflow
(recommended)

- Keep Business Account 360, explicit booking/support linkage, and historical
  records readable.
- After production inventory, hold account activation, contract publication,
  discount/credit changes, invoice generation, and manual payment completion
  until each has strict authority, reason, audit, stale-state protection, and
  impact preview.
- Make an explicit business booking fail closed unless the account, member
  permission, and matching published contract are valid.
- Generate invoice candidates only from bookings stamped with the exact
  business account. Start as an internal draft/statement, expose readiness and
  exceptions, and require a separate authorized finalization step.
- Preserve booking prices, financial-term snapshots, invoice lines, and paid
  history. Correct records through append-only adjustment/void/reissue evidence,
  never by rewriting old transactions.
- Design manual external-payment evidence separately from PayMongo webhook
  settlement. Require amount, currency, method, effective date, unique
  reference, evidence, reason, actor, and transactional audit.
- Add the customer enterprise workspace only after this server contract is
  safe, then add progressive property/site and recurring depth under D28.

### Option B - Keep the current immediate-write workflow and patch individual
checks

This is not recommended. Adding a SQL predicate, admin audit row, or better
dialog independently would leave the workflow able to publish unpreviewed
contract terms, emit unsupported invoices, and record unverifiable payments.

## Work paused

Do not deploy or exercise business-account approval, contract activation,
discount/credit mutation, invoice generation, or invoice mark-paid as a
production workflow. Do not backfill booking account links, alter existing
invoice items, or mark historical invoices paid. Local/GitHub audit work that
does not change B2B financial behavior may continue. Production inspection and
synchronization remain separately blocked by E32.
