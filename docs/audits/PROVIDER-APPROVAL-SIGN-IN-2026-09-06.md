# Provider approval and fresh sign-in

Date: 2026-09-06, Asia/Singapore. Baseline `6aba2062ddd036a2d071995dee66c712ee4d3bed`
on the existing reviewed candidate branch. No deployment or full lifecycle closure.

## Finding and decision

Approval changes the applicant's canonical account role from customer to provider.
The D34 session contract rejects access and refresh credentials carrying a different
role. However, the review screen attempted automatic refresh and then `/auth/me`
to promote its local account. Earlier tests supplied a successful mocked rotation;
that was not proof that the real backend could perform this transition.

Preserve the server security contract. A terminal failed rotation already clears
the live session. UX-1339 adds a non-persistent, non-identifying notice to the
login screen explaining fresh sign-in. It does not infer approval from a generic
401, expose a prior account's information or submit another application. Successful
OTP authentication clears the notice and receives the current account authority.

If a review screen observes an approved status, it now offers explicit **Sign in
again** instead of attempting an impossible role refresh or promising a usable
customer workspace. It ends the old session through the existing guarded logout.
Route guards follow actual auth state; no delayed completion navigates or promotes
another account. Current account, generation, route and observation checks remain.
Approval copy distinguishes access from configuring services and availability.

This is an engineering correction under Ken's existing authorization, consistent
with D34. No API authorization, role-admission rule, money path, schema, historical
transaction, legal text or external dependency has been loosened or changed.

## Evidence and limits

The new rendered UX-1339 test uses the actual mobile HTTP wrapper and auth store
with synthetic HTTP responses and secure storage. Before the fix, it reached the
plain login screen but failed because the sign-in explanation was absent: one
failed test, 8.886 seconds. An earlier sandbox run could not read a dependency and
never executed tests; the authorized rerun produced that real failing result.

After the correction, 15 focused session/review regressions passed in 5.526 seconds.
The complete mobile suite passed 578 files / 862 tests in 78.403 seconds, retaining
84 TODOs. Mobile/API TypeScript and changed-file ESLint passed. A Windows command
with an unescaped regex pipe failed before test execution; explicit filename
patterns resolved the invocation without changing tests or their selection intent.

UX-115 and UX-1330/1331/1332 were updated, not removed. They retain real-render
checks for no status-only promotion, explicit retry, different-account/same-owner
fresh-login isolation and retained-route late responses under the corrected
fresh-sign-in contract. They no longer assert the incompatible automatic refresh.

OPS-494 mounts actual auth, applicant and admin-decision routes using the safe
localhost `*_test` unique-schema harness. It exercises real OTP generation/hash/
consume, JWT issuance, persisted refresh rotation before approval, admin approval,
old access/refresh rejection, wrong/replayed OTP refusal, fresh provider sign-in,
`/auth/me`, approved status and new refresh, without duplicating the application.
SMS, security-event delivery/lockout and device-registration edges are mocked;
dev OTP bypass is explicitly disabled. This is a focused schema fixture, not the
entire production schema, external SMS delivery or lockout acceptance.

OPS-494 was **skipped locally**, not passed, because no safe local PostgreSQL
service was available. Exact-candidate CI remains pending at this publication
checkpoint. The preceding documentation-only commit
independently passed CI `33990476197` and Gates `33990476201`; that evidence must
not be reused for these newer changes.

## Browser discovery and correction

The initial compiled-browser run genuinely failed at the 320px OTP screen. The
first and last boxes extended beyond the form, and document overflow measured
4px. The failed screenshots and JSON are retained separately under the checkpoint
folder's `evidence/`, not replaced with passing images. This was an existing shared
layout bug exposed by completing the reauthentication journey.

UX-1340 allows each preferred 48px digit box to shrink within the available row;
56px height and the full-row browser input remain. No overflow masking, smaller
code length, verification bypass or style-token replacement was used. Its rendered
regression failed on the missing shrink behavior before the fix (17.655 seconds),
then passed alongside UX-315 (two tests, 1.645 seconds). The test exercises all five
supported lengths, 4 through 8, and actual input filtering and rendered digits.
Its jsdom style assertion is not represented as a pixel-layout test.

The corrected Expo web export built 4,364 modules in 13.156 seconds. Five changed
runtime files were SHA-256 compared against the isolated temporary build inputs.
The compiled browser harness then passed **60/60 journeys**: six widths (320, 390,
768, 1024, 1366, 1920), five code lengths and two review variants. Normal mode
models old-role access/refresh rejection. Explicit mode deliberately models a
retained/legacy approved response and tests the explicit sign-out button. They
are not presented as two responses the current backend normally permits.

All journeys execute real compiled review, login, code input and provider-dashboard
navigation, with synthetic HTTP, identity and OTP responses. Each verifies cleared
old identity, one verification request, the same newly authenticated provider,
no repeat application/draft write, zero unexpected requests/page exceptions and
no document overflow. Every digit's actual browser bounds fit its row, with a
readable minimum width and retained tap height. `verified-evidence/results.json`
records bundle hashes, bounds and 240 captures. This is not real SMS delivery,
production authentication, native-device or complete dashboard/Stitch acceptance.

After the shared input correction, the complete local mobile suite passed
**579 files / 863 tests**, with **84 TODOs**, in 189.555 seconds. Mobile/API
TypeScript and changed-file ESLint passed again. Fresh CI remains required.

## Continue here

Verify OPS-494 in fresh GitHub CI. Then examine admission-to-bookability guidance:
the existing approval inbox still promises immediate job acceptance even when no
priced services or availability have been configured. Immutable review revisions,
request-changes/resubmission, cleanup/privacy integration, migration-172 rehearsal
and paired authenticated release acceptance remain open. Topic, master and live
server are not aligned. No live account or production record was changed here.
