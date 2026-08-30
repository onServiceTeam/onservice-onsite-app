# E29 — Suspended provider staff can remain assigned to active bookings

**Date:** 2026-08-30
**Status:** OPEN
**Hard stop:** booking assignment, evidence attribution, and possible customer/money consequences

## Finding

Provider-staff suspension immediately removes the approved status required for assigned-job access, but `bookings.performer_staff_id` remains unchanged. The provider owner can take over or reassign, yet the platform does not force or track that decision.

Automatically clearing the field is not a safe mechanical fix. For in-progress work it may erase the identity link for evidence already captured by that staff member. Reusing the provider-account suspension escrow hold would also give a staff employment/access decision an unsupported money effect.

## Required decision

Use `.ai-coder/decisions/D31-provider-staff-suspension-assignment.md` to select the canonical assignment and chronology behavior. Option A, state-aware reassignment plus an explicit exception for work already under way, is recommended.

## Work paused

Do not add automatic unassignment, completion holds, customer notifications, or assignment restoration until D31 is decided. Immediate access revocation, reasoned audit records, truthful operator warning, and unrelated audit work may continue.
