# Autonomous development resumption, 2026-09-05

## Authority and recovery checkpoint

Ken explicitly approved all mandatory escalations on 2026-09-05 and delegated
selection of the best approach for customers, the business, scalability, and
user experience. This supersedes the earlier wait-for-decision instructions
for these existing escalations. Approval authorizes implementation and
verification; it does not mean an issue is fixed or an external requirement
has been satisfied. Do not ask Ken to reapprove the same implementation scope.

Recovery inspection confirmed repository remote
`https://github.com/onServiceTeam/onservice-onsite-app.git`, branch
`codex/financials-operator-truth`, and HEAD `e63a2931`. No tracked edits were
present. Eight local-only untracked files were preserved: AGENTS.md and the
E67/E68/E71/E72/E73/E74/E75 records. Do not publish those files or credentials.
The earlier automation's reference to six protected files was inaccurate.

## Selected approaches

| Area | Selected approach | Implementation status at resumption |
| --- | --- | --- |
| E73 dispute participant notifications | Record recipient notifications within the existing transaction, deliver after commit, and prove delivery failure cannot change the financial result. Preserve refund/release ordering and retry semantics. | Starting with source and test review. |
| E74 provider application authority | Option 3: one durable application record or projection and one decision authority. Inspect the working Provider 360 lifecycle before defining an additive compatibility path and explicit legacy handling. | Design selected; implementation and migration details pending evidence. |
| E67 privileged recovery | Option A: governed recovery, self-service single-use codes, audited removal, session revocation, fresh enrollment, and protected last-admin recovery. | Existing containment retained while the governed workflow is built. |
| E68 recovery acknowledgement | Option A: server-owned generation and acknowledgement, restricted setup sessions, recoverable interrupted enrollment, and a controlled existing-account rollout. | Pending implementation. |
| E72 investigation evidence | Option A: masked general audit log, case-linked field-scoped evidence, step-up authentication, committed access records, ephemeral display. Contain unrestricted historical payload release while this is built. | Pending implementation. |
| E75 cancellation timing | Prefer server-derived schedule and recorded decision time (Option C) for ordinary cancellation. Define late support adjustments explicitly; do not use a negative-input-only patch as proof the calculation is trustworthy. Verify existing schedule and snapshot contracts first. | Pending source review and implementation. |
| E32 production access | Retry the documented account/identity with read-only checks; verify deployment identity, revision, backup and rollback before any deploy. | Permission is present; successful authentication remains unverified. |
| Earlier escalations | Review recommendations and existing approved implementations in dependency order; record choices and regression evidence as each is handled. | Approval granted; individual technical and external closure remains to be established. |

## Continuing work order

1. Verify the interrupted checkpoint and record this approval. Update the
   existing 60-second heartbeat to resume useful bounded development.
2. Complete E73 notification linkage with money-boundary regression evidence.
3. Contain E72 arbitrary audit payload release and define the evidence workflow.
4. Unify E74 application review authority and test submission, review,
   approval/rejection, resubmission, role changes, and audit linkage.
5. Complete E68/E67 recovery durability and E75 cancellation timing in bounded
   slices with regression tests appropriate to their risks.
6. Reconcile prior feature, design, feedback, and launch records with the code.
   Maintain provider, customer, then admin screen coverage and business linkage.
7. Publish tested work to GitHub after checking remote ancestry and CI. Verify
   the correct server deployment, synchronize safely, and test the live release
   before describing client credentials or workflows as working.

Use the latest Stitch design contract for visual changes. Keep transaction
snapshots and historical audit records intact; prefer versioned settings and
explicit reasoned adjustments over rewriting completed transactions. External
legal review, payment credentials, and access failures are evidence-dependent
tasks, not items that blanket approval can mark complete. Continue independent
work when one external dependency is unavailable.

## Evidence ledger

- Initial recovery: git status and recent log inspected; no tracked edits.
- No new code tests, production inspection, deployment, or synchronization are
  claimed by this initial record. Add actual outcomes below as work completes.

### Verified local changes

