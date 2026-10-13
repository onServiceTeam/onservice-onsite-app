# E84: What providers are told when an admin cancels a quote request

**Date:** 2026-10-14
**Severity:** Spec contradiction (CLAUDE.md hard stop 4). No money is involved.
**Status:** Open for Ken. A safe default is in place (below). It is the same question as D35 Q6, applied to quote requests.
**Found during:** Milestone 2 wave 3 review (D38 request engine, package W3-A)

## Bad news first

The Milestone 2 plan (`qa-frameworks/human-audit-2026-10-13/critique.md`, section 2.2, "Cancel and expiry") says an admin cancel of an open quote request should send providers who hold a live quote the `job_request_cancelled` notice. The only text written for that notice (critique section 2.5) is:

> "The customer cancelled their request for {service}."

That is untrue when support cancelled the request, for example as fraud or a duplicate. A provider could then blame or contact the customer for something they did not do.

D35 Q6 (`.ai-coder/decisions/D35-booking-status-authority-slice1.md`) already holds all admin-cancel notice wording for Ken. The admin cancel code says the same ("that wording waits for D35 Q6"). The two documents disagree, so I did not pick wording.

The first wave 3 build did send the untrue text on an admin cancel. The fix below removed it before anything was committed.

## Default in place until Ken decides

When an admin cancels a quote request that is still open (`requested` or `quoted`):

- The request leaves every provider's Requests list. Open invites expire, and providers who were invited or hold a live quote get a silent list refresh (`job_request:closed`, which shows no text).
- Request threads on it become read-only, and their participants are sent the new state.
- **No push and no notification row go to any provider.** The customer gets no notice either (unchanged; D35 Q6).

A customer cancel is unchanged: providers holding a live quote still get "The customer cancelled their request for {service}."

Code: `packages/api/src/services/job-leads.service.ts` (`closeRequest`, option `cancelledBy: 'admin'`) and `packages/api/src/services/booking-admin.service.ts` (`cancelBookingAsAdmin`). Test: `packages/api/__tests__/ha-m2-324-admin-cancel-closes-request.test.ts`.

## Decision needed from Ken

1. Should a provider holding a live quote be told when onService cancels the request? D35 Q6 proposes this wording for a booked job: "onService cancelled this job. It no longer needs your visit." A request has no visit yet, so a version such as "onService cancelled this request for {service}." might fit better.
2. If yes, should the same wording also go to providers who were invited but have not quoted? Today they only see the request disappear from their list, for both customer and admin cancels.

## What this record does not authorize

- Changing the customer-cancel notice.
- Sending any admin-cancel notice text before Ken approves it.
