# Exact-image migration 172 rehearsal

Date: 2026-09-06. Application: onService PH onsite-services marketplace, not
onService Academy or a separate FieldOS product. This is a release-safety
checkpoint, not a production rollout or complete application acceptance.

## Result and release boundary

The candidate's built-in migration runner passed an isolated restoration of
the selected complete backup on the exact PostgreSQL image used by the live
marketplace. It applied all **16 pending migrations**, from 157 through 172,
and verified all **161 resulting migration names**. A second invocation found
zero pending files and retained the same history. Numbered migration basenames
are not the count of historical files.

The production checkout, running API image and 145-row migration history stayed
unchanged. Local/review-branch code is therefore **not aligned with production**.
The paired frontend publisher remains a plan, not an implemented or accepted
release mechanism. No client account or live authenticated workflow was tested.

## Exact evidence identity

| Evidence | Identity |
| --- | --- |
| Candidate CI | [34015709677](https://github.com/onServiceTeam/onservice-onsite-app/actions/runs/34015709677), all jobs passed |
| Candidate source | `7f97b4a9c9f2fc038705162268cad75ef0274657`, the CI merge checkout |
| Candidate API image | `sha256:c218dc274c54488d7d30126ab853029e045589c32bf3cb0f97db9994b8119d13` |
| Candidate API artifact | `9983888572` |
| PostgreSQL | Actual live image, PostgreSQL 17.5, Linux amd64; no major-version upgrade |
| Selected recovery set | Complete timestamp set `20260905-041108` |
| Successful attempt | 08:06:30 through 08:06:47 UTC; explicit exit 0 |
| Code/test checkpoint | `428f9e37c87c8653d96d05ea5ff2de507e6d995c` on the existing review branch |

The candidate source is not the topic HEAD or master. The subsequent checkpoint
changed tests/documentation, not runtime files; it does not relabel this image.
The API/admin/customer-provider candidate metadata still says
`deploymentEligible: false`. No metadata was changed to bypass acceptance.

Before image loading, the outer GitHub artifact SHA-256 and all three inner
package hashes matched independently. Extraction admitted only the four
expected regular files into a new private directory. The Git source bundle
verified with the exact candidate HEAD. After loading, Docker's actual image ID,
revision label, architecture and operating system matched the candidate.
Loading that image did not activate it as the live API.

All four selected backup artifacts passed their completion-manifest hashes,
gzip/tar readability and Git bundle verification. They remained owner-only.
No production backup, environment, personal record, document or credential was
downloaded into or committed to this repository.

## Isolation and failed first attempt

The rehearsal database had no external network, published ports or live-volume
mount. Its PostgreSQL container used 512 MiB memory, 0.5 CPU and bounded tmpfs
database storage. Each migration process used the verified candidate image,
shared only that isolated network namespace, and had a read-only root, bounded
384 MiB memory/tmpfs, dropped capabilities and no application workers started.
The image's own migration script ran without a replacement-script mount.

The first attempt failed during restoration, before migration execution. Its
Unix-socket readiness probe could accept the image's temporary initialization
server before that server's planned shutdown. The restore reported a terminated
connection. This repeated a previously documented rehearsal-startup hazard;
it is retained as failed evidence, not counted as a pass.

A separate second attempt waited for TCP readiness on the final server and
retained startup logs. Those logs confirmed the final TCP listener appeared
after initialization completed. Restoration then passed with stop-on-error and
pipeline failure propagation. Both attempts' exact test-owned containers were
removed after name/label/immutable-ID checks. Their disposable database copies
were discarded, not the original recovery set. Private scripts, hashes,
candidate files and diagnostic logs remain for authorized review.

## Data and behavior checks

The baseline captured every pre-existing public ordinary/partitioned application
table, excluding extension-owned reference tables. It retained complete JSONB
original-column values and duplicate multiplicity inside the disposable database.
This was **114 tables, 1,496 rows and 20,536 field values**. Empty tables were
included but do not establish populated-history behavior.

The dry run preserved all original rows, all 145 migration-history entries,
and the public columns/constraints/indexes/sequences fingerprint. The runner
reported 16 pending files without marking any applied.

Before execution, full review of the pending SQL identified intentional settings
changes. A separate exact expected-value contract covered the six registry seeds
in 161, the held business-booking switch in 166, and the metadata corrections in
167/168. It did not exclude a table or ignore a column. Existing setting values,
IDs, actor references and timestamps remained protected; the explicitly held
business-booking switch was required to be the text value `false`. Newly seeded
settings were checked against their specified defaults.

After application and after the repeat, every original row matched, except for
the exact expected metadata transformations in **three existing settings rows**.
All original booking/payment/provider/customer/support/audit values were part
of that comparison. New columns and rows were allowed, not treated as historical
rewrites. This is preservation evidence for this backup's populated records,
not a claim that every possible legacy population or new financial operation
was exercised.

The provider-draft fixture accepted a valid draft and each of the four valid
same-owner upload prefixes. It rejected **12 invalid cases**: array payload,
unknown key, oversize payload, four unrelated-owner upload prefixes, nonpositive
lifetime, saved-before-created timestamp, null payload, duplicate owner and
unknown owner. Specific database constraint/error categories were checked.
The fixture rolled back, original-record comparison passed again, and the draft
table was empty. These are SQL-level tests, not full HTTP authorization,
resubmission, storage-path canonicalization or retention-worker acceptance.

After cleanup at 08:08 UTC, the live API and PostgreSQL still ran their original
images. The API's own readiness handler returned `ready`, with PostgreSQL and
Redis `ok`; production migration history remained 145 and source HEAD remained
`7ed367cdca1e277f03fc08ff5bbb03b0dc142bd5`. No shared nginx, other application,
live setting, historical transaction or frontend release was changed.

## What remains

- Implement and behaviorally test the bounded paired frontend publisher,
  interruption journal, preserved old assets and compatible rollback described
  in [the paired release plan](../runbooks/paired-web-api-release.md).
- Verify old-client/new-API overlap and authenticated customer, provider,
  provider-staff and operator journeys against matching artifacts. Complete the
  screen-by-screen Stitch/desktop/tablet and company/support linkage inventory.
- Complete provider correction/resubmission/revision/retention work and the
  remaining privileged-session and governed support/evidence workflows.
- Reconcile uploads-reference coverage, cross-file backup consistency, off-host
  durability/PITR and production-scale locking. This attempt did not extract
  uploads, prove full recovery, stress-test live-scale data or establish that
  migrations containing explicit transaction boundaries roll back as one unit.
- Keep business funding, external payment, privacy/retention, accountant and
  attorney requirements open until their actual evidence exists. Approval to
  implement is not professional signoff or permission to invent historical data.

No launch-ready tag, master merge, production migration or live rollout is
claimed. The continuing audit/build goal remains active.