1. **OPS-471, E73 filing notification slice:** `fileDispute` records participant
   inboxes using the existing database transaction and delivers stored push
   notifications after commit. Normal filing notifies the assigned provider;
   automatic resolution records linked decision notices for both parties.
   The notice says a refund *decision* was recorded, not that external money
   arrived. The regression exercises ordinary and automatic filing, failed
   notification insertion, failed commit, failed refund and failed push.
   Refund/release ordering and the auto-resolution rule were not changed.
2. **SEC-070, E72 containment:** the legacy raw audit reveal URL retains its
   role, UUID and bounded-reason validation but returns a named 409 without
   reading a historical payload or writing a false successful-reveal event.
   Client-supplied case/field/step-up flags cannot bypass it. This is containment,
   not the completed governed evidence feature.
3. **OPS-472, E74 real queue projection:** the admin application endpoint now
   reads pending `providers` records created by real application submission.
   It does not depend on a disconnected onboarding-progress record. It returns
   provider/user identifiers, business name, actual submission time and a
   Provider 360 link, not KYC payloads or fabricated completed steps/review ETAs.
   Legacy pending records with missing submission time are explicitly marked.
4. **OPS-473, E74 single live decision authority:** the compatibility decision
   endpoint resolves the applicant to their provider record and calls the
   existing Provider 360 approval/rejection service. The approval checklist,
   KYC checks, pending-state guard, role transition, audit and inbox remain on
   that path. Invalid identifiers fail before lookup. A request to send an
   application back returns an explicit 409 until revision/resubmission is
   implemented; rejection is not advertised as a substitute for corrections.
5. **PHASE181-01 test correction:** replaced file-content/comment assertions
   with HTTP requests against the real admin router, checking oversized-reason
   rejection before decision services and the inclusive area-decision limit.

### E74 compatibility and remaining lifecycle work

The queue response declares `schemaVersion: 2` and `source:
provider_applications`. Its `data` array is a review summary rather than the
old `OnboardingProgress` snapshot. Repository caller discovery found no
customer, provider or admin UI consumer of that old endpoint; the visible
Providers / Provider 360 interface remains the review UI. No second sidebar
queue was added. Old integrations must consume the new summary and open its
`reviewPath`, not render the former arbitrary `dataSnapshot`.

This is the first stage of the approved unified-projection approach. It does
not migrate, delete or overwrite historical onboarding-progress records.
That legacy service is no longer mounted as an application decision authority.
Immutable application revisions, correction requests, resubmission,
legacy-record conflict reporting, and comprehensive PostgreSQL concurrency
evidence still remain. The existing approval service also needs a follow-up
review of its pre-transaction KYC read and unconditional role assignment before
expanding the lifecycle. Do not call all of E74 complete.

### Test evidence and limits

- Initial dispute run: 3 suites, 3 tests passed.
- Expanded dispute/privacy run: 9 suites, 11 tests passed.
- Provider consolidation/privacy run: 10 suites, 22 tests passed, including
  existing KYC, approval-role, rejection-role and approval-audit regressions.
- API TypeScript check and lint on the changed implementation and first four
  regression files passed after the provider bridge was added.
- Full API run: **933 suites passed, 2 failed, 4 skipped; 3,299 tests passed,
  2 failed, 4 skipped**. The two failures are UX-860 and UX201 nginx tests:
  the local Docker Desktop Linux engine pipe was absent. This is not a green
  release gate. Run them on a working isolated Docker/CI host, not against the
  shared production nginx. Elapsed runner time was 3,648.688 seconds.
- The PHASE181-01 test was being converted during that broad run. The final
  changed-file and related-regression run subsequently passed **17 suites,
  31 tests**, including that behavioral replacement (25.33 seconds).
- Final API TypeScript check, changed-file ESLint and `git diff --check`
  passed. No gate/protection settings were changed in this resumption slice.
- These service/route regressions use mocked persistence. They do not prove
  production delivery, live money movement or PostgreSQL concurrency.
- No screen-by-screen visual recapture, final legal review or complete
  customer/provider/admin acceptance pass is claimed for this checkpoint.

### Production identity and release gap

