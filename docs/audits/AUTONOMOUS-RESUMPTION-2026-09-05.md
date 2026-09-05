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
