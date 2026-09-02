# E55 - Business-account billing and contract authority is not launch-safe

**Date:** 2026-09-02
**Status:** OPTION A APPROVED BY KEN 2026-09-02; IMPLEMENTATION IN PROGRESS;
PRODUCTION LAUNCH STILL HELD
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

## 2026-09-02 approval and implementation checkpoint

Ken approved Option A, provided it remains the safest foundation for a larger
app and business. The approved direction is now implemented locally on the
`codex/system-settings-control-fix` topic branch, subject to tests, CI, review,
production inventory, and the remaining settlement hold.

The implementation currently:

1. selects statement candidates only through the booking's exact
   `business_account_id`, contract, account-terms version, and final booking
   financial-terms evidence;
2. fails explicit company booking closed instead of silently creating a
   personal booking;
3. versions commercial account terms prospectively, so existing bookings and
   statements retain their original snapshots;
4. requires preview, operator ownership, expiry, stale-state comparison,
   reason, super-admin authority, and transactional audit for account,
   contract, terms, and financial decisions;
5. separates statement preview, controlled draft preparation, and finalization;
6. replaces `mark paid` with append-only external payment, partial-payment,
   adjustment, reversal/refund, and void evidence;
7. records an independent settlement state (`open`, `settled`, `credit_due`,
   or `void`) so a write-off or rate reduction cannot be presented as cash
   payment merely because the legacy invoice status is `paid`;
8. keeps old rows `legacy_unreviewed`, performs no historical relinking or
   financial backfill, and widens commercial centavo columns from INTEGER to
   BIGINT without changing values; and
9. keeps `feature_flag.business_contract_booking_enabled` disabled and held
   from ordinary Settings changes;
10. resolves contract eligibility against the scheduled service date, not the
    day the API happens to run, and repeats that check inside the locked booking
    transaction; and
11. holds provider-specific contract publication and resolution under E56 so a
    negotiated provider rate cannot be paired with an unrelated dispatched
    provider before assignment and payable semantics exist;
12. restricts lifecycle, terms, and contract previews to super admins because
    each preview is owned by the operator who must apply the final decision;
13. uses integer-exact basis-point arithmetic and blocks a statement group
    before accumulated centavos exceed JavaScript's exact-integer range;
14. prevents a write-off from exceeding the remaining positive balance while
    still allowing an approved credit/rate reduction to create explicit
    `credit_due` evidence; and
15. distinguishes intake/current account projections from approved terms and
    interprets operator-entered payment/reversal timestamps explicitly as
    Philippine time (UTC+8); and
16. treats approved billing credit as a revolving exposure ceiling, blocks
    unsafe projected-centavo addition, and still permits controlled statements
    for completed work after an account is suspended from placing new work;
17. confines every customer business-account route to customer identities,
    prevents direct member creation from minting another owner, accepts only an
    active customer as a member, and does not report a false failed member-add
    when best-effort notification delivery fails after the membership commits;
18. validates every customer business UUID, pagination value, bounded text,
    calendar date, decimal discount, and centavo input before service or money
    access, including JavaScript safe-integer protection for estimates; and
19. classifies the database-constrained account-type and payment-term lists as
    read-only launch holds under E58 instead of allowing Admin to publish a
    value that account creation or due-date calculation cannot honor; and
20. appends the first-class `business_account`, `business_contract`, and
    `business_invoice` audit targets to the database constraint without
    dropping any earlier target. Migration 166 added the matching action verbs
    but omitted those target names, which would otherwise roll back each
    controlled write when its required audit row was inserted.

The feature flag must remain disabled. The current consumer booking state
machine assumes escrow prepayment before provider work, while a company-credit
booking needs a separate source-of-funds and provider-settlement path. Enabling
company bookings before that path is specified and tested could either strand
the booking at payment pending or pay a provider without a reconciled funding
source. This remaining issue is being tracked separately rather than hidden by
the safer billing work.

No production migration, backfill, or B2B financial operation is authorized by
this approval. E32 still blocks the required private production inventory and
server alignment. E57 separately holds a safe, consent-based company-member
invitation and permission lifecycle; the direct internal-UUID member endpoint
must not be exposed as customer UI. E58 separately holds governed account-type
and payment-term catalogs.

Local focused API Jest, Admin Vitest, and Mobile Jest execution remains
unavailable because the machine-level npm shim is broken and direct runners
hit the OneDrive sandbox/cloud-placeholder traversal failure before loading the
suites. No local behavior pass is claimed. GitHub CI run `33566793099` and
governance run `33566793102` passed the validated customer-authority/input wave,
including complete API, Admin, Mobile, Docker, and all five gate jobs. Corrected
commit `dd52ff4` then passed GitHub CI run `33572166256` and governance run
`33572166236`, including the E57/E58 API and rendered Admin containment tests.
Neither checkpoint supplies authenticated browser or production evidence.

The item 20 repair is covered by OPS-387, a PostgreSQL integration test that
executes migration 169 in an isolated test schema, inserts all three B2B target
types, proves earlier target types still work, and proves the CHECK constraint
still rejects an unknown target. Local TypeScript passes. Local Jest execution
is blocked by the recorded Windows/OneDrive dependency-read failure, so the
safe CI PostgreSQL service remains the execution gate. No production migration
or business action was run.
