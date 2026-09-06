# Paired release file-publication core

Date: 2026-09-06. Base: `42773fbad353542d69b1a22a532e6ab258968ee9`.
This implements part of the coordinated API/admin/customer-provider release
plan. It does not complete that plan or authorize deployment.

## Implementation boundary

`scripts/server/paired-web-release.mjs` is an exported file-operation core,
not a production command. It uses existing Node standard-library APIs, without
adding dependencies. Its prepare step inventories both candidate and destination
trees before changing web files, checks matching source/origin/demo metadata,
rejects unsafe paths and overlapping roots, and snapshots both complete old/new
trees into a private journal directory. A shared control-directory lock is held
across each operation; it never declares a lock stale from elapsed time.

Staging publishes only validated immutable asset names and refuses different
bytes at an existing asset path. Publication orders mutable metadata/icon files
before each `index.html`, preserving the original mounted directory identities
and all old hashed assets. File bytes, original root device/inode identities and
expected current state are checked throughout. A private intent/history journal
records the named operation before each write. Verified test-owned temporary
files can be reconciled after an interruption; unrelated bytes are retained and
cause failure rather than being deleted.

API activation, actual served-file hash collection and release/rollback
acceptance are required adapters. False or missing acceptance fails. Served-file
results must contain the expected names, byte lengths and hashes; an empty
callback result cannot stand in for nginx verification. An uncertain activation
response is reconciled against the actual adapter-reported image before retry.
The expected new API image and readiness are checked before each mutable-file
operation and again immediately before its atomic rename. These sampled checks
do not make the API and two directories one atomic transaction.

Rollback is separately authorized, restores old mutable files from retained
copies and verifies the old API afterward. Only specifically identified mutable
files added by this release can be removed, with their new copies retained in
the journal. Old and new hashed assets are not pruned. There are no database
restore/down-migration, shared-service restart or source-checkout commands here.

At this original core checkpoint, production adapters **did not exist yet**.
The subsequent [read-only observer slice](MARKETPLACE-RELEASE-OBSERVERS-2026-09-06.md)
implements actual nginx/HTTPS/API observation, not activation or acceptance.
The remaining production integration must independently enforce
the fixed marketplace paths/mounts, Git/master and artifact provenance, actual
CI and backup evidence, approved artifact promotion, and both directions of
client/API/schema compatibility. A literal `true` supplied by a fixture is not
business acceptance. Rehearsal metadata remains `deploymentEligible: false`;
neither this module nor its tests promote those candidates for production.

## Executed verification

The new core's first real filesystem run produced **22 passed and 6 failed
scenarios**. It exposed writing the first surface before detecting a second
surface's snapshot/collision failure, ignored negative acceptance results,
missing served-byte proof and ignored rollback denial. These were corrected
before publication, without weakening those assertions. This is development
evidence for new code, not a claimed old-production failure reproduction.

The first corrected direct Node run passed 28 scenarios in 15.197 seconds.
The normal API Jest bridge passed in 20.477 seconds and again in 16.826 seconds.
Further code review then found missing API rechecks between mutable-file
operations. Two added tests failed against that unpublished implementation:
after loss of readiness following admin metadata publication, and after an
unrelated API image replaced the accepted image following the admin entry
switch. Both showed that a later entrypoint was incorrectly switched before
the final API check detected the failure. The 30-case run was 28 pass / 2 fail
in 28.987 seconds. Neither failure was hidden by an expected-throw assertion:
the actual resulting HTML assertions failed.

The implementation now rechecks before each mutable-file operation and at its
rename boundary. A third added case covers API failure after a temporary
entrypoint has been written, retaining the old exposed entrypoint and then
resuming successfully without another API activation. Final direct Node:
**31 pass, zero failures/skips/TODOs, 21.467 seconds**. Final API Jest bridge:
**one suite / one test passed, 25.533 seconds**, including **31 passing child
scenarios in 24.389 seconds**. The bridge prints individual TAP outcomes and
requires exactly 31 passes with no skipped/TODO child cases. Its outer count
remains one test; it does not inflate the API total by 31.

