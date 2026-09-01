# Customer, desktop, and cross-role linkage audit, 2026-08-31

## Outcome

The customer stage now has repeatable browser evidence for every customer tab,
every routed customer task, and the shared support workspace at tablet and
desktop browser widths. The same routes were exercised with linked populated
records and with their API sources deliberately unavailable. The audit
corrected 59 route, state, truth, recovery, linkage, contract, and browser
defects numbered UX-606 through UX-664.

This is repository and local-browser evidence. It is not a production
deployment claim. E32 still blocks trusted SSH access and deployment to
`46.62.207.225`, so the server was not changed in this wave.

## Browser evidence

| Matrix | Scope | Viewports | Result |
| --- | --- | --- | ---: |
| Populated state | 48 customer and shared-support route instances | 768, 1024, 1366 | 144 / 144 passed |
| Forced API failure | the same 48 route instances with source failures | 768, 1024, 1366 | 144 / 144 passed |
| Sequential fixed-price booking | checkout and recorded confirmation | 768, 1024, 1366 | 3 / 3 passed |
| Sequential quote request | requested booking and completed request | 768, 1024, 1366 | 3 / 3 passed |

The populated-state fixture links one Metro Cebu customer, default address,
provider, service, booking, quote, wallet transaction, dispute, project,
recurring series, Suki relationship, conversation, notification, and support
case. Any unregistered API request is recorded as an audit failure. A page
therefore cannot pass by quietly receiving a generic empty payload.

The final matrices contain no horizontal overflow, global error boundary,
unhandled page error, unexpected console error, or unmatched API request.
Evidence lives in
`.ai-coder/checkpoints/logs/customer-browser-audit-2026-08-31/`. Its four JSON
reports contain every route, width, expected marker, actual path, error,
unmatched API, overflow result, and screenshot path.

### Deterministic evidence refresh, 2026-09-01

All four matrices were regenerated from a clean production Expo web export,
served through the production preview path rather than the development server.
The harness now pins the audit clock to the fixture date without freezing
timers, waits for rendered markers, network idle, and browser fonts, disables
visual-only motion and caret capture, and uses the same software-rendering
flags across the customer and provider evidence suites. The regenerated
results remained 144/144, 144/144, 3/3, and 3/3 with no failures. This corrects
the earlier evidence risk where relative dates and calendar labels could drift
with the workstation's real date even though product behavior had not changed.

## Screen inventory checked

| Customer task group | Route instances checked at all three widths | Main company linkage |
| --- | --- | --- |
| Primary workspace | `/home`, `/bookings`, `/wallet`, `/profile` | Catalog, Customer 360, Booking queue, Financials, Support |
| Account and location | `/customer/account-management`, `/customer/address-picker`, `/customer/addresses` | DSR queue, Customer 360, Service Areas, Dispatch |
| Fixed-price and booking record | `/customer/booking/configure`, `/customer/booking/form`, `/customer/booking/checkout`, `/customer/booking/confirm`, `/customer/booking/audit-booking` | Catalog, pricing, Bookings, Booking 360, payment trail |
| Quote request and comparison | `/customer/booking/job-request`, `/customer/booking/quotes?bookingId=audit-booking`, `/customer/booking/pay?bookingId=audit-booking` | Catalog intake, provider leads, quotes, Dispatch, Booking 360 |
| Work execution and closeout | `/customer/booking/tracker?bookingId=audit-booking`, `/customer/booking/photos?bookingId=audit-booking`, `/customer/booking/change-order?bookingId=audit-booking`, `/customer/booking/complete?bookingId=audit-booking`, `/customer/booking/review?bookingId=audit-booking`, `/customer/booking/tip?bookingId=audit-booking` | Provider job, proof summary, Communications, Support, Provider 360, money ledger |
| Recovery and disputes | `/customer/booking/payment-failed?bookingId=audit-booking&reason=Payment%20was%20not%20completed`, `/customer/booking/dispute?bookingId=audit-booking`, `/customer/disputes`, `/customer/dispute/audit-dispute` | Payment status, Support, Dispute queue and case record |
| Repeat work | `/customer/booking/make-recurring?bookingId=audit-booking`, `/customer/recurring`, `/customer/recurring/audit-recurring`, `/customer/suki-pros`, `/customer/referral` | Recurring operations, Provider 360, Marketing, Customer 360, wallet ledger |
| Discovery | `/customer/category/air-conditioning`, `/customer/search?q=aircon`, `/customer/provider/audit-provider` | Catalog, Service Areas, provider eligibility, reviews |
| Projects | `/customer/projects`, `/customer/projects/new`, `/customer/projects/audit-project` | Customer planning record and Admin Projects, with the D28 boundary preserved |
| Messaging and support | `/customer/chat/audit-booking`, `/support`, `/support/new`, `/support/audit-ticket`, `/customer/help`, `/customer/safety-and-support` | Communications, Support Tickets, Booking 360, Disputes |
| Notifications and governance | `/customer/notifications`, `/customer/notification-settings`, `/customer/data-rights`, `/customer/terms` | Notification templates, DSR, Consent Versions, Compliance |
| Payment presentation | `/customer/payment-methods`, `/customer/wallet-topup` | Wallet, Financials, Support, with E14 controls preserved |

