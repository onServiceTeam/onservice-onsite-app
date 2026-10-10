# Administrator recovery code copy feedback

Date: 2026-10-08 UTC. Base: `be6fea61dd4d457648161eb47aa5f2dff3873553`.
Application: onService PH marketplace, existing PR 81. Candidate only.

## Finding and correction

UX-1382: when Clipboard API access failed, `LoginPage` set an error but the
recovery-code screen never rendered it. The operator received no explanation
or manual-save guidance at the point where losing the codes matters.

The screen now displays the existing plain-language fallback in an alert linked
to the copy button. Retrying clears the stale error, announces the pending copy
and prevents duplicate clicks until it settles. Successful copying announces
that the codes still need to be saved securely. A later failure removes the old
success claim. The manual selection and acknowledgement path remains available.

Copy success does not check the saved-codes box, enter the console, store codes
in browser persistence, make an API request or regenerate recovery credentials.
No server, schema, authentication policy, dependency or gate changed. The new
feedback uses existing semantic colors and spacing in the current admin theme.

## Executed evidence

The new real-render regression failed against the unchanged base because the
alert was absent. It then passed alongside UX-1024, UX-1023 and UX-026: four
files / four tests in 3.86 seconds. The test exercises rejection, deferred retry,
duplicate clicks, successful copy content, an unavailable Clipboard API,
preserved codes and the still-unchecked acknowledgement. Existing assertions
were not weakened. Admin TypeScript, production build and changed-file ESLint
passed. The unchanged unique-regression-ID gate passed with 1,612 titled tests.

The compiled Vite bundle passed synthetic browser journeys at widths 375, 414,
768, 1280, 1440 and 1920. Each journey exercised rejected copy, keyboard retry,
successful copy, disabled continuation until manual acknowledgement and exactly
three enrollment HTTP calls. There was no document horizontal overflow,
unexpected request, console warning/error or page exception. Twelve captures
were retained locally; phone error, tablet success and desktop error captures
were visually inspected. The browser supplied deterministic API responses and
an in-page clipboard double, not a real account, server session or OS clipboard.
No protected console entry or native browser acceptance is claimed.

The first full local admin run failed: seven files / eight tests failed,
591 files / 697 tests passed, with one skipped file and three existing TODOs
(267.56 seconds). UX-714 failed to load with `ENOSPC`; the other failures were
UX-1365, UX-1371, UX-1312, OPS-269, UX-1378 and three supporting logout checks.
Some reported five-second timeouts. A later disk check showed 7.28 GB free;
that does not prove the earlier write had sufficient space or identify the
cause of every failure. The subsequent complete two-worker run passed all
706 executable tests, with three existing TODOs and zero failures. UX-1382 and
every initially failing check passed unchanged. Assertions, timeouts, test
selection and gate settings were not modified. The JSON report is retained in
the ignored session-audit directory. This successful rerun does not erase the
failed first result or prove the cause of every transient failure.

## Remaining boundaries

The saved-codes checkbox is still browser-local. Durable server-owned generation,
acknowledgement, interrupted-response recovery and existing-account rollout
remain separate approved work. The activation, session persistence and response
boundaries described in `ADMIN-ENABLE-TRANSACTION-2026-10-08.md` remain open.
This small UI correction must not be used to close that work or unlock held
recovery routes.

Exact-candidate CI remains required at this checkpoint.
Production was not accessed or changed. No master merge or deployment occurred.
The separate production recovery hold, matched-artifact release, full migration
rehearsal, native evidence and screen-by-screen latest-Stitch acceptance remain.
See `admin-recovery-copy-2026-10-08/quality-reasoning.md` for the bounded design
assessment. Private screenshots and the reproducible local browser harness are
retained in the ignored session-audit directory, not published as real codes.
