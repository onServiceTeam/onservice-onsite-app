# Deployment Guide

This is the release runbook for the current onService PH production topology.
The canonical Git branch is `master`. Production is self-hosted on the shared
Hetzner server described in `docs/HETZNER-DEPLOY.md`; Render and Vercel are not
part of the current deployment.

The production checkout is `/opt/onservice`. `/opt/onservice-onsite-app` is a
human-readable alias to the same directory. The customer/provider Expo web
export and the admin Vite build are served by the shared nginx container. The
API, Postgres/PostGIS, PgBouncer, Redis, and monitoring services run under
`docker-compose.prod.yml`.

This server also hosts unrelated applications. Never run a broad Docker prune,
stop every container, recreate the entire Compose project, or replace the
shared nginx container as part of an ordinary onService release.

## Release ownership and automation

GitHub Actions runs the code/test gates on pushes to `master`. The production
workflow in `.github/workflows/deploy.yml` is deliberately manual and deploys
the API only. It requires the `DEPLOY_HOST`, `DEPLOY_USER`, and
`DEPLOY_SSH_KEY` repository secrets before it can be used. Those secrets are
not currently stored in the repository settings.

The API workflow now uses exact image/source verification rather than health
alone. Read `docs/runbooks/exact-api-release.md` for prerequisites and the
OPS-476 verification limits. It is still API-only, not a coordinated web release.

Frontend artifacts are gitignored and must be built, transferred, and
extracted separately. Until the production workflow is configured and tested,
use the controlled SSH procedure below. Never commit an SSH private key, server
environment file, database dump, or third-party credential.

## Pre-flight gate

Run from the repository root at the exact commit being released:

```bash
npm ci --legacy-peer-deps
npx tsc --noEmit --project packages/api/tsconfig.json
npx tsc --noEmit --project apps/admin/tsconfig.json
npx tsc --noEmit --project apps/mobile/tsconfig.json
npm test --workspace=packages/api
npm test --workspace=apps/admin
npm test --workspace=apps/mobile
npm run build --workspace=packages/api
npm run build --workspace=apps/admin
npm run lint --workspace=apps/admin
npm run lint --workspace=apps/mobile
npm test --workspace=packages/api -- --runInBand __tests__/smoke.test.ts
```

The explicit API smoke command is mandatory even when the full suite already
passed. Any failure blocks deployment. The load test in
`load-tests/full-suite.js` remains a launch-cutover requirement; do not claim a
routine UI release has passed that launch gate unless it was actually run
against the intended environment.

Confirm GitHub CI is green for the release SHA before changing production.

## Build the web frontends

The Expo web build uses the customer/provider app origin because nginx proxies
`/api`, `/socket.io`, and `/uploads` to the API. Demo mode is for controlled
testing only and must be omitted for the public launch build.

```bash
cd apps/mobile
EXPO_OS=web \
EXPO_PUBLIC_API_URL=https://app.onservice.ph \
npx expo export -p web --output-dir dist-web --clear

cd ../admin
VITE_API_URL=https://admin.onservice.ph \
VITE_DEMO_MODE=0 \
npm run build
```

Before transfer, verify both bundles contain the intended production origins
and neither contains `DEV_MISSING`, `localhost:7381`, demo credentials, or demo
login controls. For a separately authorized controlled-demo build, set the
demo variables explicitly and open the freshly built login pages to confirm
the intended customer, provider, and admin demo controls render. The `--clear`
flag is required because Metro can otherwise reuse a transform compiled under
the opposite demo-mode value.

Package each artifact from inside its output directory so extraction does not
add an extra folder level:

```bash
tar czf /tmp/onservice-mobile-<sha>.tar.gz -C apps/mobile/dist-web .
tar czf /tmp/onservice-admin-<sha>.tar.gz -C apps/admin/dist .
```

## Controlled production deployment

1. Connect as the dedicated `onservice` user with key-only SSH.
2. Resolve `/opt/onservice` and the alias with `readlink -f`. Both must point to
   the intended onService checkout before any write.
3. Confirm the checkout owner. If it is root-owned, run checkout writes through
   non-interactive `sudo` with a per-command
   `-c safe.directory=/opt/onservice`; do not add a broad global safe-directory
   exception to the deployment user's Git configuration.
