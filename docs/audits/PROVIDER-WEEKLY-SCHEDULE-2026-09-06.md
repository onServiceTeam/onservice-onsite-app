# Provider weekly schedule: saved hours and edit integrity

Date: 2026-09-06, Asia/Singapore. Baseline
`21e7f93d9b2ce29347b822ab00ed69919733a9ae`. Candidate work, not deployed.

## Corrections and evidence

| Regression | Before | Candidate behavior |
| --- | --- | --- |
| UX-1350 | Missing days in a nonempty saved week became default working weekdays. | Missing saved days remain off. Saving an edit does not silently open them. |
| UX-1351 | A provider with no saved rows saw suggested hours but could not save them without a dummy edit. | Suggestions are explicitly unsaved and can be saved as shown. No automatic write occurs. |
| UX-1352 | A refreshed query replaced unsaved hours. | A dirty draft survives a completed query update and submits its own values. |
| UX-1353 | An earlier save/refetch overwrote newer typing and marked it saved. | Each submission records the local edit revision. Later edits remain visible and unsaved, with truthful feedback. |
| UX-1354 | Weekly hours promised restricted customer visibility and omitted timezone/override consequences. | Copy explains Manila-time matching, override priority, continued discoverability and unchanged existing bookings. |

The first four regressions failed against the original runtime in 3.125 seconds.
A concise repeat confirmed all four assertion failures in 2.006 seconds: Monday
unexpectedly present, missing first-save guidance, draft `10:00` replaced by
refetched `11:00`, and newer `12:00` replaced by submitted `10:00`. UX-1352 includes
a second real query observer and waits for it to render the changed cache value;
it does not mistake a resolved fetch promise for an observed React update.
UX-1354 separately failed against the old wording in 2.5 seconds.

After correction, the five regressions passed in 2.398 seconds. The earlier
seven-suite focused run also passed the existing load-failure lock, responsive
grid and screen-render checks (nine tests). Complete mobile tests passed
**593 suites / 877 tests**, with **84 TODOs** retained, in **92.2 seconds**.
Mobile TypeScript, changed-file ESLint and `git diff --check` passed. The unchanged
regression-ID gate passed with **1,548 titled regressions**.

The edit guard is local to the mounted form. It is not optimistic concurrency
control between devices. It does not cancel already-processed requests, prove
every account-switch lifecycle, or persist drafts after navigation/reload.
Failed loads remain locked. The existing time-validation rules remain in place.
No API, schema, matcher, booking, payment or production record changed here.

## Compiled browser verification

Harness and retained results:
`.ai-coder/checkpoints/logs/provider-weekly-schedule-2026-09-06/`.

- `red-evidence`: the prior compiled application fails at 320px because Monday
  appears despite only Wednesday being saved. The failure capture is retained.
- `verified-evidence`: **12/12 scenarios passed** across 320, 390, 768, 1024,
  1366 and 1920px. Each width covers an initially empty schedule and a partial
  saved week with a controlled delayed save followed by a newer edit/save.

Checks exercise actual compiled UI, exact outgoing schedule values, preservation
of missing/off days, first-save availability, pending state, later-edit feedback,
reload from the synthetic saved result and no automatic writes on reload.
There are **48 captures**, **18 expected PUTs**, zero unexpected requests, zero
page exceptions and zero document overflow. All recorded controls remain within
horizontal viewport bounds. The 320px partial/empty and 1366px partial initial
screens were directly inspected. These checks do not establish all touch-target,
contrast, keyboard or screen-reader requirements.

The isolated Expo export built 4,364 modules in **5.288 seconds**. All 291 tracked
mobile app/source files matched the temporary build after line-ending
normalization; the changed screen also passed an exact copy hash comparison.
Report time: `2026-09-05T23:17:17.364Z`. Compiled entry SHA-256:
`1408c36f9811760166d50c72f90bfa1ce7747dfbe6000a468255c8098cd9508b`.

HTTP responses, sessions and records are synthetic and isolated. This is not
real PostgreSQL persistence, deployed behavior, native baseline completion or
full Stitch acceptance. Shared current visual tokens were retained, not replaced
with the superseded palette in the older design-contract prose.
Fresh candidate CI is still required before independent verification is claimed.

## Continue here

1. Test concurrent weekly replacements against real PostgreSQL. `setSchedule`
   deletes/inserts in a transaction but does not currently serialize by provider.
   Migration 010 enforces one row per provider/day; do not claim that duplicate
   same-day rows are allowed. Investigate disjoint partial submissions and
   same-day conflicts, preserve rollback/other-owner isolation, and reflect the
   actual constraints in the focused availability test fixture.
2. Weekly day toggles still need semantic checked state, keyboard/touch-target
   and contrast review. The icon-only back action also needs its own label.
3. Verify date-only override labels outside Philippine browser timezones.
4. Continue the assignment/offer-acceptance and admin support-visibility gaps in
   `PROVIDER-AVAILABILITY-LINKAGE-2026-09-06.md`. Do not bypass money or account
   safety rules, alter existing bookings, or imply that the whole app is ready.

The topic branch, master and live production remain separate. No server access,
deployment, gate weakening, new dependency or professional signoff occurred in
this checkpoint.

## Independent CI verification

Candidate `eec230147398f6bbbe128e64016daddd20f1ad8f` passed all four jobs in
CI `33998508944` and Gates `33998508945`. Mobile job `101393104207` explicitly
passed UX-1350 through UX-1354 within **593 suites / 877 tests**, retaining
**84 TODOs**, at `2026-09-05T23:25:36Z`. This resolves the fresh-CI requirement
for these UI fixes, not deployment or the subsequent server concurrency change.