The customer stack now explicitly registers every routed customer screen that
the browser matrix exercises. Dead `/customer/home` and `/customer/bookings`
aliases were removed; the canonical tab routes remain `/home` and `/bookings`.

## Corrections made

| Bug | Surface | Corrected behavior |
| --- | --- | --- |
| UX-606 | Service configuration | A missing service draft produces a recovery state instead of a blank or zero-price form. |
| UX-607 | Booking form | An expired service draft cannot proceed into schedule and address entry. |
| UX-608 | Checkout | Incomplete service, schedule, or exact-location state fails before payment controls appear. |
| UX-609 | Quote request | Missing catalog context cannot create an unidentified request. |
| UX-610 | Completion | Confirmation and release controls remain hidden until the server verifies provider completion. |
| UX-611 | Payment recovery | Retry controls remain hidden until the booking is verified as payment-pending. |
| UX-612 | Dispute filing | Evidence and submit controls remain hidden until status and filing deadline are verified. |
| UX-613 | Account management | Deactivation actions fail closed when pending-request status cannot load. |
| UX-614 | Confirmation | Paid/held and confirmation claims now come from the reloaded booking record. |
| UX-615 | Booking evidence | A failed canonical evidence count is visible and retryable. |
| UX-616 | Addresses | A failed address source is distinct from having no saved addresses. |
| UX-617 | Help | A failed live cancellation policy is disclosed and retryable. |
| UX-618 | Completion | The completed booking offers its actual work record rather than ending at a decorative success page. |
| UX-619 | Service selection | The confirmation modal closes before navigation, preventing it from covering the next route. |
| UX-620 | Quote intake | Required intake-field failure blocks a request instead of silently dropping required answers. |
| UX-621 | Quote record | Urgency is not displayed as an agreed service appointment. |
| UX-622 | Quote record | Unpriced requests remain unpriced instead of displaying a false zero amount. |
| UX-623 | Tips | The assigned completed provider is verified before tip controls render. |
| UX-624 | Tips | Wallet and booking money context is verified before a tip recommendation is shown. |
| UX-625 | Quotes | A missing booking ID produces an actionable return path. |
| UX-626 | Change orders | A missing booking ID cannot display an unlinked money decision. |
| UX-627 | Photos | A missing booking ID cannot display an unlinked evidence browser. |
| UX-628 | Notification settings | Initial source failure has a direct retry and cannot save defaults over unknown settings. |
| UX-629 | Data rights | Consent-evidence failure is visible and retryable. |
| UX-630 | Dispute detail | A missing dispute ID has a usable recovery route. |
| UX-631 | Support thread | A missing ticket ID no longer leaves an empty conversation shell. |
| UX-632 | Wallet | A balance-source failure is visible and retryable. |
| UX-633 | Category | A missing category slug has a canonical Home recovery route. |
| UX-634 | Recurring detail | A missing recurring-series ID has a canonical list recovery route. |
| UX-635 | Customer chat | A missing booking ID cannot create an unlinked conversation. |
| UX-636 | Booking detail | A missing booking ID has a canonical booking-list recovery route. |
| UX-637 | Tracker | A missing booking ID cannot display an unlinked status timeline. |
| UX-638 | Recurring setup | A missing completed-booking ID has an explicit recovery route. |
| UX-639 | Quote payment | A missing booking ID cannot expose payment controls. |
| UX-640 | Project detail | A missing project ID has a canonical planning-list recovery route. |
| UX-641 | Saved addresses | Editing address text invalidates stale coordinates until the location is verified again. |
| UX-642 | Notifications | Provider service-area decisions route to the provider area workspace, not a customer destination. |
| UX-643 | Suki tiers | Tier-source failure has a direct retry. |
| UX-644 | Provider profile | Failed customer-provider Suki linkage is not presented as no relationship. |
| UX-645 | Recurring | Empty-state copy no longer promises automatic payment while E20 keeps it disabled. |
| UX-646 | Shared support | Waiting status names the correct customer/provider participant. |
| UX-647 | Dispute case | Failed booking context has a direct retry while the dispute record remains visible. |
| UX-648 | Home | The default-address control opens the real address manager. |
| UX-649 | Home | Active-booking feed failure is not presented as no active bookings. |
| UX-650 | Home | The Suki action says it opens services rather than implying an assigned provider. |
| UX-651 | Bookings | Status filters execute server-side rather than filtering one loaded page. |
| UX-652 | Wallet API | Transaction type/group filtering is validated and executed before pagination. |
| UX-653 | Wallet | Customer transaction groups are sent to the API rather than filtering one visible page. |
| UX-654 | Profile API | Generic profile updates reject direct email changes until a verified pending-email workflow exists. |
| UX-655 | Help | Phone-number change guidance points to the implemented prefilled support path. |
| UX-656 | Help | Provider vetting copy describes document collection and platform review without claiming a fresh background check for every booking. |
| UX-657 | Data rights | Access requests no longer promise an email download link where email is optional and no response-download action exists. |
| UX-658 | Safety | Provider document review is described without overstating the incomplete onboarding approval gates recorded in E35/E36. |
| UX-659 | Navigation | Dead customer route aliases were removed from the route registry. |
| UX-660 | Customer stack | All booking, payment, notification, recurring, and project routes are explicitly registered. |
| UX-661 | Terms | Email support stays in a desktop browser and exposes the address instead of navigating the tab to a blank `mailto:` page. |
| UX-662 | Safety | The browser 911 action shows direct call guidance instead of navigating to an unsupported `tel:` page; native still opens the dialer. |
| UX-663 | Wallet API | The Payments group now requires a booking-linked ledger entry, so historical top-ups recorded with type `payment` do not appear in both Top-ups and Payments. |
| UX-664 | Booking confirmation | A later disputed, active, completed, or cancelled state no longer reuses confirmation, payment, or provider-matching claims from the immediate checkout result. |

