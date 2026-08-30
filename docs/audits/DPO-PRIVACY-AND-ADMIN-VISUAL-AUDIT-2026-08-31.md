# DPO, privacy, and admin visual audit — 2026-08-31

## Outcome

This wave closes E34 and E38 in code. It does not claim production deployment.
The DPO is now an independent privacy-only account role, protected requests use
canonical account/session state, DPO role handovers revoke old credentials, and
the admin visual suite now photographs the current Stitch-derived operations
shell with meaningful success, loading, empty, and error states.

E32 still blocks Migration 158, deployment, and live verification on
`46.62.207.225`. E39 remains open for the broader privileged-account lifecycle.
E40 remains open for Philippine privacy counsel to settle DSR deadline wording
and breach-notification classification.

## Security and authorization findings corrected

### DPO route boundary

- DPO login lands on `/privacy`.
- DPO navigation, command search, breadcrumbs, and direct-route guards expose
  only Privacy Workspace, Data Protection, Consent Versions, password/account,
  and logout controls.
- DPO sessions cannot mount customer, provider, booking, dispatch, recurring,
  support, communications, dispute, payout, financial, tax, marketing, catalog,
  staff, settings, or general-audit pages.
- The API independently enforces the DPO/admin/super-admin action matrix.
- Plain admin does not inherit privacy-record access. Super admin retains
  fallback privacy authority.
- The old privacy/NPC tab is no longer mounted inside the mixed Compliance
  workspace. Breach UI remains held under E40.

### Canonical session state

- Migration 158 adds `users.session_version`, defaulting existing users to 1.
- Access, refresh, and admin pre-auth tokens carry the account generation.
- Every protected HTTP request reloads current role, active state, and session
  generation. Missing, inactive, role-mismatched, and stale-generation accounts
  fail closed.
- Authenticated Socket.IO handshakes apply the same canonical checks.
- Admin and DPO refresh duration is one eight-hour configuration contract;
  access and CSRF authority retain the shorter 15-minute cap.

### DPO handover

- Promotion accepts only an active plain-admin account.
- Removal returns that dedicated internal identity to admin. It cannot convert
  a DPO into a customer or provider persona.
- One locked transaction changes the role, advances `session_version`, deletes
  refresh sessions, revokes admin CSRF records, and writes the exact transition
  and revocation counts to `admin_actions`.
- Local sockets are disconnected after commit. A future horizontally scaled
  API must add a shared Socket.IO adapter so cross-instance disconnect is also
  immediate.

## Admin information-architecture and visual findings corrected

The prior baseline collection was not reliable enough for screen-by-screen
review. Many images predated the current admin shell, default routes silently
captured generic empty payloads, broad fixture routes masked state-specific
mocks, and the normal snapshot-update mode could retain changes below the
configured one-percent tolerance.

The repair forced a complete baseline rewrite with `--update-snapshots=all`,
then added semantic assertions and an adversarial SHA-256 comparison. The
following workspaces now render linked, realistic Metro Cebu records in their
default state:

- customer, provider, booking, recurring work, and business account queues;
- Booking 360, Customer 360, Provider 360, and dispute detail;
- booking support ownership, support queue, and customer/provider conversation
  moderation;
- payout and AML review, financial overview, audit evidence, and staff roles;
- DSR queue, consent versions, Compliance audit evidence, and Privacy Workspace;
- dispatch map, service areas, marketing attribution, pricing rules,
  notification templates, and system settings.

The records deliberately connect `CU-0001` (Visual Baseline), `PV-0001` (Cebu
Home Care), and `BK-0001` (post-construction cleanup) so screenshots exercise
customer/provider/admin links instead of isolated cards.

### False states found and repaired

- Communications error screenshots were loading screenshots because a broad
  route pattern never reached the queue error UI.
- Pricing Rules default equalled empty, and its error screenshot showed
  skeletons. It now has endpoint-specific populated, loading, empty, and
  post-retry error contracts.
- Analytics, Audit Log, Bookings, Business Accounts, Compliance, Consent
  Versions, Data Protection, Dispatch, Financials, Marketing, Providers, and
  Service Areas had default screenshots byte-identical to their empty state.
