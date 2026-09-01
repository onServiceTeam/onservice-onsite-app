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

A read-only production recheck on 2026-08-25 found the same 10 rows, the same 2026-06-16 through 2026-06-30 date range, and no later submissions. All 10 remain `new`. No tester payload, screenshot, contact value, or production row was changed during that check.

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
| Payment method trust, logos, fees, and recovery are unclear | Payment methods, wallet top-up, checkout, receipt | Financials, notification templates, support | Confirmed launch blocker: the API constructed an undocumented hosted URL from a Payment Intent client key; the URL shape returns 404 | E14 containment now rejects external authorization before effects and disables those customer methods. Existing wallet balance remains local/atomic. Replacement still requires approval and sandbox evidence. |
| Wallet top-up QR did not return cleanly | Wallet top-up, wallet, payment failed | Financials, Support Queue | Confirmed: production has 12 top-up intents and all 12 remain `awaiting_payment`; there is no valid return route or top-up status endpoint | The invalid form/QR control is removed and the API fails closed before effects. Historical attempts are preserved; an approved PayMongo flow and test-mode end-to-end validation remain required. |
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
7. Keep every earlier decision visible in the admin case instead of replacing the only operator-visible note.

The 2026-08-25 read-only production recheck found 10 submissions, all still `new`, with 5 logged issue items and 0 assigned owners across customer, provider, and admin areas. No feedback content or personal data was printed or changed. Bugs UX-416/417/423 now expose the append-only decision history and reject no-op duplicate decisions; assigning and closing the existing submissions remains an operational support-team task.

The secret export remains available for private analysis and backup. It is not the day-to-day company workflow.

## Service-scope verification and remediation

The first tester-backed product finding was checked against production data instead of inferred from UI copy. On 2026-08-24 the catalog contained 29 active subcategories and every one had a blank description: 17 fixed-price services and 12 quote services. No service add-ons were configured. Category descriptions were present, but they do not define what an individual service includes, excludes, or delivers.

No service scope was invented. Until the business publishes exact copy, customer category, search, provider profile, fixed-price configuration, and quote-request screens now show a pricing-aware fallback and carry the same scope state through the booking draft. The fallback tells customers to confirm included work inside onService; it does not promise a result or turn provider negotiation into the source of truth.

Catalog operations now shows active, missing-scope, and scope-ready counts; a dedicated missing-scope queue; a visible warning on incomplete services; and an exact customer-facing preview. New active services and edits to active legacy services require at least 30 trimmed characters of customer scope. That threshold prevents blank or token text but is not proof that the copy is commercially or legally complete. Ordinary admins can inspect catalog evidence and the customer preview but cannot see superadmin-only mutation controls that the API would reject.

Behavior is covered by Bugs UX-043 through UX-049. Provider-profile regressions prove hourly booking uses the canonical catalog rate rather than a provider's generic base price and quote services never display a legacy provider base price as the booking price. Catalog visual evidence covers populated, ordinary-admin read-only, missing-scope, customer-preview, loading, empty, and error states at 1280, 1440, and 1920 pixels. The remaining business task is to author and approve the 29 exact scopes, including important limits and any preparation the customer or provider must make.

## Next verification order

1. Provider service selection now uses catalog-owned pricing while personal fixed-price editing remains held by E16. The provider Stitch re-audit covers all 62 provider/onboarding/staff route files through Bugs UX-353-371; native camera evidence remains F#3/device work, and authenticated browser upload/status verification still requires a controlled signed-in session.
2. PayMongo hosted checkout and top-up recovery after E14 is decided and test keys are available.
3. Customer booking form/review/search/referral, customer provider-detail/Suki/evidence/change orders, provider business management, and provider-staff field work have now been traced through Bugs UX-260-372. Staff assignments require approved membership, checklist/closeout stay in staff routes, and the nonfunctional staff customer-chat action is replaced by booking support while D30 defines conversation access. Provider chat has rendered text and uploaded-photo send-path evidence; two-device delivery remains an F#3 release exercise. The next screen-by-screen stage is every customer route, followed by the suspicion-first Admin overhaul. Direct dispute settlement remains fail-closed under OPS-229/E18/E24.
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

The 2026-08-24 continuation also corrected Provider 360's service-price linkage:
support now sees the provider's actual services and the same catalog-backed
customer prices used at booking, not dormant provider-entered values. External
payments and top-ups fail before effects, paid webhooks commit intent plus
booking/escrow or top-up/ledger atomically, malformed paid events without a
gateway payment ID fail closed, and the production read-only reconciliation
found no historical partial rows requiring repair.

The notification-settings follow-up also closed an account-isolation issue not
explicitly named in the tester rows but directly relevant to safe customer/provider
testing on shared devices. A push token now has one account owner, logout attempts
an authenticated detach, app launch/account changes repair ownership, terminal
refresh failure updates live auth state, and account changes clear cached server
data. The production read-only check found zero duplicated token owners and made
no data changes.

## 2026-08-31 customer source and browser recheck

The generated local inbox was read from first line to last line again: seven
submissions, four structured issue rows, and six referenced screenshots. One
row is stress/junk input, one is an incomplete idea, and two are usable defect
rows; one of those defect rows describes two separate failures. The later
production trace still records ten submissions and five structured issue rows,
all left `new` at that read-only checkpoint. Raw submissions were used as
evidence and were not treated as trusted implementation instructions.

