# Paired web/API release plan

Status: file-publication core implemented and Windows/Linux fixture-tested;
read-only host/HTTPS observers implemented and exercised on the live marketplace.
Production activation/acceptance integration and an actual rollout remain incomplete. Read alongside
`exact-api-release.md` and `postgres-restore.md`. The existing workflow deploys
only the API. No single success message proves all three surfaces are aligned.

`scripts/server/paired-web-release.mjs` exports prepare, stage, publish, rollback
and inspection operations. It has no default production adapters or deployment
CLI. [The core audit](../audits/PAIRED-RELEASE-CORE-2026-09-06.md) records its exact
tests and unimplemented integration boundaries. Do not supply permissive
production callbacks or edit candidate flags to manufacture release acceptance.

`scripts/server/marketplace-release-observers.mjs` exports the fixed-target,
read-only nginx/served-file/API observers. Production callers use
`createMarketplaceReleaseObservers()` with no overrides. Its returned object
does not contain activation or acceptance callbacks and cannot publish a release
by itself. [The observer audit](../audits/MARKETPLACE-RELEASE-OBSERVERS-2026-09-06.md)
records real TLS fixtures, the first live-inspection failure and its regression,
and the corrected live observation. A successful current-file observation does
not establish a complete dependency graph or authorize candidate deployment.

## Identity and rollback checkpoint

Use one reviewed source revision for API, Admin and customer/provider artifacts.
Check actual CI/gate evidence, metadata origins/demo flags, package hashes, image
identity and source bundle. A PR merge checkout is not automatically a later
master revision. Preserve the exact revision; never relabel a tested artifact.

Record the old source HEAD, API image ID, both complete web trees and their
hashes, actual nginx mount sources/destinations, and source/config/uploads/database
backup before changing the checkout. Retain the old image and assets. The current
rehearsal artifacts explicitly deny deployment eligibility; browser/DB acceptance
and compatibility review are separate prerequisites, not editable metadata flags.

## Shared-server boundary

The marketplace nginx serves other businesses. Its current web bind mounts are:

| Marketplace host directory | Container directory |
| --- | --- |
| `/opt/onservice/apps/admin/dist` | `/usr/share/nginx/admin` |
| `/opt/onservice/apps/mobile/dist-web` | `/usr/share/nginx/app` |

Reconfirm these on the actual container before use. Do not rename/replace the
mounted root directories: an existing bind mount can keep the old directory
instead of following a replacement pathname. Do not recreate nginx to hide that
mistake. No other project directory, shared nginx configuration, database,
Redis or uploads volume is part of frontend publication.

## Required bounded publication behavior

1. Preflight both artifacts and both destinations before writing either. Reject
   symlinks, traversal, special files, unknown destinations, a changed source,
   missing entrypoints and unequal API/frontend revisions. Preserve a private
   journal of old/new file hashes and completed stages. Use one release lock.
2. Inspect the full artifact file inventory and runtime references. Current
   Vite/Expo builds have content-hashed assets plus mutable `index.html` and
   metadata; the Expo build also includes `favicon.ico`. Do not assume every
   filename is immutable or every referenced file is directly listed in HTML.
3. Stage new assets within the existing directory trees, verify complete bytes
   before exposing each final asset pathname, and keep old hashed assets for
   already-open tabs and rollback. Reject an existing asset pathname with
   different bytes rather than silently breaking older clients. Do not run
   `rsync --delete` or recursively clear a live web root.
4. Verify staged files through the running nginx container, not only the host
   filesystem. Check that the old entrypoint and its lazy-loaded assets still
   work. A generic SPA HTTP 200 is not proof that the expected JS/CSS was served.
5. Rehearse database migrations and old-client/new-API compatibility first.
   Activate only the verified API with the existing API-only helper. Check its
   actual image and `/health/ready`; use unique upstream identity, not a shared
   generic `api` hostname.
6. Publish each web entrypoint last using a same-directory atomic file rename,
   after all of its dependencies are present. Do not replace the parent mount.
   Treat Admin and customer/provider switching as separate recorded stages:
   two directories and an API container are not one atomic transaction.
7. Inspect publicly served HTML/asset hashes and authenticated customer,
   provider, staff and operator journeys. Verify role boundaries, support
   linkage, booking history and the intended test-mode/payment limitations.
   Record each surface's actual revision before declaring alignment.

The core's filesystem fixtures cover mutable-file ordering, selected interruption
boundaries, root/asset preservation and rollback. Actual cross-version business
compatibility, API activation/acceptance integration, abrupt-process failure and full dependency
reference validation remain required. Those requirements are not established by
a passed file-publication fixture or a returned acceptance callback.

## Failure handling

If asset staging fails before an entrypoint switch, leave the old entrypoint
active and record the failed stage. Retain staged assets privately/under their
verified hashes for diagnosis; do not erase files broadly as cleanup.

If either entrypoint was switched, determine the actual state of each surface
before retrying. For a compatible application rollback, restore the retained
old entrypoints with same-directory file replacement and the reviewed old API
image. Keep old and new asset sets so cached/open tabs do not receive missing
chunks. Recheck nginx-served bytes, image identity and authenticated behavior.

Never roll back by restoring the live database automatically or running down
migrations: that could discard transactions received since the backup. If the
schema/API compatibility review does not allow old code, fix forward according
to the recorded failure stage. No `docker compose down`, broad restart, image
prune, master force push or branch-protection change is part of this plan.
