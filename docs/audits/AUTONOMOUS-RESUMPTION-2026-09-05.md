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

### Verified clean browser artifact

The entire preceding OPS-476 CI run `33956701581` completed successfully; the
Admin job took 11 minutes 25 seconds. The clean-web change is published as
`46c6ae22`. In its run `33957299765`, mobile job `101282837211` passed 552 suites
(836 tests passed, 84 TODO), exported **4,280 modules** for web in 85.141 seconds,
and successfully uploaded artifact `9966825638` (1,652,958 bytes). The artifact
name is `onservice-web-audit-87f2980bb3d4c394442c31cba757c441fd38b29d`.

That revision is the CI pull-request merge checkout, not a claim that branch
HEAD or production has that SHA. Its metadata was inspected after downloading
to a unique local temporary directory: production app origin, demo mode false,
deployment eligibility false. This workflow supplies no private credentials.
This is fresh export evidence, not a full artifact-secrets audit, browser-render
or authenticated screen acceptance pass. The entire CI run `33957299765` then
completed successfully, including API, mobile/web, Admin and Docker. Gates
`33957299762` passed with unchanged report-mode limits.

## SEC-071: the legacy audit-list bypass

While rereading the complete admin service for E74, tracing its consumers found
that `GET /admin/actions` still returned unmasked `admin_actions.details` to a
super admin and left free-text reasons untouched. The main Audit Log masks
those values for every role. This legacy URL therefore bypassed the approved
E72 default, even though SEC-070 contained the distinct one-row raw reveal URL.

The legacy list now applies the existing audit masking policy for every role,
explicitly selects/projects its public columns, and masks reasons. Unrelated
historical `full_notes` or future columns cannot be released through SELECT */
object-spread behavior. Action/actor/target IDs, dates and non-PII operation
context remain visible. No retained row is rewritten. D25 operational contact
reveal and D34 route privileges are unchanged. This is consistent default-list
masking, not the completed field-allowlisted, step-up, case-linked investigation
workflow or a guarantee that heuristic masking detects every arbitrary secret.

The SEC-071 regression executes the actual HTTP router and service. It checks
super-admin masking, nested contact/IP/UA/free-text values, null historical
values, exclusion of extra columns, preserved original objects, denied ordinary
roles before database access, and read-only persistence calls. The expanded
focused run passed **5 suites / 26 tests in 1.77 seconds**. Changed-file lint and
API TypeScript passed. No production read of raw audit payloads was needed.

Two obsolete source-string assertions in `d08-encompassed-bugs.test.ts` were
removed, not counted as behavioral proof. They claimed Bugs 66 and 331 merely
from names/comments in this same legacy service. SEC-071's real request checks
both nested contact masking (66) and IP/user-agent masking (331) on the real
returned record, so these two claims now share actual path-specific evidence.
Other historical structural assertions in that file remain and are **not**
behavioral acceptance evidence; they need separate replacement, not padding of
the claimed coverage. The initial 3-suite/23-test run included that historical
file; the subsequent 5-suite run above excludes it.

SEC-071 is locally tested but not yet covered by fresh full CI or deployed.
The provider-approval KYC read/role transition and governed revision/resubmission
work remain open; inspecting the service did not fix them. No launch-ready tag,
server application change, money movement, privacy-data rewrite or credential
publication occurred in this continuation.

## Paired release-candidate preparation

The previous goal turn was progress: it published SEC-071 and real browser
export evidence. Revalidation found a clean tracked tree at `07aa4db2`; the eight
private untracked files remain protected. SEC-071's full CI `33958015741` passed.
API job `101284752670` explicitly passed the new regression and reported **942
suites / 3,306 tests**. The count reflects removal of two structural checks and
addition of the real endpoint check, not a claim that every older test is behavioral.

Read-only production reinspection confirmed the same repository and clean
`7ed367cd` checkout, x86_64 host, and running API image
`sha256:d1389471b726c00d17700fd52ad3075ca9f8a3ef9902db94b0f6e7f4be737359`.
Available memory was about 2.6 GiB with 38 GiB disk free. A capacity command's
trailing carriage return failed harmlessly; the direct retry succeeded. No
server file, container, config, financial row or application release changed.

OPS-477 adds explicit candidate packaging to avoid sharing production keys with
GitHub or building on the resource-limited shared server. Same-repository PRs
can request API/source and admin artifacts through a `release-candidate` label;
manual CI has an opt-in input for use after the workflow reaches the default
branch. Routine API image retention remains off. Customer/provider, admin and
API metadata all identify the same CI source revision; this may be a PR merge
checkout, not master. Artifacts are not marked deployment-eligible.