Read-only SSH authentication now succeeds. Both marketplace paths resolve to
`/opt/onservice`; its origin is exactly
`git@github.com:onServiceTeam/onservice-onsite-app.git`. Server branch is
`master`, HEAD `7ed367cdca1e277f03fc08ff5bbb03b0dc142bd5`, and tracked working
tree is clean. The marketplace API, Redis, nginx and PostgreSQL containers
report healthy. This verifies checkout/container identity, not release-level
business behavior or a hash match to the running image.

At the recovered local HEAD `e63a2931`, local work was 102 commits ahead of the
GitHub topic branch and 377 commits newer than that server checkout. GitHub
master is an ancestor of local HEAD. A fresh fetch succeeded. No open PR existed
for this topic branch when checked. Added-line private-key/GitHub-token/AWS-key
pattern checks on the unpublished committed diff found zero matches; this is
a bounded check, not a claim of a complete secrets audit.

Production runs PostgreSQL/PostGIS `17-3.5`, while current CI targets `18-3.6`.
The release gap includes migrations 157 through 171 and edits to historical
081/082, so a blind pull plus restart is not a safe database rollout. No
database upgrade, migration, service restart or server file change was made.
The shared marketplace nginx also fronts other businesses: never bring the
entire compose project down. Key material and connection-specific private
notes stay outside committed documentation.

A subsequent read-only query confirmed the database is `onservice` inside
the marketplace PostgreSQL container and the most recently recorded migration
is `156_restore_dpo_provider_staff_user_roles`. The first attempt assumed a
database role named `onservice` and failed; the successful retry used the
container's own configured identity without exposing credentials. A complete
set comparison, historical migration checksum review and backup/restore check
are still required before applying 157-171.

### Next checkpoint

Pre-publication audit also found two duplicate regression identifiers in the
prior local commits. The API consent-publisher test is now **OPS-474**; the
admin display test remains **UX-1301**. The dashboard failure/retry test moves
to its own **UX-1309** file, leaving the empty-state test **UX-1304** and the
Analytics variant-name test **UX-1305** unchanged. Assertions are preserved;
the retry check now counts requests to the failing source specifically. This
corrects evidence identity, not application behavior. No gate was relaxed.

Verification of that correction: all four related admin rendered tests passed,
the renamed API regression passed, and the unique-regression-ID Gate C
fragment passed with 1,480 titled regressions. This is one fragment, not a
claim that all five gates passed.

1. Commit only the explicit implementation/tests and sanitized records, keeping
   the eight protected local files untracked. Final changed-file checks passed
   as recorded above; full Docker-backed and release-level CI still must pass.
2. Publish the topic branch and use the risky-change PR path for CI. Do not
   merge or deploy on the strength of focused tests alone.
3. Reconcile every unapplied migration against the real marketplace schema,
   verify backups/restore and rollback, then prepare a bounded deployment that
   leaves other businesses untouched. E32 authentication is no longer a blocker.
4. Continue E73 acceptance/refund atomicity and durable post-commit delivery
   (a process crash between commit and push is not solved by OPS-471), E72
   governed case evidence, E74 revision/resubmission, E68/E67 recovery and E75
   authoritative cancellation timing. Earlier approval remains in force.

## Release-safety continuation, 2026-09-05

### Published checkpoint and actual CI scope

The previous resumption slice was committed and published as `87a3e02d` on
`codex/financials-operator-truth`. PR #81 targets master:
<https://github.com/onServiceTeam/onservice-onsite-app/pull/81>.
The accumulated topic branch was published, not merged or deployed.

CI run `33952588379` completed successfully at that checkpoint:

- API: 939 suites, 3,305 tests passed on the Linux runner, including the two
  Docker-backed tests that failed locally because the engine was unavailable.
- Mobile: 552 suites passed; 836 tests passed and **84 TODOs** remained.
- Admin: 561 test files passed, one skipped; 645 tests passed and **3 TODOs**
  remained. Type checking and the production admin build passed.
- Docker: the API image built, booted and served its liveness route.

Gates run `33952588360` also reported success. Important limits: visual Gate D
and mutation Gate E remain **REPORT**, not blocking execution of their full
workloads. Gate B is dispatch-branch conditional. None of those green labels
proves a complete visual acceptance pass, a mutation score or launch readiness.
No gate mode, workflow/protection requirement or dependency was changed here.