Coverage uses actual temporary filesystem reads/writes, snapshots, hashes,
directory identities, symlink/junction rejection, locks, interruption/retry,
mutable-file ordering and rollback. API operations and nginx/acceptance adapters
are substituted. Fixtures compare the actual resulting file bytes, not source
strings or a checklist claiming success. Exact test-created temporary roots are
verified before cleanup; no production files participate.

Local Node was 24.13.0 on Windows. Direct Node syntax checks, final three-file
ESLint and API TypeScript passed. The first ESLint run found an undeclared
`structuredClone` global in the existing lint environment; a local binding from
`globalThis` corrected it without changing lint rules. Initial `npx` resolution
and sandbox dependency-read failures occurred before tests; authorized direct
execution of the existing Jest/ESLint installations succeeded. No dependency
repair, version change or gate relaxation was used to hide those failures.
ESLint and API TypeScript passed again after the three API-boundary cases.

The exact same two core/fixture files were also run with host **Node 20.20.2 on
Linux** in a newly created private temporary directory: **31 pass, zero
failures/skips/TODOs, 10.640 seconds**, exit 0. Both transferred file SHA-256
hashes matched local bytes before execution. The unprivileged run had a
120-second timeout and 192 MiB Node old-space limit. This exercised the POSIX
filesystem paths (including normal directory sync and owner-only control),
not Docker/nginx integration, a real API, permission/disk fault injection or
hard-crash durability. The two fixtures and full TAP log remain privately
retained. Test-created data directories were removed by their guarded cleanup;
no existing user or production data was deleted.

Reproduce the core fixtures without contacting any server:

```sh
node --test --test-reporter=tap scripts/server/__tests__/paired-web-release.test.mjs
```

The preceding documentation checkpoint's CI `34021720277` and Gates
`34021720273` both passed. Fresh CI for this new core is still required at this
local verification checkpoint. Passing Windows and Linux filesystem fixtures
does not establish complete deployment or business acceptance.

Subsequent independent CI completed successfully at published checkpoint
`28faad9e1f77ff8c6bd68c98c941c8d69de0b03c`: CI `34024503185` and Gates
`34024503189`. The API job executed the bridge with 31 child tests / 31 passes;
the complete API run was 971 suites, 3,406 passes and two explicit TODOs in
121.247 seconds. Admin passed 590 files with one skipped file, 697 passing
tests and three TODOs in 467.21 seconds. Mobile and the Docker build/boot job
also passed. Existing report-only visual/mutation gates and skipped/TODO work
are not upgraded to end-to-end acceptance by these results.

## Remaining work and separately discovered UI issue

- Complete activation and the acceptance/provenance contract, building on the
  subsequent read-only host observers; do not substitute no-op production
  callbacks for those checks.
- Exercise real Linux/nginx bind mounts, actual image activation boundaries,
  interrupted-process/lock recovery, durability and disk/error fault injection.
- Validate complete HTML/JS/CSS resource references and execute old/new-client
  business journeys. The current inventory/hash/naming checks are not a complete
  dependency graph or authenticated browser acceptance test.
- The actual retained Admin candidate and `apps/admin/index.html` reference
  `/vite.svg`, but that file is absent from its artifact inventory. This browser
  icon/template-branding defect was found by reading the real exported HTML,
  not caught by this core. It is **not fixed in this slice**. Reuse a reviewed
  onService brand asset and prove the built/served result in a separate UI fix.
  The subsequent [UX-1374 record](ADMIN-BROWSER-IDENTITY-2026-09-06.md) documents
  that separate source fix and real build/HTTP regression, not a live rollout.
- Continue the full provider/customer/admin Stitch and business/support/payment
  linkage audit, provider application lifecycle, privileged-session/evidence
  workflows and the registered operational/professional signoffs.

Read-only server checks confirmed the expected two marketplace web bind mounts
and host Node 20.20.2. The isolated filesystem run above used only private test
files. At this original checkpoint no script was installed or executed against
live web files. The subsequent observer audit separately records read-only
observation of the existing live files, not a publication or deployment.
No production source, frontend, account, database, API or shared service changed.
This is an implementation checkpoint, not release readiness or goal completion.