The actual package helper checks source cleanliness, exact image/platform and
saved config identity, Git bundle identity and final hashes. It rejects existing
destinations and failed/inconsistent saves without overwriting old sets. Its
**13-scenario** behavioral regression and OPS-476 passed **2 suites / 2 tests in
19.988 seconds**. ESLint, API TypeScript, shell syntax, YAML parsing and whitespace
checks passed. Docker inspection/save are substituted locally; actual Docker
packaging and paired artifacts still need the requested fresh CI run. No gate
mode, required check, branch protection, package dependency or live policy changed.

Next: produce/download the requested candidate, verify all identities, rehearse
the exact migration runner on an isolated restoration, and prepare the bounded
web/API publication and rollback. E74 lifecycle, the full Stitch acceptance
inventory, business/support/payment linkage and all unresolved launch requirements
remain in scope; candidate packaging is not a substitute for them.

## Candidate verification and OPS-478 prerequisite defect

OPS-477 at `614f89fb` passed complete CI `33958914787` and Gates `33958914609`.
All four jobs succeeded, including real image packaging. The matching candidate
source revision is the CI merge checkout
`814bf7a8369e2d8a8d7c2f46b4dd786f83e25503`, not master or the topic HEAD.
Retained artifacts are API `9967345316`, admin `9967396819` and customer/provider
web `9967338450`. Both frontend metadata records match the API revision, use
their production origins, disable demo mode and explicitly deny deployment
eligibility. The three API package checksums matched after private download.
Its recorded image ID is
`sha256:c5e8e48f6a52dc90bdbbf4f323ffd673087042e411730304f95964cb12f10e4f`.
The one-run `release-candidate` PR label was removed after completion.

Production identity checks still found the same clean `7ed367cd` checkout and
healthy marketplace API/PostgreSQL/Redis/nginx. A database-owner probe initially
lost shell quoting and attempted a nonexistent root role; the corrected
read-only probe succeeded without printing a password or user records. Only a
new private marketplace rehearsal directory and candidate/script transfer have
been initiated. No live checkout/config/database/service was changed. The large
candidate transfer is still in progress at this checkpoint; staging is not a
successful image load or restore rehearsal.

Reading the installed node-pg-migrate 8.0.4 CLI and runner revealed that its
basename argument filters to **one exact file**. The existing helper therefore
could apply 171 while silently skipping pending 157-170. Previous OPS-001/476
tests used substituted container calls; they proved command/identity plumbing,
not prerequisite execution. This invalidates using their green status as proof
of the requested final migration boundary. Production rollout remains held.

OPS-478 introduces a real bounded runner and a mandatory CI PostgreSQL test that
first reproduces the old CLI failure. It preserves out-of-order legacy history,
selects every pending prerequisite, excludes later files, rejects unknown or
duplicate history, verifies results and shares the existing advisory lock.
The shell helper and deployment wording now use this upper-bound meaning.
No SQL migration or historical record is rewritten to hide the mismatch.

Local syntax, changed-file ESLint and API TypeScript passed. OPS-001/476 passed
two suites/two tests in 15.068 seconds. OPS-478 was explicitly **skipped**, not
passed: the local Docker engine is unavailable and no safe test database was
configured. Fresh Linux CI must execute it. Transactional fixture rollback
will not establish whole-release atomicity for historical SQL containing its
own BEGIN/COMMIT. An exact-image rehearsal and paired web/API release plan are
still required before any production upgrade.

The first OPS-478 CI at `54abce93` correctly failed (run `33960502840`, API job
`101291447105`). It reproduced the original exact-file prerequisite error, but
the corrected runner then imported an unusable legacy subpath: the installed
package lacked `dist/legacy/operations/casts.js`. The fix-forward imports the
same runner and lock constant through the package's public bundled entry point,
which the existing CLI also uses. No dependency, gate or test expectation was
weakened. This failed CI is not counted as completed database verification.

Local execution of the first legacy-subpath version also hit an `UNKNOWN`
filesystem read error in the OneDrive dependency tree; syntax checks alone had
not loaded its dependency graph. That failed preflight is not a passing check.

The complete `54abce93` CI then finished as failed: API failed, Admin and
Mobile passed, Docker was skipped. The public-entry import also encountered the
local dependency-tree `UNKNOWN` read failure, so local runtime execution is
still unverified, not silently passed. The fix-forward needs clean CI.

The exact original candidate was independently checksum-verified and loaded
privately on the shared server without activating the API. A fresh isolated,
internal-network PG17 restoration of the **new complete `20260905-041108` set**
succeeded. Original-row and schema checks passed after its dry run. Applying the
original final-file CLI increased `pgmigrations` from **145 to only 146**, not
the required 160. The rehearsal correctly exited 1. Its exact labeled database
container and private network were removed; original backups, live data and
other applications were untouched. This is a reproduced release failure and
successful database restoration, not a successful release rehearsal. Candidate
files, the unactivated image and private diagnostic logs are retained.