- Notification Templates, Customers, Recurring Work, and System Settings also
  received populated default records so their primary table/setting layouts are
  covered even where surrounding summary cards had previously made hashes differ.
- Cancellation Policy default and empty renders were effectively identical
  because the shared fixture returned no policy-version list. The default now
  renders a complete active policy, while a missing/inactive policy produces an
  explicit booking hold instead of a blank editor.
- Analytics and Catalog used only a small line of text to distinguish loading
  from source failure. Both now use the standard, actionable loading/error
  states and state-specific semantic assertions.
- The 1920px Manila clock made strict detail screenshots depend on the minute in
  which CI ran. Visual browser time is now fixed at a documented instant.

The first adversarial check compared encoded-file hashes and therefore detected
only exact duplicates. A manual size review exposed that weakness. The final
verifier decodes the images and compares changed pixels across all 60 available
1280px `default=empty` and `error=loading` pairs. Zero pairs differ by less than
2% of pixels. Human contact-sheet review covered all 31 default pages and all 30
loading, empty, and error page families.

## New operator-truth fix

Bug UX-575 was found during contact-sheet review. When the financial overview
source failed, the page displayed an error and still rendered six zero-valued
KPI cards. A company operator could treat those as real GMV, revenue, refund,
booking, and ticket figures. The page now hides those KPI cards, labels the
financial overview unavailable, and states that missing figures must not be
treated as zero. A real rendered test proves the false zero values are absent.

The decoded-pixel audit then found three more operator-truth failures. UX-576
makes a missing active cancellation policy an explicit booking hold. UX-577
makes unavailable cohort analytics visibly non-actionable instead of presenting
a tiny failure line. UX-578 does the same for catalog scope and pricing. Each
has one rendered behavioral regression test.

## Executed evidence

| Check | Result |
| --- | --- |
| Final admin Vitest suite | 170 files passed + 1 skipped; 280 tests passed + 3 todo |
| UX-575 rendered regression | 1 file, 1 test passed |
| UX-576 through UX-578 rendered regressions | 3 files, 3 tests passed |
| API Jest suite excluding Docker-only UX201 | 517 suites passed + 1 skipped; 3,114 tests passed + 1 skipped |
| Admin Playwright forced recapture | 396 passed |
| Populated-state targeted recapture | 222 passed |
| Fixed-time 1920px recapture | 129 passed |
| Final Playwright replay without updates | 396 passed in 5.1 minutes |
| Final Analytics/Catalog/Cancellation recapture and independent replay | 45 passed + 45 passed |
| Decoded 1280px state-pair audit | 60 pairs checked; zero below 2% pixel difference |
| Root ESLint | Passed |
| Root workspace typecheck | Passed |
| Admin production build | Passed |
| API TypeScript build | Passed |
| Environment contract | Passed, 80 keys |
| Gate A | Passed, 10 migration fragments |
| Gate C | Passed |
| Gates D and E | Passed in report mode |
| Phantom/screen inventory verifiers | Passed |

The Docker nginx/certificate test could not run because Docker Desktop is not
available in this environment. Migration verification recognized Migration 158
but could not inspect a live database because no `DATABASE_URL` was supplied.

## Production and synchronization truth

- No production file, schema, token, role, socket, service, or database row was
  changed in this wave.
- The supplied local SSH files are not usable private identities for the current
  production account. The server rejects the available keys with
  `Permission denied (publickey)`.
- GitHub synchronization may proceed only through the guarded topic PR and
  required CI. Production synchronization must wait for E32 to be cleared, then
  follow backup, Migration 158, deployment, old-token rejection, role-matrix,
  service-health, and live browser verification steps.

## Next audit loop

After this branch is green and merged, continue with the remaining customer and
provider browser/tablet surfaces, then return to the admin linkage matrix for
business accounts, projects/ProofFlow evidence, support ownership, payout and
refund trails, and privileged-account lifecycle containment. Do not convert E39
or E40 into implementation defaults without their required governance and legal
decisions.