### OPS-475: complete recovery sets before backup success

Full source review and a read-only server comparison confirmed that the live
backup script is the same defective version: uploads/config errors were
ignored, Git/off-site errors were warnings, retention still ran and the script
always printed `backup OK`. This is a real release-recovery risk, not proof
that every existing backup is corrupt.

The replacement script requires all four artifacts to succeed, checks gzip/tar
readability and Git bundle validity, and writes a SHA-256 completion manifest
last. It inspects the uploads volume before mounting it so a missing volume
cannot silently become a newly created empty backup source. A configured but
missing/failing off-site tool fails the run. Failed runs preserve older backups
and private incomplete files. A lock rejects overlapping runs. Existing
14-day retention stays limited to matching top-level regular files and can be
skipped for release preflights. Success explicitly says whether off-site
copying was configured and that a restore test was not run by this script.

The executable OPS-475 regression runs the real script, gzip, tar, Git bundles,
checksums, file publication and retention against private temporary fixtures.
Docker and off-site storage are substituted; explicit fault injection covers
missing/empty/failed/corrupt sources, unavailable off-site tooling, failed
off-site data/manifest copies, an occupied lock and successful empty uploads.
This is not a source-text/file-existence test. The associated production-seed
guard is included in the focused check. Final results are recorded below.

`docs/runbooks/postgres-restore.md` now requires isolated restoration before
live cutover. It removes unsafe advice to load onto live data and recreate it
after errors, rejects a user-count-only definition of success, and reconciles
PITR with the launch runbook rather than calling it optional after launch.
Historical claims of provider-level off-host backups are not current evidence.
E32 now records successful SSH authentication without publishing private key
locations; its original failed-access record remains as history.

### Exact production schema and recovery rehearsal

Read-only comparison found **145 applied migration names**, all present in the
local set of 160. Exactly 157-171 are pending; there are no server-only names.
The historical 081/082 differences against the server revision are comments
only, not changed executable SQL. The live PostgreSQL 17 instance has the
required `uuidv7()` function. The refund-key duplicate aggregate returned zero,
and no incompatible existing retry-action values were returned. Audit CHECK
definitions were inspected before replaying their append operations.

All four selected `20260905-020001` legacy artifacts passed archive/bundle
format checks on the server. No production data or private archives were
downloaded into the local workspace. The database archive was then restored
with `pipefail` and `psql ON_ERROR_STOP` into a temporary PostgreSQL/PostGIS
17-3.5 container with no external network, no published ports, no live volume
mount, 512 MiB memory and 0.5 CPU limits; database storage used bounded tmpfs.

The first rehearsal connected to the image's temporary initialization server
before its planned shutdown, so restore failed explicitly. That test container
was identity-checked and removed. A fresh rehearsal waited for PostgreSQL to
be PID 1 and ready before restoration, which succeeded. A preliminary snapshot
probe also used an incorrect `payments` table name; the real table is
`payment_intents`. A later comparison query's ambiguous variable name was
corrected. These were failed rehearsal probes, not production mutations, and
are not counted as successful evidence.

The successful restored database contained 30 users, six providers, 126
bookings and the expected 145 migration-history records. Before migration,
an isolated snapshot retained all original columns of 13 selected tables.
All 15 exact local SQL files then executed successfully with stop-on-error.
Afterward, row counts and every original JSON field were compared by row ID:

| Checked table | Historical rows preserved |
| --- | ---: |
| Bookings | 126 |
| Business accounts | 1 |
| Admin actions | 23 |
| Providers | 6 |
| Users | 30 |
| Wallets | 20 |
| Payment intents | 12 |
| Business contracts/invoices/items, support tickets, wallet transactions, pricing rules | 0 in each |

All **218** existing rows retained their original field values. There were no
guessed historical booking financial snapshots; all 126 existing bookings
retained unclassified legacy billing mode. Five prospective commission
versions were seeded. Business-contract booking remained disabled. The real
post-migration audit constraints accepted six new action/target pairs and
eight existing pairs. Attempted commission-version updates correctly raised
SQLSTATE `55000` and left the versions unchanged.