The initial laptop-to-server SCP was too slow and was stopped after verifying
its exact process identity; its partial artifact remains private. The same
GitHub artifact was then downloaded directly to the new server directory with
a temporary artifact-delivery URL kept out of output. No GitHub account token
or server SSH key was transferred. Extraction accepted exactly four expected
filenames in a new directory; all three package hashes matched again.

## Corrected runner evidence and the first browser-navigation finding

Fix-forward `3656839a` passed complete CI `33961265891` and Gates `33961265921`.
API job `101293443168` explicitly passed OPS-478 with **944 suites / 3,308 tests**.
Admin, Mobile and real Docker boot/package jobs also passed. Its matching
candidate revision is `033d456098019812e6ebab098b0e3de0b2dbc565`; artifact IDs are
API `9968076017`, admin `9968142053`, web `9968057413`. These remain rehearsal
inputs, not an approved production deployment. The candidate label is being
kept only for the immediately following explicitly requested public-link fix
wave, then must be removed after that run.

Before that CI finished, the corrected public-entry runner was tested as a
read-only, separately hashed script inside the already verified `814bf7a8` base
image. Its SHA-256 was
`a19940708ca40841101f1198e7c42054a4baba79822900163a190b77f4ebd9be`.
A fresh isolated restoration of the same complete `20260905-041108` backup
passed the dry-run schema/row comparison, applied **all 15** pending migrations,
matched **all 160** resulting migration names to the image, and passed a second
application with no additional migration entries. Every original field in
**363 records** was preserved: 218 business records plus 145 prior migration
history records. All test-owned containers and internal networks were verified
absent afterward; live services remained healthy and the clean production
checkout stayed `7ed367cd`. Logs and the unactivated candidate image remain
private. This proves the proposed runner against restored PG17 data, but the
separate script mount means it is **not** the final rebuilt-image rehearsal.

The browser audit used the actual exported `814bf7a8` web/admin artifacts, not
mock screenshots. Customer onboarding and sign-in rendered; sign-in was
inspected at confirmed 1440x900 and 768x1024 viewports. Admin sign-in rendered
at 768x1024. No credential, OTP request, registration or live mutation was made.
One initial resize applied only to the selected admin tab; the customer tab's
DOM still measured 1440 pixels, so it was not falsely counted as a tablet pass.
Closing the temporary admin tab and reapplying the override produced a verified
768-pixel customer viewport with no horizontal document overflow.

UX-1310 was reproduced in that real browser: both sign-in legal controls were
SPANs with no link role/href and tabIndex -1. Both accessibility and DOM clicks
returned to sign-in. Tracing the route confirmed that `/customer/terms` is inside
the customer-only guard. The registration form used the same broken path.

The correction adds a public `/legal` route that renders the existing policy
screen, registers it in the root stack/navigation contract, and uses actual
Expo Links with the correct terms/privacy tab from both auth forms. It does not
relax CustomerLayout, modify legal wording, change consent acceptance, or expose
private account data. The public route is an alias of the existing document
screen, not a second independently maintained policy copy.

The focused local screen/access run passed **five suites / nine tests in 47.216
seconds**. The new DOM-render test verifies configured link destinations,
selected documents without a session, no OTP request, and the still-protected
customer stack. It substitutes Expo navigation, so actual exported-browser
routing and keyboard acceptance remain to be checked on the new CI artifact.
Changed-file lint and Mobile TypeScript passed after removing an unnecessary
test-only DOM type assertion flagged by lint. Full UI CI and post-fix browser
verification are still pending; no production web artifact was overwritten.

The initial draft used UX-1120, which the blocking uniqueness check correctly
found was already assigned to an admin notification-template test. The existing
test was left untouched. A repository-wide title inventory identified UX-1310
as the next free ID, and this new regression was renamed before publication.

## Exact rebuilt-image rehearsal and public-link browser acceptance

UX-1310 commit `dc7a908916c349a0d2c7e4ecceb924e1fdcfda73` passed complete
CI `33962050423` (all four jobs) and Gates `33962050420`. Mobile job
`101295511347` explicitly passed the new regression: **553 suites, 837 passing
tests and 84 honest todos** overall. Todos are not completed behavior. The
mandatory OPS-478 real-PostgreSQL regression passed in the preceding complete
CI `33961265891`; the latest complete API job also succeeded. Gate report modes
and the existing launch requirements have not been promoted or waived.

