# Provider, staff, and onboarding linkage audit, 2026-08-31

## Outcome

The provider stage now has repeatable browser evidence for its owner workspace,
assigned-team-member workspace, shared support workspace, and the sequential
provider application flow. The audit corrected 27 user-facing truth,
recovery, contract, and accessibility defects numbered UX-579 through UX-605.

This is repository and local-browser evidence. It is not a production
deployment claim. E32 still blocks trusted SSH access and deployment to
`46.62.207.225`, so the server was not changed in this wave.

## Browser evidence

| Matrix | Scope | Viewports | Result |
| --- | --- | --- | ---: |
| Populated state | 45 provider-owner routes plus 8 staff/shared-support route instances | 768, 1024, 1366 | 159 / 159 passed |
| Forced API failure | the same 53 route instances with source failures | 768, 1024, 1366 | 159 / 159 passed |
| Sequential application | role, categories, service area, vetting, documents, selfie, agreement, pending review, application status | 768, 1024, 1366 | 27 / 27 passed |

The populated-state audit uses linked Metro Cebu records for one provider,
customer, booking, team member, payout, dispute, conversation, and support
case. Any unregistered API request fails the audit. It therefore cannot pass by
quietly rendering an empty screen after receiving a generic fixture.

The sequential application audit starts with a customer identity at every
viewport and executes the actual draft flow. It selects a catalog category,
captures a service-area geolocation, completes required vetting fields,
uploads three private document records and one selfie record, accepts the
agreement, submits the application, and reads the recorded pending status.

Evidence lives in
`.ai-coder/checkpoints/logs/provider-browser-audit-2026-08-31/`. The JSON
reports contain every path, expected marker, overflow result, unmatched API,
console error, and screenshot path. Contact sheets provide one-page visual
review at each width.

### Deterministic evidence refresh, 2026-09-01

The populated, forced-failure, and onboarding matrices were regenerated from
a clean production Expo web export served through the production preview path.
The harness now pins the fixture clock without freezing timers, waits for the
expected rendered marker, network idle, and browser fonts, disables
visual-only motion and caret capture, and uses reduced-motion plus a consistent
software-rendering configuration. The populated audit also supplies the real
commission-preview and provider job-request response shapes instead of stale
generic fixtures. The regenerated results remained 159/159, 159/159, and
27/27 with no failures.

A repeat six-capture probe isolated the last raw-pixel variance to browser
anti-aliasing: five images were byte-identical and one 768-pixel Job Detail
capture changed 57 of 691,200 pixels, each by one colour value on rounded card
edges. Its path, text, API coverage, overflow result, and report were
unchanged. This is recorded as renderer noise, not a changing application
state or a hidden functional pass.

## Corrections made

| Bug | Surface | Corrected behavior |
| --- | --- | --- |
| UX-579 | Provider dashboard | A failed active-job preview is no longer presented as “No active jobs.” |
| UX-580 | Earnings | Loading summary data no longer confirms a false zero. |
| UX-581 | Earnings | Trend failure has a direct browser retry rather than unsupported pull-only guidance. |
| UX-582 | Calendar | A source failure is distinct from a day with no jobs. |
| UX-583 | Services | A failed provider-service feed is distinct from no offered services. |
| UX-584 | Services | Category and subcategory failures expose their own retries. |
| UX-585 | Account management | Deactivation controls remain hidden until pending-deletion status is confirmed. |
| UX-586 | Job detail | A dispute lookup failure is visible and retryable instead of hiding the case path. |
| UX-587 | Job photos | New uploads pause when canonical evidence history cannot be verified. |
| UX-588 | Completion | Completion controls stay hidden until the booking record is verified. |
| UX-589 | Job detail | Proof-summary failure has a direct retry. |
| UX-590 | Team | Roster/assignment failures no longer become zero-member or zero-assignment claims. |
| UX-591 | Chat | Message-history failure is not presented as a new empty conversation. |
| UX-592 | Active job | Staff-roster failure is shown instead of silently removing assignment controls. |
| UX-593 | Job detail | Commission failure no longer displays an unverified net amount. |
| UX-594 | Quote builder | Template-feed failure is not presented as no matching templates. |
| UX-595 | Quote builder | Commission failure has a direct retry. |
| UX-596 | Change order | Commission failure has a direct retry. |
| UX-597 | Completion | Earnings-preview failure is explicit and retryable. |
| UX-598 | Withdrawal | Saved payout-detail failure is explicit while the editable manual form remains usable. |
| UX-599 | Withdrawal | Recent-earnings failure has a direct retry. |
| UX-600 | Earnings | Transaction failure does not hide a valid wallet and summary. |
| UX-601 | NBI banner | The component reads the production API envelope, so required expired/missing clearance warnings cannot disappear. |
| UX-602 | Quote templates | Failed offered-service choices have a direct desktop retry. |
| UX-603 | Chat | Failed booking context has a direct desktop retry while conversation history remains usable. |
| UX-604 | Shared support | Failure copy now points to the implemented retry button instead of claiming nonexistent pull refresh. |
| UX-605 | Provider application selfie | Browser upload is a named button with disabled/busy accessibility state and a tested private-upload path. |