Limits: this replay exercised SQL on a restored PG17 database, not the complete
containerized migration-runner bookkeeping or a Postgres major-version upgrade.
The empty commercial/support/pricing tables mean populated legacy cases and
live-scale locking still need dedicated fixtures. No new application image,
frontend bundle, production migration, production setting or live financial
record was changed. Restore rehearsal alone does not close those release gaps.

### Next release work

1. Publish OPS-475 and this evidence, then require fresh CI for that commit.
2. Finish populated legacy commercial/pricing fixtures and the exact production
   runner rehearsal. The existing OPS-331 migration test still asserts SQL
   source contents; replace it with behavioral database evidence, not a new
   success claim based on its current green result.
3. Prepare a reversible deployment for API **and both web experiences**. The
   existing deployment workflow only handles the API image, so invoking it
   alone cannot establish customer/provider/admin alignment. Preserve the
   shared nginx configuration and all other applications.
4. Continue the approved E73/E72/E74/E68/E67/E75 workflow slices and the full
   Stitch screen/interaction inventory. Neither approval nor green unit tests
   makes those incomplete flows finished.

### Recovery-set creation and cleanup

Both test-owned rehearsal containers were removed after verifying their exact
names, audit label and isolated network. Their temporary database copies were
discarded; the original backups remain recoverable. The marketplace API,
PostgreSQL, Redis and nginx remained healthy. A plain-user Git check encountered
the checkout's ownership guard; the follow-up used its existing root owner.
No global `safe.directory` exception or ownership change was installed.

The revised backup script was exercised remotely without installing it into
the production checkout, with retention skipped and off-site copying explicitly
disabled for this local recovery-set check. The first streamed invocation
exposed Docker Compose forwarding stdin and consuming the remainder of the
script. It exited without a manifest; this was **not** counted as a completed
backup. The private `.incomplete-20260905-040827-zSVcQc` directory remains for
inspection, and no old backup was removed. The dump subprocess now receives
`/dev/null`, the exit trap rejects premature successful exit, and a streamed
execution regression covers this behavior.

The corrected invocation produced `backup-20260905-041108.complete`. An
independent checksum verification passed for all four referenced artifacts;
each artifact and the manifest had permission mode `600`. This verifies a new
local recovery set, **not** off-site durability or restoration of that newer
set. The successful database restore/migration rehearsal above used the
earlier `20260905-020001` set. Do not conflate those two pieces of evidence.

The server's tracked checkout remained clean at `7ed367cd`. No rehearsal
containers remained. The backup files are the only retained server artifacts
created by this continuation; the new script still needs installation through
the reviewed code rollout so the scheduled job benefits from the fix.

Final local verification: the OPS-475 test exercised **19** success/failure
scenarios and passed; together with the production-seed guard, **2 suites and
2 tests passed** in 20.232 seconds. Changed-test ESLint, API TypeScript, shell
syntax and `git diff --check` passed. The unique-regression-ID gate fragment
passed with 1,481 titled regressions. Fresh full CI for this new commit is
still required; the full-suite totals above belong to `87a3e02d`.

## Populated commercial-history verification continuation

Backup fix `95b1d54f` is published in PR #81. Its full CI run `33954758414`
and Gates run `33954758325` completed successfully. This includes Linux
execution of OPS-475, with its owner-only permission assertions. Production
remains on the earlier revision; no full application rollout is implied.

OPS-331 previously inspected SQL strings and could pass without running the
migration. Its replacement builds the real commercial tables using migrations
021/129 in a random, isolated test schema, populates legacy paid/unpaid
statements, personal/partial/mismatched booking links, old contracts (including
an invalid historical rate/date), and invoice lines, then executes migration
166. Assertions compare all original fields, test prospective billing-mode
defaults, cross-company rejection, amounts beyond INTEGER capacity, preserved
terms-version links, partial-payment/reversal evidence, duplicate references,
and immutable rows. Minimal unrelated entities and a schema-local UUID helper
are fixtures; this is not an end-to-end provider funding/checkout test.