The matching API/admin/customer-provider source is the CI merge checkout
`09051d72b57dd3a5d33666ee18900c0997f3cd0f`, not the topic commit or master.
Artifact IDs: API `9968303464`, admin `9968368942`, web `9968292458`.
Both frontend metadata records were read after download. Their origins are
`https://admin.onservice.ph` and `https://app.onservice.ph`, demo mode is false,
and deployment eligibility is explicitly false. The API package's three hashes
matched again on the server. Its exact loaded image is
`sha256:9d5d99bb69715235a96b41b698aa06759a7f3b81e0e7e186877e302584ca88d2`.
The temporary PR candidate label was removed and verified absent.

The **built-in runner in that exact image**, with no replacement script mount,
passed a fresh isolated PG17 restore of complete backup `20260905-041108`.
The backup manifest and Git bundle/source/image identities were verified first.
The dry run retained 145 migration entries, public column/constraint fingerprint
and the recorded historical fields. Applying the reviewed boundary ran all 15
pending migrations and produced exactly the image's 160 migration names.
Original fields in **218 business records plus 145 old migration-history rows**
were compared by row identity and unchanged. A second actual application kept
160 entries and passed the same historical-field checks. These checks cover
the explicit baseline tables, not every row/table in the database, and are not
an authenticated booking/payment/support acceptance test.

The rehearsal exited 0. Evidence remains in the private candidate's
`runner-evidence-7um43rd8` directory; the exact temporary database container and
internal network were removed and verified absent. The complete backup, loaded
candidate image and logs were retained. No live checkout, environment, schema,
transaction, frontend bundle or service was modified. Subsequent checks showed
clean production HEAD `7ed367cd`, the original running API image, and healthy
API/PostgreSQL/Redis/nginx. The API's own `/health/ready` returned `ready`, with
PostgreSQL and Redis `ok`. A request to the public app's `/health` had returned
the SPA HTML, not API readiness; that HTTP 200 is explicitly not health proof.

The actual new exported customer/provider artifact was then served locally,
with real production API configuration but no login/OTP/signup submission.
Ordinary keyboard Tab focused the login Terms **link** and Return opened
`/legal?tab=terms` with Acceptance & Eligibility. Pointer activation of login
Privacy opened `/legal?tab=privacy` with the Data Controller section. Both
registration links independently opened their correct public documents.
Direct signed-out navigation to `/customer/terms` still settled at `/auth/login`,
so the customer guard was not weakened. Screenshots/accessibility output are
in the task history; no new baseline PNG set was committed. The new-build
checks were at the 1024x600 audit viewport. This is a focused navigation fix,
not whole-screen Stitch parity or authenticated desktop/tablet acceptance.

Production configuration was inspected privately for presence/aggregate state,
without printing credentials or customer records. It currently says `staging`,
has privileged 2FA bypass disabled, and has test OTP enabled for eight allowed
numbers. CAPTCHA/Turnstile server secrets were absent. Existing roles include
customer, provider, provider_staff, admin, super_admin and DPO. This is not proof
of valid client demo credentials or launch-ready configuration. Do not share
test access until the account/role and intended non-production use are verified.

Next: prepare bounded paired web/API publication and rollback without replacing
the live bind-mounted directories or recreating the shared nginx service.
Review broad PR scope and paired authenticated acceptance before deploying.
E74 lifecycle, E72 reveal governance, E73 durable notifications, full Stitch
coverage, operator business feasibility and unresolved launch items remain open.

## E36/E74 initial-approval transaction correction

The delegated approval is applied conservatively: keep the existing four-file
application contract, enforce it for pending decisions, preserve previously
approved history, and do not invent a legacy exemption or missing evidence.
Read-only server counts found no pending providers and six approved records,
each missing all four KYC references. Their creation dates ranged from June 3
to August 25. These may be test/legacy records, but this has not been proved.
No document keys, personal records or credentials were printed; no provider
was approved, suspended, demoted or backfilled. The selected complete backup
had already passed checksum and isolated restore verification.

OPS-479 moves the KYC read into the existing approval transaction with a
provider-row lock, requires both ID sides/NBI/selfie to be nonblank, and keeps
the pending-only decision predicate. OPS-480 conditionally promotes only an
active customer or legacy early-promoted provider with no fraud flag. A stale
account role, inactive account or fraud flag produces 409 and rolls back the
provider decision before its audit/notification can be committed. Staff,
admin, super-admin, DPO and unknown future roles are not overwritten.

The two new regressions use the actual service and actual `db.transaction`,
pointing only its configured pool at unique schemas in a safe localhost
`*_test` PostgreSQL database. They cover missing/blank fields, actual concurrent
document removal and user-role changes, one winner in concurrent approvals,
historical approved-record preservation, and audit-failure rollback. PostgreSQL
lock dependencies are observed, not inferred from a timed sleep. The fixtures
model the exercised tables and constraints, not the entire production schema.
CI requires this database; local absence is an explicit skip.

