# D29 — Repeat-provider booking and assignment semantics

Date: 2026-08-25
Status: OPEN — architecture decision required before promising or persisting a chosen provider
Raised from: customer provider profiles, Suki relationships, Quick Re-book, and the provider/client relationship value in Ken's ProofFlow direction

## Decision

What should happen when a customer starts a booking from a specific provider, a Suki relationship, or a prior completed booking?

## Evidence

The current customer surfaces imply a repeat-provider action, but the booking draft stores only the category and service. It does not store a preferred provider. The normal booking flow therefore matches any eligible provider.

The existing customer self-assignment endpoint is not a safe implementation of “Book Again”:

- it immediately assigns the booking instead of asking the provider to accept;
- it checks provider approval and booking conflicts, but not the selected service, service area/radius, or provider schedule;
- it can race with pending booking offers;
- it applies the Suki discount at assignment time;
- it changes marketplace assignment and money behavior, so it must not be wired into customer UI as an incidental screen fix.

The safe interim UI says that selecting a service starts a booking and that provider assignment is confirmed later. It does not claim the viewed provider is reserved, requested, or assigned.

## Options

### Option A — Preferred-provider-first offer (recommended)

- Store an explicit preferred provider on the booking request or draft.
- Validate approval, selected service, active service area/radius, schedule, and conflicts before offering the job.
- Offer the job to that provider first and require provider acceptance.
- If the provider declines or times out, ask the customer whether to use normal matching rather than silently cascading.
- Apply any Suki discount only after the selected provider accepts and the canonical price is known.
- Cancel or suppress competing offers transactionally.

Benefits: matches the relationship promise while preserving provider consent, customer clarity, and support evidence.

Tradeoff: adds an offer state and fallback choice, and needs concurrency, notification, pricing, and expiry tests.

### Option B — Validated direct assignment

- Extend the current self-assignment path with service, area, schedule, conflict, and competing-offer checks.
- Assign immediately without provider acceptance.

Benefits: fewer customer steps.

Tradeoff: weakens provider consent and can create accepted work the provider never explicitly accepted. Not recommended.

### Option C — Generic matching with truthful relationship links

- Keep the current booking behavior.
- Provider and Suki screens may open services and start a service booking, but must state that assignment is confirmed later.
- Do not label the action “Book Again with this provider.”

Benefits: safe and available now.

Tradeoff: does not deliver the repeat-provider promise and leaves Suki as a loyalty/reporting relationship rather than a provider-selection feature.

## Recommendation

Approve Option A.

It gives customers and enterprise repeat users a real preferred-provider workflow without silently assigning work or pretending the existing category-only rebook flow preserves the relationship.

## Boundaries unaffected by this decision

- Suki point conversion remains E25.
- Provider fixed-price ownership remains E16.
- External payment authorization remains E14.
- Customer signature identity remains E19.
- Property/site/visit modeling remains D28.

## What can proceed before approval

- truthful customer copy and action labels;
- provider-profile and Suki responsive browser work;
- links from Suki relationships to provider services and provider CRM;
- tests proving no screen claims a provider is selected when it is not;
- read-only relationship and prior-work context.

## What pauses on D29

- storing a preferred provider on a booking;
- “Book Again with this provider” behavior;
- provider-first offer and fallback rules;
- direct assignment from provider profile or Suki;
- Suki discount timing changes;
- changes to offer cancellation or assignment concurrency.
