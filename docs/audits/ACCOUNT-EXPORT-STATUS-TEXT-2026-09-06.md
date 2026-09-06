# Customer/provider account export status clarity

Date: 2026-09-06. Baseline: `2adf7af1849646797a0da7d169a1443ef85aa5a8`.
Bug UX-1375. Candidate UI correction, not deployed or visually signed off.

Both Account & Data screens rendered an export's format, icon and date, but
did not name queued, processing or failed states. A completed record with no
available download also gave no next-step explanation. Only expired exports
had explicit status guidance. Users should not need to infer processing state
from an icon's shape or color.

Both screens now render one shared, safe status description: Queued, Preparing,
Failed with a request-again instruction, the existing Expired instruction,
Ready to download, or Download unavailable with a request-again instruction.
Unexpected status values receive a reload instruction. Internal processing
errors and storage keys are not displayed. Download eligibility still uses the
existing completed-status plus server-provided availability check; no link is
minted automatically and no backend permission or export lifetime changes.

Rows stack their description and creation date below wrapping file/action
details. Existing theme colors, typography and spacing are reused. This is a
targeted clarity change, not a new design system or a claimed latest-Stitch
comparison. No new screen, account role or admin authority is introduced.

## Executed verification

The new regression renders both actual screen modules with React Query and
fixture service responses. Before the correction it failed on the first
missing Queued description: one failure, 19.379 seconds. Existing native-stub
icon warnings and the lengthy failed DOM output were not test passes.

After correction, five focused suites / nine tests passed in 2.288 seconds.
The new test executes twelve screen/state combinations and checks visible
descriptions, download-action eligibility and withholding the fixture internal
error. Existing expired-state coverage and both screen render suites pass.
The existing responsive test checks a workspace label, not measured geometry;
it must not be presented as proof of responsive visual correctness.

The full mobile suite passed **595 suites / 879 tests**, with **84 existing
TODOs**, in 79.859 seconds. Changed-file ESLint, mobile TypeScript, diff checks
and the unchanged unique-regression-ID gate passed (1,574 titled regressions).
Fresh CI and compiled-browser/native visual checks remain required. The DOM
harness substitutes React Native primitives, router and network boundaries;
it does not prove real browser geometry, keyboard or device behavior, backend
archive creation/download, all-screen UX or live account acceptance.

## Remaining account/privacy work

Manual refresh/ongoing export-status recovery, provider control accessibility,
full retained-data inventory and archive scope wording need further review.
These screens still do not establish complete erasure: E21 retention and E43
canonical DSR/execution linkage remain open. Provider-staff account/privacy
coverage is separate E69 work. The preceding draft backend correction and its
test boundaries are recorded in
`docs/audits/PROVIDER-DRAFT-EXPIRY-EXPORT-2026-09-06.md`.
