# D28 — Proof-to-close canonical record

Date: 2026-08-25  
Status: OPEN — architecture decision required before property/site/visit schema work  
Raised from: Ken's request to make the attached ProofFlow value part of onService for providers, provider businesses, customers, and ongoing/enterprise customer use

## Decision

How should proof-to-close become part of onService without creating a second disconnected product or making simple home-service bookings difficult?

## Evidence

The 2026-08-25 audit found that onService already has bookings, checklists, photos, signatures, quotes, change orders, recurring work, projects, business accounts, provider staff, provider CRM, disputes, support, and audit actions. The gap is the canonical relationship among them.

The full evidence and capability map is in:

`docs/audits/PROOF-TO-CLOSE-CORE-VALUE-AUDIT-2026-08-25.md`

## Options

### Option A — Booking-centered work record with optional site and visits (recommended)

- `bookings` remains the marketplace commercial work order and money source of truth.
- Add a property/site record owned by a customer or business account.
- Add one or more visits under a booking for crew, time/location, checklist, evidence, issues, and visit closeout.
- Projects and recurring plans group or generate bookings; they do not replace booking payment authority.
- A normal booking gets an implicit one-visit experience and stays simple.

Benefits: reuses the strongest current system, keeps support/payment linkage intact, fits both consumer and enterprise use, and can be delivered additively.

Tradeoff: the booking entity remains broad and needs a carefully designed proof read model so clients do not assemble it differently.

### Option B — Project-centered field-service record

- Promote `projects` to the parent of work, visits, evidence, and bookings.
- Treat every job, including a simple one-time service, as a project or project phase.

Benefits: one hierarchy for large work.

Tradeoff: current projects are customer-only planning records with no assignment, booking, payment, or provider-acceptance contract. This option requires a larger migration and risks forcing project complexity into ordinary consumer bookings.

### Option C — Keep current entities and add only consolidated screens

- Build proof summary pages from current tables without property/site or visit records.

Benefits: fastest and lowest schema risk.

Tradeoff: cannot truthfully represent multiple visits, property history, arrival evidence, callbacks, crew handoffs, or enterprise service locations. It improves presentation but does not deliver the core value.

## Recommendation

Approve Option A.

It makes onService's existing booking the end-to-end record of request, scope, authorization, field proof, closeout, support, and payment. Property/site and visits add the recurring and enterprise depth Ken described while progressive disclosure keeps the consumer app simple.

## Boundaries unaffected by this decision

- No milestone escrow or new fund movement; D27p5 remains open.
- No customer-signature identity model; E19 remains open.
- No Suki conversion change; E25 remains open.
- No automatic warranty/liability decision.
- No accounting authority or third-party integration approval.
- No marketing use of job media without separate consent.

## What can proceed before approval

- current proof-integrity defects;
- consolidated read-only proof summary from existing records;
- truthful customer/provider/admin presentation;
- responsive browser work;
- tests and documentation.

## What pauses on D28

- property/site schema;
- visit/phase schema;
- project-to-booking parent relationship;
- enterprise property hierarchy;
- backfill or migration of existing booking addresses into properties/sites.