Local verification passed five existing suites / 28 tests in 19.099 seconds;
the two new database suites/tests were skipped, not claimed passed. Changed-file
lint and API TypeScript passed. Existing unit fixtures were updated to return
the locked pending record and fourth document. Their old no-transaction KYC
assertion became a no-write-after-locked-validation assertion; approval-role,
rationale and inbox assertions remain. Full fresh CI is still pending.

This is not full E36/E74 closure. The Admin panel still needs a visible missing
evidence state and explicit front/back checklist wording. Durable application
revisions, request-changes/resubmission and legacy evidence classification are
not implemented. The separate reactivation function currently turns suspended
records into approved records, while suspension accepts pending applications;
that route also needs eligibility/lifecycle review before claiming one complete
safe admission boundary. No migration, dependency, legal text, production
policy value or historical financial term was changed.

The temporary local browser audit tab was closed after restoring its original
1440x900 dimensions, and the exact preview-server terminal was stopped. No user
browser tabs or other local/server applications were closed.

The existing uniqueness gate passed with 1,486 titled regressions. The route-file
inventory found 114 non-layout TSX files; CLAUDE.md's stale 108 count was corrected.
This includes aliases, not 114 independently accepted UX flows. No gate mode,
allowlist, branch protection or historical phase specification was edited.
`docs/runbooks/paired-web-api-release.md` now records the bounded publication
and rollback requirements. It is a plan, not an implemented or tested publisher.

## Verified CI and admin evidence-gate follow-up

The published backend commit `5fb2ab418d51200d83b1a20d0b5673719bc63276`
passed CI `33964968565` and Gates `33964968623`. Individual API logs explicitly
show OPS-479 and OPS-480 passing against the CI PostgreSQL service. The API
passed 946 suites / 3,310 tests. Mobile passed 553 suites / 837 tests, with 84
explicit todos. Admin passed 561 files / 645 tests, with one skipped file and
three todos. The API image build and actual liveness boot also passed. No
release-candidate label was present; this run did not retain a new API/admin
release bundle. Production still runs the older revision, not this commit.

A further read-only identity-provenance count matched five of the six approved
providers to the exact phone/email/business-name identities in the public demo
seed. One remains unclassified. A fixture-identity match is not evidence of
real KYC verification. No private identity values were published, no missing
evidence was invented, and no live account was changed.

UX-1311 adds one shared evidence review to both the provider queue and Provider
360 approval panel. Each opening requests the canonical profile; the UI blocks
while checking, after a failed request, for a mismatched/non-pending record,
and when any required reference is missing or blank. It names all four files
as **On file** or **Missing**, explicitly separates presence from verification,
and links to the full application/private document review. The checklist now
names both ID sides. Refetching blocks approval and discards prior checklist
attestations before a fresh review can be submitted. Retry/recheck is explicit.
The queue dialog is height-bounded and scrollable for the longer review.

The real rendered regression exercises both actual approval surfaces, each
missing/blank field, absent document metadata, wrong provider/status, pending
network request, completed-review refetch/reset, failed request/retry and the
single permitted approval request. The original UX-433/435 review-body tests
remain and now provide complete profile fixtures. Three files / three tests
passed locally; Admin TypeScript and changed-file lint passed. The first
TypeScript attempt caught three unchecked test-array accesses; those were
corrected, and the full focused command was rerun successfully. This follow-up
has not yet passed fresh full CI or authenticated browser acceptance.

This is not immutable reviewed-revision enforcement. The backend row lock
checks current evidence at the decision; it cannot prove the human inspected
that exact revision. Full E74 revisions/resubmission, the reactivation bypass,
legacy evidence classification, full Stitch viewport acceptance and deployment
remain open. Visual reasoning and explicit limits are retained in
`docs/audits/provider-approval-2026-09-05/quality-reasoning.md`.

The expanded local provider-admin run passed 65 files / 71 tests in 55.85
seconds. The actual Admin production build passed (2,845 transformed modules;
Vite build 17.48 seconds). Neither result is an authenticated browser test.

## Reactivation is not admission, OPS-481

Under the delegated E36/E74 approval, the selected bounded correction follows
the documented lifecycle: only approved providers can be suspended through the
admin action; a pending applicant must use admission review. Reactivation locks
the suspended provider, requires its review timestamp plus a retained explicit
`provider_approved` event, and locks an active provider-role owner without a
fraud flag through commit. It never promotes a role, clears account flags,
revives old sessions, or clears booking holds. The reason, audit and inbox
remain in the same transaction. Both operator explanations name the safeguards.