Every correction has its own rendered behavioral test. No test asserts merely
that a file or bug label exists.

## Cross-role linkage checked

| Provider or staff task | Customer counterpart | Admin/company counterpart | Shared record |
| --- | --- | --- | --- |
| Services, coverage, availability | discovery, address coverage, provider profile | Catalog, Service Areas, Provider 360 | catalog and provider-area records |
| Job requests and quotes | custom request and quote comparison | Bookings and Dispatch | booking, quote, intake, and pricing records |
| Active work, checklist, photos, completion | tracker, proof, change order, confirmation | Booking 360, Support, Communications | booking proof summary and canonical evidence |
| Chat and support | booking chat and shared support case | Communications and Support Tickets | conversation and support-ticket records |
| Earnings, withdrawals, payouts | paid/held booking and wallet | Financials and Payouts | wallet ledger, commission, payout request |
| Disputes and reviews | customer claim/evidence and review | Dispute 360 and Provider 360 | participant-scoped dispute/review records |
| Team assignments | named assigned worker on service record | Provider 360 and Staff & Roles | approved membership and booking assignment |
| Provider application | customer account retains access during review | Provider 360 verification queue | application, private uploads, and decision status |

The provider application remains a reviewed extension of a customer account.
Submission does not promote the local role. Only the recorded admin decision
and refreshed canonical session can activate the provider workspace.

## Visual review

The 768-pixel layouts use the compact tablet/browser navigation and preserve
usable cards, controls, and two-column workspaces where space permits. The
1024- and 1366-pixel layouts use the role-specific operations rail. The
Stitch-derived direction is consistent across the reviewed screens: pale
canvas, white bounded work surfaces, dark navy hierarchy, blue primary
actions, visible status chips, and contextual right-side panels for evidence,
money, or next actions.

No horizontal overflow, blank document, global error boundary, unhandled page
error, unexpected console error, or unmatched API path remained in the final
browser matrices.

## Checkpoint PV-01: provider availability max-length regression is behavior-tested

The provider availability reason-limit regression had been checking the screen
source for `maxLength={500}`. It now renders the actual provider availability
screen, opens the Date Overrides form, and verifies the real browser input
exposes `maxlength="500"`, matching the API validator. The test changes no
availability record and does not submit an override.

Focused verification passes 1 mobile test file and 1 test; mobile TypeScript
and targeted ESLint pass. This is local test-quality evidence only. E32, E72,
and E73 remain in force.

## Checkpoint PV-06: provider onboarding document limits are behavior-tested

The provider onboarding metadata regression had been reading the documents
screen source for the NBI expiry and government-ID `maxLength` props. It now
renders the actual tablet/browser verification-document workspace and checks
the two mounted fields expose `maxlength="10"` and `maxlength="64"`, matching
the server validators. The test does not upload documents or advance the
application.

Focused verification passes 1 mobile test file and 1 test; mobile TypeScript
and targeted ESLint pass. This is local test-quality evidence only. E32, E72,
and E73 remain in force.

## Checkpoint PV-05: provider portfolio caption cap is behavior-tested

The provider portfolio caption regression had been checking source text for
`maxLength={500}`. It now renders the real portfolio workspace at tablet width,
opens the public work-photo form, completes the browser file-picker path, and
verifies the mounted caption input exposes `maxlength="500"`. The test stops
before consent, upload, or publication.

Focused verification passes 1 mobile test file and 1 test; mobile TypeScript
and targeted ESLint pass. This is local test-quality evidence only. E32, E72,
and E73 remain in force.

## Checkpoint PV-02: provider withdrawal destination cap is behavior-tested

The provider withdrawal destination-account regression had been checking the
withdrawal screen source for `maxLength={255}`. It now renders the actual
tablet/browser withdrawal workspace, selects GCash, and verifies the mounted
payout phone input exposes `maxlength="255"`, matching the server schema. The
test stops before a withdrawal request or confirmation dialog.

