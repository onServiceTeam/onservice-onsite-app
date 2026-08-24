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
| Payment method trust, logos, fees, and recovery are unclear | Payment methods, wallet top-up, checkout, receipt | Financials, notification templates, support | Confirmed launch blocker: the API constructs an undocumented hosted URL from a Payment Intent client key; the URL shape returns 404 | E14 records the required Checkout Session vs client-integration decision; do not change the live money path without test keys and approval |
| Wallet top-up QR did not return cleanly | Wallet top-up, wallet, payment failed | Financials, Support Queue | Confirmed: production has 12 top-up intents and all 12 remain `awaiting_payment`; there is no return route or top-up status endpoint | Blocked under E14 pending an approved PayMongo flow and test-mode end-to-end validation |
| Cebu address could not be recognized | Address picker, saved addresses, booking form | Service Areas, Dispatch, booking detail | Confirmed follow-on defects: shared-province matching misclassified Mandaue as Cebu City; coordinate-less saved addresses received fake Cebu coordinates; bookings were not coverage-gated | Bugs UX-050 through UX-054 now use configured areas, require exact coordinates/barangay, verify active coverage, classify overlapping areas by nearest center, and support browser geolocation; paid autocomplete remains D24 |
| Duplicate requested bookings appeared after a failed payment attempt | Home, bookings, payment failed | Booking queue, Financials, Audit Log | E03 was resolved on 2026-06-19 after the report; do not reopen from old evidence alone | Keep as a regression scenario and verify current idempotency before any new fix |
| Help, cancellation, dispute, and live-support entry points are hard to find | Help, Safety & Support, support inbox, booking detail, payment failure | Support Queue, Customer 360, Provider 360, Booking 360 | Confirmed: production had zero support tickets; payment failure discarded booking/error context, booking detail had no support action, safety reports opened a blank generic form, and admin labeled provider tickets as customers | Bugs UX-055 through UX-065 add contextual case entry, booking ownership enforcement, correct customer/provider linkage, account/booking reverse links, search, agent-created cases, waiting-case reactivation, and wide support workspaces. E05 still blocks checklist issue reporting. |
| Provider checklist issue reporting is missing/broken | Provider job checklist | Booking 360, Support Queue | Hard stop E05: no approved endpoint or escalation behavior | Do not invent; preserve as an explicit decision/escalation item |
| Provider checklist completion and photo proof do not persist correctly | Provider job checklist and completion | Booking 360, disputes, customer evidence | Confirmed in current code: toggles sent `isCompleted` while the API requires `completed`; uploaded proof was never attached by `photoId`; remounts rendered a fake `photo:` URI; the screen had no explicit wide layout | Bugs UX-147 through UX-150 align the mobile/API contract, attach proof, reload the persisted URL, expose photo-required state, cover empty templates honestly, and add a bounded tablet/desktop workspace. E05 remains separate and open. |
| Provider navigation/location failed | Provider job navigation and active job | Dispatch, Booking 360, Service Areas | Confirmed: both real job-detail and active-job map callers had no browser implementation; the dedicated navigation route had no caller and exposed blank external URLs before a destination loaded | Bugs UX-075/076/078/079 route both callers and a successful Start Navigation transition into one address-or-coordinate workspace, gate external map actions, gate arrival on booking coordinates/en-route state, and add an explicit desktop split without inventing map/ETA data |
| Provider cannot confidently edit services or availability | Provider Services, Skills, Schedule, Availability | Catalog, provider 360, Service Areas | Confirmed two defects and one money-path contradiction: fetch failure exposed editable fallback hours; DB TIME values returned seconds that the editor rejected; provider fixed prices can differ from the catalog booking amount | Bugs UX-077/083-088 lock unknown schedules, normalize/validate time windows, show field details, and add a wide availability workspace. E16 pauses provider service pricing/edit behavior pending an explicit price-source decision. |
| Provider team contact validation is weak | Provider Team, staff invites | Provider 360 Staff, Staff & Roles | Confirmed: malformed/oversized values bypassed route validation; formatted phones did not match accounts; D23's customer discovery link had later been removed | Bugs UX-080/081/082/089/090 normalize and bound contacts, restore in-app customer discovery, describe delivery honestly, and add responsive team/invitation workspaces without changing staff authorization. |
| Certification dates and photo uploads are cumbersome or fail | Certifications, portfolio, onboarding documents/selfie | Provider 360 vetting | Confirmed: certification date/upload defects; private onboarding references were rendered as anonymous images; applications granted provider role before approval; portfolio used the private onboarding upload context; customer consent was not captured; Provider 360 could not see the customer-facing portfolio | Bugs UX-091 through UX-104 correct certification evidence. Bugs UX-110 through UX-122 keep applicants as customers until transactional approval, enforce KYC ownership, use secure on-file states, make portfolio media public and provider-owned, capture timestamped written-consent affirmation, add bounded tablet/desktop layouts, and show the published portfolio and consent evidence in Provider 360. Native camera evidence remains F#3/device work. |
| Payout methods and net-pay explanation lack trust | Earnings, payout settings, payouts, withdraw | Payouts, Financials, provider 360 | Confirmed: the settings screen promised automatic cadences that no runtime worker consumed; two production providers had inactive non-manual preferences; bank rail validation was split; admin relabeled pending requests as scheduled; earnings then inferred money from wallet balance and admin omitted internal-review/reason/audit safeguards | E15 selected manual-only launch mode. Bugs UX-069 through UX-074 and UX-123/124/127/128/130/132 plus FIN-002 through FIN-005/008 preserve legacy values without running them, align the four rails, use recorded earnings/live commission, expose complete payout states, serialize one-in-flight requests, and require atomic reasoned admin decisions, including direct rejection of a held request without first clearing it. External transfer remains manual. |
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

