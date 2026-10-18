# D44: Send each request only to Service Providers approved for that specialty

**Date:** 2026-10-18
**Decided by:** Ken, in chat, 2026-10-18.
**Status:** DECIDED in principle. The details below are Claude's proposal; they go to Ken with the services proposal (docs/qa/customer-review-2026-10-17/) before any code is written. This changes the matching rule of D38; the rest of D38 (the first Service Provider to quote wins) stays.

## Ken's words

> yes the requests should be by specialties and what the provider has been approved to be able to do on the app by our admins, their reviews, etc.. and profile verification

Context: Ken's services notes of the same day (`docs/qa/customer-review-2026-10-17/04-KEN-NOTES-2026-10-18-SERVICES.md`): construction and carpentry have specialists in each area, appliance repair should be split by appliance, and onService needs specialists in each area.

## What happens today (master 2057c9b1)

- A request matches a Service Provider who has ANY active service in the request's category, directly or through any job type of that category, inside their travel radius (`packages/api/src/services/booking/request-eligibility.ts:56-72`). So a carpenter who only does doors gets every carpentry request, and a TV repair person gets every appliance request.
- Service Providers switch their own services on and off. No admin approves a single service or specialty.
- Admins already approve the Service Provider account (documents, D09) and can mark certifications verified (migration 157). Neither is tied to a specialty.
- Reviews and ratings are not used to decide who gets a request.

## What Ken decided

A request goes only to Service Providers who:
1. are approved by an onService admin for that specialty (not only for the account);
2. have a verified profile (account approved, identity and documents checked);
3. pass a review standard (their ratings and reviews count);
plus the existing rules (inside their travel radius, not the customer themselves, online for the first notice).

## Claude's proposal for the details (to confirm with Ken)

- **Specialty = a job type** (for example "TV repair", "Refrigerator repair", "Aircon cleaning", "Roof leak repair"), grouped under the categories customers see. One list, kept in admin. The services proposal sets the launch list.
- **Admin approval per specialty:** a Service Provider asks for specialties at sign-up or later; each one is Pending until an admin approves or refuses it, with a reason. Evidence an admin can look at: certificates (for example TESDA), portfolio photos, past jobs on onService. Every decision is audited. A Service Provider sees which specialties are approved.
- **Existing Service Providers:** their current active services are carried over as approved on the day this ships, and listed for admins to re-check, so nobody loses work overnight. (Alternative: all start Pending; that would stop every request until admins finish.)
- **Profile verification:** "verified" means the account is approved and the identity documents are checked. Only verified Service Providers get requests.
- **Reviews:** a minimum rating (an admin setting, for example 3.5 stars once a Service Provider has at least 5 reviews; new Service Providers are not blocked for having no reviews), and when more Service Providers qualify than the invite limit (today 30), higher-rated and closer Service Providers are notified first.
- **A request with no specialty** (the customer taps a broad group or picks "Not sure"): the form asks one simple question to pick the specialty, with "Not sure" going to the group's general specialty (for example "General appliance check-up"). Every request ends up with one specialty.
- **Admin editor** for every number above (standing rule 9).

## Not decided yet (questions for Ken, in the services proposal)

- The exact minimum rating and review count, and whether a low rating pauses all specialties or only the one with complaints.
- Whether existing services are carried over as approved (recommended) or reset to Pending.
- The launch list of specialties.

## Not done

- No code changed yet. The matching rule, the admin approval screens, the Service Provider sign-up and the customer form change together in one slice after Ken confirms the details.