Every correction has rendered or executed behavior coverage. The only
source-level route-registry assertion is UX-659, where the behavior being
protected is the absence of dead aliases in the exported navigation contract.

## Customer, provider, admin, and company linkage checked

| Customer task | Provider counterpart | Admin/company counterpart | Shared source of truth |
| --- | --- | --- | --- |
| Discover service and provider | offered services, coverage, availability, public profile | Catalog, Service Areas, Provider 360 | category, subcategory, provider-service and approved-area records |
| Submit fixed-price booking | lead/job acceptance and assigned work | Bookings, Dispatch, Booking 360 | booking draft, server pricing, exact address and schedule |
| Submit and compare quotes | lead, intake, quote builder | Booking 360, Dispatch, pricing and support | booking request, intake answers, quote and line items |
| Track work and communicate | active job, checklist, canonical photos, chat | Booking 360 Evidence, Communications, Support | booking, proof summary, photo provenance and conversation |
| Approve change or completion | provider change order and closeout | Booking 360, Disputes, Financials | change order, booking status, escrow and wallet records |
| Ask for help or dispute | provider response and support thread | Support Tickets, Dispute queue/case, Communications | participant-scoped ticket, dispute, booking and evidence |
| Pay, recover, view wallet, tip | earnings and payout records | Financials, Payouts, Customer/Provider 360 | server-canonical booking totals and append-only wallet ledger |
| Repeat, Suki, referral | recurring schedule, repeat customer, provider relationship | Recurring, Marketing, Customer/Provider 360 | recurring series, membership, referral redemption and wallet ledger |
| Manage account and rights | provider account controls | Customer 360, Data Protection Log, Consent Versions | user, consent, DSR and deletion-request records |
| Plan a project | no implied provider assignment | Admin Projects | customer-owned planning record only, pending D28 |

