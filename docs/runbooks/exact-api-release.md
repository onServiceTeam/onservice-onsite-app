# Exact-revision API release

## Scope and current limitation

OPS-476 corrects an API deployment defect: loading `onservice-api:<SHA>` did not
make the old Compose activation command select that image. A healthy old API
could therefore be reported as a successful new deployment. The workflow also
previously checked out moving `master` while naming artifacts with the original
dispatch SHA.

OPS-478 is a separate release blocker discovered during runner review: the
previous `node-pg-migrate up <basename>` command selected only that file, not
all pending prerequisites through it. OPS-476's image-identity tests did not
establish this library behavior. Do not deploy an older helper merely because
its dry run and final-file application both report success.

The corrected workflow checks out the exact dispatch revision, labels the image
with that revision, bundles that detached HEAD, and uses the release override for
both migrations and API activation. It does **not** deploy either web bundle.
Do not use an API-only success message as proof of customer/provider/admin
alignment, a full rollout, or business acceptance. The shared nginx, PostgreSQL,
Redis, uploads and other businesses are not restarted by the activation helper.

## Preconditions before an operator invokes the workflow

1. Confirm the exact reviewed revision is on master and its CI/gates have the
   required evidence. Report-mode visual/mutation gates are not acceptance.
2. Record the existing checkout, running API image ID and previous web artifacts
   privately. Keep the old API image loaded. Do not prune images during rollout.
3. Confirm recoverable database/uploads/configuration/source backups and an
   isolated restore rehearsal. Back up **before changing the checkout**, not
   only before schema migration: the workflow's automatic pre-migration backup
   runs after fast-forwarding and does not substitute for that earlier source
   checkpoint. See `postgres-restore.md`.
4. Review migration compatibility and test the exact image's migration runner
   against an isolated restoration. Supply the exact final reviewed migration
   basename. Do not use a raw SQL replay as proof of runner bookkeeping.
5. Prepare both web artifacts and their separate bounded publication/rollback
   plan. Determine whether the old web clients can safely use the new API. Do not
   invoke the API-only workflow when a coordinated interface change is required
   and the matching frontend release is not ready.
6. Verify the actual production connection/identity privately. The workflow
   requires configured deployment secrets; do not publish credentials or upload
   a shared-server SSH key to another service merely to make this workflow run.

## Helper behavior

`docker-compose.release.yml` overlays only the API image and forbids pulling.
`scripts/server/release-api-common.sh` rejects an absent/invalid full SHA, a
different HEAD, tracked edits, missing Compose files, an unloaded image, or an
image whose revision label differs. Both following commands must run from the
reviewed marketplace checkout with the same full SHA:

```bash
sudo -n env ONSERVICE_RELEASE_SHA=<40-character-reviewed-commit> \
  MIGRATION_TARGET=<exact-reviewed-migration-basename> \
  bash scripts/server/run-production-migrations.sh

sudo -n env ONSERVICE_RELEASE_SHA=<same-40-character-reviewed-commit> \
  bash scripts/server/activate-api-release.sh
```

The first helper always dry-runs before applying. The image's
`scripts/run-reviewed-migrations.mjs` treats the exact target as an **inclusive
upper bound** and loads every SQL migration through it. The real runner applies
all unapplied files in that set, not only the final one. Historical out-of-order
entries retain the documented `checkOrder: false` compatibility setting.

The bounded runner rejects a missing target, duplicate sequence prefixes,
duplicate applied history, and recorded migrations absent from the image or
beyond the requested boundary. Validation and execution share the existing
runner's advisory lock. It verifies the complete resulting history and refuses
to call a partial set successful. Later files are excluded from loading.

Dry-run failure prevents application. `MIGRATIONS_DRY_RUN_ONLY=1` does not apply
pending migration SQL or mark it applied. On an initial empty database the
underlying library can create its metadata table even during a dry run; do not
describe bootstrap dry runs as entirely read-only. Release mode requires an
exact upper bound; the no-SHA/no-target initial-install caller selects the last
file in its image. That bootstrap path is not an ordinary release deployment.

This does not make all historical SQL atomically reversible. Some repository
migrations include explicit transaction boundaries. Real restore rehearsal,
partial-failure inspection and compatible rollback planning are still required.

Activation uses `--no-deps --no-build --pull never`, checks the running container's
actual image ID, checks `/health/ready`, and confirms the same service container
still exists afterward. A wrong image, failed startup, changed container or
readiness timeout is failure, not deployment success. It does not echo the
container environment or automatically print application logs.

These revision/health checks do not prove business behavior, safe data changes,
immutable artifact signing, every possible concurrent operator interaction, or
frontend compatibility. An operator must still perform release acceptance.

## Failure and rollback

