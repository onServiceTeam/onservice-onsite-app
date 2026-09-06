# Provider 360: record-owned private reveals and operator drafts

Date: 2026-09-06, Asia/Singapore. Baseline
`1cf7e309020f115e2cffad18d8728d031a7b8922`. Candidate fix, not deployed.

## Confirmed defects and correction

Moving directly between two already-cached provider records kept child component
state from the first provider while showing the second provider's heading:

| Regression | Incorrect retained state | Verified boundary |
| --- | --- | --- |
| UX-1356 | Revealed phone/email, including a delayed response | Another provider starts masked and requires its own reveal; query profiles remain masked. |
| UX-1357 | Internal-note body, category and pin selection | A different provider starts empty; same-provider profile refresh preserves the draft; a fresh note targets the second provider. |
| UX-1358 | Suspension confirmation title and reason | Navigation closes the old decision without submitting it; a fresh dialog names the new provider and has an empty reason. |
| UX-1359 | Wallet-adjustment amount and reason | Navigation closes the old adjustment draft; reopening starts empty and disabled. No wallet request is sent. |

The loaded page subtree is now keyed by canonical provider ID. Correctly scoped
query keys alone did not reset local component state. App and layout routes do
not otherwise remount on provider-ID navigation. Existing useReasonDialog cleanup
resolves abandoned confirmations to null on unmount. Same-ID updates retain the
subtree, avoiding a broad pathname-based reset or a series of after-render effects.

E76 records the money-adjacent risk, narrow recommended containment and Ken's
current engineering approval. No new financial policy, dependency, schema, role,
ledger value, booking, refund, commission, or live suspension is changed. An
already-submitted server request is not canceled by this lifecycle fix.

## Source and behavioral verification

ProviderDetailPage.tsx was read in full (2,661 pre-fix lines), including recovery
of truncated read segments. App.tsx, AdminLayout.tsx, ReasonDialog.tsx, test setup,
test configuration and relevant fixtures were also fully read. This does not
claim a full read of the 1,825-line provider admin service; its initial profile
section and final wallet-adjustment implementation were inspected separately.
No financial endpoint behavior was changed or exercised against production.

Each defect has its own real-render test file and Bug title, using the actual
memory router and QueryClient. Both profiles are cached with infinite stale/GC
times so a loading unmount cannot accidentally hide the defect. Before the
runtime fix **all four tests failed on the incorrect rendered state**, in
**7.91 seconds**. Afterward the four regressions plus existing provider-page
tests passed **5 files / 7 tests in 2.87 seconds**. The reveal test also completes
an old pending mutation after navigation; it waits for actual mutation success.

Full admin result: **569 passing files, 1 skipped file; 653 passing tests,
3 TODOs**, in **152.04 seconds**. Existing marketing-dialog description warnings
remain visible in that run and are not called fixed. Admin TypeScript,
changed-file ESLint, diff checks and the unchanged regression-ID gate passed
(**1,554 titled regressions**). Fresh GitHub CI is required after publication.

## Compiled browser evidence

Evidence root: `.ai-coder/checkpoints/logs/provider-record-ownership-2026-09-06/`.

- `red-evidence`: prior compiled build `3ab3db17...` failed its first check at
  320px, showing Alpha's unmasked phone/email under Beta's record. This is
  retained failed evidence, not a successful 30-scenario baseline.
- `verified-evidence`: **30/30 passed**, five scenarios (completed reveal,
  delayed reveal, note draft, suspension dialog, wallet draft) at 320, 390, 768,
  1024, 1366 and 1920px. There are **60 retained screenshots**.
- `final-evidence`: the same **30/30 checks passed again**, with **60 additional
  captures** after explicitly scrolling to the top before full-page screenshots.
  This corrects the initial capture's mid-document sticky-header placement,
  not application behavior. Direct visual review includes the old contact leak,
  corrected narrow masked record and corrected desktop wallet page. Final report
  time is `2026-09-06T00:31:30.321Z`; bundle hashes are unchanged.
- The actual BrowserRouter first loads Beta, then navigates to Alpha and back
  through history/popstate without reloading the app. Each check proves Beta
  has exactly one profile read, with no extra read on return to its warm cache.
- All HTTP and identities are synthetic. Only synthetic contact-reveal POSTs
  are permitted; no note, wallet, suspension or other mutation is submitted.
  Unexpected HTTP requests and page exceptions are zero. Recorded document
  overflow is zero; this is not whole-page accessibility or Stitch acceptance.

The isolated build transformed **2,845 modules in 15.39 seconds**. All **659
tracked admin source files** matched the temporary source after newline
normalization; newly added regression files were run in the real repository,
not included in this tracked-file count. The changed page also matched its exact
copied hash. Report time: `2026-09-06T00:26:04.774Z`.

Compiled ProviderDetailPage SHA-256:
`9d63e57ef33f1afb6ed1d20f1f60d1a911a12b9b3b4c97efa96a060ad44ba84a`.

## Continue here

Customer 360 has a similar unkeyed loaded subtree and local header reveal state.
Its complete 1,812-line page has now been read. Reproduce its own navigation
behavior before extending this correction. The provider header also visually
truncates the business name at narrow widths; full-name readability remains
a separate operator identity/layout follow-up, not fixed by the root key.
Do not infer every detail page or every financial action is now safe.

Provider scheduling diagnostics, pending override draft behavior, action
accessibility and the assignment/acceptance eligibility gaps remain open in the
prior availability audits. Master/live remain behind the reviewed topic branch;
no deployment, migration-172 rehearsal, authenticated live acceptance, complete
Stitch comparison or launch-ready assertion is made here.

## Published candidate verification

Candidate `306ca0ed5e5dd7afdcd58ea81e2190dc98952a9e` passed CI
`34001766960` (all four jobs) and Gates `34001766965`. Admin job
`101401781563` explicitly passed UX-1356 at `2026-09-06T00:40:58Z`,
UX-1357 at `00:41:49Z`, UX-1359 at `00:44:59Z`, and UX-1358 at
`00:45:31Z`. Final admin result at `00:48:27Z`: **569 passing files,
1 skipped file; 653 passing tests, 3 TODOs**, in **576.68 seconds**.
This resolves fresh CI for this provider candidate, not production rollout.
