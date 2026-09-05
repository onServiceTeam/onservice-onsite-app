# Provider application: compiled-browser recovery audit

Date: 2026-09-06, Asia/Singapore. Baseline:
`0b96afe5e4af75f3b94182ce00e01c03b7c118ae`, on the existing
`codex/financials-operator-truth` candidate branch. Scope is the six-step
applicant browser flow and its recovery controls, not complete provider/admin
acceptance, a live deployment or closure of E35/E74.

## Three reproduced defects

1. **UX-1335, navigator reset.** Clicking "I provide services" started loading
   the draft but returned the browser to role selection. The layout replaced
   the entire Stack with a loading screen, then remounted it, losing the
   transition/history. The previous DOM entry test mocked navigation and did
   not prove navigator lifetime. Its passing result was insufficient.
   The actual layout now uses the installed navigator's `screenLayout`
   boundary: the Stack remains mounted while the active screen's form waits
   for hydration. Inactive retained pages do not mount private controls or
   issue redirects. Returning to a step restores its last saved data. The
   customer-only outer role guard remains unchanged.
2. **UX-1336, checked state missing in browsers.** After refresh, Cleaning
   looked selected, the form said "1 selected", and the saved fields were
   correct, but the compiled DOM omitted `aria-checked`. The shared native
   test primitive had invented this mapping for `accessibilityState.checked`.
   Categories, market selection and agreement now set explicit `aria-checked`
   while retaining native accessibility state. The focused regression uses
   the observed web primitive behavior instead of the overly generous mapping.
3. **UX-1337, destructive-dialog cancellation clipped.** At 320 pixels,
   "Replace with saved draft" pushed Cancel partly beyond the left viewport.
   The document itself had zero horizontal overflow, so checking only document
   width missed the defect. The shared customer/provider confirmation dialog
   now wraps and sizes its buttons within available width, with 44-pixel
   minimum height and centered labels. Cancel and confirm remain separate
   callbacks. No confirmation requirement was removed.