4. Confirm the checkout is clean and its remote points to
   `onServiceTeam/onservice-onsite-app` over either SSH or HTTPS.
   Confirm `docker volume inspect onservice_uploads_data` succeeds. This is an
   external, data-bearing volume used by the API and nginx. If it is missing on
   an existing server, stop and investigate as possible data loss; do not run
   the first-install helper to create an empty replacement.
5. Record the previous checkout, API image and web artifact identities privately.
   Take and verify the complete backup set **before changing the checkout**,
   retain the old image/assets, and confirm the isolated restore and rollback
   rehearsal. Fetch `origin/master`, then fast-forward only to the already-green release
   SHA. If the server's private-repository deploy key is unavailable, create a
   uniquely named incremental `git bundle` from the verified local clone,
   transfer it to `/tmp`, run `git bundle verify` on the server, fetch its
   `master` ref into a temporary remote-tracking ref, and merge with
   `--ff-only`. This preserves the canonical remote and avoids putting a GitHub
   token on the server. Never force-push or merge an unverified server-side
   commit.
6. Transfer the two uniquely named frontend archives and their verified
   revision/checksum manifest to a private, release-specific staging directory.
   Check archive paths and extract there first, not over the live entry files.
   Verify that both artifacts and the API were built from the same release SHA.
7. Load the reviewed SHA-tagged API image, or build and label it from the exact
   clean checkout. Building the image does **not** activate it:

   ```bash
   cd /opt/onservice
   release_sha="$(git rev-parse HEAD)"
   docker build -f packages/api/Dockerfile \
     --label "org.opencontainers.image.revision=$release_sha" \
     -t "onservice-api:$release_sha" .
   ```

8. Do not run migrations unless the release contains reviewed migrations and
   the release plan explicitly includes them. With the backup and isolated
   exact-runner rehearsal verified, set `MIGRATION_TARGET` to the exact reviewed
   final basename and `ONSERVICE_RELEASE_SHA` to that same SHA. Run the helper
   below **before** starting an API that requires the new schema. Migrations
   bypass PgBouncer and use `DATABASE_DIRECT_URL`. Confirm the old API can safely
   run throughout; otherwise use the separately reviewed coordinated cutover.
9. After schema compatibility is confirmed, activate only the exact API image:

   ```bash
   sudo -n env ONSERVICE_RELEASE_SHA="$release_sha" \
     bash scripts/server/activate-api-release.sh
   ```

   Publish validated hashed web assets into the existing `apps/mobile/dist-web`
   and `apps/admin/dist` directories first, preserving old assets for open browser
   sessions. Install each new `index.html` last using a temporary file and atomic
   file rename **inside the existing directory**. Never replace either mounted
   directory inode. API-first entry publication is only suitable when the old
   web clients remain compatible; otherwise the release needs an explicit
   coordinated cutover plan. This guide is not an implemented atomic publisher.
10. Do not recreate nginx for an ordinary frontend or API release. In-place
   extraction makes the new static files visible without replacing the shared
   proxy.

## Post-deploy verification

Verify all of the following before declaring the release complete:

- `/opt/onservice` is clean and exactly matches the GitHub release SHA.
- `onservice_uploads_data` exists as the explicitly named external volume, is
  mounted only by the onService API and nginx, and Compose emits no ownership
  warning for it.
- `docker compose -f docker-compose.prod.yml ps` reports the onService API,
  Postgres, Redis, and nginx as healthy/running.
- Redis reports `maxmemory-policy=noeviction`; BullMQ queue keys must never be
  discarded by a cache-eviction policy.
- Fresh API startup logs include `Settings drift check passed`. A drift warning
  means an active admin setting and its database-outage fallback are no longer
  aligned and the release is incomplete.
- Unauthenticated probes of protected routes return 401 and are recorded as
  `Request rejected` warnings, not `Request error` events. A normal access check
  must not create a false server-failure alert for the support team.
- `nginx -t` passes and fresh nginx logs contain no `ssl_stapling ignored`
  warning. Current Let's Encrypt certificates use CRL distribution points and
  contain no OCSP responder URL.
- The API container's `/health/ready` returns a successful readiness response.
  While the staging IP lock is active, an outside request to
  `https://api.onservice.ph/health/ready` correctly returns 403; verify the
  customer/provider proxy with `https://app.onservice.ph/api/v1/config` instead.
- `https://app.onservice.ph` loads the customer/provider app and serves the new
  hashed Expo entry asset.
