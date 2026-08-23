# Third-party tester feedback trace

Date: 2026-08-24
Status: active implementation input, not a product-approval document
Scope: all production `feedback_submissions` records available on 2026-08-24, their screenshots, and the customer/provider/admin surfaces they reference

## Evidence handling

The production export was pulled with the repository's key-protected `scripts/feedback/pull.mjs` workflow. The generated inbox, JSON, and downloaded screenshots remain gitignored because they contain tester names, contact details, device information, and free-text personal data. No export key, contact value, screenshot, or raw submission is included in this document.

The review covered:

- 10 submissions dated 2026-06-16 through 2026-06-30;
- 5 explicitly logged issue records plus the longer questionnaire answers and ratings in every submission;
- 6 uploaded screenshots, opened and visually inspected rather than inferred from filenames;
- customer, provider, mixed-role, and admin testing;
- the current code, historical response record, and existing escalation decisions.

All 10 production rows were still in `new` status at review time. The previous system had no admin queue, owner, decision note, or dismissal state. One submission is clearly stress/junk input. It is useful as abuse-validation evidence but not as product research. The other nine vary in depth and credibility. High NPS values in this small, mixed-quality sample do not override specific reproducible problems.

## Screenshot findings

The six files separate into:

- one real address-entry failure showing “Location Not Recognized” for a Cebu address;
- one real customer home view showing duplicate requested aircon bookings;
- one real blank browser page caused by a `mailto:` support handoff;
- two unrelated generated/test-logo images;
- one unrelated stock workshop photo.

Only the first three are screen evidence. The other three support spam/quality triage and must not be treated as proof of a UI defect.

## Cross-role trace

| Feedback cluster | Customer/provider surface | Admin/company counterpart | Current assessment | Action |
| --- | --- | --- | --- | --- |
| Service scope, inclusions, exclusions, and expected result are unclear | Home, category detail, provider profile, booking configure/request | Catalog, provider services, pricing rules | Confirmed: all 29 active production services had blank descriptions on 2026-08-24 | Added honest customer fallbacks, end-to-end scope retention, an admin publishing queue and exact customer preview, and server-side publishing validation; the business still must author the 29 real scopes |
| Custom-quote checkout can feel like a dead end | Quotes, pay, checkout, payment failed | Booking 360, Communications, Support Queue | Historical report; current post-E03 state must be reproduced before changing behavior | Trace fixed-price and quote state machines end to end and add a regression only for a current failure |
| Payment method trust, logos, fees, and recovery are unclear | Payment methods, wallet top-up, checkout, receipt | Financials, notification templates, support | Plausible current friction; money behavior remains server-authoritative | Improve explanation and recovery UI without inventing payment guarantees or methods |
| Wallet top-up QR did not return cleanly | Wallet top-up, wallet, payment failed | Financials, Support Queue | Current-code verification required | Trace redirect/callback/deep-link handling and visible pending/failed/success states |
| Cebu address could not be recognized | Address picker, saved addresses, booking form | Service Areas, Dispatch, booking detail | Real screenshot evidence; a prior matcher fix exists, so regression testing is required | Reproduce exact class of supported Cebu address against current matcher and browser fallback |
| Duplicate requested bookings appeared after a failed payment attempt | Home, bookings, payment failed | Booking queue, Financials, Audit Log | E03 was resolved on 2026-06-19 after the report; do not reopen from old evidence alone | Keep as a regression scenario and verify current idempotency before any new fix |
| Help, cancellation, dispute, and live-support entry points are hard to find | Help, Safety & Support, support inbox, booking detail | Support Queue, Disputes, Communications | Current information-architecture issue likely remains on shell-only screens | Put real support cases ahead of `mailto:` exits and keep booking/user context attached |
| Provider checklist issue reporting is missing/broken | Provider job checklist | Booking 360, Support Queue | Hard stop E05: no approved endpoint or escalation behavior | Do not invent; preserve as an explicit decision/escalation item |
| Provider navigation/location failed | Provider job navigation and active job | Dispatch, Booking 360, Service Areas | Current-code and external-navigation fallback verification required | Test coordinates, missing-location state, external map handoff, and browser behavior |
| Provider cannot confidently edit services or availability | Provider Services, Skills, Schedule, Availability | Catalog, provider 360, Service Areas | Plausible discoverability/validation gaps | Verify edit affordances, disabled/re-enabled days, allowed catalog scope, and save feedback |
| Provider team contact validation is weak | Provider Team, staff invites | Provider 360 Staff, Staff & Roles | Current-code verification required | Check phone/email validation and provider-owner scope without changing staff authorization architecture |
| Certification dates and photo uploads are cumbersome or fail | Certifications, portfolio, onboarding documents/selfie | Provider 360 vetting | Browser/device fallback gap likely | Test date picker/manual date parsing and browser file upload states separately from native camera behavior |
| Payout methods and net-pay explanation lack trust | Earnings, payout settings, payouts, withdraw | Payouts, Financials, provider 360 | Money-sensitive; presentation can improve only around canonical server values | Verify method labels/logos, commission/net math source, destination masking, and failure recovery |
| Provider dashboard priorities are unclear | Provider dashboard | Dispatch, Analytics | Directional design signal | Keep today's schedule, availability, and earnings ahead of secondary metrics on wide and phone layouts |
| Admin dashboard and support organization do not reflect operator work | Dashboard, Support Queue, Tester Feedback | all user-side lifecycle events | Confirmed by the suspicion-first admin audit | Continue queue-first, owner-first case workspaces; do not invent unsupported SLAs |
| Customer/provider feedback should be separable and owned | Tester Feedback | customer/provider/admin research | Confirmed company-process defect | Implemented as a dedicated Support & Trust queue with area filters, named owner, note, and audited status |
| Online/nearest providers and top-provider reporting are wanted | Dispatch, Analytics, provider list | provider availability and location | Product/report-definition request, not an automatic build instruction | Define source, freshness, privacy, and metric meaning before adding a report |
| Refund actions need clear confirmation | Payment failed, booking/dispute outcomes | Booking 360, Disputes, Financials | Valid control principle; refund math remains E09/legal sensitive | Require canonical preview/reason/audit, but do not change refund behavior while E09 is open |