The navigator API was checked against installed source and the official
[React Navigation navigator documentation](https://reactnavigation.org/docs/navigator/).
No dependency, navigation-library version, legal clause, backend admission rule,
money behavior or storage policy was changed.

## Reproducible evidence

Harness and retained evidence:
`.ai-coder/checkpoints/logs/provider-application-browser-2026-09-06/`.

- `audit.mjs`: actual compiled Expo app, local-only static server, synthetic
  account/HTTP, real browser navigation, form edits, geolocation permission
  fixture and file chooser/multipart preparation. Unexpected HTTP/external
  requests are blocked and fail the run. It does not contact production.
- `evidence/results.json`: baseline failure returned to role selection.
- `after-ux1335/results.json`: navigator correction exposed missing checked
  state on the restored category. The category data itself was not lost.
- `recovery-before/results.json`: strengthened conflict/recovery run exposed
  the off-screen Cancel control. Its screenshot shows the exact failure.
- `verified-evidence/results.json`: final six flows passed at 320, 390, 768,
  1024, 1366 and 1920 pixels. Ten screen captures per flow, 60 in total,
  cover role choice, six steps, both recovery confirmations and submitted state.

At every width the final harness verifies:

- A failed PUT retains the name/category, explicit retry saves, and a full
  refresh restores them before the controls initialize.
- A second real browser tab saves a newer version. The original tab's stale
  PUT receives a conflict instead of overwriting it. Cancel retains local
  edits; confirmed reload replaces them with the latest saved values.
- Canceling discard preserves the draft. Confirming discard sends its exact
  revision, clears the unsubmitted fixture record and returns to role choice.
  It does not submit, delete files or change a provider record.
- Services, configured market, exact captured pin, experience and reference
  reach the final payload. Actual Back returns from vetting to service area
  with its saved pin/market; forward continuation remains functional.
- Three document uploads and one selfie use actual browser chooser/multipart
  code. Refresh restores private references and optional metadata without
  requesting their storage keys as public images.
- Agreement is unchecked on entry and after refresh. No save/refresh submits.
  Exactly one final POST carries fresh consent, the latest revision and exactly
  the same normalized fields as the preceding PUT. The fixture consumes that
  draft and returns HTTP 201 with a provider UUID.
- The applicant sees the canonical submitted screen but retains the customer
  identity. Reopening an editing URL after submission returns to status.
- All captured documents have zero horizontal overflow; both confirmation
  actions remain within the viewport. There are zero unhandled page errors and
  zero unexpected requests. Expected 503 and 409 console errors are retained.

The fixture checks payload/version equality; it is **not** an actual database
implementation. Database transaction/authorization coverage is separately
recorded in `docs/architecture/provider-application-lifecycle.md`. This does not
prove production upload existence, admin review receipt, real GPS accuracy,
native camera permission, screen-reader behavior or live login.

The unchanged review harness also passed all 84 status/route/width combinations
against the same final bundle. Its numeric report is retained as
`review-regression-results.json`; earlier review screenshots are not relabeled
as screenshots of this newer build.

Direct image inspection covered the failing phone category and confirmation,
the corrected phone confirmation, phone documents/selfie/service area, tablet
documents and desktop service area. Sixty captures are not a claim that every
pixel of every screenshot was manually reviewed.

## Tests, build and provenance

Each new regression failed deliberately before its respective fix:
UX-1335 missing mounted navigator (1.974 seconds), UX-1336 missing checked
attribute (1.646 seconds), UX-1337 nonwrapping dialog actions (2.652 seconds).
Their focused green reruns took 1.499, 1.659 and 1.510 seconds respectively.

After the first two fixes the full mobile suite passed 576 files / 860 tests,
with 84 TODOs, in 105.578 seconds. After the shared-dialog correction it passed
577 files / 861 tests, with the same 84 TODOs, in 110.256 seconds. No TODO is
counted as a pass. TypeScript and changed-file ESLint passed. The unchanged
unique-regression-ID gate passed with 1,525 titled regressions; diff checks
passed. Fresh CI for this new candidate remains required after publication.

The preceding exact commit `0b96afe5` independently passed CI `33985775588`
and Gates `33985775571`, all four CI jobs. Mobile job `101358878870` explicitly
passed UX-1333/1334 and 574 suites / 858 tests plus 84 TODOs, and exported
4,364 modules in 86.682 seconds. That evidence does not cover these new fixes.

Local browser exports used the previously established full-lockfile install
outside OneDrive. Additional direct reads of the repository's cloud-backed
dependency files failed; dependencies and lockfile were not rewritten to hide
that environmental problem. The final incremental export completed 4,364
modules in 6.273 seconds. Its JavaScript bundle SHA-256 is:
`953E38EC73F3482ED3AD39AE7B74725367B5660408D5E1F2ECA5DBD5A4F889FF`.
The report identifies the exact baseline plus UX-1335/1336/1337 source overlay,
not a nonexistent build-time commit. The loopback API origin makes this a
test-only artifact: do not deploy it.

## Remaining work and handoff

The latest Stitch archive still lacks verified availability/provenance. Existing
approved palette and responsive conventions were retained, not claimed as
pixel-perfect acceptance. The observed selfie-on-file hint extends across the
circular placeholder border on phone; keep that polish item open. Market and
radius controls, questionnaire choices, headings, keyboard/focus order, error
announcements and long-form/landscape layouts still need a full accessibility
and copy pass. Current successes are bounded workflow evidence, not all-field
UX certification.

Next: verify the actual API/admin review handoff, durable review revisions and
request-changes/resubmission, bounded draft expiry/privacy inventory, governed
legacy admission, and the full migration-172 chain. Rehearse paired API/browser
release and authenticated acceptance before safely aligning master/production.
Continue the remaining provider, customer and operator-console business/support/
payment/work-order audits. All existing money, privacy, legal and operational
holds remain explicit; engineering approval is not qualified legal signoff.

No server connection/write, production migration, real account creation,
historical transaction adjustment, master merge, release label, branch-protection
or gate amendment occurred in this checkpoint. Topic, master and production
remain different revisions.
