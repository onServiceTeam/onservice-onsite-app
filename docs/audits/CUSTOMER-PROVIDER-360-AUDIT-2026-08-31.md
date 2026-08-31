# Customer and Provider 360 audit, 2026-08-31

## Scope and honesty boundary

This checkpoint re-audits the admin workspaces that support one customer or provider across account access, support cases, bookings, payments, disputes, service areas, provider staff, internal notes, and history. It traces the identifiers and data sources behind each visible exit instead of treating a tab or API route as proof that the workflow is connected.

This record does not claim that every customer, provider, or admin screen is complete. It covers the Customer 360 and Provider 360 account-support boundary and the linked Support Tickets and Service Areas views. Remaining configuration, compliance, catalog, policy, analytics, settings, role-governance, mobile, and production checks continue in later checkpoints.

Production deployment is not claimed. E32 remains open because the supplied SSH identities are rejected by the production host. No production account, booking, payment, support case, or provider record was changed during this checkpoint.

## Canonical relationship traced

| Operator question | Canonical relationship used |
| --- | --- |
| Which support cases belong to this customer? | A case opened by the customer, or any case linked to a booking whose `customer_id` is the customer. |
| Which support cases belong to this provider? | A case opened by the provider owner, opened by one of the provider's linked staff accounts, or linked to a booking whose `provider_id` is the provider record. |
| Which disputes belong to this customer? | Every dispute on a booking owned by the customer, whether the customer or provider filed it. Fraud-pattern counts remain customer-filed only. |
| Which service-area requests belong to this provider? | Requests store the provider owner's user ID; the admin filter resolves that owner to the canonical provider record ID before limiting the queue. |
| Which access sessions are active? | Current refresh-token rows for the account owner. Force sign-out and suspension also advance `users.session_version`, invalidating older access tokens immediately. |
| Which internal notes belong here? | Notes are read, edited, and deleted only when both the provider ID and note ID match. Updates preserve an admin decision record. |

## Screen-by-screen gap analysis

### Customer 360

| Area | Audit result | Implemented boundary |
| --- | --- | --- |
| Header and profile | Account status, support ownership, and remembered sign-ins were absent from the main support context. | Added open, urgent, and unassigned case signals, current support owners, refresh-session count, audited force sign-out, and exact suspension effects. |
| Bookings | Existing customer booking linkage remains the canonical work history. | Route IDs, status, page, and page-size inputs now fail before database work when malformed. |
| Payments | Existing wallet and payment records remain visible. | No wallet limit, refund percentage, or payment state was changed; E31 still governs manual wallet controls. |
| Disputes | The tab showed only disputes filed by the customer and could omit a provider-filed case on the customer's job. | The list now includes every dispute on the customer's bookings, labels the filer and filer role, and paginates. Fraud signals continue to use customer-filed disputes only. |
| Referrals | Existing referral records remain read-only in this checkpoint. | No reward or Suki policy semantics were changed. |
| Activity | User-targeted admin events could be omitted when the screen searched only customer-targeted events. | Activity includes both `customer` and `user` target types for this account. |
| Support exit | “View support history” previously scoped only by the customer user ID. | The exit uses `relatedCustomerId`; Support Tickets applies the same direct-or-booking-linked definition and identifies the related-account view. |
| Tablet/browser behavior | The section tabs could wrap into an unstable dense block. | The rail is horizontally scrollable with touch-sized controls and responsive page padding. |

### Provider 360

| Area | Audit result | Implemented boundary |
| --- | --- | --- |
| Header and profile | The header lacked support ownership, area-change queue, sessions, and accurate enforcement effects. | Added open/urgent/unassigned support signals, owners, pending area changes, refresh sessions, audited force sign-out, and reasoned reject/suspend/reactivate actions with exact effect copy. |
| Provider suspension | Refresh tokens were deleted, but an already issued access token could remain usable; some provider routes bypassed the approved-profile check. | Suspension advances `session_version` and removes refresh tokens in one transaction. Service-area and job-request routes now pass through the approved-provider workspace gate. |
| Jobs and financials | Existing tabs retain the provider record as the owner. | Route IDs, pagination, and booking-status filters now reject malformed input. No money movement or settlement semantics changed. |
| Reviews and disputes | Existing provider-linked review/dispute records remain canonical. | Nested IDs and pagination are validated before service/database work. |
| Staff | Normal admins received full invited-member phone/email even though provider-owner contact was masked. Suspension copy did not explain active-assignment handling. | Invite contact is masked for normal admins and raw only for super-admin. The UI marks the masked state. Suspension explains that access stops but the provider must take over or reassign active work; E29 remains the state-policy hard stop. |
| Service areas | Provider 360 had no reliable way to open only this provider's pending requests. Filtering after a limited queue could miss matching rows. | Provider 360 links to provider-scoped Service Area operations. The API filters by canonical provider record before `LIMIT`, and the page shows a provider-specific context banner. |
| Internal notes | Notes could be addressed by note ID without proving they belonged to the provider, and updates lacked a dedicated transactional audit event. The UI could create, pin, and delete but not edit. | Update/delete operations require provider ID plus note ID. Updates are audited transactionally. The tab supports bounded editing and displays request errors. |
| Activity | User-targeted account events could be absent. | Activity includes both provider-record and owner-user targets. |
| Support exit | History scoped only to the provider owner and missed staff- or booking-linked cases. | The exit uses `relatedProviderId`; Support Tickets applies owner, staff, and booking linkage and identifies the related-account view. |
| Tablet/browser behavior | Nine tabs and dense header actions did not provide a stable tablet layout. | The section rail scrolls horizontally, header/actions wrap safely, and page padding adapts at 820 and 1024 pixels. |