The dedicated PostgreSQL regression exercises the former pending/suspend/
reactivate bypass, a legacy suspended applicant, a rejection timestamp without
approval, real approval followed by suspension and reactivation, blocked owner
roles/flags, an actual concurrent fraud-flag update, audit failure rollback,
one winner under concurrent reactivations, preserved session generation and
unchanged active/historical booking amounts and held/released states. Local
absence of safe PostgreSQL is an explicit skip, not a pass. The four existing
API suites / 16 tests, API TypeScript and changed-file lint passed locally.
Fresh mandatory PostgreSQL CI remains required before this can be released.

A fresh read-only live count at 12:35 UTC found only six approved providers,
zero suspended/pending providers, one review timestamp, and **zero retained
provider-approval events**. All six owners satisfy the current provider-role/
active/not-fraud predicate. They remain unchanged. If one is later suspended,
this candidate will refuse to reactivate it without governed admission proof.
That consequence is deliberate, not a completed legacy-recovery workflow.
Do not deploy and surprise operations: finish legacy classification/review and
acceptance first. A durable first-class E74 admission/revision record is still
needed; the retained event check is a safe interim guard, not a lifetime
retention architecture. NBI renewal/expiry enforcement remains separate E62
work, and this change does not claim to implement it.

Production remained on `7ed367cdca1e277f03fc08ff5bbb03b0dc142bd5`. Its own
API readiness endpoint returned PostgreSQL and Redis `ok`. No live rows,
services, schema, historical money or neighboring app were changed. The unique
regression-ID gate passed with 1,488 titled regressions before publication.

The first surrounding Admin rerun after adding reactivation copy failed
UX-436's existing explicit booking-hold wording assertion (64 files / 70 tests
passed; one failed). The original precise hold warning was restored verbatim
after the new eligibility sentence. No assertion was removed or loosened;
final rerun evidence is required below before publication.

Final surrounding rerun passed all 65 provider-admin files / 71 tests in 50.06
seconds. Admin TypeScript and changed-file lint then passed. Final API
TypeScript/lint and `git diff --check` also passed. The uniqueness gate remained
green at 1,488 titled regressions. OPS-481's actual database execution remains
mandatory in the new CI run; its local skip is not converted into a pass.

## Completed CI and canonical submission foundation, OPS-482/483/484

The published `cdad4114130677ad49357d16aab7d052e4801e02` passed CI
`33967149207` and Gates `33967149209`. API logs explicitly show OPS-481
passing against PostgreSQL: 947 suites / 3,311 tests passed. Admin passed
562 files / 646 tests, with one skipped file / three todos. Mobile passed
553 suites / 837 tests with 84 todos. All four CI jobs, including the actual
API image build, completed successfully. This does not deploy those changes
or supply the missing authenticated/full-viewport acceptance evidence.

Read-only legacy inventory verified the exact marketplace origin and live
revision `7ed367cdca1e277f03fc08ff5bbb03b0dc142bd5`, then ran a read-only
database transaction. `provider_onboarding_progress` contains zero rows,
including zero snapshots, and there are zero `provider_application` targets
or `provider_application_%` action rows. No payloads, identity values or
credentials were exposed. The legacy table/service has not been dropped or
migrated. The six approved providers remain a separate legacy-admission issue.

Before adding same-record resubmissions, this slice corrects the initial
submission transaction:

- OPS-482 locks the applicant account, rechecks active/customer/not-fraud
  eligibility, and checks for the existing provider inside that transaction.
  Concurrent submissions serialize to one application and one explicit 409,
  without granting a role, clearing flags, or replacing an existing record.
- OPS-483 removes the invalid undefined-column fallback. Real PostgreSQL
  cannot execute its second INSERT after the first aborts the transaction;
  making that fallback work with a savepoint would silently discard identity
  metadata and questionnaire answers. A missing application column now rolls
  back and returns a stable, non-sensitive 503. The success log runs only
  after `db.transaction` commits. Linkage failure also rolls back the provider.
- OPS-484 requires currently active catalog categories under shared row locks
  and deduplicates category selections. The old category-only rows have no
  uniqueness guarantee, and `ON CONFLICT DO NOTHING` did not deduplicate them.
  Disabling a category affects new submissions, not historical application rows.

Three separate regressions use the real service and real PostgreSQL
transactions in isolated localhost `*_test` schemas. They exercise current
and concurrently changed roles/flags, missing owners, duplicate submissions,
owned private references and retained optional fields, actual missing-column
and downstream-constraint failures, inactive/nonexistent categories, concurrent
catalog deactivation, deduplication and unchanged historical records. This is
a focused service fixture, not a full migration or end-to-end browser proof.

Initial local test/compiler attempts were blocked by Windows module/compiler
permissions, not application assertions. The authorized rerun passed five
focused files / 13 tests in 14.805 seconds; three new database files/tests
were explicitly skipped because no safe local PostgreSQL was configured.
API TypeScript and changed-file lint passed. The unchanged regression-ID gate
passed at 1,491 titled regressions, and `git diff --check` passed. The first
broader test selector was rejected by Windows command parsing before tests
ran; the selector was corrected for the rerun. Fresh CI database execution
remains mandatory before claiming these three new regressions have passed.

