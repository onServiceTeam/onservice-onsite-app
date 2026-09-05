# Provider application lifecycle: staged implementation

Date: 2026-09-05. Status: candidate backend foundation, not a deployed or
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
  same owner. Final conversion must join this transaction boundary, not race
  it with a separate post-submit draft deletion.

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

1. Atomically validate/consume the exact draft revision when creating the
   canonical submitted application. Retain the draft when submission fails.
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