## Enforcement and privacy decisions

- Suspension and force sign-out are separate actions. Force sign-out changes credentials only. Suspension also changes account/provider state. Neither action cancels a booking, refunds a customer, resolves a dispute, or releases escrow.
- A provider suspension does not erase `performer_staff_id`, alter evidence attribution, or automatically reassign work. E29/D31 must define that lifecycle before a money- or evidence-affecting mutation is added.
- Customer/provider contact and provider-staff invite contact follow the existing least-privilege rule: normal admins receive masked values; the existing audited account-contact reveal remains the controlled support path; super-admin receives the authorized raw view.
- Provider internal note edits preserve an explicit audit action. This checkpoint does not claim E37's global request-correlation architecture is complete.
- Customer disputes display all case directions, while fraud-pattern analysis remains limited to customer-filed disputes so a provider filing against a job cannot itself label the customer fraudulent.

## Implemented defects and evidence IDs

| Defect | Result |
| --- | --- |
| UX-744 | Customer suspension invalidates existing access and refresh credentials. |
| UX-745 | Provider suspension invalidates existing access and refresh credentials. |
| UX-746 | Suspended providers cannot enter provider-only service-area or job-request workspaces. |
| UX-747 | Customer 360 lists every dispute linked through the customer's bookings and identifies the filer. |
| UX-748 | Customer 360 exposes support ownership/session context and accurate access actions. |
| UX-749 | Provider 360 exposes support, access, area-queue, and status-action context. |
| UX-750 | Customer 360 route identifiers, paging, status, and limit inputs are bounded. |
| UX-751 | Provider 360 route identifiers, paging, status, and limit inputs are bounded. |
| UX-752 | Provider note edits/deletes are provider-scoped and edits are audited. |
| UX-753 | Customer and Provider 360 tab rails remain usable on tablet browsers. |
| UX-754 | Customer force sign-out is reasoned, transactional, and audited. |
| UX-755 | Provider force sign-out is reasoned, transactional, and audited. |
| UX-756 | Service Area operations can be scoped to the provider opened from Provider 360. |
| UX-757 | Provider internal notes can be edited with a 5,000-character boundary and visible errors. |
| UX-758 | Provider area requests are filtered before queue limiting. |
| UX-759 | Support API account filters include booking-linked and provider-staff-linked cases. |
| UX-760 | Support Tickets preserves and explains the related customer/provider workspace. |
| UX-761 | Provider staff invite contact is masked for normal admins. |
| UX-762 | Customer/Provider 360 support signals use the same related-case definition as the queue. |

## Verification evidence

- API and admin TypeScript checks passed after the final privacy and linkage changes.
- Focused behavior coverage for UX-744 through UX-762 passed.
- Strict Customer/Provider 360 screenshot comparison passed 37 tests without updating a baseline.
- Reviewed visual states include default, loading, missing-record, error, disputes, certifications, notes, provider staff/privacy, and operations layouts at 820, 1024, 1280, 1440, and 1920 pixels.
- Full-suite, build, lint, repository-gate, CI, merge, and GitHub alignment results are recorded in the parent continuous-audit checkpoint when this branch lands.

## Remaining hard stops and next work

- E29/D31: provider-staff suspension and active assignment/evidence chronology.
- E30/D32: customer fraud-review clearance semantics.
- E31/D33: limits and dual control for manual wallet adjustments.
- E35: one provider-onboarding source of truth and a safe resubmission lifecycle.
- E36: government-ID-back approval enforcement after production evidence can be inspected.
- E37: globally complete and request-correlated audit evidence.
- E39: governed privileged admin-account lifecycle.
- E09, E14, E18, E22, E24, and D27p5: cancellation/refund, checkout evidence, dispute-window escrow, BIR authority, direct settlement concurrency, and milestone escrow.

The next safe loop is the remaining catalog, service-area configuration, cancellation-policy truth, compliance/data-protection containment, analytics, settings, staff/roles, and other admin navigation fields. Hard-stop items stay documented rather than being guessed into production behavior.