This is submission groundwork, not E35/E74 completion. Durable expiring drafts,
immutable submitted revisions, expected-revision decisions, correction requests,
same-provider resubmissions, reviewer notifications, legacy admission and full
Stitch/browser acceptance remain outstanding. E21's qualified retention matrix
cannot be supplied by a blanket engineering approval. No schema, production
data, financial history, dependency, gate or security setting changed here.

The corrected broader provider command passed 102 files / 251 tests in
16.243 seconds. Six PostgreSQL files/tests were explicitly skipped locally
(the three preceding admission regressions plus the three new submission
regressions). The earlier admission tests already have CI evidence above;
the new submission tests still require their first CI execution.

## Submission CI verified; operator dialog follow-through

Published submission commit `b288524b3ace5a1493e798f7eb538306ee647961`
passed CI `33968968274` and Gates `33968968271`. The completed API logs name
OPS-482, OPS-483 and OPS-484 as passed against the isolated CI PostgreSQL
service. All 950 API suites / 3,314 tests passed. All four CI jobs completed
successfully, including Admin, Mobile and the API image build. This supersedes
the preceding local-skip uncertainty, not the release or lifecycle limitations.
No API/admin release artifacts were requested for this run.

UX-1312 aligns the shared approval rationale with the existing server's trimmed
10-to-2,000-character range. Both actual approval surfaces keep their submit
action disabled for an invalid rationale, including an over-limit value
injected past the native textarea limit. Required semantics, a stable unique
field ID, linked guidance/count and blur-triggered error feedback are present.
Whitespace trimming matches the approval payload. No vetting-policy item or
server rationale limit changed.

UX-1313 replaces the provider queue's hand-built modal with the existing Radix
dialog primitive, retaining the bounded scroll container and semantic styles.
Real rendered interactions exercise focus entry, Tab/Shift-Tab boundary loops,
attempted outside focus, Escape, original-trigger restoration, explicit draft
discard, retained entries after choosing to keep reviewing, pending close
attempts, failed-decision context and a successful retry. A decided provider
can disappear from a filtered queue: the directory refresh completes before
close, and focus falls back to the stable search field if its trigger is gone.
The next provider starts with no previous reason or error. No new UI dependency
or global primitive change was needed.

Safety interpretation of the design contract's dismissal rule: an unsent
review can be cancelled/discarded, but Escape or Close cannot cancel an API
request already sent. During that request, the dialog remains on its target,
its fields/submit/cancel are disabled and a visible status explains the pending
decision. Retry clears the preceding error; failure restores editing while
preserving the target and entries. Discard wording does not falsely promise
that an earlier failed request never reached the server. This does not block
browser navigation or claim network failures prove rollback.

Initial focused UI execution passed six files / six tests. TypeScript then
identified two mocked responses missing the real client's `status` and `ok`
fields; those fixtures were corrected with actual values, not a suppressed
type error. The surrounding provider-admin suite passed 67 files / 73 tests,
and TypeScript, changed-file lint and the unchanged uniqueness gate passed
(1,493 titled regressions). A subsequent run including frozen pending fields
also passed 67 files / 73 tests in 20.26 seconds. Final refresh/focus-fallback
verification and the production build are recorded below when complete.

Full six-viewport authenticated browser/Stitch acceptance remains outstanding.
These DOM tests neither open real private documents nor approve production
accounts. Durable drafts, request-changes/resubmission, immutable reviewed
revisions and governed legacy admission remain the next lifecycle work. The
candidate has not been merged into master or deployed to the shared server.

Final UX-1312/1313 verification passed all 67 provider-admin files / 73 tests
in 22.98 seconds, including the removed-row focus fallback. The Admin build
passed TypeScript and emitted its production bundle (2,845 modules; 20.57
seconds), followed by successful changed-file lint. `git diff --check` passed.
Fresh full CI for this UI continuation is still required after publication.

## Provider draft foundation, after verified operator-dialog CI

CI `33970189538` for published `b18c313b78c4da60b9108663ce9b47ca6ae1e345`
completed successfully in all four jobs. Gates `33970189650` also passed.
This resolves the preceding fresh-CI requirement, not browser acceptance or
deployment. No production checkout, schema, account or service changed.

The next lifecycle slice implements the typed draft foundation described in
`docs/architecture/provider-application-lifecycle.md`. Migration 172 is
additive, with no legacy backfill or deletion. The owner-only HTTP API uses
strict fields, private object keys, expiring rows and revision conflicts. It
does not write approval state or general-audit payloads. A bounded cleanup
service exists but is not yet scheduled. Final submission consumption and
applicant UI resumability are explicitly still pending.