- `https://admin.onservice.ph` loads the admin login and serves the new Vite
  assets.
- Customer and provider demo sessions work at phone, tablet, and desktop
  widths when the deployed build intentionally enables demo mode.
- The browser console contains no new application errors.
- Other applications routed by the shared nginx container remain reachable.

Keep the release archives only long enough to verify deployment, then remove
the exact `/tmp/onservice-*-<sha>.tar.gz` files. Do not use wildcard cleanup in
a shared `/tmp` directory.

## Database migrations

Migrations live in `packages/api/migrations`. They are forward-only. A
production migration is a hard stop unless it has been reviewed, backed up,
and explicitly included in the release plan.

The repository uses legacy three-digit migration filenames rather than the
timestamp filenames expected by node-pg-migrate 8. Production migrations
135-145 were also recorded in a nonnumeric order during one historical batch.
The normal order check therefore rejects later migrations even though the
schema ledger is complete. The production helper uses the runner's
`--no-check-order` mode, but limits ordinary releases to an exact target and
always performs a dry run first.

When authorized, take a backup and run the exact reviewed migration through the
helper:

```bash
sudo -n bash scripts/server/backup-db.sh
sudo -n env ONSERVICE_RELEASE_SHA="$release_sha" \
  MIGRATION_TARGET=<exact-reviewed-final-migration-basename> \
  MIGRATIONS_DRY_RUN_ONLY=1 bash scripts/server/run-production-migrations.sh
```

Read the dry-run output and confirm the **entire pending batch** through that
target is intended. Then apply it and verify all expected ledger/schema changes:

```bash
sudo -n env ONSERVICE_RELEASE_SHA="$release_sha" \
  MIGRATION_TARGET=<same-exact-reviewed-final-migration-basename> \
  bash scripts/server/run-production-migrations.sh
```

Never improvise a destructive inverse migration on production. Follow the
backup and rollback plan written for that migration.

## Rollback

For an application-code regression with no migration:

1. Create a normal `git revert <bad-sha>` on `master` and push it.
2. Wait for all GitHub CI checks on the revert to pass.
3. Build the frontend artifacts from the revert commit and deploy them in
   place using the same procedure.
4. Fast-forward the server checkout and build/verify/activate only the API using
   the exact-image procedure above, with the new revert revision and its label.
5. Repeat every post-deploy verification, including checks of the neighboring
   apps.

Do not force-push `master`, use `git reset --hard`, or roll the database back
without a separately reviewed recovery plan.

## Environment variables

Production values live only in the protected server environment file. The
tracked `.env.production.example` is the inventory and must contain
placeholders, never live values. Important groups include:

- canonical URLs and runtime mode;
- direct and pooled Postgres connections;
- Redis;
- JWT signing and expiry settings;
- PayMongo payment and webhook keys;
- SMS, email, push, CAPTCHA, and object-storage credentials;
- Sentry and monitoring settings;
- TLS domain and contact settings.

Run `node scripts/verify-env-contract.mjs` before deployment. The current
self-hosted topology deliberately uses `DB_SSL_MODE=disable` only for the
private API-to-PgBouncer Compose hop. The production template also fails safe
with `ENABLE_TEST_FIXTURES=0`, `BIR_DOCUMENT_ISSUANCE_ENABLED=0`,
`EXTERNAL_PAYMENT_AUTHORIZATION_ENABLED=0`, and
`DISPUTE_PARTY_SETTLEMENT_ENABLED=0`. E22, E14, E18, and E24 must be resolved
and validated before the held workflows are enabled. Mobile/public variables are
inventoried separately in `apps/mobile/.env.example` and must never contain
server secrets.

Mobile native releases continue to use EAS Build/Submit. Bump the public app
version and both store build numbers for every store submission. Use EAS Update
only for JavaScript changes permitted by the store policies.

## Incident escalation

- P1: customer-facing outage, payment failure, suspected data loss, or security
  incident. Stop the rollout, preserve logs, notify the founder/DPO, and begin
  the incident runbook immediately.
- P2: degraded performance or a major single-feature outage. Roll back if the
  release caused it and start same-day triage.
- P3: cosmetic issue or isolated log noise. Record it with evidence and fix it
  through the normal tested release path.

Do not publish placeholder phone numbers, PagerDuty routes, or internal contact
details in the repository.
