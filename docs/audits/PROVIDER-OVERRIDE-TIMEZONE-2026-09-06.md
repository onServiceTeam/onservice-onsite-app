# Provider date overrides: device-timezone label correction

Date: 2026-09-06, Asia/Singapore. Baseline
`7ebe5dd993021b9acffd2aee7ba551b6aecd3920`. Candidate work, not deployed.

## Defect and boundary

UX-1355: the availability list parsed a saved date as device-local midnight,
then displayed that instant in Manila. On devices east of the Philippines this
showed the previous day. A saved August 31 block appeared as August 30; a saved
February 29 block appeared as February 28.

The parser now anchors the date to Manila midnight before formatting. Only the
label's interpretation changes. No stored date, matching window, calendar rule,
booking, schema, permission or financial value changes.

## Real-render regression

`apps/mobile/__tests__/bug-ux-1355-override-date-device-timezone.test.tsx`
renders the actual availability screen with synthetic returned overrides. It
starts fresh, bounded Node/Jest processes with Pacific/Auckland,
America/Los_Angeles and UTC configured before runtime initialization. Each child
checks its actual timezone and executes the same DOM assertions without further
child processes. This avoids treating a change to Jest's sandboxed `process.env`
as proof that the runtime timezone changed. The parent also renders/asserts.

Before the fix the Auckland child failed on the missing correct date label
(2.511 seconds within a 5.844-second parent run). Afterward the regression passed
in **6.764 seconds**, including all three timezone children. The complete mobile
suite passed **594 suites / 878 tests**, with **84 TODOs** retained, in
**84.165 seconds**. Mobile TypeScript, changed-file lint and `git diff --check`
passed. The unchanged regression-ID gate passed with **1,550 titled regressions**.

## Compiled browser verification

Evidence root: `.ai-coder/checkpoints/logs/provider-override-timezone-2026-09-06/`.

- `red-evidence`: the old compiled UI failed at 320px in Pacific/Auckland.
  Direct screenshot review confirms both saved dates were shown one day early.
- `verified-evidence`: **12/12 checks passed**, combining four actual browser
  timezones (Pacific/Auckland, Asia/Manila, America/Los_Angeles, UTC) with widths
  of 320, 768 and 1366px. Both the month-boundary and leap-day labels match the
  saved Philippine dates, and each label is in the viewport for its capture.

There are **24 captures**, zero writes, zero unexpected requests, zero page
exceptions and zero document overflow. Recorded controls remain within the
horizontal viewport. Corrected Auckland phone and desktop captures were directly
inspected, alongside the old failure image. Sessions and HTTP records are
synthetic. This does not establish live data behavior, native baselines, all
accessibility requirements or whole-product Stitch parity.

The isolated Expo export built 4,364 modules in **51.943 seconds**. All 291 tracked
mobile app/source files match the temporary build after line-ending normalization;
the changed file also passed an exact copy hash check. Report time:
`2026-09-05T23:47:52.114Z`. Compiled entry SHA-256:
`afd2b47e98ce77a7ad531e82dffcc5dcf63541e2d9a317547daa9995f799bed1`.
Fresh CI is still required for this newer checkpoint.

## Continue here

The weekly day toggles and availability switch/type controls still need full
semantic state, touch/keyboard and contrast review. The pending override form
also needs a separate delayed-save/draft-lifecycle check. Provider 360 currently
has no observed weekly/date-override workspace in its page/profile interfaces;
continue the full page/service/authorization read before adding operator
diagnostics. Do not present an hours readout as complete assignment eligibility.
The separate assignment, offer acceptance and release limitations remain open.

During the initial operator-page read, `ProviderHeader` was also observed to keep
revealed contact values in local state without an explicit provider ID. Test
navigation between two already-cached provider records and a delayed reveal
before claiming either a leak or safety. This ownership check takes priority
over adding a new diagnostics tab. Only the first 530 lines of the 2,661-line
page and the first 245 lines of its 1,825-line service were read in this
timezone checkpoint; a full-page/service audit is not claimed.

## Published candidate CI verified

Candidate `1cf7e309020f115e2cffad18d8728d031a7b8922` passed CI
`33999991201` (all four jobs) and Gates `33999991204`. Mobile job
`101397010069` explicitly logs UX-1355 passed at `2026-09-05T23:58:53Z`;
the complete **594 suites / 878 tests** passed, with **84 TODOs**, at
`23:59:48Z`. This resolves the preceding fresh-CI requirement, not the
remaining native, whole-product design, production or release requirements.
The subsequent Provider 360 full-page read and record-ownership reproduction
are documented separately in `PROVIDER-RECORD-OWNERSHIP-2026-09-06.md`.