## What this feedback does not authorize

Tester suggestions are evidence of a problem or desire, not approval for product behavior. This review does not authorize:

- new service categories or exact service prices;
- a customer/provider bargaining or “tawad” mechanism;
- WhatsApp or other off-platform contact that weakens the on-app support record;
- new payment rails, wallet withdrawal behavior, refunds, escrow movement, or guarantees;
- fictional online-provider distances, top-provider rankings, KPIs, or support SLAs.

Those items require current data, canonical server behavior, and where applicable Ken, finance, legal, privacy, or architecture decisions.

## Operational remediation

The admin now needs one dedicated Tester Feedback workspace under Support & Trust rather than treating product research as Communications moderation or Support tickets. The intended workflow is:

1. Start in `new` and filter by customer, provider, or admin area.
2. Preserve the original summary, issue records, reproduction steps, expected result, ratings, answers, pricing reactions, ideas, and screenshots.
3. Mask contact details and personal data in free text for ordinary admins.
4. Require an active named admin owner before status can become `triaged` or `done`.
5. Require a written note for every status change, including `dismissed` spam or non-actionable input.
6. Write status, owner, and note changes to the audit log in the same transaction.

The secret export remains available for private analysis and backup. It is not the day-to-day company workflow.

## Service-scope verification and remediation

The first tester-backed product finding was checked against production data instead of inferred from UI copy. On 2026-08-24 the catalog contained 29 active subcategories and every one had a blank description: 17 fixed-price services and 12 quote services. No service add-ons were configured. Category descriptions were present, but they do not define what an individual service includes, excludes, or delivers.

No service scope was invented. Until the business publishes exact copy, customer category, search, provider profile, fixed-price configuration, and quote-request screens now show a pricing-aware fallback and carry the same scope state through the booking draft. The fallback tells customers to confirm included work inside onService; it does not promise a result or turn provider negotiation into the source of truth.

Catalog operations now shows active, missing-scope, and scope-ready counts; a dedicated missing-scope queue; a visible warning on incomplete services; and an exact customer-facing preview. New active services and edits to active legacy services require at least 30 trimmed characters of customer scope. That threshold prevents blank or token text but is not proof that the copy is commercially or legally complete. Ordinary admins can inspect catalog evidence and the customer preview but cannot see superadmin-only mutation controls that the API would reject.

Behavior is covered by Bugs UX-043 through UX-049. Provider-profile regressions prove hourly booking uses the canonical catalog rate rather than a provider's generic base price and quote services never display a legacy provider base price as the booking price. Catalog visual evidence covers populated, ordinary-admin read-only, missing-scope, customer-preview, loading, empty, and error states at 1280, 1440, and 1920 pixels. The remaining business task is to author and approve the 29 exact scopes, including important limits and any preparation the customer or provider must make.

## Next verification order

1. Customer wallet top-up and payment-result recovery.
2. Cebu address recognition and browser address fallback.
3. Customer Help, Safety & Support, and shared support case linkage.
4. Provider navigation, Services, Schedule/Availability, Team, Certifications, and upload states.
5. Provider earnings/payout presentation without changing money behavior.
6. Admin dashboard/reporting requests only after metric definitions and privacy boundaries exist.
