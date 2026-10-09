# Provider application client-session checkpoint

Historical foundation checkpoint. The subsequent six-step wiring and submission
stage is recorded in `PROVIDER-APPLICATION-STEP-INTEGRATION-2026-09-06.md`.
Statements below about components not yet being wired describe this checkpoint,
not the later integrated candidate.

Date: 2026-09-06 (Asia/Singapore). Baseline:
`87b1450749c0516b1cd1a500eb2ed9adddf1a921` on
`codex/financials-operator-truth`. Scope: staged E35/E74 applicant draft UI
foundation and one reproduced authentication defect. Not a deployment.

## What is and is not connected

The owner-bound draft client, in-memory session coordinator, loading boundary
and explicit draft-action component are implemented and behavior-tested.
Authentication now invalidates private draft memory on sign-out, terminal
expiry, owner/role transitions and a fresh same-owner login. Profile-only edits
do not discard an application. A delayed logout can no longer erase a newer
login; normal logout still clears its own session after a network failure.

**The new loading boundary and action component are not yet rendered by the
onboarding layout or its six applicant steps.** Existing application screens
are unchanged in this checkpoint. This is intentional staging, not completed
draft resumability or screen acceptance. They must be connected together with
the final save/revision/agreement submission path. Enabling only the early-step
saves would leave the old submit screen unable to submit an active draft.

No customer/provider/admin application role is granted by saving or restoring
a draft. The auth changes affect cleanup and delayed logout only, not server
approval authority, financial transactions or legal agreement wording.

## Contract and behavior

- Draft responses must have a successful, typed envelope, bounded fields,
  revision and ordered timestamps. Four restored document references must be
  private keys under the expected applicant's namespace. Unexpected response
  fields, including agreement acceptance, fail closed.
- The client mirrors the API's incomplete draft schema. It preserves partial
  reference entries; it does not silently turn an incomplete reference into a
  completed one or persist an agreement checkbox.
- Hydration finishes before controls initialized from the store can mount.
  Failures show an explicit retry. A confirmed reload or discard changes the
  generation so local controls and delayed picker callbacks cannot reuse it.
  Canonical application-status screens bypass draft loading, inside the
  existing outer role boundary.
- Saves are explicit and locally serialized. They carry the last observed
  revision. Failure retains form fields. A revision conflict disables saving
  until an explicitly confirmed reload; there is no force-overwrite path.
- A save finishing after the user has typed more does not navigate forward or
  overwrite those controls. The component asks the user to save the newer work.
- Discard requires confirmation and uses the exact revision in the DELETE
  body. Failed deletion preserves memory. With no saved revision, discard
  clears local fields only and does not claim to delete a server draft.
- Detailed timestamps use Philippine time. Recovery and retention details
  are collapsible to avoid an unnecessarily tall default action area. Uploaded
  files, submitted records and backups are not claimed to be deleted.
- Draft state has no public-storage persistence, generic audit snapshot,
  payload logging, automatic submit, or privileged override. The existing
  shared fetch wrapper independently protects delayed account-bound HTTP.

## Verification evidence

The preceding published baseline passed GitHub CI `33974769862` and Gates
`33974769636`. All four CI jobs succeeded. The completed mobile log explicitly
records UX-1314 at `2026-09-05T15:27:00.6702554Z`, UX-1315 at
`2026-09-05T15:28:01.7261771Z`, and 555 suites / 839 passed tests plus 84 TODOs
at `15:28:18Z`. This is evidence for that baseline, not this later checkpoint.

New behavioral tests:

| ID | Executed behavior |
| --- | --- |
| UX-1316 | Real loading/retry render, invalid response rejection, initial-value hydration before mount, no restored consent, status-route bypass |
| UX-1317 | Real save/retry/conflict/reload actions, preserved input, exact outgoing revision, no navigation after newer typing |
| UX-1318 | Real auth/session stores, delayed hydration/save invalidation, same-owner re-login, profile edit, staff transition, terminal expiry and logout |
| UX-1319 | Real discard confirmation/cancel/failure/success, exact DELETE revision, cleared fields and invalidated callback generation |
| UX-1320 | Real auth store, old logout versus a newer same-owner login, normal logout after profile update/network failure |

The initial UX-1318/1320 runs hit test-environment setup errors (native module,
mock initialization and missing storage functions). Those errors are not
counted as reproduced application defects. After correcting the fixtures,
UX-1320 failed on the intended assertion: the old logout called `clearTokens`
after a fresh login. It then passed after the identity-generation correction.

Local verification:

- Full mobile suite: 560 files / 844 passed tests, 84 existing device TODOs,
  105.89 seconds. No TODO is counted as a pass.
- After the final compact recovery presentation and type-annotation changes:
  focused eight files / 13 tests passed in 3.429 seconds.
- Changed-file ESLint passed with zero warnings after fixing two missing
  return-type annotations. The earlier warning-bearing run is not a clean gate.
- Final unchanged-code rerun: 560 files / 844 passed tests, 84 existing TODOs,
  105.81 seconds. Mobile TypeScript and zero-warning changed-file lint passed.
  TypeScript first caught an unchecked test callback; the test now explicitly
  asserts that the real auth store registered its expiry handler before use.
- Regression-ID check: 1,508 titled regressions passed. No gate configuration,
  allowlist, branch protection or test expectation was weakened.

HTTP responses in these client tests are controlled fixtures; native primitives
use the documented DOM harness. They do not prove browser persistence, native
camera behavior, cross-device delivery, full migration-chain compatibility,
production credentials or visual parity. Actual PostgreSQL draft/submission
proof remains separately recorded in `provider-application-lifecycle.md`.

## Next implementation stage

1. Wire the loading boundary around the existing draft-step guard and stack.
   Preserve the outer customer-only role boundary and canonical status exits.
2. Wire Categories, Service Area, Vetting, Documents and Selfie to explicit
   save/continue using their actual current controls, not stale store values.
   Keep partially entered optional references or require an explicit removal.
3. Bind picker, camera, location, upload and save callbacks to the captured
   owner/generation before starting a request and after every await. Changing
   the selected market during location capture must not apply the old result.
4. Wire Terms to save one normalized final payload, then submit exactly that
   payload with the returned revision and a freshly affirmed agreement. Keep
   network uncertainty distinct from rejection or confirmed submission.
5. Exercise every step and status path, restart/reload/account/multi-tab cases,
   keyboard access and all required Stitch viewports. Keep the action area
   scroll-safe, especially Categories and the currently non-scrollable Selfie.
6. Check the push-token unregister helper's delayed local-marker removal
   separately: its `finally` currently removes the marker unconditionally.
   The logout token fix is not a claim that every account-scoped cache or
   notification-registration race is closed.
7. Complete cleanup/privacy inventory, immutable reviewer revisions and
   same-record request-changes/resubmission. Then rehearse migration 172 in
   the full paired candidate and perform authenticated release acceptance.

No server writes, migration, seeded identity, money adjustment, release label,
master merge or deployment ran in this checkpoint. E35/E74, full Stitch
acceptance and launch readiness remain open. Local/topic publication is not
equivalent to master/production alignment.