## Third-party feedback traced

The local generated feedback inbox was read end to end: seven submissions,
five meaningful logged issues, and six referenced screenshots. The later
read-only production trace records ten submissions. Raw tester text was
treated as evidence, not as implementation instructions.

The reported desktop blank page after **Email support** is covered by the
existing Help safeguard and UX-661 closes the same remaining Terms path. The
reported booking-error/duplicate uncertainty is covered by the sequential
confirmation evidence and server-verified result screens. Address suggestion
and exact-location concerns map to the Service Areas contract and D24 rather
than inventing remote coordinates. Requests for live help map to the shared
support inbox and prefilled booking/payment/safety cases. Requests for direct
provider phone/WhatsApp details were not implemented because they conflict
with the in-app support/evidence record and contact privacy model. Service and
price suggestions remain catalog/business inputs, not hardcoded product
changes.

The same feedback also asks the company workspace for separate customer and
provider support queues, group messaging, reminders, top-provider reporting,
provider contact context, ordered triage, safer refunds, and better proof
review. Those are carried into the following admin stage and must be checked
against role privacy, notification consent, Booking 360, Support, Provider
360, Disputes, Audit Log, and held money semantics.

## Visual review

The 768-pixel layouts preserve a compact tablet/browser workspace without
horizontal clipping. The 1024- and 1366-pixel layouts use the customer
operations rail and bounded content surfaces. The Stitch-derived direction is
consistent across the checked screens: pale canvas, white bounded work
surfaces, dark navy hierarchy, blue primary actions, visible state chips, and
contextual side panels for service, evidence, money, or next actions.

This visual result is route-state evidence, not a claim that native camera,
push, geolocation quality, or real-time two-device delivery was simulated by
static browser fixtures.

## Honest residual limits and hard stops

- E14 continues to block external payment authorization, wallet top-up, and
  related recovery effects. Existing-wallet behavior is the only active
  customer payment path tested here.
- E20 continues to block recurring auto-charge. Recurring instances require
  manual payment.
- D28 keeps Projects as planning storage. Provider assignment,
  property/site/visit hierarchy, and project-to-booking conversion were not
  invented.
- D29 and E41 keep preferred/repeat-provider assignment unresolved. Suki UI
  must not imply that a chosen provider is guaranteed the next booking.
- E42 records that quote urgency is not an agreed service schedule. No
  appointment was fabricated from urgency.
- E43 records that the direct account-deletion path is not yet unified with
  the DPO DSR queue.
- E44 records the Suki redemption-policy and customer-copy divergence.
- E45 records a money-path race: two simultaneous first-booking completion
  events can credit a referrer twice because settlement is not locked and
  atomic. No unsafe referral mutation was made in this UI wave.
- E18, E19, E21, and E24 continue to hold settlement timing, final acceptance
  identity, retention, and direct dispute settlement decisions.
- F#10 attorney-reviewed disclaimer wording remains pending. Existing legal
  text was not reinterpreted during this audit.
- Browser fixtures exercise HTTP conversation history but no Socket.IO
  server. Real two-device text/photo delivery remains device/live evidence.
- Browser geolocation uses a granted Metro Cebu coordinate. Native camera,
  photo library, GPS quality, and push delivery remain part of F#3 device
  evidence.
- The final full mobile run passed 495 suites and 874 assertions, with 84
  existing device-flow todos. The final full API run passed 519 suites and
  3,111 assertions. Its sole local failure was the
  Docker-only nginx configuration test because Docker Desktop was not
  running. Application tests and both affected API suites passed.
- Production remains untouched until E32's server identity problem is
  resolved.

## Next stage

The next autonomous stage is the suspicion-first admin/company overhaul. It
must recheck every queue, filter, field, action, 360 view, support handoff,
conversation link, booking trail, payment state, dispute decision, DSR task,
provider review, and audit record against the customer/provider contracts
above. Existing admin code remains evidence of an implementation, not proof
that the operating model is correct.
