# Admin operator query-cache isolation

Date: 2026-09-06, Asia/Singapore. Baseline
`b1b05b71775a8863a5937628c214b19ef8f0b1b0`. Candidate work, not deployed.

## Reproduction and correction

UX-1365 uses the actual App routes, auth store, Header logout, LoginPage and
Customer 360. A synthetic supervisor reads an unmasked customer, signs out,
and an ordinary operator signs in through the real form. Reopening the same
customer displayed the supervisor's cached private contact. The regression
failed on the actual unmasked phone in 4.14 seconds. Only HTTP and post-login
dashboard landing content are reduced in this test; no real identities,
credentials or production records participate.

The old module-level QueryClient survived logout/login. Record-ID keys from
E76 cannot separate different operators looking at the same record. E77
documents the recommended engineering containment and current user approval.

`AdminSessionQueries` owns a separate QueryClient for authenticated ID and role,
and a separate signed-out boundary. Changing owner remounts route state and
creates a fresh client. The retired client is cleared, never reused by the new
operator. Old callbacks retain their old reference and cannot write into the
new cache. Same-owner profile refresh retains caching and unfinished route
state. Existing query defaults are unchanged. App's hydration effect remains
outside the keyed boundary, avoiding repeated authentication bootstrap.

No server authentication, permission, cookie, money, ledger, financial hold,
booking or production service is changed. No dependency or gate is changed.

## Automated verification

- UX-1365 now passes. Four additional real-render behavior tests establish
  same-owner draft/cache continuity, same-ID role changes, late old query
  responses and late callbacks writing through the retired client. These four
  tests are supporting coverage, not four additional numbered bug claims.
- Focused auth/routing selection: **4 files / 7 tests passed**, 4.00 seconds.
- Full admin: **576 passing files, 1 skipped file; 663 tests, 3 TODOs**,
  **177.55 seconds**. Existing marketing-dialog description warnings remain.
- TypeScript, changed-file lint and diff checks pass. The unchanged regression-ID
  gate passes with **1,560 titled regressions**. No API/mobile source changes.

## Compiled browser evidence

Evidence: `.ai-coder/checkpoints/logs/admin-actor-cache-2026-09-06/`.

- `red-evidence` uses the prior compiled customer candidate. The first 320px
  customer scenario fails because the new masked contact is absent; the
  retained failure screenshot visibly contains the old private phone/email.
  This is **0 completed scenarios**, not a passing baseline matrix.
- `verified-evidence`: **24/24 scenarios passed**, customer and provider records
  with either a completed or delayed supervisor profile response, each at
  **320, 390, 768, 1024, 1366 and 1920px**. Actual compiled logout and login
  controls execute, with synthetic HTTP/cookies. After login the real router
  returns to the same record without an app reload.
- Each scenario verifies the new operator identity, a fresh masked record read,
  absence of old private contact, its own reveal action, restricted-action
  visibility, and exactly one initial auth bootstrap. Delayed old responses
  contain the raw supervisor payload captured before logout, not a fixture
  accidentally changed to the new operator's masked payload.
- **72 captures**, zero unexpected HTTP, zero page exceptions and zero recorded
  document overflow. The only **48 writes** are synthetic login/logout calls.
  No money, reveal, status, session-revocation or fraud action is submitted.
- Realtime connections are explicitly blocked by the harness. Socket lifecycle
  and production authentication are not certified. Direct visual review covers
  the old phone leak, corrected narrow customer, and desktop delayed provider.

The isolated build transformed **2,846 modules in 45.35 seconds**. All **92
runtime source files** match after newline normalization; App.tsx, main.tsx and
AdminSessionQueries.tsx additionally match exact file hashes. A first bytewise
comparison detected Windows line-ending differences. Two normalization commands
then failed on empty-file reads; the final fail-fast ReadAllText comparison
completed with no mismatches. Those failed checks are not counted as verification.

Report time: `2026-09-06T01:31:13.408Z`.
Entry-script SHA-256: `82df59ca6fc617836baa6b410fd7ffac849ec021d54724008d8e5ab91310b838`.
Index SHA-256: `9cb463a76b9cab310a7bbb97b995f825880ecf99f333954bf75b149d5c51bc35`.

## Remaining boundaries

Fresh GitHub CI is required for this candidate. No merge/deployment is claimed.
This fix does not cancel work already processed by the server, govern stale
HTTP refresh/replay, guard async auth-store completion, close socket lifecycle,
or detect another tab changing cookies. A same-ID credential replacement that
never passes through signed-out state is not certified by the ID/role key.
Global toasts and downloaded document completion need separate review.

Provider phone-title truncation, customer generic fraud-dialog identity context,
action accessibility, assignment eligibility and broader Stitch/spec coverage
remain open. Full migration-172 rehearsal, paired publishing, authenticated live
acceptance, native baselines and external launch sign-offs remain separate work.
