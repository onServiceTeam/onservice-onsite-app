# Provider decision notifications: guidance and destinations

Date: 2026-09-06, Asia/Singapore. Baseline
`9ec0078185c3e8761c9b405ad46cac4267d1f5e1`. Candidate work, not a live release.

## Defects and corrections

- **OPS-495:** new approval notices promised immediate job acceptance. Approval
  is not proof of configured services or availability. New notices now explain
  fresh sign-in and reviewing services, pricing and availability before accepting
  work. Only the body of future inserts changes. Notification type, target owner,
  provider ID, transaction and admission requirements remain unchanged.
- **UX-1341:** a declined applicant remains a customer, but the generic provider
  ID fallback sent their decision to a public provider profile. Customer approval
  and rejection notices now lead to owned application review. Already-authenticated
  providers open their dashboard after an approval notice, not the data-export/
  account-deactivation screen. The shared inbox/push resolver ignores unrelated
  payload IDs for these admission events. It does not grant roles or bypass auth.
- **UX-1342:** both inboxes clamped decision bodies to two lines, with no way to
  read the omitted instructions there. Approval and rejection messages now show
  their full body; ordinary notification previews remain compact. Existing colors,
  typography, cards and list spacing are retained.

No historic notification is rewritten, no decision repeated, no account changed,
and no money, schema, legal wording, external dependency or production setting is
changed by this checkpoint. A notification is guidance, never authorization.

## Verification, including failures

UX-1341 failed before the fix on a real rendered inbox tap: expected owned review,
received `/customer/provider/synthetic-provider` (2.713 seconds). Afterward,
25 focused notification files / 31 tests passed in 5.307 seconds. UX-1342 failed
before the fix on the rendered two-line restriction (1.651 seconds), then passed
after the correction (1.716 seconds). These tests render both actual inboxes with
synthetic notification service responses and the shared route resolver.

The full mobile suite then passed **581 files / 865 tests**, retaining **84 TODOs**,
in 109.132 seconds. Mobile/API TypeScript and changed-file ESLint passed. The
unchanged regression-ID gate passed with 1,533 titled regressions.

The full local API attempt was **not green**: 937 suites / 3,301 tests passed,
22 database suites/tests were skipped, and two Nginx tests failed because the local
Docker daemon was unavailable (180.168 seconds). No tests or gates were weakened
to conceal that environment failure. The subsequent focused API run passed 12
existing tests and explicitly skipped new OPS-495, pending safe PostgreSQL/CI.
OPS-495 exercises actual approval SQL and stored notification rows, preserving
an existing historical notice and refusing a duplicate approval without extra
notifications or audit actions. This is a focused schema test, not full migration
or external delivery acceptance.

The previous compiled bundle reproduced the actual 320px decision-text clamp.
Its failing screenshot/JSON remain in the checkpoint's `red-evidence/`. The new
Expo export built 4,364 modules in 69.989 seconds. All 291 tracked source files in
`apps/mobile/app`, `apps/mobile/src` and `packages/shared/src` matched the temporary
build after normalizing Windows line endings; the three changed files also had
exact SHA-256 copy checks. This is not an installed-dependency reproducibility claim.

The compiled browser audit passed **18/18 flows**: six widths (320, 390, 768, 1024,
1366, 1920), each with a declined customer, a retained customer approval notice,
and an authenticated provider approval. It measures unclamped/full text, executes
the actual tap, checks the intended screen and one mark-read request, and refuses
unexpected requests, page exceptions and horizontal document overflow. Thirty-six
captures and bundle hashes are retained under
`.ai-coder/checkpoints/logs/provider-decision-notifications-2026-09-06/`.

All browser HTTP, identities and decisions are synthetic. The retained-customer
approval scenario tests stale-session navigation and forced fresh sign-in, not a
claim that the current backend serves a new notice to revoked credentials. This
is not device-push delivery, real production authentication, actual SMS/PostgreSQL,
all inbox interactions or complete Stitch acceptance. Fresh CI must still execute
OPS-495 and the newer UX tests at the exact published candidate.

## Continue here

Confirm fresh CI by named regression, not the preceding checkpoint's green badge.
Then examine the other account-status notification destinations and full-message
access, actual device-push entry and first-provider service/availability setup.
Other lifecycle work remains open: immutable review revisions, request-changes/
resubmission, privacy/cleanup integration, migration-172 restore rehearsal and
paired authenticated publication. Local candidate, master and live are not aligned.

The earlier sign-in checkpoint independently passed all four CI jobs in
`33992639416` and all Gates in `33992639405`. API job `101377471165` explicitly
passed OPS-494 within 960 suites / 3,324 tests. Mobile job `101377471226` explicitly
passed UX-1339/1340 within 579 suites / 863 tests, with 84 TODOs, and built 4,364
web modules. That evidence applies to `9ec00781`, not these newer changes.
