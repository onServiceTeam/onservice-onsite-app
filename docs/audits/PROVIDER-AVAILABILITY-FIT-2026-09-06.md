# Provider availability: narrow forms and truthful guidance

Date: 2026-09-06, Asia/Singapore. Baseline
`12c59bbb8fcfe3a1b8a4709a1d3f4c6e79048fae`. Development candidate, not deployed.

## Corrections

- UX-1343: wide-screen column minimums also applied on phones, putting the Add
  action outside a 320px viewport. Phone columns now shrink naturally; tablet and
  desktop retain the two-column layout. Columns retain space between them.
- UX-1344: an empty date-override list claimed the weekly schedule was active,
  although this screen does not fetch weekly hours. Neutral copy now directs the
  provider to the existing Weekly schedule link to check their normal hours.
- UX-1345: the shared Button defaults to full width, so both Cancel and Save
  requested the entire horizontal action row. Both now use their natural width.
- UX-1346: the two custom-hours inputs retained browser intrinsic minimum widths,
  clipping the end time on narrow screens. They now allow shrinking in their row.

These changes do not alter availability rules, matching, database records,
existing bookings, pricing, security holds or admission criteria. Existing design
tokens, typography, cards and colors are retained. This is not a complete Stitch
comparison or accessibility acceptance.

## Behavioral and visual verification

Each defect has a separate real rendered-screen regression in
`apps/mobile/__tests__/bug-ux-1343` through `bug-ux-1346`. A thin native-component
adapter flattens rendered styles for DOM inspection; it does not replace the
screen or shared Button with a fake implementation. Tests exercise Add, Cancel,
the weekly-schedule destination and both custom-hours input values.

The first UX-1343 attempt had a Jest factory-scope error, not a valid failing
behavior result. After correcting the harness, UX-1343 and UX-1344 both failed
against the old behavior (1.482 seconds). UX-1345 and UX-1346 independently failed
before their corrections (2.205 and 2.053 seconds). Intermediate test-only typing
errors were corrected without suppressions or changes to the app's rules.

Final complete mobile tests passed **585 suites / 869 tests**, with **84 TODOs**
still outstanding, in 104.365 seconds. Mobile TypeScript and changed-file ESLint
passed. The unchanged unique-regression-ID gate passed with 1,537 titled
regressions. `git diff --check` passed.

The final isolated Expo web export built 4,364 modules in 2.688 seconds using its
existing build cache. All 291 tracked mobile app/source and shared-source files
match the isolated build after Windows line-ending normalization. This does not
claim dependency reproducibility or production-build parity.

The compiled browser harness passed **12/12 scenarios**: widths 320, 390, 768,
1024, 1366 and 1920, each with a blocked day and custom hours. It loads the real
screen, opens the form, enters values, checks each measured control's viewport
bounds, saves, asserts exactly one expected HTTP payload and sees the refreshed
list. All requests/identities/data are synthetic and isolated. There were zero
unexpected requests, page exceptions or horizontal document overflow. Thirty-six
final screenshots and JSON measurements are retained. Direct visual review also
covered the 320px, 768px and 1366px custom-hours form captures.

This is not proof of real PostgreSQL persistence, booking eligibility, actual
payments, native devices, live accounts or every interaction. In particular, a
document-level overflow check alone had missed the clipped inner controls.

## Retained evidence, including failed iterations

Root: `.ai-coder/checkpoints/logs/provider-availability-fit-2026-09-06/`.
The folder names of intermediate attempts are not acceptance decisions:

| Folder | Actual result | Defect observed |
| --- | --- | --- |
| `red-evidence` | 0/12; stopped on first failure | Add outside viewport |
| `verified-evidence` | **Failed**, 0/12 | Cancel clipped after the column correction |
| `accepted-evidence` | **Failed**, 1/12 | Custom end-time input clipped after the button correction |
| `final-evidence` | **12/12 passed** | All four corrections present |

No failed artifact was overwritten or relabeled as passing. The final report was
generated at `2026-09-05T22:02:43.950Z` and records entry SHA-256
`309311ab64556bd61ced089814325d8a9ed1f97ebd6bac982ef57e9579dc3194`.

## Continue here

Fresh CI must verify this new candidate, not reuse the preceding green result.
Next trace weekly hours, date overrides, current availability, service readiness,
customer selection and admin/support visibility through actual backend rules.
The current Available Now copy, a fixed past example date, accessible labels and
small controls still need separate review. These were not silently included in
this layout correction. Full application-lifecycle and release limitations remain
open. Local candidate, GitHub master and the live server are not aligned.

## Independent verification

Candidate `39f5c78ba683c537c38842700978da11123420d0` passed all four CI jobs
in `33995233818` and Gates `33995233856`. Mobile job `101384506768`
explicitly passed UX-1343, UX-1344, UX-1345 and UX-1346, with 585 suites /
869 passing tests and 84 TODOs. API, Admin and Docker jobs all succeeded.
This closes the fresh-CI requirement for the layout checkpoint, not the later
availability-linkage corrections or deployment.
