# E56 - Business-credit bookings have no provider funding and settlement model

**Date:** 2026-09-02
**Status:** OPEN - money-path and working-capital decision required before
company booking can be enabled
**Hard stop:** provider payability, company receivable funding, refunds,
disputes, cancellations, and production launch of contract bookings
**Related:** E14 external payments, E18 dispute timing, E22 tax-document design,
E24 direct dispute settlement, E51 immutable dispute settlement, E55 controlled
business billing, D-phase200 contract pricing

## Bad news

E55 Option A now provides the right controlled customer-side foundation:
company bookings are explicitly owned by one account and contract, commercial
terms are snapshotted, statements are prepared and finalized separately, and
later corrections use append-only evidence. It does not by itself answer who
funds the provider before the company pays its statement.

The existing consumer workflow assumes prepayment. A new booking starts with
`escrow_status = 'pending'`; a verified payment later creates held escrow.
Customer confirmation, automatic confirmation, and operator force-completion
can release provider earnings only when the booking has `held` or
`partially_refunded` escrow and a positive booking-specific escrow ledger
balance.

A company-credit booking would intentionally have no customer prepayment and no
held escrow. If the existing confirmation path is reused, the booking can be
marked complete or confirmed without paying the provider. If code instead
pretends company credit is escrow, the platform would report money as held when
no customer funds were received. Neither outcome is acceptable.

## Why this is separate from company statements

The company statement is an onService receivable. Provider earnings are an
onService payable. They have different timing, failure, dispute, and audit
requirements:

- a provider should not have to wait for a company's Net 15 or Net 30 payment
  after completing accepted work unless that commercial rule is explicitly
  agreed and shown before acceptance;
- paying the provider at accepted completion means onService advances working
  capital and carries company credit/default risk;
- paying only after company collection avoids an advance but changes the
  provider offer, earnings timing, cancellation rules, dispute handling, and
  cash-flow expectations;
- a later company adjustment, write-off, payment reversal, or credit balance
  cannot silently claw back already-earned provider funds; and
- a dispute decision and its actual money movement must remain separate, as
  required by E51.

## Containment already in place

`feature_flag.business_contract_booking_enabled` defaults to false, is blocked
from ordinary Settings changes, and the booking service fails an explicit
company selection closed while the flag is false. The customer company
workspace is read-only and does not expose a company-paid checkout selector.
Provider-specific contract drafts also cannot be published or resolved while
this escalation is open, because the current dispatch path does not guarantee
that the named provider receives the work or the snapshotted payable terms.

Do not enable the flag, fabricate escrow entries, release provider money, or
backfill historical bookings under this escalation.

## Options

### Option A - Platform-funded provider payable, separate company receivable
(recommended for the intended enterprise product)

At accepted completion, onService creates an immutable provider payable from a
dedicated, funded business-credit clearing wallet or ledger account. It applies
the booking's snapshotted provider commission and pays the provider on the
published provider schedule. The company statement remains a separate
receivable collected under the account's credit terms.

Required safeguards:

1. account-level approved credit limit, exposure reservation at booking, and
   release or conversion of that reservation through cancellation, completion,
   dispute, statement finalization, payment, adjustment, and write-off;
2. an operator-visible funding and reconciliation ledger that never labels an
   unfunded receivable as customer escrow;
3. a minimum platform reserve and an automatic booking hold when available
   business-credit funding is insufficient;
4. immutable booking financial terms and provider payable terms before the
   provider accepts the offer;
5. idempotent payable creation and payout, with one lock order and explicit
   retry/manual-attention states;
6. compensating entries for approved post-completion changes, never mutation of
   the original payable or statement;
7. dispute and cancellation rules that state whether provider payability is
   held, reduced, or guaranteed at each state; and
8. Finance and Support views linking account, contract, booking, proof,
   statement, receivable, provider payable, payout, dispute, and adjustments.

Why recommended: it gives providers a predictable onService payment promise,
keeps company collection risk with the party that approved the credit, and
separates the two accounting obligations cleanly. It can scale, but it requires
real working capital, treasury limits, accounting review, and an approved loss
policy before launch.

### Option B - Provider payable only after company cash collection

Create provider payability only after the company payment is verified and
allocated to the statement. This avoids onService advancing working capital,
but providers may wait through Net 15, Net 30, late payment, reversal, or
default. Provider offer and acceptance screens would need to disclose that
timing, and matching may be materially harder.

This is safer for onService cash but does not fit the current provider promise
unless the product is deliberately repositioned for invoice-funded enterprise
work.

### Option C - Require company pre-funding for every booking

Reserve actual company wallet funds before dispatch and use the existing
escrow-style release only after the ledger proves that booking-specific money
is held. This has the lowest credit risk and is the simplest launch subset, but
it is not Net 15 or Net 30 billing and removes much of the enterprise-credit
value.

It remains a viable staged pilot mode, not a substitute for the approved
credit-account model.

## Recommendation and staged path

Adopt Option A as the target architecture, with Option C as the only permissible
limited pilot if the business wants contract bookings before treasury,
accounting, and credit-loss operations are ready. Do not silently fall back
from Option A to Option C in an account already promised credit terms.

The implementation should add a provider-payable ledger, not reuse or overload
consumer escrow. A business booking should carry both `billing_mode` and a
distinct provider-funding mode, and all screens should name the actual state:
credit reserved, provider payable held, provider paid, company statement open,
company payment verified, credit due, or manual attention.

## Required business and professional inputs

1. Ken confirms whether Option A is the intended target and whether a
   pre-funded Option C pilot is acceptable.
2. The accountant defines the ledger accounts, recognition events, adjustment
   treatment, provider payable evidence, and interaction with the E22
   tax-document model.
3. Ken approves working-capital reserve, per-account exposure, overdue/default,
   collection, and loss/write-off policies.
4. E18/E24/E51 settlement decisions define what happens to provider payability
   during disputes and compensating remedies.
5. A private production inventory under E32 confirms no historical record will
   be reclassified or funded automatically.

## Acceptance criteria after approval

1. A company booking cannot dispatch unless its exact funding mode and
   available exposure are reserved transactionally.
2. Provider offer, job, earnings, and admin views show the same snapshotted
   payable and expected timing.
3. Completion cannot strand provider earnings or create unfunded fake escrow.
4. Statement collection cannot pay the provider twice, and payment reversal
   cannot erase an already-posted provider payable.
5. Cancellation, dispute, partial remedy, credit due, default, and write-off
   each use append-only, idempotent entries with explicit authority and audit.
6. Finance can reconcile provider payables, company receivables, cash,
   reserves, statements, payments, and exceptions without spreadsheet-only
   knowledge.
7. Concurrency and failure tests prove one booking produces at most one
   effective provider payable and one effective payout.
8. No feature flag is enabled until test-mode end-to-end evidence and a
   production-history review are complete.
9. Provider-specific contracts cannot publish until provider assignment,
   acceptance, reassignment, and payable behavior are explicit and tested.

## Work paused

Company booking dispatch and provider settlement remain paused. Safe work may
continue on the read-only company workspace, controlled statement records,
admin visibility, tests, documentation, and unrelated customer/provider/admin
audits. This escalation does not undo or weaken E55 Option A; it is the next
money boundary that E55 correctly made visible.
