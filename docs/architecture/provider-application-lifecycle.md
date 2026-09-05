# Provider application lifecycle: staged implementation

Date: 2026-09-05. Status: candidate draft/submission backend, not a deployed or
complete lifecycle. Ken approved the recommended escalation choices in the
current task. This record implements part of E35/E74; it does not close them.

## Source of truth

Keep one submitted provider identity in `providers`, with its linked service
categories, primary market and review evidence. Provider 360 remains the
approval authority. Do not revive the disconnected progress-table decision
path or put applicant payloads into generic audit events.

The separately typed `provider_application_drafts` row is **unsubmitted work**,
not another approval state. Saving it cannot create a provider, grant a role,
change availability, clear a fraud restriction, or enter an admin review queue.
The legacy progress table has not been deleted or migrated. Its last recorded
read-only production inventory found zero rows; that is not permission to
invent evidence for the six already-approved legacy providers.

## Implemented candidate draft contract

- `GET /api/v1/providers/application-draft` returns the current account's
  active draft or null. No user-ID parameter or operator override is accepted.
- `PUT` replaces the whole typed draft, with `{ expectedRevision, fields }`.
  A null revision means a fresh read found no active draft. Each accepted save
  receives a new UUID. A stale revision returns a stable conflict instead of
  overwriting newer work. An expired or deleted/recreated draft cannot reuse
  a previous revision.
- `DELETE` requires the current revision and removes only that draft row.
  An already-absent row is an idempotent success. It does not delete uploaded
  objects, submitted applications, financial records, or backups.
- Every response, including authentication and conflict failures, is marked
  `private, no-store`. Authentication checks current role/session generation;
  the service then locks the owner and rechecks active customer eligibility,
  fraud restriction and absence of an existing canonical provider.
- The lock order is owner, then draft. Initial submission already locks that
  same owner. Conversion joins this transaction boundary, not a separate
  post-submit draft deletion.

`POST /api/v1/providers/apply` additionally accepts `draftRevision`. With an
active draft, that revision and the complete submitted fields must match the
saved draft, after normalizing upload URLs to owned private keys. A matching
revision alone is not permission to submit different or unsaved details. The
client must save its final normalized submission fields before sending this
request; it must not trim/filter fields differently between that save and apply.
Resumed object keys are accepted by the application parser, with the existing
service ownership check still mandatory. Agreement acceptance is required on
the apply request itself and is never restored from the draft.

The provider, market/category links and draft removal commit together. An error,
including failure of the final draft removal, rolls them all back. Current
market/category eligibility is still checked; saving a draft does not reserve
an inactive category or authorize an out-of-market pin. Older clients without
a revision work only if no active draft exists. An absent/expired supplied
revision returns a conflict. A successful older-client submission also removes
any expired draft row, never uploaded objects or historical applications.

Migration 172 is now required for submission on this candidate, including
older clients. A missing draft table/column returns the existing safe schema
unavailable 503; it must not fall back to ignoring saved work. Rehearse and
apply the additive schema before rolling out this API.

Fields are limited to the existing application: business name, category IDs,
market and exact operating pin, radius, city/province, four owned private
document keys, optional NBI date/ID metadata/experience and the explicitly
listed questionnaire/reference fields. Incomplete text and reference entries
are allowed in a draft; final submission still has its stronger requirements.
Agreement acceptance, approval status and arbitrary nested fields are rejected.
Stored upload references are normalized private owner keys, not bearer URLs,
document bytes or public image copies. No field payload is written to logs.

The service caps individual fields and the encoded UTF-8 payload at 16 KB.
Migration 172 additionally checks JSON object/root keys, private owner prefixes,
timestamp order and a 20 KB database representation cap. Nested field types
are enforced by the strict service schema, not by a claimed SQL JSON schema.
The owner primary key bounds this to one current draft per account. A separate
expiry index supports bounded cleanup without scanning all active drafts.

## Expiry decision and privacy limits

Use 30 days since the last successful save as the initial engineering default
for unfinished work. Reads do not extend that period. This balances resuming
an interrupted application against retaining abandoned identity metadata.
The API returns the exact expiry timestamp for explicit applicant-facing copy.
This number is **not attorney/DPO approval of a legal retention schedule**.

Expired rows are hidden immediately. The cleanup service removes only expired
rows, defaults to 100 per invocation, permits 1 through 500, and skips locked
rows. Worker scheduling has not yet been connected. Object storage cleanup,
backup expiry and submitted-evidence retention remain separate E21 work. Do
not claim that draft expiry erases documents or all personal data.