An error may occur after source fast-forwarding or after the API has changed.
The helper deliberately does not pretend to make the whole deployment atomic.
Record which stage succeeded and the actual running revision before proceeding.

Do not automatically restore a live database or execute down migrations. That
can destroy transactions received after a backup. Apply the reviewed compatible
application rollback with the retained previous image and matching web files,
or fix forward when the schema/API compatibility review requires it. Recheck
API identity, readiness, protected web access and critical workflows afterward.
Never use `docker compose down` on the shared marketplace stack.

## Verification evidence

`packages/api/__tests__/bug-ops-476-exact-api-release.test.ts` executes the real
helpers and Git checks against unique temporary fixtures. Seventeen scenarios
cover wrong/dirty source, invalid SHA, missing/mislabeled images, activation
failure, missing/replaced container, wrong running image, readiness exhaustion,
exact-target migrations, dry-run-only behavior, and dry-run/application errors.
The real Docker Compose parser verifies the production/override merge without
starting the daemon. Container side effects are substituted in these tests;
this is not a live deployment or exact production runner rehearsal.

Local verification on 2026-09-05 passed this regression and OPS-001: two suites,
two tests, 13.803 seconds. Full Linux CI subsequently passed at `db202185`
(run `33956701581`), including the actual Compose configuration merge. An
isolated runtime rehearsal is still required before production use.

OPS-478 adds a real PostgreSQL integration regression. It first executes the
old installed CLI to reproduce the skipped-prerequisite error, then exercises
the corrected boundary, unchanged historical records, out-of-order legacy
history, dry run, no-op repeat, later-file exclusion, unsafe history, concurrent
lock ownership and a failing transactional fixture. It is mandatory in CI's
isolated localhost `*_test` database; without that database the local test is
honestly skipped. Fixture rollback is not proof that every production migration
is one atomic transaction. Fresh CI and the actual restored-database runner
rehearsal remain required for this correction.

## Requesting matching rehearsal artifacts

CI can retain the API image/source and admin web build when explicitly requested:

- For a same-repository PR, add the `release-candidate` label **before** its next
  push/synchronization event. Label changes alone deliberately do not rerun CI.
  Remove the label after the requested candidate run so routine changes do not
  retain large API archives.
- Once this workflow is available on the default branch, manual CI dispatch
  with `retain_release_candidate=true` requests the same artifacts. The input
  defaults to false. Fork PRs cannot request image retention via this label.

After the requested run succeeds, download these exact names from that one run:

1. `onservice-api-candidate-<CI-source-SHA>`: `api-image.tar.gz`,
   `onservice-source.bundle`, `api-candidate.json`, `SHA256SUMS`.
2. `onservice-admin-candidate-<same-CI-source-SHA>`: Vite files and
   `build-audit.json`.
3. `onservice-web-audit-<same-CI-source-SHA>`: customer/provider Expo files and
   `build-audit.json` (also retained by ordinary web CI).

API/admin candidate retention is three days; the smaller browser audit artifact
retention is seven days. Archive the selected release evidence privately before
expiry if it is still needed. No server SSH key, environment file or production
database is supplied to this workflow. Image packaging runs only after image
boot succeeds; admin retention runs after its tests. All three jobs and the
required gates still need to succeed before the candidate is accepted for review.

The package helper checks the clean source revision, image revision/platform,
saved config digest and labels (not only a mutable tag), full-history Git bundle,
and final artifact checksums. It refuses an existing output directory and never
deletes prior sets. The regression uses real archive/Git/hash operations with
Docker save/inspect substituted; the requested CI run exercises real Docker.

On receipt, check `SHA256SUMS`, inspect both frontend metadata files, and require
all source revisions to match `api-candidate.json`. On an isolated runner,
inspect/load the archive and compare the resulting image ID and revision label
to the metadata before starting it. The source bundle's HEAD must also match.
A PR artifact describes its CI **merge checkout**, which is not automatically
the topic HEAD or a later master commit. Do not relabel it as another revision.

These are rehearsal inputs and deliberately say `deploymentEligible: false`.
No real CAPTCHA/demo credentials, authenticated acceptance, database migration,
full rollback or business launch approval is implied. Candidate packaging does
not publish either web app or activate the API on any server.

The [2026-09-06 exact-image rehearsal](../audits/EXACT-IMAGE-MIGRATION-172-2026-09-06.md)
verified the built-in runner through 172 on an isolated restored PG17 database,
including all 16 pending files, complete resulting history, repeat invocation
and original-record preservation with exact reviewed settings transformations.
That named candidate still denies deployment eligibility. The separate paired
publisher, authenticated compatibility and production-release prerequisites
above remain required; the rehearsal is not a production rollout.
