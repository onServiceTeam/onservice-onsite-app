# E58 - Business type and payment-term settings contradict the database

**Date:** 2026-09-02
**Status:** OPEN - schema and commercial-policy design required
**Hard stop:** making the two settings editable or removing their database constraints without a governed replacement
**Related:** E32 production access, E55 controlled business billing, E57 membership lifecycle

## Bad news

`business_account_types` and `business_payment_terms` were described as
Admin-growable settings, and customer business-account creation reads those
values. PostgreSQL still enforces a fixed list for both fields.

Changing either setting can therefore make the API accept a value that the
database rejects. Payment terms have an additional dependency: due-date logic
maps `net_15`, `net_30`, and `net_60` to a fixed number of days, while published
term versions and mobile types also use those literal values. A new label in a
comma-separated setting is not a complete commercial term.

This is exactly the Admin-control failure Ken asked the audit to find: the
screen can claim a change is live even though the rest of the platform cannot
honor it.

## Immediate containment

Both settings are now classified as **Launch hold** by the runtime control
registry. Admin can still see their current values and the reason, but update
and reset calls fail before mutation. Existing account, contract, booking,
statement, and payment records are unchanged.

Do not manually change these rows in PostgreSQL or bypass the Settings API.

## Options

### Option A - Governed catalogs with prospective references (recommended)

Replace comma-separated pseudo-configuration with explicit records:

1. `business_account_type_definitions` stores a stable code, customer/Admin
   label, description, active state, display order, and created/retired audit
   evidence. Accounts retain the stable code they were created with; retiring a
   type blocks new selection but never rewrites history.
2. `business_payment_term_definitions` stores a stable code, display label,
   exact due-days integer, active state, effective dates, and publication audit.
   Published account-term versions reference or snapshot both code and due days.
3. Admin uses draft, preview, publish, and retire controls. A preview counts
   affected accounts, draft contracts, future bookings, and any scheduled term
   change. Publication is prospective and reasoned.
4. Customer account setup and controlled term publication read only active
   definitions. Finalized statements calculate due dates from the snapshotted
   term definition, not from the current catalog.
5. API and mobile responses continue to include stable codes plus server labels,
   so adding a type or term does not require a client release merely to render
   human text.
6. Support and Audit Log link each account or statement to the exact definition
   and version that governed it.

This is the best scaling foundation because it makes Admin changes real,
prospective, reviewable, and historically explainable.

### Option B - Keep the fixed lists permanently

Remove the two rows from editable Settings and treat additions as migrations and
releases. This is safer than the current contradiction but makes routine market
configuration depend on code deployment. It is acceptable as a launch subset,
not the intended long-term Admin model.

### Option C - Drop database checks and trust the comma-separated settings

Not recommended. It would allow arbitrary values without stable definitions,
due-day semantics, retirement rules, historical labels, or referential evidence.

## Required inventory before migration

Under E32, privately inspect:

1. every distinct account type and payment-term value in production;
2. current setting values compared with database constraints and code enums;
3. published account-term versions and draft contracts by payment term;
4. finalized statement due dates compared with their snapshotted terms; and
5. evidence of any failed or manual attempt to add a new type or term.

Record only aggregate conclusions in the repository. Do not rewrite historical
accounts or statement dates to match a new catalog.

## Acceptance criteria after approval

1. An Admin-published type is selectable for a new account without a deploy or
   database error.
2. An Admin-published payment term has explicit due-day semantics before use.
3. Existing bookings and statements retain their original type/term labels,
   snapshots, amounts, and due dates.
4. Retiring a definition blocks new use without invalidating old records.
5. Preview, publication, retirement, stale-state, reason, and audit behavior is
   executed by real tests.
6. Customer, provider where relevant, Support, Finance, and Admin show the same
   stable code and human label.

## Work paused

Do not make these two rows editable, remove the existing checks, or add new
literal values in only one layer. Safe work may continue on the read-only
current values, controlled account terms, route validation, tests,
documentation, and unrelated audits.
