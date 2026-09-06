# Customer 360: isolate operator state by customer record

Date: 2026-09-06, Asia/Singapore. Baseline
`306ca0ed5e5dd7afdcd58ea81e2190dc98952a9e`. Candidate work, not deployed.

## Reproduced issues

The complete 1,812-line pre-fix CustomerDetailPage was read. Its query keys
already separated customers, but child state was not remounted when a second
customer's record was immediately available from cache.

| Regression | Reproduced incorrect state | Expected correction |
| --- | --- | --- |
| UX-1360 | First customer's revealed contact remains under the second customer. | Completed and delayed reveals stay with their record; the next customer requires its own reveal. |
| UX-1361 | Old suspension dialog and status tray remain. | Cancel the abandoned confirmation and start the next customer with a closed tray. |
| UX-1362 | Wallet amount and reason carry into another customer. | Keep the draft on same-customer refresh; clear it on a different customer. |
| UX-1363 | First customer's forced-sign-out confirmation remains. | Remove it without submitting and require a fresh reason for the next customer. |
| UX-1364 | Dispute-tab fraud-review reason remains on another customer. | Remove the abandoned dialog and start any new confirmation empty. |

The loaded page subtree now uses canonical customer ID as its React key.
Same-customer profile refresh retains the component and its draft. Different
records remount their private state and invoke existing reason-dialog cancellation
cleanup. E76 records the approved narrow engineering containment and this
customer counterpart. There is no financial-policy, role, ledger, booking,
refund, session-revocation or fraud-rule change. No production request was made.

## Test evidence

Five distinct real-render regression files use the actual memory router and
query cache, primed with two synthetic customers and their relevant tab data.
All five failed before the runtime fix. The concise repeat records the exact
retained contact, dialogs and wallet field failures in **2.96 seconds**.

The five new files plus existing customer-page tests passed **6 files / 8 tests**
in **3.35 seconds**, and again in **3.37 seconds** after a test-selector typing
correction. Full admin execution passed **574 files, 1 skipped file; 658 tests,
3 TODOs**, in **182.14 seconds**. Existing marketing-dialog description warnings
remain, not suppressed or claimed resolved.

Type checking found two test-code issues during verification: three unsupported
`exact` options copied from browser locator syntax into Testing Library, then an
unnamable inferred helper return type involving the page's private profile type.
The options were removed (role-name string matching is already exact) and the
helper was given an explicit locally named return type. Final TypeScript and
changed-file lint passed. These were test-code corrections, not application
failures hidden by passing runtime tests. A final full rerun after both type-only
corrections is recorded separately when it completes. The unchanged regression-ID
gate passes with **1,559 titled regressions**; diff checks pass.

## Compiled browser verification

Evidence: `.ai-coder/checkpoints/logs/customer-record-ownership-2026-09-06/`.

- `red-evidence`: prior compiled admin reproduces the contact leak at 320px.
  It fails the first scenario; it is not a passing 36-scenario baseline.
- `verified-evidence`: **36/36 scenarios passed**, covering completed/delayed
  reveal, wallet draft, status confirmation, forced sign-out and dispute-tab
  fraud confirmation at **320, 390, 768, 1024, 1366 and 1920px**.
- **72 captures**, zero unexpected HTTP, zero page exceptions and zero recorded
  document overflow. The only POSTs are **24 synthetic contact reveals**; no
  money, status, session-revocation or fraud endpoint is submitted.
- Real BrowserRouter navigation primes Beta, moves to Alpha, then returns to
  Beta without an app reload. Each scenario verifies exactly one Beta profile
  read, with no extra read on the return, proving warm-cache coverage.
- Direct visual review includes the old leak, corrected narrow masked customer
  and corrected desktop wallet form. Screenshots do not establish complete
  accessibility, every populated-data layout or full Stitch design parity.

The isolated admin build transformed **2,845 modules in 31.13 seconds**.
All **91 tracked non-test admin source files** match its source after newline
normalization, with an additional exact hash check for CustomerDetailPage.
Report time: `2026-09-06T00:48:16.649Z`. Customer page bundle SHA-256:
`ffc211d6b4a9ead04bdd2f68fa69ec81c3f6ac949f0a19fa342571fa82772894`.

## Next boundary and release status

The admin app's long-lived QueryClient, client-side logout/login, and late HTTP
responses need separate actor/session ownership tests. Record-ID keys cannot
alone protect two different operators viewing the same record. The complete
admin API wrapper and socket helper, main entry, auth store and app routes were
read; full login/header inspection and reproduction continue separately. No
session-cache/transport fix is claimed by this checkpoint.

Provider full-name readability on phones, action accessibility, operator
availability diagnostics and assignment/acceptance checks remain open. The
fraud dialog's generic title also deserves an identity-context review. Financial
form bounds, wording and transaction adjustment policy are not certified by
draft isolation. No release merge, live deploy, migration-172 rehearsal, full
launch acceptance, customer credentials or full-product completion is claimed.

## Final local verification

After both test-only typing corrections, the final full admin run again passed
**574 files, 1 skipped file; 658 tests, 3 TODOs**, in **174.89 seconds**.
Final TypeScript and changed-file lint completed successfully. This resolves
the local rerun requirement above. Fresh GitHub CI is still required for the
customer candidate. The complete 420-line Header and 669-line LoginPage have
also now been read for the separate upcoming actor/session-cache reproduction;
neither is changed by this customer-record correction.

## Independent candidate CI

Published candidate `b1b05b71775a8863a5937628c214b19ef8f0b1b0` passed CI
`34003132465` (admin, mobile, API and Docker jobs) and Gates `34003132466`.
Admin job `101405450418` explicitly passes UX-1360 through UX-1364, with
**574 passing files, 1 skipped file; 658 tests, 3 TODOs** at
`2026-09-06T01:20:20Z`. The job completed at `01:20:22Z`. This resolves the
fresh-CI requirement for the customer-record correction, not deployment.
