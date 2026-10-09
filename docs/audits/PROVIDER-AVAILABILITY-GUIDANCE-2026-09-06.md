# Provider availability: accurate guidance and date entry

Date: 2026-09-06, Asia/Singapore. Baseline
`68fbab2ab407ad362cd401a46cb7570e8982911f`. Candidate work, not deployed.

## Corrections

- UX-1347: instant availability no longer claims that switching off hides the
  public profile. The off state explains paused automatic matching and continued
  discoverability. The on state describes eligible new offers, not guaranteed
  work. Both states explain that existing bookings are not cancelled/rescheduled.
- UX-1348: the date form reuses the existing mobile real-calendar-date helper.
  Impossible dates show a warning before an HTTP write; entered values remain
  available for correction. The independently tested server validator remains
  authoritative. A corrected valid leap day submits once.
- UX-1349: the fixed August 31 example is replaced with today's Philippine date,
  explicitly labelled as Manila time. A test covers the UTC/Manila date boundary.

The Provider Support SOP now distinguishes candidate fixes from live behavior,
explains fresh sign-in after an actual approval, reflects the four-document
candidate check and removes an unusable renewal/re-upload template. It tells
agents not to collect KYC through chat/email or imply an unimplemented renewal
was accepted. No message was sent, account approved, renewal enabled, financial
rule changed or professional/legal signoff fabricated.

## Verification

The three real-render regressions failed before the changes (27.779 seconds):
incorrect status explanation, no local impossible-date warning and expired
example. Afterward all three passed in 2.003 seconds. Complete mobile tests passed
**588 suites / 872 tests**, retaining **84 TODOs**, in 108.494 seconds. Mobile
TypeScript, changed-file ESLint and `git diff --check` passed. The unchanged
regression-ID gate passed with 1,543 titled regressions.

The isolated Expo export built 4,364 modules in 68.917 seconds. All 291 tracked
mobile app/source and shared-source files match the build after Windows line-
ending normalization; the changed file also passed an exact copy hash check.
This is not installed-dependency reproducibility or a production build claim.

The existing synthetic availability browser harness gained an explicit
`AUDIT_GUIDANCE=1` follow-up mode. Its default behavior remains available for the
older layout-only audit; old result files were not overwritten. The new mode
checks both initial availability states, full explanatory copy, today's example,
the invalid-date warning with zero POSTs, and correction to a valid blocked/custom
date with exactly one expected POST and a refreshed list. It retains viewport
bounds, no document overflow, no unexpected requests and no page exceptions.

Evidence root:
`.ai-coder/checkpoints/logs/provider-availability-guidance-2026-09-06/`.

- `red-evidence`: old compiled UI failed at 320px on the incorrect off-state text.
- `verified-evidence`: first new run passed 12/12 semantic/browser scenarios,
  but direct screenshot review found the 320px warning capture preceded the end
  of its entrance animation. This is insufficient visual warning evidence.
- `final-evidence`: stronger checks wait for the warning to enter the viewport
  and its combined ancestor opacity to exceed 0.98. **12/12 passed**, with
  **48 captures** and **12 warning-position records**. The 320px warning capture
  was directly inspected and shows the complete two-line message.

Final report time: `2026-09-05T22:48:19.056Z`. Compiled entry SHA-256:
`f29739bdc796ea1060254e96bd57e42814e36554cc8fc6d4fd8cf43eda1bf167`.
Phone empty-state and desktop custom-form captures were also visually inspected.

Browser requests and identities are synthetic. This does not prove real
PostgreSQL persistence, live search, actual OTP delivery, native behavior, every
accessibility interaction or complete Stitch parity. The separate backend
checkpoint passed actual PostgreSQL CI, as recorded in the linkage audit.
Fresh CI remains required for these newer UI/documentation changes.

## Continue here

Weekly schedule still needs a separate saved-versus-suggested-hours review:
initial defaults, missing stored days, editing while refetch/save is pending and
account changes. Read-only cache clearing exists at the app root; do not falsely
claim it is absent or assume it protects local form state without testing.
Also inspect date-only labels under non-Philippine browser timezones. Continue
the direct-assignment, offer-acceptance and operator-visibility work documented
in the linkage audit. Those release gaps were not solved by changing this copy.

## Independent CI verification

Candidate `21e7f93d9b2ce29347b822ab00ed69919733a9ae` passed all four jobs in
CI `33997197201` and Gates `33997197220`. Mobile job `101389685601` explicitly
passed UX-1347/1348/1349 and **588 suites / 872 tests**, with **84 TODOs**, at
`2026-09-05T22:56:50Z`. This resolves the fresh-CI requirement for that
checkpoint, not deployment or the remaining linkage/accessibility work.
