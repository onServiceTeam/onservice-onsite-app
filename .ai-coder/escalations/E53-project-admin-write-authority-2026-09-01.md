# E53 — Project Admin write authority conflicts with the read-only operations contract

**Date:** 2026-09-01  
**Status:** OPEN  
**Hard stop:** authorization, customer-owned planning data, and missing audit/concurrency controls

## What the audit found

The Admin Projects screen and the operator training manual both define the
workspace as read-only planning oversight. The screen exposes no edit action.
The shared project service does not enforce that boundary:

- Admin and super-admin requesters pass `isOwnerOrAdmin` and can patch a
  customer's project, add/update/delete milestones, and add/delete choices.
- Admin requesters can add documents and remove any project document.
- These writes require no operator reason, create no `audit_log` or
  `admin_actions` record, and have no optimistic-concurrency/version check.
- The routes are mixed customer/provider/Admin routes under `/api/v1/projects`,
  so the read-only Admin presentation is not an authorization control.

This is a source-of-truth conflict. Silently keeping the hidden authority makes
the manual false and permits untraceable customer-data changes. Silently
removing it could break an undocumented support process or emergency correction
path.

## Options

### Option A — Enforce read-only Admin access now

Reject Admin/super-admin project mutations at the service boundary. Customers
retain ownership writes and an accepted legacy provider retains only its
existing narrow progress/document behavior. Add a later governed support
correction workflow if a real need is approved.

**Benefit:** the API matches the current screen and operator contract; smallest
immediate customer-data risk.

**Tradeoff:** removes any undocumented direct-API Admin correction practice.

### Option B — Build a governed Admin correction workflow

Keep carefully scoped Admin corrections, but expose them in the project record
with before/after impact, a required reason, transactionally coupled audit
evidence, record-version conflict handling, and field-specific authority. Do
not include provider assignment, booking conversion, milestone money, or
document deletion until those separate policies are approved.

**Benefit:** supports real customer service while preserving accountability.

**Tradeoff:** materially larger authorization and operating-policy design.

### Option C — Retain the hidden shared-route authority

No code change. This leaves the user interface, training manual, and API in
conflict and permits unaudited Admin writes. Not recommended.

## Recommendation

Use Option A as the immediate safe boundary, then add only the specific Option B
corrections that an operator runbook can justify. This preserves customer-owned
planning data now without treating support correction as permanently
unnecessary.

## Work that may continue

- read-only Admin search, pagination, exact-record handoff, and participant links;
- truthful customer/provider presentation;
- responsive browser and accessibility fixes;
- API projections, tests, and documentation;
- production inventory of legacy provider links once E32 is resolved.

## Work paused on E53

- changing Admin mutation authorization;
- adding Admin project edit/delete controls;
- claiming project edits are audited or governed;
- using hidden API writes as an operator procedure.

This escalation does not resolve D28's booking/site/visit architecture or
D27p5/E12 milestone-fund handling.