The test refuses non-local/non-test database targets and fails CI setup if the
safe PostgreSQL service is missing. Local execution loaded the test but
**skipped its database case** because no safe local test database is configured;
lint and whitespace checks passed. At commit `11e910e8`, API job
`101277834953` in CI run `33955444644` explicitly reported this migration test
PASS and **940 suites / 3,306 tests passed**. The entire CI run subsequently
completed successfully, including mobile, admin and the API image boot check;
Gates run `33955444647` also passed with the report-mode limitations above.
These results are database-backed fixture evidence, not a production migration
or business-billing launch approval.

The full 2,067-line launch-limitations register was reread. Dated corrections
retain old findings while identifying obsolete no-admin-test-suite claims,
contradictory deferral of required native baselines, provider send-back UI that
does not yet exist, and old compliance-bar assertions that are not professional
sign-off. The E55 section distinguishes its controlled foundation from the
still-disabled company checkout and E56 funding requirements. No blocker was
deleted or marked resolved merely because implementation was authorized.

## OPS-476: exact API release identity

Inspection found that the manual deployment workflow loaded a SHA-tagged image
but its Compose command selected no such image. It could restart or keep an old
API and report success based on health alone. The workflow also checked out
moving master instead of the dispatch revision used to name its artifacts.

The workflow now checks out and bundles exact HEAD, labels its image, and passes
the same SHA to image preflight, migrations and API activation. A small Compose
override selects only that API image with no pull. Shared helper checks reject
wrong/dirty source and absent/mislabeled images. Activation disables build/pull
and dependency restarts, compares the actual container image ID, checks readiness
and rejects replacement during the check. Migration dry-run and apply both use
that exact-image override; the initial-install no-SHA behavior remains compatible.
No PostgreSQL/Redis/nginx configuration, dependency or CI gate mode was changed.

The real-script OPS-476 regression passed **17 scenarios**. It uses real Git and
the real Compose configuration merge, with container effects substituted. Together
with OPS-001, **2 suites / 2 tests passed in 13.803 seconds**. Changed-test lint,
shell syntax and whitespace checks passed. Full CI for these edits remains
pending; older commit results do not cover them. The runbook
`docs/runbooks/exact-api-release.md` states prerequisites, rollback boundaries,
and that neither web experience is published by this API-only workflow.

Final local checks also passed API TypeScript, YAML parsing for the workflow
and Compose override, and the unique-ID gate fragment (1,481 titled regressions).
The main deployment guide now puts backup before checkout changes, schema
review/application before API activation, and staged assets before atomic entry
file publication. Its coordinated frontend publisher is still a requirement,
not newly implemented automation. README no longer calls every registered
launch blocker an intentional v1 caveat.

No live application rollout, production migration, credential publication or
new production write occurred during this slice. The production runner rehearsal,
paired web artifact publication, release rollback rehearsal and business/visual
acceptance remain open. The API-only workflow must not be invoked as a substitute
for that coordinated rollout.

## Clean browser-export verification continuation

OPS-476 is published as `db202185`. Its API job `101281218295` in CI run
`33956701581` explicitly passed the release regression and **941 suites /
3,307 tests**. Mobile and Docker jobs passed; Admin was still running at this
checkpoint. Gates run `33956701592` passed with the same report-mode caveats.

A fresh local Expo web export, with private dotenv loading disabled and all
demo inputs blank/off, failed before Metro startup. A second diagnostic attempt
identified the exact unreadable installed dependency:
`node_modules/@expo/cli/node_modules/zod/v3/locales/en.cjs` (installed Zod
3.25.76). Node 24.13.0 raised `UNKNOWN`, errno -4094, while reading that file.
No dependency was substituted, package version changed, private environment
printed, or successful browser build claimed. The output directory was a
unique local temporary audit directory, not an existing web release.

The mobile CI job now also performs a clean Linux Expo web export, disables
dotenv loading and demo credentials explicitly, and retains a seven-day audit
artifact using the repository's existing upload-artifact action version. The
artifact metadata records the exact CI source revision and marks
`deploymentEligible: false`: CAPTCHA public configuration and authenticated
acceptance are not included. A build failure fails the job; no gate was weakened
and no test failure is converted to a warning. Workflow YAML parsing passed.
Actual clean export and artifact upload remain pending the new CI run.
