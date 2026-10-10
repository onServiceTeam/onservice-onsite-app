# Provider application: six-step draft and submission integration

Date: 2026-09-06, Asia/Singapore. Baseline:
`cb22c558d21e65deb9fb479943bbe2d3df058ad0`, branch
`codex/financials-operator-truth`. Scope: E35/E74 applicant workflow candidate.
This is not a deployment, final visual signoff, or closure of either escalation.

Follow-up: `PROVIDER-APPLICATION-REVIEW-STATUS-2026-09-06.md` records independent
CI for this stage and the subsequent correction of both status URLs. The
status-screen findings under next item 2 below are historical discovery, not
the corrected candidate's current behavior. Other acceptance items remain open.

Accuracy correction: `PROVIDER-APPLICATION-BROWSER-2026-09-06.md` subsequently
reproduced a real navigator reset during draft loading. The earlier statement
below that the back stack was not destroyed was not established by the mocked
router test and was incorrect for the compiled browser. UX-1335 now places the
gate around active screen content while retaining the navigator; actual browser
entry, refresh, recovery and Back navigation are separately verified there.

## Outcome and remaining release boundary

The previous checkpoint's loading boundary and draft actions are now rendered
by the actual onboarding layout and all six steps. Terms saves and submits the
same normalized application with the returned revision. Early-step draft saves
are no longer being offered with a revision-unaware final submit implementation.

This code is not live. Migration 172 still requires full-chain rehearsal and
the API, database and browser releases require paired authenticated acceptance.
The repository's topic branch, master and production are not yet aligned.
The full customer/provider/admin audit, native baselines and launch operational
requirements remain open. No legal wording, payment policy or approval authority
was changed in this stage.

## Actual screen wiring

| Surface | Implemented behavior |
| --- | --- |
| Layout and role choice | Outer customer-only role guard remains. Applicant draft hydration precedes the existing incomplete-step guard and local form initialization. Role choice and canonical status screens bypass draft loading. Choosing provider survives an empty draft response. Loading errors offer retry and a customer-workspace exit. |
| Categories | Explicit save uses the visible business name and selected category IDs. Continue waits for confirmed save. Grid and actions are within scrollable content. |
| Service area | Save uses the displayed admin-configured market, radius and real captured pin. Changing market invalidates an outstanding location result. Permission/location errors retain current work. No city-center pin is fabricated. |
| Vetting | Drafts preserve incomplete references. Continue requires every entered reference to be complete. Extra references require confirmed removal, not silent filtering. Field validation is visible and actions scroll with the long form. |
| Documents | Permission, picker and upload callbacks are applicant/screen-bound. Failures retain the previous private reference. Current local previews remain transient; restored keys are not used as public image URLs. Optional date validation rejects impossible calendar dates before continuing. |
| Selfie | The same owner-bound capture/upload behavior applies. File selection is available on web. Capture is secondary to save/continue, and the entire page is scrollable. |
| Terms | Consent starts unchecked even if old local state says otherwise. Final normalization happens once before PUT. POST carries the returned revision and fresh consent, with the same fields. Optional null metadata is omitted only where the final API requires omission. |

Navigation changes increment a separate screen-operation epoch without changing
draft ownership or destroying the navigator's back stack. This matters because
a native stack can keep an old screen mounted. Delayed save/continue and picker
callbacks cannot navigate or apply media after leaving that screen. Busy local
controls reset when their operation scope changes. Owner/generation checks remain
independent of this navigation scope.

The upload helper additionally accepts the applicant's validity callback and
checks it after each asynchronous multipart preparation, before starting HTTP.
Checking only before calling `uploadImages` was insufficient: preparing a browser
Blob can await before the authenticated client captures its request owner. The
new argument is wired to both onboarding upload callers. Other upload contexts
retain their existing behavior and need their own pre-request ownership audit;
this is not a claim that every media flow has been audited.

## Submission and uncertainty

Final normalization trims bounded text, deduplicates categories and preserves
every reference. Incomplete required data is rejected before final saving.
The draft coordinator serializes the PUT and subsequent application POST.
Leaving the screen or changing account while PUT is pending prevents POST.
Reload, discard and other saves cannot run during the active submission.

Success requires HTTP 201, a successful envelope and a canonical provider UUID.
Only a still-current applicant/screen may then clear onboarding memory, remove
the new-user marker and navigate to review status. No provider role is granted
locally. A malformed success envelope or request failure retains details and
offers the canonical status page; the UI does not claim that an uncertain
network outcome definitely rejected the application. Server-side atomic
draft consumption and existing-provider checks remain the duplicate boundary.

## Evidence and honest test limits

