# E30 - Customer fraud-review marker has no auditable clearance action

**Date:** 2026-08-30
**Status:** OPEN
**Hard stop:** schema-backed enforcement and audit semantics

## Finding

Customer 360 can add and display `users.is_flagged_fraud`, but no supported action can clear the marker after a review. Clearing it mechanically would require a new canonical audit verb and rules separating trust review from account activation, disputes, bookings, and money.

## Required decision

Use `.ai-coder/decisions/D32-customer-fraud-review-clearance.md`. Option A, an explicit super-admin clearance with a required reason and an append-only state transition, is recommended.

## Work paused

Do not clear the flag on reactivation or through an unaudited update. Existing flag creation, duplicate protection, visible state, corrected analytics, and unrelated audit work may continue.