## Remaining work before this can be offered to applicants

1. Rehearse the full migration chain and atomic submission on the paired
   candidate. Focused database CI has passed; it is not the full rehearsal.
2. Connect owner-bound mobile/web hydration, save status, retry, conflict
   recovery, discard, logout/reset and expiry messaging to every onboarding
   step. Agreement acceptance must still occur at submission, not in a draft.
3. Schedule bounded cleanup and integrate draft data with account privacy
   exports/deletion inventory, without claiming complete E21 erasure.
4. Verify browser refresh, app restart, account switching and multi-tab races
   through actual UI flows and all required Stitch viewports.
5. Add reviewed immutable revisions, request-changes/resubmission, reviewer
   assignment/notifications and a governed legacy-admission path on the same
   provider identity. Preserve previous evidence; never manufacture KYC or
   retrospectively grant an approval.
6. Rehearse migration 172 in the full candidate migration chain and perform
   paired authenticated acceptance before any live rollout.

## Evidence at initial publication

- OPS-485: real schema/service input validation, one local test passed.
- OPS-486: real PostgreSQL owner isolation, canonical account locking and
  existing-application restrictions.
- OPS-487: real concurrent writes/discards, rollback, expiry/recreation.
- OPS-488: actual migration constraints and bounded locked-row cleanup.
- OPS-489: mounted HTTP routes, real JWT/current-session authentication and
  database service, private responses and conflict handling.

The four PostgreSQL tests are explicitly skipped when no safe local test
database exists and must execute in CI. Their harness permits only a localhost
`*_test` database, creates a unique owned schema, applies the actual additive
migration and removes only that schema. This is not proof of the full migration
chain, uploaded-object existence, browser acceptance or production readiness.

Foundation commit `f80d41ffc8e4edcf4f1f2c2dc8913d905a293f18` passed CI
`33972140158` and Gates `33972140143`. The API job's completed logs show
OPS-485 through OPS-489 passed (955 suites / 3,319 tests overall). All four
CI jobs succeeded. This verifies the foundation, not the later submission
integration or its UI.

OPS-490 adds actual database stale/unsaved-field checks, atomic final-consume
failure and concurrent submission. OPS-491 exercises apply through the real
router/auth/database with restored keys, current revision and fresh agreement.
OPS-492 covers absent/expired drafts, older clients and missing migration.
The final local provider selection passed 103 files / 252 tests in 10.724
seconds with 13 explicitly skipped PostgreSQL files/tests. API TypeScript,
changed-file lint and the unchanged regression-ID gate passed (1,501 titled
regressions). Fresh CI for OPS-490 through OPS-492 is required after publication.

Submission commit `2d657b3b615e198385610a03d1e7f48cb169e752` passed CI
`33973157203` and Gates `33973157202`. The completed API logs explicitly name
OPS-490, OPS-491 and OPS-492 as passed (958 suites / 3,322 tests overall), and
all four CI jobs succeeded. This supersedes the preceding CI uncertainty.

UI preparation found two additional requirements. Categories keep local name/
selection state until Next, so restoring the global store after the screen has
already mounted would not hydrate those controls. Hydration must precede screen
mounting or explicitly synchronize all local controls. Documents correctly keep
only transient local image previews and otherwise show an on-file placeholder;
do not turn restored private keys into public image requests. Also, the shared
transport must bind delayed responses and token refresh/replay to their initiating
account/session (UX-1314/1315), independently of owner-bound draft memory. Neither
transport protection nor backend storage alone constitutes UI resumability.

## Client-session foundation, 2026-09-06

The typed client, owner/generation-bound memory coordinator, loading boundary
and explicit save/reload/discard component now have real behavior/render
coverage (UX-1316 through UX-1319). Auth transitions clear applicant memory;
UX-1320 additionally reproduces and fixes a delayed logout erasing a newer
same-owner login. The action/loading components are deliberately **not yet
wired into the applicant layout or steps**. Final payload normalization and
revision-aware submission must be connected in the same next stage before
offering the feature. No UI-resumability, browser-acceptance or deployment
claim is made. Detailed evidence and continuation checklist:
`docs/audits/PROVIDER-APPLICATION-CLIENT-SESSION-2026-09-06.md`.

The preceding transport commit `87b1450749c0516b1cd1a500eb2ed9adddf1a921`
passed CI `33974769862` and Gates `33974769636`, including the explicitly named
UX-1314/1315 regressions, 555 mobile suites / 839 tests and all four CI jobs.
That independent verification does not apply to later unpublished work.
