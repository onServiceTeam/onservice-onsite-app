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
rows. The candidate worker now schedules one 100-row attempt every five minutes,
with three attempts and exponential one-minute retry backoff. It never takes a
cutoff or limit from queued payloads. Job failures propagate rather than report
successful cleanup. This schedule is not yet deployed. Object storage cleanup,
backup expiry and submitted-evidence retention remain separate E21 work. Do
not claim that draft expiry erases documents or all personal data.

The private account archive now includes `providerApplicationDraft` when a row
is retained. An absent row is null in JSON and omitted as an empty CSV section,
following the existing serializer. It contains the stored fields, revision and
timestamps, plus `expired` evaluated by the database at export time. Unlike
resume, this owner-scoped read includes an expired row awaiting cleanup and
does not depend on current applicant eligibility. It does not extend expiry,
grant access to another owner's draft or mint uploaded-document URLs. A failed
draft read fails the archive, not an apparently complete export missing data.
Migration 172 is required for this archive projection as well as submission.

## Remaining work before this can be offered to applicants

1. Complete atomic submission and authenticated paired-candidate acceptance.
   The isolated exact-image full-chain migration rehearsal is now recorded in
   `docs/audits/EXACT-IMAGE-MIGRATION-172-2026-09-06.md`; it is not authenticated
   application acceptance or a production migration.
2. Complete actual browser/native acceptance of the now-wired six-step draft
   flow, including owner-bound hydration, save/recovery/discard, logout/reset,
   expiry and final revision-aware submission. Candidate DOM behavior evidence
   is not a substitute for authenticated browser/device acceptance.
3. Verify scheduled cleanup and private draft exports on the paired candidate,
   including queue/backlog operation. The current draft-specific inventory is
   recorded below, but the approved E21 deletion manifest is not implemented.
4. Verify browser refresh, app restart, account switching and multi-tab races
   through actual UI flows and all required Stitch viewports.
5. Add reviewed immutable revisions, request-changes/resubmission, reviewer
   assignment/notifications and a governed legacy-admission path on the same
   provider identity. Preserve previous evidence; never manufacture KYC or
   retrospectively grant an approval.
6. Revalidate the selected release's schema, API and both web artifacts together
   before any live rollout; earlier retained artifacts are not automatically
   eligible because newer tests pass.

## Draft-specific privacy inventory, 2026-09-06

This describes implemented candidate behavior, not an approved legal retention
matrix, a complete app-wide inventory, or evidence of production erasure.

| Data location | Current behavior | Remaining requirement |
| --- | --- | --- |
| `provider_application_drafts` | One typed row per owner. Active drafts can resume; retained active or expired drafts enter the owner's private archive. Saved expiry controls bounded row cleanup. | Verify deployed scheduling, backlog and actual owner archive/download acceptance. |
| Account anonymization | Updates/deactivates the owner but does not remove the draft row. A foreign-key delete cascade does not run when the user is only updated. Expiry remains independent. | Approved E21 action and canonical DSR/execution linkage; do not claim complete erasure. |
| Private onboarding uploads | Draft fields store owner-scoped opaque keys. Removing or expiring a draft does not remove the referenced files. | Shared/submitted-evidence reference inventory and approved physical deletion/exception workflow. |
| Generated account archives | A private JSON/CSV artifact can contain a copy of the draft after its source row expires. The existing archive lifetime is seven days and download links last five minutes. | Verify physical artifact expiry and retained backup treatment; source-row cleanup alone is insufficient. |
| Submitted provider evidence and backups | Separate from unfinished drafts and untouched by this job. | Approved class-specific retention/access controls, immutable review revisions and governed legacy admission. |

Operators can inspect completed job counts and failures in the existing scheduler
logs/queue. This change adds no admin purge button, applicant-data log or claimed
backlog dashboard. A full 100-row batch indicates possible backlog, not an exact
remaining count; repeated failures or full batches require scoped investigation.
Do not clear failed jobs or increase deletion scope merely to make monitoring
green. Evidence and bounded-capacity limits:
`docs/audits/PROVIDER-DRAFT-EXPIRY-EXPORT-2026-09-06.md`.

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

## Six-step client integration, later on 2026-09-06

The layout now hydrates before the incomplete-step guard and all six applicant
steps render explicit draft actions. Terms normalizes once, saves, and submits
that exact version with fresh agreement acceptance. The role-choice entry and
canonical status screens remain independent of draft availability. Delayed
picker/location/upload/save operations are bound to applicant and screen scope,
including multipart preparation before HTTP and native back-stack retention.
This supersedes the earlier foundation-only wiring status, not its history.

UX-1321 through UX-1327 exercise the actual controls/coordinator/helper. Full
mobile verification passed 567 files / 851 tests with 84 existing TODOs. Detailed
evidence, test limits, design-source availability and remaining release gates:
`docs/audits/PROVIDER-APPLICATION-STEP-INTEGRATION-2026-09-06.md`.
No migration 172 deployment, full-chain rehearsal or authenticated release
acceptance is implied. E35/E74 and full Stitch/launch acceptance remain open.

## Admin declaration projection, 2026-09-06

The candidate Provider 360 profile adds `declaredCategories`, separate from
`services` and its deprecated priced `categories` projection. Application
submission writes category-only `provider_services` rows with no subcategory;
the service-price join previously omitted those declarations entirely.
The new read includes this provider's active category-only associations,
deduplicates identical category rows and exposes the current catalog name and
active flag. A subsequently disabled catalog category remains visible for
review. It does not create a priced service, change an approval, or infer
bookability. Existing priced-service fields and stored prices are unchanged.

These are current retained declarations, not immutable application revisions.
The admin explicitly labels that distinction and treats an older API omitting
the new field differently from an empty selection. It does not substitute the
legacy priced-category projection. OPS-493 adds focused real-PostgreSQL HTTP
handoff coverage; UX-1338 renders the actual profile tab. Execution evidence and
remaining boundaries: `docs/audits/PROVIDER-ADMIN-HANDOFF-2026-09-06.md`.

## Approval session handoff, later on 2026-09-06

Canonical role checks reject pre-approval customer access and refresh credentials
after the owner becomes a provider. Approval is not a token-refresh promotion.
The review UI now offers explicit fresh sign-in, while terminal session expiry
explains that step on the login screen without inferring approval from an error.
The ordinary verified-mobile-number login returns the current account role.
An application status label alone never grants provider authority. Signing in
again does not create or resubmit an application. Approval also does not establish
priced services, availability or job eligibility. The former mocked automatic
activation tests have been corrected to this contract; exact execution scope and
remaining evidence are in `docs/audits/PROVIDER-APPROVAL-SIGN-IN-2026-09-06.md`.
