# Tester-server release runbook

**Status (2026-10-17):** Implemented. The two release scripts and their tests are in the repo. They have **not** yet been used for a real release in this form. Rollback has **never** been practised on the tester server. A CI job has been added to run the tests and the mutation check on Linux. It has not run on GitHub yet (see "Evidence and limits").

**Nothing here is enforced.** GitHub protection is off by Ken's choice (D40, 2026-10-14). No GitHub setting, hook or check stops a release that skips these steps. The steps work only because whoever releases follows them.

**Public repo.** This file names no server address, no SSH alias, no credential value, no credential location that the public `docker-compose.prod.yml` does not already show, and no tester data. Where a value is private it says "private records (not in the repo)". Commands here find containers by their Compose service name (`api`, `postgres`, `redis`, `nginx`, all public in `docker-compose.prod.yml`). The two release scripts name the default Compose container names and the database user on purpose: those follow from the public Compose file and `.env.production.example`, and the scripts need a fixed name to check.

---

## 1. What this covers

- **Covered:** releasing one exact `master` commit to the **tester server**: the API image, additive database migrations, the admin web build, the customer/provider web build, the tester APK, and the catalog cache.
- **The tester server** is the live box testers use at `app.onservice.ph`, `admin.onservice.ph` and `api.onservice.ph`. It runs in staging mode with tester data. It is **not** a real-customer production.
- **Not covered:**
  - a real-customer production release or launch cutover (`docs/runbooks/launch-cutover.md`, Ken only);
  - any change to the shared nginx, the Compose stack, the host front door, or anything that belongs to other businesses on the same host;
  - a migration that drops, renames or rewrites existing data (CLAUDE.md hard stop 2);
  - DNS, real money, new vendors.

  Each of these needs Ken first.

**Who may release, and on what authority.** Ken's sync rule (2026-10-12, repeated in D40 item 2): every verified piece goes to GitHub, the tester server and, when mobile code changed, a new APK, in the same session. Its limits are written as row R2 of `.ai-coder/governance/AUTHORIZATION-REGISTER.md`. **That row is DRAFT until Ken confirms it.** The permission does not apply (stop and ask Ken) if any of these is true:

- CI is not green on the exact commit;
- the migration rehearsal fails;
- a migration drops, renames or rewrites data;
- the release needs an nginx or Compose change to work;
- real customers are using the server;
- Ken has withdrawn the rule.

## 2. When to release

