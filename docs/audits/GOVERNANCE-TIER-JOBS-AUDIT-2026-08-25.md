# Governance, Tier, and Provider Jobs Audit

Date: 2026-08-25
Scope: provider tier progression, provider Jobs list, customer Legal and Data Rights, participant booking-list authorization, Admin-controlled commission settings, and production read-only truth checks

## Outcome

This continuation found that several screens were visually present but did not tell the same story as the API, Admin settings, or production data.

- Provider tier progression described Founding as the top rung, claimed unsupported benefits, and used static commission rates even though Admin settings are the runtime source of truth.
- Tier eligibility trusted `providers.total_jobs`, which can be stale when completion happens through worker or Admin paths.
- Provider Jobs applied period and pay sorting only to pages already loaded on the device. A provider could see a false empty or false highest-pay result.
- Disputed and resolved bookings were omitted from all three participant list buckets.
- The participant booking-list service had no fail-closed branch for an authenticated role other than customer or provider. Admin, DPO, or staff callers could reach an unscoped list query instead of their dedicated route.
- Customer Legal hid a live cancellation-policy load failure behind baseline text and had no useful tablet/desktop document layout.
- Customer Data Rights still documented its own working request-history endpoint as deferred and rendered as one long phone column on browsers.

## Production and specification evidence

- A read-only production comparison found one provider whose stored `total_jobs` was one lower than the canonical completed-booking count. No production row was changed.
- Admin-controlled commission settings remain the live source. The tier API now reads those values instead of duplicating them.
- Current operations documents define Founding as a parallel invite-only status and the normal ladder as New, Verified, Pro, and Elite. Promotion remains a super-admin decision with a recorded reason; meeting signals makes a provider eligible for review, not automatically promoted.
- The payout `aml_review` state is retained. It is an internal large-withdrawal risk-review label in the current product, not a customer-facing legal claim that onService performs a regulated AML determination.

## Implemented corrections

| Bug | Correction |
| --- | --- |
| UX-324 | Tier progression reads all five live commission settings and publishes only implemented tier effects. |
| UX-325 | Tier progress counts canonical completed states instead of the stale provider counter. |
| UX-326 | Founding is presented as parallel and invite-only, not above Elite. |
| UX-327 | Tier progression uses a bounded tablet/desktop workspace and states that promotion requires super-admin review. |
| UX-328 | Customer Legal uses a bounded section rail and document panel on tablet/desktop. |
| UX-329 | A cancellation-policy load failure is disclosed, the affected section is marked unavailable, and retry is functional. |
| UX-330 | Data Rights separates request actions from request history in a bounded tablet/desktop workspace and corrects the stale technical comment. |
| UX-331 | Jobs period/sort filters execute in the server query before count, ordering, and pagination. |
| UX-332 | The participant booking list rejects unsupported roles before any database query. |
| UX-333 | Disputed work remains active and resolved work remains visible in completed history. |
| UX-334 | Provider Jobs uses a bounded wide workspace and includes customer context on each assigned job. |
| UX-335 | The Jobs controls send their selected server filter contract through the paginated query. |

The obsolete Phase 175 Jobs source-regex test was replaced with a real rendered interaction test covering all three empty-state explanations.

## Legal hard stop

E26 records a contradiction in F#10 sources: one heading says the disclaimer is finalized while the same decision and current launch sources say it is interim and still requires Philippine counsel. No Terms, Privacy, guarantee, insurance, retention, or liability wording changed. `v1.0.0-launch-ready` remains blocked unless an authoritative attorney-approval artifact is supplied.

## Verification and release status

- Mobile: 358 suites passed, 783 tests passed, and 84 existing device-baseline todos remained explicit.
- Admin: 84 files passed with one skipped file; 197 tests passed and three existing todos remained explicit.
- API: 433 locally runnable suites and 3,076 tests passed. UX-201 remained the sole local exclusion because Docker Desktop was off; it still requires independent GitHub Docker validation and live `nginx -t`.
- The mandatory API smoke passed 13/13.
- Repository lint and every workspace TypeScript check passed.
- API and Admin production builds passed.
- The 80-key environment contract passed.
- Gate A passed all ten blocking fragments after exposing the Windows Node executable to WSL; all six gate self-tests passed; Gate C passed all six blocking articles. Gates D and E confirmed their documented REPORT modes and are not claimed as visual or mutation evidence.

Independent GitHub CI, merge, production backup, deployment, and post-deploy alignment remain required at the time of this verification record.