The preceding commit passed GitHub CI `33977917784` and Gates `33977917786`.
All four CI jobs succeeded. Mobile job `101337782667` explicitly records
UX-1316 through UX-1320 as passed, followed by 560 suites / 844 passed tests and
84 TODOs at `2026-09-05T16:29:53Z`. That independent evidence applies to the
baseline, not automatically to this later integration.

| Regression | Real executed behavior |
| --- | --- |
| UX-1321 | Actual Terms screen: fresh consent, failed PUT prevents POST, delayed PUT ordering, exact saved fields/revision, malformed 201 retains data, confirmed 201 clears/navigates, changed session prevents late POST |
| UX-1322 | Actual Vetting screen: save an unfinished second reference, block continue, cancel removal, confirm removal, then save and continue with the remaining reference |
| UX-1323 | Actual Documents/Selfie screens: invalidate permission, picker and upload results on session change; current applicant still uploads and saves successfully |
| UX-1324 | Actual draft actions/loading gate: no delayed navigation after unmount or after a route change with the old component still mounted |
| UX-1325 | Actual role/category controls with loading/incomplete-step guards: customer choice without a draft request, preserved provider intent through hydration, correct category save and next route |
| UX-1326 | Actual Service Area screen: delayed Cebu location cannot populate a newly selected Davao market; a new valid Davao capture saves and continues |
| UX-1327 | Actual upload helper with controlled multipart preparation: invalidating the applicant during preparation prevents HTTP, while a current applicant still uploads |

The first broad integration run found 14 failed files / 16 failed tests. Those
were old fixtures missing complete store fields, hydrated sessions or the new
save-before-continue contract. Read-only rendering fixtures now include the real
initial field shape; interaction fixtures exercise the real onboarding/session
stores and controlled typed API replies. These setup failures are not counted
as newly reproduced application defects. No assertion or gate was weakened.

UX-1327 was deliberately run before its upload-helper fix and failed on the
intended behavior: the upload resolved after its applicant scope changed.
It passed after the helper and both screen callers were corrected.

Local test runs:

- Initial focused integration: 10 files / 13 tests passed, 37.597 seconds.
- Before the multipart fix: full 566 files / 850 passed tests, 84 TODOs,
  121.581 seconds.
- Upload/multipart selection after that fix: 5 files / 11 tests passed,
  2.654 seconds.
- Full suite after the upload fix: 567 files / 851 passed tests, 84 TODOs,
  84.229 seconds. No TODO is counted as a pass.
- Final seven new regressions after correcting test-only type annotations:
  7 files / 7 tests passed, 4.335 seconds.
- Changed-file ESLint passed with zero ESLint warnings. The unchanged unique-ID
  gate passed with 1,515 titled regressions. Final mobile TypeScript check passed;
  earlier checks caught incorrect test-only permission,
  query-option and multipart-return annotations, which were corrected.

These are DOM behavior tests with documented native primitive stubs and controlled
HTTP replies. They do not prove real camera access, two-device behavior, restored
production credentials, multi-tab server races or visual parity. Actual database
submission tests are separately recorded in `provider-application-lifecycle.md`.

## Design-reference availability and next acceptance

Current approved theme tokens and the previously reconciled Stitch direction
were retained. Existing legal clauses were left verbatim. No new generated
mockup or unrelated VistA reference was substituted.

The former Downloads path for `stitch_onservice_ph_redesign.zip` was absent on
this machine during this stage. The repository's
`stitch_onservice_ph_strategic_plan_v2.zip` exists as a 10,744,973-byte OneDrive
file, but reading its hash failed with a cloud-operation timeout. Its contents
and provenance were therefore not freshly verified. This does not supersede
the previously recorded onService reference hash or establish that the older
strategic ZIP is the latest design. No new screenshot/visual acceptance was run.

Next work remains explicit:

1. Recover the applicable local/extracted onService design assets and exercise
   the integrated browser workflow, refresh, failed reload, discard, same-owner
   login and multi-tab conflict at all contract viewports. Inspect keyboard,
   screen-reader labels, field errors, focus and long-form scrolling.
2. Review both canonical status screens. Fresh reading found that the secondary
   background-check screen maps unknown server status strings to pending and
   suspended to rejected. Reconcile with the actual canonical response instead
   of claiming those presentations are already accurate.
3. Complete same-record reviewer revisions/request-changes/resubmission,
   governed legacy admission, bounded expiry scheduling and privacy inventory.
4. Rehearse migration 172 with the full candidate chain and perform paired API/
   browser release acceptance. Then safely align master, GitHub and production.
5. Resume remaining provider, customer and especially operator-console fields,
   cross-role work orders, support, messaging and financial-adjustment audits.

No production writes, migrations, seeded identities, money adjustments, release
label, master merge, branch-protection changes or live deployment ran here.