- After each verified piece of work, in the same session (Ken's sync rule).
- Release the commit that is on `master` and passed its checks. One commit per release. Never release a commit that is not on `master`.
- Do not release while CI or Gates are still running or red.
- Do not release a batch of changes that were never verified one by one.

## 3. Release states

Every release has exactly one state. A task being "Verified" does not move a release.

| State | What it means on the tester server | How a release gets there |
|---|---|---|
| `candidate` | A `master` commit picked for release. | It is pushed, and its CI and Gates runs finished green. Name the gates that did not really run (today Gates B, D and E report green on `master` without running). |
| `validated` | The candidate's checks before the server are done, and its migrations passed a rehearsal on a restored copy. | The local suites passed, the migration review says "additive only", and the deploy log says `rehearsal passed`. |
| `authorized` | Allowed to go to this server. | Tester server: Ken's sync rule within register row R2 (DRAFT), with no stop condition from section 1. Real-customer production: never through this runbook. |
| `deployed` | The new version reached the tester server. | The deploy log ends with `deploy done`. The web publish log ends with `web publish done`. If mobile changed, the APK is published. If only part is done, say so, for example "deployed (API only)". |
| `production_verified` | **Not used on the tester server.** CLAUDE.md keeps "Production verified" for real-customer production. | On the tester server write instead: `deployed; tester checks passed for <scope> at <UTC time>`, or `deployed; verification pending: <what is missing>`. |
| `rolled_back` | The previous API image and the previous web entry files are live again. | The rollback steps in section 8 ran and their checks passed. |
| `blocked` | A precondition failed, a script stopped, or a hard stop was hit. | Write down the reason, what is needed, and the next action. Keep doing other ready work. |

A release moves forward one state at a time. A failure at any step moves it to `blocked` (or to `rolled_back` after a rollback). On the tester server the deploy script passes `validated` (rehearsal passed) and reaches `deployed` in one run, so confirm `authorized` before you start it.

## 4. Before you start

Placeholders used below:

| Placeholder | Meaning |
|---|---|
| `<sha>` | The full 40-character release commit. |
| `<prev>` | The full commit the tester server runs now (from the last release record). |
| `<count>` | The number of rows in `pgmigrations` on the live database now. |
| `<target>` | The newest migration file in `<sha>`, for example `186_marketplace_alerts`. |
| `<server>` | The SSH alias for the tester server. Private records (not in the repo). |
| `<release folder>` | A private folder on the server, outside the live and build checkouts. You upload the release files there, and the scripts write their own files there, each private (mode `600`). Private records (not in the repo). |
| `<build checkout>` | A separate clone of this repo on the server, used only to build the API image. It must hold nothing but the commit (no changed, untracked or ignored files) and use the same origin as the live checkout. Private records (not in the repo). |
| `$API`, `$PG`, `$WEB` | Shell variables that hold the running API, Postgres and nginx containers. Set them in `/opt/onservice` right before you use them: `API=$(sudo -n docker compose -f docker-compose.prod.yml ps -q api)`, and the same with `postgres` for `$PG` and `nginx` for `$WEB`. Each must be non-empty. Set `$API` again after any activation or rollback: the API container gets a new ID each time. |

Checklist. Every item must be true before step 1.

1. **CI and Gates are green on the exact commit.** On your machine:

   ```bash
   gh run list --commit <sha>
   ```

   Both "CI" and "Gates" must show `success` for `<sha>`. Write their run IDs in the release record. Name the gates that did not really run.

2. **The local suites passed on that commit.**

   ```bash
   npx tsc --noEmit --project packages/api/tsconfig.json
   npm test --workspace=packages/api
   npx tsc --noEmit --project apps/admin/tsconfig.json
   npm run test --workspace=apps/admin
   npx tsc --noEmit --project apps/mobile/tsconfig.json
   (cd apps/mobile && npx jest --config jest.config.js)
   bash scripts/gates/__tests__/run-all.sh
   node --test "scripts/release/__tests__/*.test.mjs"
   ```

   Record counts with their totals, for example "API 1410 of 1413, 3 need Docker".

3. **Find `<prev>`, `<count>` and `<target>`.** `<target>` comes from the commit:

   ```bash
   git ls-tree --name-only <sha> packages/api/migrations/ | sed -n 's#.*/\([0-9]\{3\}_.*\)\.sql$#\1#p' | sort | tail -n 1
   ```

   `<prev>` and `<count>` come from the last release record. You may confirm them with two read-only checks on the server, as part of this release (register row R4 is DRAFT, so tie each live check to a release):

   ```bash
   sudo -n git -c safe.directory=/opt/onservice -C /opt/onservice rev-parse HEAD
   docker exec "$PG" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT count(*) FROM pgmigrations"'
   ```

   (`$POSTGRES_USER` and `$POSTGRES_DB` are read inside the Postgres container, from its own environment.)

4. **Every new migration is additive.** Read each migration between `<prev>` and `<sha>`:

   ```bash
   git diff --name-only <prev> <sha> -- packages/api/migrations/
   ```

   No `DROP`, no `RENAME`, no rewrite or backfill of existing rows, no delete. If there is one, stop. That is hard stop 2 and needs Ken.

5. **Shared configuration.** Check:

   ```bash
   git diff --name-only <prev> <sha> -- nginx docker-compose.prod.yml docker-compose.release.yml
   ```

   The scripts never reload, restart or recreate nginx. nginx reads `nginx.conf` through a single-file mount, so after a release changes it the running nginx keeps the old copy. That holds **only until the shared nginx next restarts**, which can happen at any time without warning (its restart policy, a host reboot, a Docker restart, or work for another business on the same server). Then the newer copy loads for every site that nginx serves, not only onService. Compose changes for services other than the API wait for their next recreate the same way.

   If this lists files and the release depends on them, stop and ask Ken. If it does not, add a LAUNCH-LIMITATIONS entry saying what is still waiting for a restart. The deploy script prints a warning and records `shared_config_changed`. It also records `nginx_config_drift`: `yes` when the copy the running nginx reads differs from the live checkout's, even if this release did not change it. Today expect `yes`: LAUNCH-LIMITATIONS already says the running nginx uses a stale configuration from 2026-08-24.

6. **Older apps.** If the API change breaks older app versions, decide the APK `minimumVersionCode` and add a LAUNCH-LIMITATIONS entry.

7. **Disk space.** On the server, `df -h` must show room for one more database dump and one restored copy of the database.

8. **Backups.** The deploy script takes its own `pg_dump` backup before it changes anything. The nightly `scripts/server/backup-db.sh` is separate. Its header says that, without an off-site setting, backups stay on the same disk as the live data. Whether off-site copying is set up is in the private records.

## 5. The release, step by step

Run the steps in this order. Stop at the first failure, set the release to `blocked`, and go to section 7.

### Step 1. Build the web bundles (build machine, Git Bash)

The server has no Node, so the web bundles are built on the build machine from a clean checkout at `<sha>`:

```bash
git status --short          # must print nothing
git rev-parse HEAD          # must print <sha>

VITE_API_URL=https://admin.onservice.ph VITE_DEMO_MODE=0 VITE_DEMO_ADMIN_EMAIL= VITE_DEMO_ADMIN_PASSWORD= \
  npm run build --workspace=apps/admin

(cd apps/mobile && NODE_ENV=production EXPO_OS=web EXPO_NO_DOTENV=1 \
  EXPO_PUBLIC_API_URL=https://app.onservice.ph EXPO_PUBLIC_DEMO_MODE=0 \
  EXPO_PUBLIC_DEMO_CUSTOMER_PHONE= EXPO_PUBLIC_DEMO_PROVIDER_PHONE= EXPO_PUBLIC_DEMO_OTP= \
  npx expo export --platform web --output-dir dist-web --clear)
```

These are the same public values CI uses (`.github/workflows/ci.yml`, jobs `admin-check` and `mobile-check`). With `EXPO_OS=web`, `apps/mobile/app.config.ts` needs no maps key and no EAS project ID. CI's own comment says its web bundle has no public CAPTCHA setting. If the tester build needs extra public values, they are listed in the private records (not in the repo). Never put a secret into a web build: everything in it is public.

Package and checksum them, named by the full commit:

```bash
tar -czf admin-dist-<sha>.tar.gz -C apps/admin/dist .
tar -czf mobile-dist-web-<sha>.tar.gz -C apps/mobile/dist-web .
sha256sum admin-dist-<sha>.tar.gz mobile-dist-web-<sha>.tar.gz > web-builds-<sha>.sha256
```

Upload all three files to `<release folder>`, one connection at a time (parallel SSH sessions to the server have been cut off before):

```bash
scp admin-dist-<sha>.tar.gz mobile-dist-web-<sha>.tar.gz web-builds-<sha>.sha256 <server>:<release folder>/
```

The publish script checks the checksums, so a cut-off upload is refused rather than published.

### Step 2. Deploy the API (server)

Copy the deploy script out of the release commit into the release folder. It must run from **outside** the live and build checkouts, because it moves them:

```bash
ssh <server>
sudo -n timeout 240 git -c safe.directory=<build checkout> -C <build checkout> fetch --quiet origin master
sudo -n git -c safe.directory=<build checkout> -C <build checkout> show <sha>:scripts/release/deploy-tester-release.sh \
  > <release folder>/deploy-tester-release.sh
```

Run it detached, so a dropped SSH connection cannot stop it halfway. A dropped connection once stopped an earlier release between the migration and the activation (private records).

```bash
cd <release folder>
ONSERVICE_RELEASE_DIR=<release folder> ONSERVICE_BUILD_DIR=<build checkout> \
  nohup bash <release folder>/deploy-tester-release.sh <sha> <prev> <count> <target> > /dev/null 2>&1 &
```

Follow its log until it ends with `deploy done` or `FAILED`:

```bash
tail -n 5 <release folder>/api-<first 12 characters of sha>-*[0-9].log
```

(The main log name ends in the run's process number. The step logs next to it end in `-build.log`, `-migrate.log` and so on.)

What the script does, and refuses, is described at the top of `scripts/release/deploy-tester-release.sh`. In short:

1. It checks the live checkout is clean at `<prev>`, the running API carries `<prev>`'s label, the rollback image `onservice-api:<prev>` exists, and the live migration count is `<count>`.
2. It refuses if any path the release adds already exists in the live checkout. git would silently replace a server-only, git-ignored file there (for example a settings file, TLS material or a web build), and moving back would then delete it.
3. It refuses if the build checkout holds anything but the commit (changed, untracked or ignored files). Then it builds `onservice-api:<sha>` there and checks its label.
4. It backs up the live database.
5. It moves the live checkout to `<sha>`, refusing to replace any ignored file, and records `nginx_config_drift` (section 4, item 5).
6. It rehearses the migrations on a restored copy: a dry run, an apply, and a repeat that must find nothing to do. Then it drops the copy.
7. It migrates the live database through `<target>`.
8. It activates the API with `scripts/server/activate-api-release.sh`.
9. It writes `api-<…>-record.txt` next to the log.

### Step 3. Publish the web builds (server)

After `deploy done`, the live checkout is at `<sha>`, so run the publish script from it:

```bash
ONSERVICE_RELEASE_DIR=<release folder> bash /opt/onservice/scripts/release/publish-web-builds.sh <sha>
```

It refuses to run unless the live checkout and the running API are both at `<sha>`. It checks the uploads against their checksums. It refuses links, absolute or `..` paths, odd top-level names and a missing `index.html`.

Before writing anything, it compares every file with the live folders. One file with different bytes stops both builds. It then:

1. adds new files beside the old ones;
2. checks that every file is visible inside nginx;
3. saves the current top-level files to `web-<…>-previous/` for rollback;
4. switches the top-level files, `index.html` last;
5. checks that nginx serves the new `index.html`;
6. writes `web-<…>-record.txt`.

It never deletes a file and never touches nginx itself.

### Step 4. Clear the catalog cache (server)

A new API does not clear the cached catalog (it lives up to an hour). Remove the same keys the API removes itself after an admin catalog edit (`packages/api/src/routes/catalog.routes.ts`).

The Redis password never appears on a command line and is never printed. The API container already has it in its environment. `printenv` sends it through a pipe into the Redis container. There a shell builtin (`read`) puts it into `REDISCLI_AUTH`, the variable `redis-cli` reads. The command lines hold only variable names, so the lines below are safe with or without `sudo`. Nothing has to be loaded beforehand. This covers only the commands in this step: the stack's own Redis start command and health check still carry the password on a command line (`LAUNCH-LIMITATIONS.md` section 136).

```bash
cd /opt/onservice
API=$(sudo -n docker compose -f docker-compose.prod.yml ps -q api)
RC=$(sudo -n docker compose -f docker-compose.prod.yml ps -q redis)
docker exec "$API" printenv REDIS_PASSWORD | docker exec -i "$RC" sh -c '
  IFS= read -r REDISCLI_AUTH && [ -n "$REDISCLI_AUTH" ] || { echo "no password received; stop"; exit 9; }
  export REDISCLI_AUTH
  [ "$(redis-cli PING)" = PONG ] || { echo "Redis did not answer PONG; stop"; exit 9; }
  pattern="onservice:http:*/api/v1/catalog*"
  echo "catalog keys before: $(redis-cli --scan --pattern "$pattern" | wc -l)"
  redis-cli --scan --pattern "$pattern" | while IFS= read -r key; do redis-cli DEL "$key" < /dev/null > /dev/null; done
  echo "catalog keys after: $(redis-cli --scan --pattern "$pattern" | wc -l)"
'
```

Rules for this step:

- **Never put a secret on a command line or on the screen.** No `redis-cli -a`, no `REDISCLI_AUTH=<value>` anywhere on a command line, and never run `printenv` on the password except straight into the pipe above.
- **The run must print the two counts.** `no password received` or `Redis did not answer PONG` means stop: without a working password, `--scan` prints nothing, which looks the same as an empty cache.
- The count after can be `1` if a tester loaded the catalog in the seconds since; that key was written by the new API.
- This method has not yet been run on the tester server (first used with the first release under this runbook). If it fails, stop and record why; do not fall back to `redis-cli -a`.
- Older agent notes in this repo (the 2026-06-29 handoff under `.ai-coder/handoff/`) still show `redis-cli -a` and say it is required. They are out of date. Do not follow them; use the method above.

`scripts/release/__tests__/release-scripts-safety.test.mjs` fails if any doc under `docs/`, any workflow, any script under `scripts/` or any agent note under `.ai-coder/` puts a Redis password on a command line or prints it. Test folders are skipped because they quote the unsafe lines on purpose. The lines of the older notes above are listed in the test one by one: the test proves it finds them, and fails on any other line.

### Step 5. Build, check and publish the APK (only when mobile code changed)

1. **Raise the version in the release commit itself.** Raise both `version` and `android.versionCode` in `apps/mobile/app.config.ts`, and the matching test `apps/mobile/__tests__/android-standalone-config.test.ts`. An installed app accepts only a strictly higher `versionCode`.
2. **Build** the signed release APK on the build machine with the private APK build procedure (private records, not in the repo). The signing key never leaves that machine. It is never copied, printed or committed.
   - Regenerate the native Android project first with `npx expo prebuild -p android --clean` (in `apps/mobile` of the build copy). Without `--clean`, the old launcher, splash and notification images stay in the generated project and the APK keeps them (added 2026-10-18 for the house logo, LAUNCH-LIMITATIONS section 138).
3. **Inspect it** with the repo's checker. All four paths must be absolute:

   ```bash
   node scripts/release/inspect-android-apk.mjs <apk> <Android build-tools folder> <java executable> <expectation.json>
   ```

   `expectation.json` holds exactly these fields:
   - `packageName` (`ph.onservice.app`);
   - `versionName`;
   - `versionCode`;
   - `previousVersionCode` (the one live now);
   - `certificateSha256` (the pinned signing certificate, from the last release record);
   - `requiredAbis` (for example `["arm64-v8a", "armeabi-v7a"]`).

   The output gives `apkSha256`, `apkBytes` and the permission list. Compare the permissions with the previous release and record any new one. The output always says `deploymentEligible: false`. That is expected: the checker is a preflight, not an approval.
4. **Upload it and check the copy:**

   ```bash
   scp <apk> <server>:<release folder>/onService-<versionName>-<versionCode>.apk
   ssh <server> sha256sum <release folder>/onService-<versionName>-<versionCode>.apk   # must equal apkSha256
   ```

5. **Publish it** on the server with the existing script. Its header explains every argument and the release-notes rule for phones on 1.0.1 and 1.0.2:

   ```bash
   bash /opt/onservice/scripts/release/publish-android-apk.sh <release folder>/onService-<versionName>-<versionCode>.apk \
     <versionName> <versionCode> <minimumVersionCode> <apkSha256> <certificate sha256 in UPPER-case> "<release notes>"
   ```

### Step 6. Post-deploy checklist

Run every item and record each result. Report counts and yes/no answers only. Logs and database rows hold tester data. Never paste them into chat, a commit or the repo. Set `$API` and `$WEB` first (section 4, placeholders): the activation gave the API container a new ID.

| # | Check | How | Pass when |
|---|---|---|---|
| 1 | API deployed | Read the end of the deploy log and the record. | `deploy done`. The record shows `commit=<sha>`, the new `image_id`, and `migrations_after` equal to the number of migrations in `<sha>`. |
| 2 | Readiness | `docker exec "$API" curl -fsS http://localhost:7381/health/ready` | Exit code 0. |
| 3 | Config endpoint | `curl -fsS https://app.onservice.ph/api/v1/config` | `"success":true`. The reply includes `featureFlags` and any setting this release changed. A reply with only `appVersion`, `currency`, `currencySymbol` and `timezone` is the fallback: it means the settings could not be read, so the check fails. |
| 4 | New endpoints refuse unsigned requests | For each new or changed protected endpoint: `curl -s -o /dev/null -w '%{http_code}\n' https://app.onservice.ph/api/v1/<path>` with no sign-in. | `401` (or `403`). Never put a real token in a command that gets logged. |
| 5 | No errors since activation | `docker logs --since <activated_at> "$API" 2>&1 \| sed 's/\x1b\[[0-9;]*m//g' \| grep -c '^error:'` | `0`. Print the count only. |
| 6 | Scheduler jobs running | Wait at least 2 minutes, then use the same `docker logs` command with `grep -c 'Scheduler job completed.*marketplace-alerts-sweep'`, and again with `grep -c 'Scheduler job failed'`. | The first count is 1 or more. The second is `0`. |
| 7 | Customer/provider web served | `curl -fsS https://app.onservice.ph/ \| sha256sum` on your machine, compared with `sha256sum apps/mobile/dist-web/index.html`. Then fetch the entry script named in the web record: `curl -s -o /dev/null -w '%{http_code}\n' https://app.onservice.ph/<entry script>`. | Same checksum. The entry script answers `200`. |
| 8 | Admin web served | On the server: `docker exec "$WEB" sha256sum /usr/share/nginx/admin/index.html`, compared with `sha256sum apps/admin/dist/index.html` locally. Then Ken or a tester opens the admin site once. | Same checksum. The page loads. |
| 9 | APK manifest and download (if released) | `curl -fsS https://app.onservice.ph/api/v1/app-releases/android/latest`. Then download `https://app.onservice.ph/api/v1/app-releases/android/files/onService-<versionName>-<versionCode>.apk` into a scratch folder and run `sha256sum` on it. | The manifest shows the new `versionCode` and `sha256`. The download's checksum equals `apkSha256`. |
| 10 | Catalog cache | Step 4 ran. | `PING` printed `PONG`, and the last count printed `0` (or `1`, see step 4). |
| 11 | Shared configuration | The record's `shared_config_changed` and `nginx_config_drift`. If the drift is `unknown`, compare by hand: `docker exec "$WEB" cat /etc/nginx/nginx.conf \| sha256sum` and `sha256sum /opt/onservice/nginx/nginx.conf`. | `none` and `no`, or a LAUNCH-LIMITATIONS entry exists for what is still waiting for the next nginx restart. Never restart or reload the shared nginx to make this pass: that is Ken's decision, and it affects every site it serves. |
| 12 | Real phone (if mobile changed) | Install or update on a real phone. | Today this cannot be done: nothing has been tried on a real phone yet (LAUNCH-LIMITATIONS). Record `verification pending: real phone`. |
| 13 | Second look | Repeat checks 5 and 6 about 30 minutes later. | Still `0` errors and the sweep still running. |

Record the outcome as `deployed; tester checks passed for <list of checks> at <UTC time>`, or `deployed; verification pending: <what>`. Never write "verified in production" for the tester server.

Never make a real payment, refund or payout as a check.

## 6. The release record

Write one record per release in the private worklog (private records, not in the repo). The server keeps the scripts' own records next to their logs. The record holds no tester data and no secrets.

| Field | Where it comes from |
|---|---|
| Commit and previous commit | `<sha>`, `<prev>` |
| CI and Gates run IDs, and the gates that did not really run | `gh run list --commit <sha>` |
| Local suite counts with totals | Section 4, item 2 |
| Image tag and image ID | Deploy record: `image`, `image_id` |
| Rollback image and its ID | Deploy record: `rollback_image`, `previous_image_id` |
| Backup file, size and checksum | Deploy record: `backup_file`, `backup_bytes`, `backup_sha256` |
| Rehearsal result | Deploy record: `rehearsal_result` |
| Migrations before and after, and the target | Deploy record: `migrations_before`, `migrations_after`, `migration_target` |
| Shared configuration changed, and nginx drift | Deploy record: `shared_config_changed`, `nginx_config_drift` |
| Activation time | Deploy record: `activated_at` |
| Web archive checksums | `web-builds-<sha>.sha256` |
| Web files added and already identical, per build | Web record |
| Web bundle IDs (entry script names) and `index.html` checksums, new and previous | Web record: `*_entry_scripts`, `*_index_sha256`, `*_previous_index_sha256` |
| APK version name, version code, minimum version code, sha256, size, md5, certificate pin, new permissions | Inspector output and `publish-android-apk.sh` output |
| Post-deploy check results and time | Section 5, step 6 |
| Release state | Section 3 |
| Who ran it, and the review label | For example "Claude session, self-review" or "Ken" |

A short public-safe summary (commit, migration count, APK version, release state) may go in the checkpoint file and, for anything still open, in LAUNCH-LIMITATIONS.

## 7. When a step fails

Read the last lines of the log. The deploy script names the stage that failed.

- **Failed in `preflight`, `fetch`, `build` or `backup`.** Nothing that serves testers changed. A new image tag or a backup file may exist; leave them. Fix the cause and run the script again with the same arguments. Two refusals need more care:
  - `the live checkout already holds paths this release adds`: the listed paths may be server-only files (settings, TLS material, web builds) that git would replace. Never delete or move them to get past this. Tell Ken: the release commit probably should not track that path.
  - `build checkout has changed, untracked or ignored files`: never run `git clean` or delete files there. Record what `git status --porcelain --ignored` lists in the build checkout, and ask Ken. A fresh clone in a new folder is the way that deletes nothing.
- **Failed in `checkout` or `rehearsal`.** If the live checkout had moved, the script moved it back to `<prev>` (the log says so, or says it could not). The live database and the running API were not touched. If the checkout itself was refused because git would have replaced an ignored file, a server-only file appeared at a path the release adds after the fetch check; leave it and tell Ken. The rehearsal copy is **kept** so you can see what went wrong, and the next run refuses to start while it exists. After reading the logs, drop the copy by hand, in bash. Copy its name from the log line `the rehearsal copy … was kept for diagnosis`:

  ```bash
  DB=<the name from that log line>
  if [[ "$DB" =~ ^onservice_rehearsal_[0-9a-f]{12}$ ]]; then
    printf 'DROP DATABASE %s;\n' "$DB" | docker exec -i "$PG" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'
  else
    echo "refusing: '$DB' is not a rehearsal copy name"
  fi
  ```

  The check refuses any name that is not `onservice_rehearsal_` followed by exactly 12 lower-case hex characters, so the live database can never be dropped this way and an unfilled placeholder is refused. Then fix the cause and rerun.
- **Failed in `migrate` or `activate` (after the live migration started).** The live checkout stays at `<sha>`. The old API may still be serving, now on the migrated database. The script does not try to undo anything.
  1. Check what is running (`docker inspect --format '{{.Image}}' "$API"`, with `$API` set just before) and the migration count.
  2. If the migration finished and only activation failed, read the activate log. Run activation alone once the cause is fixed:

     ```bash
     cd /opt/onservice && sudo -n env ONSERVICE_RELEASE_SHA=<sha> bash scripts/server/activate-api-release.sh
     ```

  3. Otherwise, roll back the app (section 8) or fix forward.
  4. Never restore the database without Ken. Tell Ken.
- **Web publish failed before any entry file was switched.** The old site is still live. New files sit unused beside the old ones. Fix the cause and run it again: files with the same bytes are accepted.
- **Web publish failed while switching.** The log says which build was being switched. Check what nginx serves for each build. Then finish the publish by running it again, or put the saved previous files back (section 8).

## 8. Rollback

**Who decides.** Rolling back the app is register row R5, which is DRAFT and uncertain. Until Ken confirms it, tell Ken and get his yes first. **A database restore always needs Ken.**

**Truth.** Rollback has never been practised on the tester server. Ken decides whether and when to practise it.

**Before rolling back.** Check that the old code can run on the new database. Releases allow only additive migrations, and old code normally ignores new tables and columns. If a migration changed something the old code relies on, do not roll back the app. Fix forward and tell Ken.

**API.** This needs the rollback image `onservice-api:<prev>` (the deploy preflight checked it exists; never prune images during a release):

```bash
sudo -n git -c safe.directory=/opt/onservice -C /opt/onservice checkout --quiet --no-overwrite-ignore --detach <prev>
cd /opt/onservice && sudo -n env ONSERVICE_RELEASE_SHA=<prev> bash scripts/server/activate-api-release.sh
```

Moving the checkout back removes the files `<sha>` added. `--no-overwrite-ignore` makes git refuse rather than replace a git-ignored file. If git refuses for any reason (local changes or ignored files), stop and ask; never force it. The activation helper refuses an image whose label is not `<prev>`, and reports failure if the API does not become ready.

**Web.** Put the saved top-level files back from `<release folder>/web-<…>-previous/admin/` and `…/app/`. Use a same-folder rename for each file, `index.html` last. For example:

```bash
sudo -n cp <previous folder>/admin/index.html /opt/onservice/apps/admin/dist/.index.html.tmp-publish
sudo -n chmod 644 /opt/onservice/apps/admin/dist/.index.html.tmp-publish
sudo -n mv -f /opt/onservice/apps/admin/dist/.index.html.tmp-publish /opt/onservice/apps/admin/dist/index.html
```

The old assets are still there, because publishing never deletes.

**Database.** There is no automatic restore and no down migration. The release backup is in `<release folder>`. A restore throws away everything testers did since the backup. Only Ken decides it (`docs/runbooks/postgres-restore.md`).

**APK.** Phones cannot move to a lower `versionCode`. To undo an app change, publish a new APK with a higher `versionCode`. If the API was rolled back, phones on the newer APK may call endpoints the old API does not have. Record that in LAUNCH-LIMITATIONS.

**After.**
1. Run the post-deploy checklist against `<prev>`.
2. Set the release to `rolled_back`.
3. Add a LAUNCH-LIMITATIONS entry.
4. Tell Ken.

## 9. Incident procedure (one page)

**Use this when** testers cannot use a main flow, errors keep appearing in the logs, data looks wrong, a secret may have leaked, or something touched another business on the host.

1. **Stabilize.** Stop releasing. If the last release caused it and Ken agrees (row R5 is DRAFT), roll back the app and web (section 8). Never restart or recreate the shared nginx. Never run `docker compose down`. Never touch other businesses' containers.
2. **Keep the evidence.** Delete nothing. Keep the release logs. Save the API log on the server under a new file name:

   ```bash
   docker logs --since <start time> "$API" > <release folder>/incident-<UTC time>-api.log 2>&1
   ```

   Logs hold tester data. They stay on the server or in the private records. Never paste them into chat or the repo.
3. **Size it.** Answer with counts and yes/no only:
   - what is broken, and since when;
   - how many testers are affected;
   - whether any data changed.

   Real payments are not allowed on the tester server. If any payment, refund or payout happened, that is a money hard stop: tell Ken at once.
4. **Tell Ken** in plain words: what broke, since when, who is affected, what you did, and what you need from him.
5. **Testers.** Only Ken decides what testers are told. Send nothing on his behalf without his yes.
6. **Secrets.** If a secret may have leaked, do not print it or search for it in chat. Tell Ken. Changing credentials is his decision.
7. **Fix.** Write a test that fails first. Fix the cause. Run the full suites, wait for green CI, and release through this runbook.
8. **Record.**
   - Add a LAUNCH-LIMITATIONS entry (never remove one).
   - Set the release state (`rolled_back` or `blocked`).
   - Write down the cause and how to prevent it.
   - If a hard stop was hit, write an escalation file. Keep it in the private records if it names server details or a security weakness.

## 10. Evidence and limits

**Tests.** `scripts/release/__tests__/`, run with:

```bash
node --test "scripts/release/__tests__/*.test.mjs"
node scripts/release/__tests__/preflight-mutation-check.mjs
```

A CI job, "Release scripts - behaviour tests" (`.github/workflows/ci.yml`, added 2026-10-17), is set up to run both on Linux. It has not run on GitHub yet. The first command also runs the APK-inspector test in the same folder.

Each script run in these tests is stopped after 2 minutes. On a heavily loaded Windows PC one run can take longer. A stopped run fails its test with a message that starts with `RELEASE_SCRIPT_TIMEOUT`. That is a timeout, not a result. Run one file at a time with `RELEASE_TEST_TIMEOUT_MS=900000` set.

- `deploy-tester-release.test.mjs` runs the real deploy script against throwaway git repositories. The real `scripts/server/release-api-common.sh`, `run-production-migrations.sh` and `activate-api-release.sh` run too.
  - Only `sudo`, `docker` and the migration runner inside the fake API container are replaced, by test doubles in `fixtures/`. The fake `docker` keeps image, migration-count and nginx-copy state in files and refuses any command it does not expect.
  - Covered: the order build, backup, checkout move, rehearsal (dry run, apply, repeat), drop copy, migrate, activate.
  - Covered: the argument checks. The folder refusals, each checked by its own message: empty, relative, odd characters, `..` and `//`, a missing folder, each way the three folders can overlap, and a folder that is not a git checkout. `/` is refused by the pattern check; the separate filesystem-root check behind it is a backstop that no input reaches and no test covers. A folder given as a symbolic link is checked on Linux only. A copy of the script inside the live checkout, or inside the build checkout, refuses to run. A second run is refused while the lock folder exists.
  - Covered: **every refusal in the deploy script's preflight stage, 17 in all.** Each has its own case, which checks its own message, that it was the only refusal, and that nothing changed. A guard test fails if the preflight stage gains a refusal that has no case. `preflight-mutation-check.mjs` (below) shows that each case fails when its own refusal is switched off.
  - Covered: four commit checks (not on master, wrong target, not a descendant, more live migrations than the commit has); a failed build; a wrong image label; a build checkout with an untracked file, and one with a git-ignored file under `packages/api/`; an empty backup.
  - Covered: **a release that adds a path the live checkout already holds as a git-ignored, server-only file**, both at the same path and as a file where the release adds a folder. The run stops in the fetch stage, before the build and the backup, and the file is byte-for-byte unchanged. Covered too: such a file appearing after that check (during the backup). The live move then refuses (`--no-overwrite-ignore`), the checkout stays at `<prev>` and the file is unchanged.
  - Covered: a failed rehearsal (moved back, copy kept, the next run refuses to reuse it); a failed migration; a failed activation; the shared-configuration warning; `nginx_config_drift` as `no`, as `yes` when the release changes `nginx.conf`, as `yes` when the running nginx already reads an older copy, and as `unknown` when its copy cannot be read. nginx is only ever read (`cat`), never reloaded.
  - Covered in every deploy test except the self-copy and lock refusals (which stop before any file is written): no release file (logs, record, backup, inner script) and no command line contains the password of the direct database URL. The clean, failed-rehearsal and failed-migration tests also check the script output.
  - **Not covered:** most refusals after the preflight stage that need git, Docker or Postgres to fail in one particular way. Examples: a failed `pg_dump`, a failed fetch, a commit with no migration files, a restored copy with the wrong migration count, and the checks after the live migration and after the activation. `back_out`'s `--no-overwrite-ignore` is checked by the lint only. The real migration runner's own messages are not checked (the tests use a fake runner). Only the refusals listed above have tests, and only the preflight ones are mutation-checked.
  - The new-path check also refuses a release that replaces a tracked folder with a file of the same name. That is rare; check such a release by hand.
  - Linux only, because Git Bash on Windows fakes file modes: files that root's git writes into both checkouts stay readable (folders 755, files 644), and the backup, the logs, the inner rehearsal script and the record are private (600).
- `publish-web-builds.test.mjs` runs the real publish script.
  - Covered: add-beside, including new folders (made with `mkdir -m 755`, parents first, before any file); checks in nginx before any switch; `index.html` last; previous files saved; a rerun with the same bytes accepted.
  - Covered: **every refusal from the start of the script's `main()` to the checksum stage that a run can reach, 11 in all.** Six come before the preflight stage: a wrong number of arguments, a commit that is not a full sha, a release folder inside the live checkout, a live checkout inside the release folder, a missing live web folder (or, on Linux, one that is a symbolic link), and an existing lock folder. Five are the preflight stage: an unreadable live checkout, a live checkout at another commit, an API container that cannot be inspected, an API image whose label cannot be read, an API at another commit. Each has its own case that checks its own message and that nothing was written. A guard test keeps the list in step with the script, and the mutation check covers all 11. The one refusal there that no run can reach (the log file already exists: its name holds the run's process number and the current second) is listed in both as unreachable.
  - Covered: the folder checks, each by its own message, for both folders: empty, relative, odd characters, `..`, `.` and `//` parts, missing, and (Linux only) a symbolic link. These are not mutation-checked. `/` is refused by the pattern check; the separate filesystem-root check is a backstop that no input reaches.
  - Covered: one conflicting asset stops both builds; a top-level name that is a folder live; bad or missing checksums, including a checksum line that is not `sha256sum` output.
  - Covered: links, `..` and absolute paths, odd names and a missing `index.html`; a file nginx cannot see; a stale `index.html` after the switch.
  - **Not covered:** a failed `sudo cp`, `chmod`, `mv` or `mkdir` while adding or switching files; a failed unpack; a top-level name with characters outside letters, digits, `.`, `_` and `-`; a live file or symbolic link where the build has a folder, or a live symbolic link where the build has a file; a switched `index.html` that does not match. Only the refusals listed above have tests.
  - Linux only: new files in the live folders are readable (644), and new folders can be opened (755).
- `release-scripts-safety.test.mjs` is a text lint, not a behaviour test.
  - The two scripts contain no `rm`, no addresses or URLs, no credential words, and guard their folder variables.
  - Every path a root (`sudo`) command writes to is built only from `${name:?}` expansions, so an empty variable stops the run instead of writing near the filesystem root (the E08 lesson). This is checked on the `sudo cp`, `mv`, `mkdir` and `chmod` lines and on the `dest=` lines that build their targets.
  - Every move of the live checkout in the deploy script, and every one in this runbook, uses `--no-overwrite-ignore`.
  - No doc under `docs/`, no workflow, no script under `scripts/` and no agent note under `.ai-coder/` puts a Redis password on a command line or prints it. Test folders are skipped, because they quote the unsafe lines on purpose. The four lines of the 2026-06-29 handoff that still show `redis-cli -a` are listed in the test one by one (step 4 says not to follow them); any other line fails it.
  - Each rule is first shown to reject the patterns it claims to catch, including `redis-cli -a` under `sudo`.
  - `scripts/release/publish-android-apk.sh` is not linted. It predates these two scripts and is not changed here. It is safe today: its upload folder comes from a check that stops on an empty value, and its one `rm -f` removes a file `mktemp` made under `set -e`. But its root writes do not use `${name:?}` guards, so nothing catches a future regression. Adding the guards and the lint is a follow-up.
- `preflight-mutation-check.mjs` is not picked up by `node --test`; the CI job is set up to run it as its own step. It first runs the refusal cases of both scripts against the real scripts (17 deploy, 11 publish), and all must pass. Then, for each of those refusals in turn, it switches that refusal off in a copy of the script kept in a temporary folder outside the repo, runs that refusal's own case against the copy, and fails if the case still passes. A case stopped by the timeout counts as inconclusive, never as caught. It never writes to the real scripts: it checks their sha256 before and after, also after an error or Ctrl-C. Refusals after those parts of the scripts are not mutation-checked.

**Results (2026-10-17, after the review fixes, on the Windows build PC: Git Bash 5.2.37, Node 24.13.0, git 2.53).**

- `node --test "scripts/release/__tests__/*.test.mjs"`, one run with the default 2-minute limit per script run: 74 of 74 passed in about 2.5 minutes (deploy 34, publish 21, safety lint 7, APK inspector 12). The PC was far less busy than earlier that day, when one deploy run took about 9 minutes.
- Before that, each file was run on its own (the deploy file in 12 groups at once). Everything passed except one publish case: its new folder assertion compared with the admin build's first copy instead of the app's. The assertion was wrong, not the script. After fixing it, the publish file passed 21 of 21.
- `preflight-mutation-check.mjs`: all 17 deploy and all 11 publish refusal cases passed against the real scripts. Then 17 of 17 and 11 of 11 switched-off refusals made their own case fail. The real scripts were unchanged afterwards (sha256 checked).
- Four more changed copies of the deploy script, kept outside the repo, were each caught by the new tests: one that prints the direct database URL inside the rehearsal, one without the new-path check, one without `--no-overwrite-ignore` on the live move, and one without `--ignored` on the build checkout check.
- The Linux-only file-mode checks did not run (Windows). They have never run anywhere yet.

**Correction (2026-10-17).** The 2026-10-14 version of this section said every preflight refusal was covered. That was false. 6 of the 17 preflight refusals had no test: an unreadable live checkout, an unreadable checkout status, a build checkout without an origin, an unreadable image label, an unreadable live migration count, and an unreadable list of databases. A reviewer switched one check off and the tests still passed. The folder test also accepted any error message, so a switched-off folder check could pass too. Its "18 of 19 deliberate breaks caught" result did not cover those checks.

**Correction (2026-10-17, review).** A review of the first 2026-10-17 version found real gaps, now fixed and tested:
- The live checkout move could silently replace a server-only, git-ignored file at a path the release adds, and a failed rehearsal's move back would then delete it. No `rm` was involved, so the lint could not see it. The deploy script now refuses such a release before the build, and every move of the live checkout uses `--no-overwrite-ignore`.
- The shared-configuration warning said nginx changes "will not take effect". They take effect at the next restart of the shared nginx, which can happen without warning. The live server already runs an older `nginx.conf` than master, and the script did not notice. It now records `nginx_config_drift`.
- No test checked that the direct database URL stays out of the release logs; a version that printed it passed every test. The deploy tests now check it.
- An ignored file in the build checkout could enter the image. The script now refuses it.
- Several publish refusals before the preflight stage had no case, and the new-folder path was never run in a test. Both are covered now.
- This section said the deploy folder test covered "the filesystem root" refusal. No input reaches that check (the pattern check refuses `/` first).

**Limits.**
- **The CI job has not run on GitHub yet.** It was added on 2026-10-17, and nothing has been pushed since. Until it passes once, the Linux-only checks above have never run anywhere: this PC cannot run Linux (its Linux subsystem does not start; checked again on 2026-10-17, the virtual-machine feature it needs is not installed). Look at that job's result on the first push.
- **Step 4 (catalog cache) has never run on the tester server** in its 2026-10-17 form. The lint only checks its text.
- No real Docker, Postgres or nginx is used in the tests. They do not prove the scripts work on the server. The first real release with them should be watched step by step.
- **What runs on the server is not the artifact CI tested.** The API image is rebuilt on the server from the same commit, and the web bundles are built on the build machine. Only the source commit matches.
- There is no rollback script and no real-phone check. Slack alerts are off until a webhook is set (LAUNCH-LIMITATIONS), so an error after a release reaches nobody unless someone runs the checklist.
- `.github/workflows/deploy.yml` is not used for releases. When checked on 2026-10-14, and again on 2026-10-17, it had never run, and the repo had no Actions secrets.