1. Provider Services remains blocked by E16 until Ken chooses the fixed-price source. Portfolio and onboarding upload/application states are covered through Bug UX-122; native camera evidence remains F#3/device work and real browser upload/status verification remains part of the deployment gate.
2. PayMongo hosted checkout and top-up recovery after E14 is decided and test keys are available.
3. Remaining customer/provider settings, booking, payment, and dispute forms. Projects, notifications, recurring, provider job execution, and account-management wide workspaces are now covered, but still require the specific live/browser or device evidence noted below.
4. Admin dashboard/reporting requests only after metric definitions and privacy boundaries exist.

The Cebu address regression and safe browser fallback are covered by Bugs
UX-050 through UX-054. D24 remains open only for third-party autocomplete and
geocoding of a property other than the browser user's current location.

The shared support batch is covered by Bugs UX-055 through UX-068. It does not
claim that a live support team or automated SLA timers exist. Production had no
support cases or messages at the time of the read-only audit, so the zero-use
finding is preserved as operational evidence rather than presented as proof of
future staffing or response speed.

Provider navigation and schedule load safety are covered by Bugs UX-075 through
UX-079. External maps remain an honest handoff to Google Maps or Waze; the app
does not claim an in-app route, ETA, traffic feed, or map provider integration.

Provider certification remediation is covered by Bugs UX-091 through UX-104.
The provider can add, edit, replace, and remove evidence without receiving a
public storage URL. Public discovery receives only active, verified, unexpired
certification claims, while Provider 360 receives a private authenticated
document link and an explicit review decision. A provider edit always clears
the prior verification so changed evidence cannot retain an old trust badge.

Provider application and media remediation is covered by Bugs UX-110 through
UX-122. Application submission does not grant provider authority; the admin
decision is the role source of truth. Private onboarding objects are bound to
the applicant and represented as secure on-file evidence after upload.
Portfolio objects use a separate public, provider-owned path, require a written
customer-consent affirmation, and record the decision time. Provider 360 now
shows support staff the same published images and their consent evidence.

Provider checklist persistence is covered by Bugs UX-147 through UX-150. The
provider toggle now sends the server's real `completed` field, uploaded booking
proof is attached to the exact checklist item, and a later read returns its real
storage URL rather than a fabricated URI. Photo-required work is labeled before
the provider tries to finish it, and the same screen has an explicit bounded
tablet/desktop workspace. The separate Report Issue action remains on E05's
honest-error band-aid until Ken chooses whether to build or remove that feature.

Provider job evidence capture is covered by Bugs UX-151/152/192. The dedicated
photo screen no longer routes new evidence through the deprecated generic
upload and legacy booking arrays; it uses the same authorized canonical
`booking_photos` records as checklist evidence and completion. Partial batches
state how many photos saved and failed, remove only saved selections, retain
failed photos for immediate retry, and tablet/desktop now separate the
before/after phase guidance from the evidence area. Real browser file-upload and
native camera evidence remain deployment/device checks rather than claimed here.

Provider completion evidence is covered by Bugs UX-153/154. Existing canonical
after-photos now count toward the server's two-photo completion rule, the screen
prevents duplicate local uploads when a later step fails and is retried, and the
tablet/desktop layout separates evidence from readiness. E19 records a separate
trust blocker: the provider-session `customer_acceptance` upload stores the
provider as signer, so that bitmap must not be presented as verified customer
identity evidence until Ken selects the customer-controlled or witnessed model.

Active-job execution is covered by Bugs UX-155-157. The in-progress primary
action now opens the completion evidence workflow instead of attempting a status
mutation that usually fails checklist/photo gates, and an address-only booking
shows no fabricated map center or pin. Tablet/desktop place the map or honest
address state beside the provider's operational controls.

Recurring scheduling is covered by Bugs UX-160-173. Customer creation now uses
the canonical fixed-price/category contract, shows the server total and preferred
time, and gives tablet/desktop a real preview workspace. Skip-next is atomic and
limited to the next occurrence; instance history opens the generated booking and
uses that booking's status. Bugs UX-189-191/196 make E20's containment explicit:
token activation returns 503 before storage, the scheduler never calls the
defective charge service even for a legacy enabled row, and API responses hide
reusable payment/source IDs. New series explicitly store auto-charge off and
the database default is false for future rows. Every generated booking requires manual payment;
this remediation makes no claim that unattended charging is available or safe.

Private export and account-management remediation is covered by Bugs UX-174-183/186-188/193-195.
Customer and provider archives use owned five-minute download links, the nginx
public upload route rejects the private-artifact namespace, expired artifacts are
physically deleted, interrupted builds can be reclaimed after a one-hour lease,
failed post-storage writes remain visible to cleanup, streaming and cleanup reject
non-private database keys, and JSON/CSV cover owned role-specific records. Both personas
have bounded tablet/desktop history/action workspaces. Deletion retries interrupted
work and revalidates active bookings, disputes, and balances. Both account
workspaces, Data Rights, and Help now state the implemented cooling-off,
deactivation/anonymization, and possible required-record retention behavior.
E21 correctly blocks any promise of complete erasure until the business has an
approved retention matrix.

The AML review finding is covered by Bugs UX-184/185. The production database had
no payout rows and no configured threshold row during the read-only check. The
new audited setting defaults to ₱500,000 and can be made stricter, while runtime
clamping prevents an unsafe larger value from bypassing the internal hold. Admin
shows the captured threshold and states that the hold is an internal control, not
by itself a statutory AML determination or filing.