Local focused execution passed OPS-485 and honestly skipped the four actual
PostgreSQL regressions OPS-486 through OPS-489 (5 files total, 5.268 seconds).
Those database tests require their first CI execution. API TypeScript passed.
Initial lint reported one missing return-type annotation; that annotation was
added rather than suppressing the rule. This is not an E35/E74 closeout or a
claim that drafts already survive a refresh in the user-facing app.

## Draft foundation CI passed; atomic submission continuation

Published `f80d41ffc8e4edcf4f1f2c2dc8913d905a293f18` passed CI
`33972140158` and Gates `33972140143`. API job `101322413721` logs each
OPS-485 through OPS-489 as passed between 14:35:14 and 14:35:26 UTC; the
overall API result was 955 suites / 3,319 tests passed. All four CI jobs
succeeded. The earlier local database skips are superseded by this actual
execution. Local Docker was checked read-only and its engine was unavailable;
no daemon/container was started as a workaround.

OPS-490 now joins draft validation and consumption to the existing canonical
submission transaction. Owner and draft locks protect the expected UUID and
typed fields. An older client cannot bypass an active draft. Unsaved changes,
stale revisions, expired/absent supplied revisions and concurrent duplicate
submissions cannot overwrite or replace the saved/current application. Catalog
and market checks still apply at final submission. Failure at the final draft
DELETE rolls back provider and linkage writes. No approval, account promotion,
fraud-flag clearing or uploaded-object deletion is added.

OPS-491 forwards `draftRevision` through the real apply route and accepts
restored private onboarding keys under the same service ownership boundary.
Agreement acceptance remains required on the final request. OPS-492 covers
expiry, older-client compatibility without an active draft and a missing draft
schema. Missing migration 172 is a safe 503, not permission to ignore drafts.
The existing submission fixture now uses UUID accounts plus actual migration
172 in its isolated schema; it still does not claim a full migration-chain test.

The final surrounding local provider selection passed 103 files / 252 tests
in 10.724 seconds, with 13 explicit database skips. The targeted draft selection
passed its one local input test and skipped seven PostgreSQL tests. API
TypeScript, changed-file lint, regression-ID gate (1,501 titles) and diff checks
passed. Fresh CI is mandatory for the new OPS-490 through OPS-492 regressions.
No production state changed. The next work remains applicant UI hydration and
save/conflict/retry, bounded worker expiry, privacy inventory and full lifecycle
review/revision/resubmission, followed by paired authenticated acceptance.

## Atomic submission CI verified; account-switch transport correction

Published `2d657b3b615e198385610a03d1e7f48cb169e752` passed CI
`33973157203` and Gates `33973157202`. API job `101325134774` logs OPS-490,
OPS-491 and OPS-492 passed at 14:55:50, 14:55:57 and 14:56:13 UTC. All 958
API suites / 3,322 tests passed, as did all four CI jobs. Draft submission
integrity is verified in the isolated test database, not yet on production.

Reading the actual onboarding screens and shared transport before UI wiring
exposed two reproducible session bugs. UX-1314's controlled old-account draft
write received a 401 after switching to another account; the unmodified client
refreshed/replayed and incorrectly resolved 200 instead of refusing the replay.
UX-1315 showed that a no-token refresh left a resolved-null global promise, so
a later signed-in session could not refresh. Both real transport regressions
failed before the fix (2 files / 2 failures, 17.886 seconds); no real accounts,
identity records or network services participated in those reproductions.

The shared client now checks the initiating stored account before/after HTTP,
before refresh and after rotation, refusing stale responses/replays with a safe
session-changed error. Refresh work is keyed by account and refresh session,
not just one global promise. A late old rotation cannot overwrite a newer login
or clear its refresh gate; a changed token pair also prevents an old failure
from signing out a newer same-account login. No-token refresh exits without
creating a stuck gate. Normal same-session concurrent refresh still coalesces,
retains the device fingerprint and updates the active token pair.

The focused new and existing transport checks passed five files / five tests
in 1.423 seconds. The full mobile suite passed 555 files / 839 tests, with 84
existing TODOs explicitly not counted as passes (97.991 seconds). Mobile
TypeScript, changed-file lint, unchanged regression-ID gate (1,503 titles) and
diff checks passed. Expanded same-account concurrent-login assertions also
passed in the final five-file/five-test rerun (1.371 seconds), followed by
successful final type/lint/diff checks. Fresh CI is required after publication.

This does not undo requests already processed by the server, replace server
authorization/session revocation, or clear every UI cache/draft on account
switch. Owner-bound onboarding state and actual screen save/hydration remain
required. No UI layout, legal policy, production account, live schema, server
checkout or runtime service was changed in this continuation.