Focused verification passes 1 mobile test file and 1 test; mobile TypeScript
and targeted ESLint pass. This is local test-quality evidence only. E32, E72,
and E73 remain in force.

## Checkpoint PV-03: full mobile customer/provider regression remains green

After the provider test conversions, the complete mobile Jest inventory passes
549 suites and 926 assertions, with 84 existing device-flow todos. No new
device or live-server claim is made by this run; native camera, GPS quality,
push delivery, and Maestro baseline capture remain separately recorded work.

This verification changes no customer, provider, booking, payment, support,
audit, database, GitHub, master, or production record. E32, E72, and E73
remain in force.

## Checkpoint PV-04: provider completion notes are behavior-tested

The provider completion-notes regression had been checking the source for a
`maxLength` prop and counter expression. It now renders the actual completion
workspace, waits for the verified job record, checks the mounted notes input's
`maxlength="2000"`, enters a note, and verifies the visible character counter.
The test stops before uploading photos, capturing a signature, or submitting
the completion transition.

Focused verification passes 1 mobile test file and 1 test; mobile TypeScript
and targeted ESLint pass. This is local test-quality evidence only. E32, E72,
and E73 remain in force.

## Checkpoint PV-07: customer and provider help show the shared version

The help-version regression had been checking both help-screen source files
for an import and JSX expression. It now renders the customer and provider
help workspaces at desktop width and asserts that each visible footer matches
`platformConfig.appVersion`. This keeps the support handoff identifier the
same for customers, providers, and the profile surfaces.

Focused verification passes 1 mobile test file and 1 test; mobile TypeScript
and targeted ESLint pass. This is local test-quality evidence only. E32, E72,
and E73 remain in force.

## Checkpoint PV-08: provider checklist renders the server-defined service scope

The dead-checklist regression had been checking that an obsolete constant was
absent from the source. It now renders a provider desktop checklist response
with a plumbing-specific section and item, verifies those server values are
visible, verifies the old cleaning-only task is absent, and verifies the
canonical checklist request path. No checklist item is changed.

Focused verification passes 1 mobile test file and 1 test; mobile TypeScript
and targeted ESLint pass. This is local test-quality evidence only. E32, E72,
and E73 remain in force.

## Checkpoint PV-09: provider calendar preserves Manila boundary jobs

The calendar timezone regression had been checking implementation text only.
It now renders the provider desktop calendar with the device timezone set to
UTC, verifies the API range is anchored to the full Manila month, selects May
1, and verifies a 06:30 Manila appointment (April 30 UTC) appears on that
day. This protects the schedule-to-job linkage at month boundaries without
changing any appointment.

Focused verification passes 1 mobile test file and 1 test; mobile TypeScript
and targeted ESLint pass. This is local test-quality evidence only. E32, E72,
and E73 remain in force.

## Checkpoint PV-10: provider directions use the real job destination

The dead-ETA regression had been checking that obsolete style names were
absent from source. It now renders the provider desktop directions workspace
with a server-shaped booking, verifies the actual customer and address, opens
Google Maps with the canonical coordinates, verifies Waze is present, and
confirms no fabricated ETA is shown. No arrival or booking status is changed.

Focused verification passes 1 mobile test file and 1 test; mobile TypeScript
and targeted ESLint pass. This is local test-quality evidence only. E32, E72,
and E73 remain in force.

## Honest residual limits

- The fixture audit exercises HTTP conversation history but has no Socket.IO
  server. Real two-device text/photo delivery remains device/live evidence.
- Geolocation is a browser-granted Metro Cebu test coordinate. It verifies the
  flow and boundary logic, not a field device's GPS quality.
- Native camera and photo-library behavior remains part of F#3 device baseline
  work. Browser file selection is covered here.
- E14, E16, E18, E19, E21, E24, E25, F#10, and other recorded money/legal/data
  holds were not bypassed or reinterpreted by visual work.
- Expo/React Native dependency drift remains a separate compatibility wave.
  A forced bulk upgrade would be higher risk than the defects corrected here.
- Production remains untouched until E32's server identity problem is resolved.

## Next stage

The customer source-truth, populated-state, failure-state, fixed-price, and
custom-quote browser audit is now complete. The next autonomous stage is the
admin/company overhaul: recheck every queue, field, control, and 360 view
against the customer/provider records rather than treating the existing admin
surface as presumptively correct.