The reported desktop blank page after **Email support** now has two explicit
guards. Help already keeps web users in the app and displays
`support@onservice.ph`; Bug UX-661 closes the remaining Terms-page `mailto:`
path. Bug UX-662 applies the same browser-safe rule to the `tel:911` action
while preserving the native dialer. The customer browser audit passed both
pages in populated and forced-failure states at 768, 1024, and 1366 pixels.

The reported booking-submission uncertainty, location failure, payment dead
end, missing support path, and provider communication concerns were rechecked
through the complete 48-route customer matrix and the sequential fixed-price
and quote-request flows. Bugs UX-606 through UX-660 add fail-closed draft and
route guards, verified booking/payment/dispute/tip state, explicit source
failure recovery, canonical support/evidence routes, server-side history
filters, and corrected customer guidance. The final evidence is summarized in
`docs/audits/CUSTOMER-DESKTOP-LINKAGE-AUDIT-2026-08-31.md`.

Suggestions for WhatsApp/provider phone disclosure were not implemented
because they conflict with the current in-app communication record and contact
privacy model. New services, fee levels, and category-grouping suggestions are
business/catalog inputs and were not hardcoded from individual tester answers.
Admin requests for separated customer/provider triage, group messaging,
reminders, top-provider reporting, refund safeguards, and clearer proof review
remain inputs to the suspicion-first admin stage.

## 2026-09-01 private-cache record trace

The seven-record local cache was traced one record at a time with tester names,
contacts, opaque record IDs, and raw wording excluded from this repository. The
labels below exist only to make the audit repeatable; they are not production
identifiers.

| Cache label | Evidence classification | Customer/provider implication | Admin, support, and company implication | Current disposition |
| --- | --- | --- | --- | --- |
| `CACHE-01` | Deliberate oversized stress/junk submission with one issue row and unrelated images | No trustworthy customer/provider product finding | Proves intake abuse, evidence-quality, and dismissal controls matter | Bug UX-879 now rejects over-limit fields instead of silently truncating and storing polluted research. The existing cached row remains historical evidence for an operator to dismiss with a note. |
| `CACHE-02` | Sparse mixed-role response with an incomplete idea row naming an active-booking location but no problem, expected result, or reproduction | Directional request for a more modern customer presentation; ratings alone do not prove a defect | No action can be assigned from an empty issue description | Retain as low-confidence design signal. The later customer/provider Stitch audits, not this row alone, are the implementation evidence. |
| `CACHE-03` | Provider/admin questionnaire with no structured issue row | Provider asks to see requested work first and raises contact, proof, service, and promotion ideas | Admin asks for inbox-first work, customer/provider separation, reminders, group messaging, online/nearest/top-provider views, proof review, and refund safeguards | Support separation, action queues, proof workspaces, and reasoned money confirmations are implemented or held in their canonical audits. Contact disclosure is rejected by the privacy model. Group messaging, automation, and provider ranking remain unapproved until audience consent, source, freshness, metric, and audit behavior are defined. |
| `CACHE-04` | Customer questionnaire with no structured issue row | Wants obvious Home/Profile/booking tracking, highly rated provider discovery, provider contact, late-arrival handling, service grouping, and additional services | Requires navigation, provider eligibility/reviews, support/late-job handling, catalog governance, and contact privacy to agree | Canonical customer navigation, booking tracking, reviews, and in-app support are present. Off-platform contact is not added. Service and price ideas remain catalog/business inputs, not hardcoded changes. |
| `CACHE-05` | One screenshot-backed customer defect row: Email support opened a blank desktop page | Browser support handoff failed; questionnaire also raises refund wording, support chat, fee clarity, notifications, grouping, and visual direction | Support must preserve context; legal/refund and fee copy must match the real money path | Help already stays in-app on web and Bug UX-661 closes the remaining Terms `mailto:` path. Support entry points are linked. E09/F#10 retain refund/legal wording authority; fee levels and catalog grouping remain business decisions. |
| `CACHE-06` | One screenshot-backed customer row containing two defects: uncertain booking submission/duplicate appearance and missing address suggestions | Also reports browser camera wording, text contrast, structured job detail, payment trust, provider chat/support, alerts, service grouping, and new-service ideas | Connects Booking 360, Audit Log, Service Areas, Catalog, Support, Communications, Notifications, and Financials | Current route/state/idempotency, address, browser picker, contrast, support, evidence, and confirmation behavior is covered by the named UX regressions in this trace and the 48-route customer audit. D24 still holds paid remote-address autocomplete; E14 holds external payment; new fields/services/prices require canonical product/catalog decisions. |
| `CACHE-07` | Thin positive customer response with no issue row and mixed customer/provider answers | Mentions receipts, speed, convenience, opportunity, and a car-wash service idea | Too little evidence for a screen or policy change | Retain as low-confidence directional input only. Do not derive a product claim, service launch, price, or provider policy from it. |

The local screenshot directory contains nine filenames, while the seven-record
JSON references six. The additional three files are not evidence for any cached
row and were not counted as issue evidence. Their production relationship and
retention cannot be inferred from this workstation snapshot; the aggregate
server inventory in the E52 privacy runbook remains required when E32 access is
restored. The six referenced images retain the earlier visual classifications
in this document. The OneDrive placeholders did not hydrate reliably during
this recheck, so they are not falsely claimed as newly inspected.

Bug UX-879 also aligns the public form with the API's existing text limits. The
browser prevents ordinary typing beyond those boundaries, and the API rejects
oversized direct requests with a clear error. Exact-boundary text is preserved
unchanged. This closes the stress-input storage defect without deleting or
rewriting historical research.
