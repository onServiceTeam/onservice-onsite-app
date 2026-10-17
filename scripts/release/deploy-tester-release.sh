#!/usr/bin/env bash
# Release one exact master commit of the onService API to the live TESTER server.
#
# Read docs/runbooks/tester-server-release.md first. This is for the tester
# server only. It is not a tool for a real-customer production release.
#
# Usage, on the server, from a copy kept OUTSIDE the live checkout and the
# build checkout (this script moves both, so it refuses to run from inside
# either one). Run it detached and follow its log:
#
#   ONSERVICE_RELEASE_DIR=<release folder> ONSERVICE_BUILD_DIR=<build checkout> \
#   nohup bash <release folder>/deploy-tester-release.sh \
#     <full sha> <expected previous sha> <expected live migration count> <migration target> \
#     > /dev/null 2>&1 &
#
#   <full sha>                       40 lower-case hex characters, a commit on master
#   <expected previous sha>          the commit the live checkout and the API run now
#   <expected live migration count>  rows in pgmigrations on the live database now
#   <migration target>               the newest migration basename in <full sha>,
#                                    for example 186_marketplace_alerts
#
# ONSERVICE_PROJECT_DIR may name the live checkout. It defaults to
# /opt/onservice, as in scripts/server/*.sh.
#
# What it does, in order, stopping at the first problem:
#   1. checks the four arguments and the folders against strict patterns;
#   2. preflight, changing nothing: the live checkout is exactly the expected
#      previous commit with no tracked edits; the running API image carries the
#      previous commit's label and is still tagged onservice-api:<previous>
#      (the rollback image); the live database has exactly the expected number
#      of applied migrations; no rehearsal copy is left from an earlier run;
#   3. fetches master into the build checkout and checks that the commit is on
#      master, descends from the previous commit, and that the migration target
#      is the newest migration file in that commit. It refuses when a path the
#      commit adds already exists in the live checkout (git would silently
#      replace a server-only, git-ignored file there). It warns (and records)
#      when the release changes nginx or Compose files, because this script
#      never reloads or recreates the shared nginx;
#   4. checks the build checkout holds nothing but the commit (no changed,
#      untracked or ignored files), builds onservice-api:<sha> there and checks
#      its revision label (the live checkout and the running API are untouched);
#   5. takes a pg_dump backup of the live database into the release folder;
#   6. moves the live checkout to <sha> (files only; the running API is not
#      changed), refusing to replace any ignored file. Until step 8 starts, any
#      failure moves it back. It then records whether the nginx.conf the
#      shared nginx container reads differs from the one in the checkout;
#   7. rehearses the migrations on a copy restored from that backup, with the
#      new image: dry run, apply, repeat (the repeat must find nothing to do),
#      then drops the copy. It refuses to reuse an existing copy;
#   8. migrates the live database through the target with
#      scripts/server/run-production-migrations.sh;
#   9. activates the API with scripts/server/activate-api-release.sh and checks
#      the running image;
#  10. writes a release record next to the log.
#
# It never restores or downgrades the database, never runs docker compose down,
# never restarts nginx, Postgres or Redis, and deletes no file itself. Moving
# the live checkout back after a failure removes only the files the release
# commit added, and step 3 has already refused any such path that held a file.
# After a failed run, a rehearsal copy is kept for diagnosis; the runbook says
# how to drop it. A finished run means "API deployed". It does not mean the
# release works for users: run the post-deploy checklist in the runbook.
set -euo pipefail
# Normal umask on purpose: commands run through sudo inherit it, and both
# checkouts must stay readable for the image build and for nginx. The files
# this script writes into the release folder (backup, logs, record) are made
# private one by one with new_private_file.
umask 022

# The default Compose names of the containers and database for the project in
# /opt/onservice, from the public docker-compose.prod.yml and
# .env.production.example. Named here on purpose (runbook: "Public repo").
readonly PG_CONTAINER=onservice-postgres-1
readonly API_CONTAINER=onservice-api-1
readonly NGINX_CONTAINER=onservice-nginx-1
readonly DB_USER=onservice_user
readonly LIVE_DB=onservice
readonly REHEARSAL_PREFIX=onservice_rehearsal_
readonly LABEL_FORMAT='{{index .Config.Labels "org.opencontainers.image.revision"}}'
# Run as root (so folders only root can open are checked too) with the live
# checkout as $1. Reads the paths a release adds, separated by NUL, on stdin
# and prints each one the live checkout already holds: the path itself in any
# form, or a parent folder of it that is a file or a link. Changes nothing.
readonly CLASH_CHECK='
live="$1"
while IFS= read -r -d "" p; do
  if [ -e "$live/$p" ] || [ -L "$live/$p" ]; then printf "%s\n" "$p"; continue; fi
  q="$p"
  while [ "${q%/*}" != "$q" ]; do
    q="${q%/*}"
    if [ -L "$live/$q" ] || { [ -e "$live/$q" ] && [ ! -d "$live/$q" ]; }; then printf "%s\n" "$q"; break; fi
  done
done'

# State read by the exit handler. Global on purpose: the handler can run after
# main has returned, when main's local variables no longer exist.
SHA="" PREV="" RELEASE_DIR="" PROJECT_DIR="" LOG="" REHEARSAL_DB=""
STAGE=start LOCKED=0 CHECKOUT_MOVED=0 MIGRATION_STARTED=0 REHEARSAL_CREATED=0 DONE=0

usage_error() {
  echo "ERROR: $*" >&2
  echo "usage: deploy-tester-release.sh <full sha> <expected previous sha> <expected live migration count> <migration target>" >&2
  exit 2
}

# Prints the canonical form of a folder after strict checks.
check_dir() {
  local name="$1" value="$2" real
  [[ "$value" =~ ^/[A-Za-z0-9._/-]+$ ]] || { echo "ERROR: $name must be an absolute path made of letters, digits, '.', '_', '-' and '/'" >&2; return 1; }
  case "$value/" in */../*|*/./*|*//*) echo "ERROR: $name must not contain '..', '.' or '//' parts" >&2; return 1;; esac
  [ -d "$value" ] && [ ! -L "$value" ] || { echo "ERROR: $name is not a folder, or is a symbolic link" >&2; return 1; }
  real="$(cd "$value" && pwd -P)" || return 1
  [ "$real" != "/" ] || { echo "ERROR: $name must not be the filesystem root" >&2; return 1; }
  printf '%s\n' "$real"
}

# True when folder $1 is folder $2 or is inside it.
inside() { case "$1/" in "$2"/*) return 0;; *) return 1;; esac; }

log() {
  local line
  line="$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"
  printf '%s\n' "$line"
  if [ -n "$LOG" ]; then printf '%s\n' "$line" >> "$LOG"; fi
}
fail() { log "STOP: $*"; exit 1; }
# Creates an empty file only the deploy user can read. With noclobber set it
# fails when the file already exists, so a backup or log is never overwritten.
# Callers then append to it with >>. Never wrap a sudo command in umask 077:
# sudo would pass that umask on to root.
new_private_file() { ( umask 077 && : > "$1" ) || fail "could not create $1 (it may already exist)"; }
g() { sudo -n git -c safe.directory="$1" -C "$1" "${@:2}"; }
psql_db() { docker exec "$PG_CONTAINER" psql -U "$DB_USER" -d "$1" -v ON_ERROR_STOP=1 -Atc "$2"; }

back_out() {
  if g "$PROJECT_DIR" checkout --quiet --no-overwrite-ignore --detach "$PREV"; then
    log "live checkout moved back to $PREV (the running API was not changed)"
  else
    log "COULD NOT move the live checkout back to $PREV; check it by hand before anything else"
  fi
}

on_exit() {
  local code=$?
  trap - EXIT
  if [ "$DONE" != 1 ]; then
    [ "$code" -ne 0 ] || code=1
    log "FAILED during stage '$STAGE' (exit $code). No later stage ran."
    if [ "$CHECKOUT_MOVED" = 1 ] && [ "$MIGRATION_STARTED" = 0 ]; then back_out; fi
    if [ "$REHEARSAL_CREATED" = 1 ]; then
      log "the rehearsal copy $REHEARSAL_DB was kept for diagnosis; drop it by hand after reading the logs (runbook: failed rehearsal)"
    fi
    if [ "$STAGE" = record ]; then
      log "the API was activated and checked; only writing the release record failed. Write the record by hand from this log."
    elif [ "$MIGRATION_STARTED" = 1 ]; then
      log "the live migration or activation did not finish. The live checkout stays at $SHA and the old API may still be serving."
      log "follow the runbook section 'failure after the live migration started'. Never restore the database without Ken."
    fi
  fi
  if [ "$LOCKED" = 1 ]; then
    rmdir "$RELEASE_DIR/.deploy-lock" || log "could not remove the lock folder $RELEASE_DIR/.deploy-lock"
  fi
  exit "$code"
}

main() {
  [ "$#" -eq 4 ] || usage_error "expected exactly 4 arguments, got $#"
  SHA="$1" PREV="$2"
  local COUNT="$3" TARGET="$4"
  [[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || usage_error "the release commit must be a full 40-character lower-case sha"
  [[ "$PREV" =~ ^[0-9a-f]{40}$ ]] || usage_error "the expected previous commit must be a full 40-character lower-case sha"
  [ "$SHA" != "$PREV" ] || usage_error "the release commit equals the previous commit; there is nothing to release"
  [[ "$COUNT" =~ ^[1-9][0-9]{0,3}$ ]] || usage_error "the expected live migration count must be a whole number from 1 to 9999"
  [[ "$TARGET" =~ ^[0-9]{3}_[a-z0-9_]{1,60}$ ]] || usage_error "the migration target must be a migration basename such as 186_marketplace_alerts"

  local release_raw="${ONSERVICE_RELEASE_DIR:?set ONSERVICE_RELEASE_DIR to the release folder (outside the live and build checkouts)}"
  local build_raw="${ONSERVICE_BUILD_DIR:?set ONSERVICE_BUILD_DIR to the separate checkout used to build the image}"
  local project_raw="${ONSERVICE_PROJECT_DIR:-/opt/onservice}"
  local BUILD_DIR
  RELEASE_DIR="$(check_dir ONSERVICE_RELEASE_DIR "$release_raw")" || exit 2
  BUILD_DIR="$(check_dir ONSERVICE_BUILD_DIR "$build_raw")" || exit 2
  PROJECT_DIR="$(check_dir ONSERVICE_PROJECT_DIR "$project_raw")" || exit 2
  ! inside "$BUILD_DIR" "$PROJECT_DIR" || usage_error "the build checkout must not be the live checkout or inside it"
  ! inside "$PROJECT_DIR" "$BUILD_DIR" || usage_error "the live checkout must not be inside the build checkout"
  ! inside "$RELEASE_DIR" "$PROJECT_DIR" || usage_error "the release folder must be outside the live checkout"
  ! inside "$RELEASE_DIR" "$BUILD_DIR" || usage_error "the release folder must be outside the build checkout"
  ! inside "$PROJECT_DIR" "$RELEASE_DIR" || usage_error "the live checkout must not be inside the release folder"
  ! inside "$BUILD_DIR" "$RELEASE_DIR" || usage_error "the build checkout must not be inside the release folder"
  [ -d "$PROJECT_DIR/.git" ] || usage_error "ONSERVICE_PROJECT_DIR is not a git checkout"
  [ -d "$BUILD_DIR/.git" ] || usage_error "ONSERVICE_BUILD_DIR is not a git checkout"

  local self="${BASH_SOURCE[0]:-}" self_dir
  if [ -n "$self" ] && [ -f "$self" ]; then
    self_dir="$(cd "$(dirname "$self")" && pwd -P)"
    if inside "$self_dir" "$PROJECT_DIR" || inside "$self_dir" "$BUILD_DIR"; then
      usage_error "run a copy of this script kept outside the live and build checkouts (this script moves them)"
    fi
  fi

  local SHORT="${SHA:0:12}" STAMP
  STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
  local PREFIX="$RELEASE_DIR/api-$SHORT-$STAMP-$$"
  REHEARSAL_DB="$REHEARSAL_PREFIX$SHORT"
  [[ "$REHEARSAL_DB" =~ ^onservice_rehearsal_[0-9a-f]{12}$ ]] || usage_error "internal: unexpected rehearsal database name"

  mkdir "$RELEASE_DIR/.deploy-lock" 2>/dev/null || usage_error "another release is running, or a stale lock folder $RELEASE_DIR/.deploy-lock needs review"
  LOCKED=1
  trap on_exit EXIT
  # A stop signal still runs the exit handler (back out, release the lock).
  trap 'exit 130' INT
  trap 'exit 143' TERM
  set -o noclobber
  [ ! -e "$PREFIX.log" ] || fail "log $PREFIX.log already exists"
  new_private_file "$PREFIX.log"
  LOG="$PREFIX.log"

  log "== deploy start: release $SHA, previous $PREV, expected live migrations $COUNT, target $TARGET"
  log "live checkout $PROJECT_DIR; build checkout $BUILD_DIR; release folder $RELEASE_DIR"

  STAGE=preflight
  log "== preflight (changes nothing)"
  local head status
  head="$(g "$PROJECT_DIR" rev-parse HEAD)" || fail "could not read the live checkout"
  [ "$head" = "$PREV" ] || fail "live checkout is at $head, not the expected previous commit $PREV"
  status="$(g "$PROJECT_DIR" status --porcelain --untracked-files=no)" || fail "could not read the live checkout status"
  [ -z "$status" ] || fail "live checkout has tracked changes"
  local origin_live origin_build
  origin_live="$(g "$PROJECT_DIR" remote get-url origin)" || fail "live checkout has no origin remote"
  origin_build="$(g "$BUILD_DIR" remote get-url origin)" || fail "build checkout has no origin remote"
  # Compared, never printed: a remote URL can carry credentials.
  [ "$origin_live" = "$origin_build" ] || fail "the build checkout and the live checkout use different origin remotes"

  local running_image running_rev rollback_id
  running_image="$(docker inspect --format '{{.Image}}' "$API_CONTAINER")" || fail "could not inspect the running API container"
  [[ "$running_image" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "unexpected running API image id"
  running_rev="$(docker image inspect --format "$LABEL_FORMAT" "$running_image")" || fail "could not read the running API image label"
  [ "$running_rev" = "$PREV" ] || fail "the running API image is labelled '$running_rev', not the expected previous commit $PREV"
  rollback_id="$(docker image inspect --format '{{.Id}}' "onservice-api:$PREV")" || fail "rollback image onservice-api:$PREV is not present"
  [ "$rollback_id" = "$running_image" ] || fail "onservice-api:$PREV is not the image the API is running"
  log "running API image $running_image (revision $PREV); rollback image onservice-api:$PREV is present"

  local live_count leftovers
  live_count="$(psql_db "$LIVE_DB" 'SELECT count(*) FROM pgmigrations')" || fail "could not count live migrations"
  [ "$live_count" = "$COUNT" ] || fail "live database has $live_count applied migrations, not the expected $COUNT"
  leftovers="$(psql_db "$LIVE_DB" "SELECT count(*) FROM pg_database WHERE left(datname, 20) = '$REHEARSAL_PREFIX'")" || fail "could not list databases"
  [ "$leftovers" = "0" ] || fail "a rehearsal copy from an earlier run still exists ($leftovers found); read its logs and drop it by hand first"
  log "preflight passed: live checkout clean at $PREV, $live_count live migrations, no rehearsal copy"

  STAGE=fetch
  log "== fetch master into the build checkout and check the commit"
  sudo -n timeout 240 git -c safe.directory="$BUILD_DIR" -C "$BUILD_DIR" fetch --quiet origin master || fail "fetch in the build checkout failed"
  local master_head
  master_head="$(g "$BUILD_DIR" rev-parse FETCH_HEAD)" || fail "could not read the fetched master"
  g "$BUILD_DIR" merge-base --is-ancestor "$SHA" "$master_head" || fail "$SHA is not on origin master ($master_head)"
  g "$BUILD_DIR" merge-base --is-ancestor "$PREV" "$SHA" || fail "$SHA does not descend from the previous commit $PREV"
  local tree_listing
  tree_listing="$(g "$BUILD_DIR" ls-tree --name-only "$SHA" packages/api/migrations/)" || fail "could not list migrations in $SHA"
  local -a migrations=()
  mapfile -t migrations < <(printf '%s\n' "$tree_listing" | sed -n 's#^packages/api/migrations/\([0-9][0-9][0-9]_[a-z0-9_]*\)\.sql$#\1#p' | LC_ALL=C sort)
  [ "${#migrations[@]}" -gt 0 ] || fail "no migration files found in $SHA"
  local newest="${migrations[${#migrations[@]}-1]}"
  [ "$newest" = "$TARGET" ] || fail "the newest migration in $SHA is $newest, not the target $TARGET (holding a migration back is not covered by this script)"
  local EXPECTED_AFTER="${#migrations[@]}"
  [ "$COUNT" -le "$EXPECTED_AFTER" ] || fail "live has $COUNT migrations but $SHA has only $EXPECTED_AFTER through $TARGET"
  local PENDING=$((EXPECTED_AFTER - COUNT))
  log "commit is on master and descends from $PREV; $EXPECTED_AFTER migrations through $TARGET, $PENDING pending"
  local shared_changes
  shared_changes="$(g "$BUILD_DIR" diff --name-only "$PREV" "$SHA" -- nginx docker-compose.prod.yml docker-compose.release.yml)" || fail "could not compare shared configuration files"
  shared_changes="$(printf '%s' "$shared_changes" | tr '\n' ' ')"
  if [ -n "$shared_changes" ]; then
    log "WARNING: this release changes shared configuration files: $shared_changes"
    log "WARNING: this script never reloads, restarts or recreates nginx. nginx changes stay inactive only until the shared nginx next restarts, which can happen at any time without warning (its restart policy, a host reboot, a Docker restart, or work for another business on this server), and every site it serves is affected when it does. Record that as a limitation; ask Ken if the release depends on them."
  fi
  # git checkout silently replaces an ignored file at a path the new commit
  # tracks, and moving back would then delete it. So no path the release adds
  # (renames count as added) may exist in the live checkout yet.
  local clashes
  clashes="$(g "$BUILD_DIR" diff --no-renames --name-only -z --diff-filter=A "$PREV" "$SHA" | sudo -n bash -c "$CLASH_CHECK" _ "$PROJECT_DIR")" \
    || fail "could not check the paths this release adds against the live checkout"
  [ -z "$clashes" ] || fail "the live checkout already holds paths this release adds, and git would replace them: $(printf '%s\n' "$clashes" | head -n 10 | tr '\n' ' ')(check them by hand; never delete one to get past this)"
  log "no path this release adds exists in the live checkout yet"

  STAGE=build
  log "== build onservice-api:$SHA in the build checkout"
  g "$BUILD_DIR" checkout --quiet --detach "$SHA" || fail "could not check out $SHA in the build checkout"
  head="$(g "$BUILD_DIR" rev-parse HEAD)" || fail "could not read the build checkout"
  [ "$head" = "$SHA" ] || fail "build checkout is at $head, not $SHA"
  # --ignored as well: an ignored stray file (packages/api/.env, node_modules)
  # would be copied into the image, which must be built from the commit only.
  status="$(g "$BUILD_DIR" status --porcelain --ignored)" || fail "could not read the build checkout status"
  [ -z "$status" ] || fail "build checkout has changed, untracked or ignored files; the image must be built from the exact commit"
  new_private_file "$PREFIX-build.log"
  (cd "$BUILD_DIR" && docker build -f packages/api/Dockerfile --label "org.opencontainers.image.revision=$SHA" -t "onservice-api:$SHA" .) >> "$PREFIX-build.log" 2>&1 \
    || fail "image build failed; see $PREFIX-build.log"
  local image_rev IMAGE_ID
  image_rev="$(docker image inspect --format "$LABEL_FORMAT" "onservice-api:$SHA")" || fail "could not inspect the new image"
  [ "$image_rev" = "$SHA" ] || fail "new image label is '$image_rev', not $SHA"
  IMAGE_ID="$(docker image inspect --format '{{.Id}}' "onservice-api:$SHA")" || fail "could not read the new image id"
  [[ "$IMAGE_ID" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "unexpected new image id"
  log "image built: onservice-api:$SHA $IMAGE_ID"

  STAGE=backup
  log "== backup of the live database"
  local DUMP="$PREFIX.dump"
  # The backup holds tester data: private from the moment it exists.
  new_private_file "$DUMP"
  docker exec "$PG_CONTAINER" pg_dump -U "$DB_USER" -d "$LIVE_DB" -Fc >> "$DUMP" || fail "pg_dump failed"
  local dump_bytes dump_sha
  dump_bytes="$(stat -c %s "$DUMP")" || fail "could not read the backup size"
  [ "$dump_bytes" -gt 0 ] || fail "the backup is empty"
  dump_sha="$(sha256sum "$DUMP" | cut -d' ' -f1)" || fail "could not hash the backup"
  log "backup $(basename "$DUMP"): $dump_bytes bytes, sha256 $dump_sha"

  STAGE=checkout
  log "== move the live checkout to $SHA (files only; the running API is not changed)"
  head="$(g "$PROJECT_DIR" rev-parse HEAD)" || fail "could not read the live checkout"
  [ "$head" = "$PREV" ] || fail "live checkout changed to $head during the release"
  sudo -n timeout 240 git -c safe.directory="$PROJECT_DIR" -C "$PROJECT_DIR" fetch --quiet origin master || fail "fetch in the live checkout failed"
  CHECKOUT_MOVED=1
  # --no-overwrite-ignore: if a server-only ignored file appeared at a path the
  # release adds since the check in the fetch stage, refuse instead of
  # replacing it.
  g "$PROJECT_DIR" checkout --quiet --no-overwrite-ignore --detach "$SHA" || fail "could not check out $SHA in the live checkout"
  head="$(g "$PROJECT_DIR" rev-parse HEAD)" || fail "could not read the live checkout"
  [ "$head" = "$SHA" ] || fail "live checkout is at $head, not $SHA"
  status="$(g "$PROJECT_DIR" status --porcelain --untracked-files=no)" || fail "could not read the live checkout status"
  [ -z "$status" ] || fail "tracked changes appeared after the checkout"
  log "live checkout at $SHA"
  # Read-only. nginx reads nginx.conf through a single-file bind mount, so after
  # git replaces the file the running container keeps reading the old copy,
  # and the new one loads at nginx's next restart.
  local NGINX_DRIFT=unknown container_conf checkout_conf
  if container_conf="$(docker exec "$NGINX_CONTAINER" cat /etc/nginx/nginx.conf | sha256sum | cut -d' ' -f1)" \
    && checkout_conf="$(sha256sum "$PROJECT_DIR/nginx/nginx.conf" | cut -d' ' -f1)"; then
    if [ "$container_conf" = "$checkout_conf" ]; then NGINX_DRIFT=no; else NGINX_DRIFT=yes; fi
  fi
  log "nginx_config_drift=$NGINX_DRIFT (does the nginx.conf the running shared nginx container reads differ from the live checkout's)"
  if [ "$NGINX_DRIFT" = yes ]; then
    log "WARNING: the shared nginx runs an older nginx.conf than the live checkout. The newer copy loads the next time that nginx restarts, which can happen without warning and affects every site it serves. Record that as a limitation and tell Ken."
  elif [ "$NGINX_DRIFT" = unknown ]; then
    log "WARNING: could not compare nginx.conf with the copy the shared nginx container reads; check it by hand (runbook, post-deploy check 11)."
  fi

  STAGE=rehearsal
  log "== rehearsal on a restored copy ($REHEARSAL_DB) with the release image"
  local exists copy_count
  exists="$(psql_db "$LIVE_DB" "SELECT count(*) FROM pg_database WHERE left(datname, 20) = '$REHEARSAL_PREFIX'")" || fail "could not list databases"
  [ "$exists" = "0" ] || fail "a rehearsal copy already exists; refusing to reuse it"
  psql_db "$LIVE_DB" "CREATE DATABASE $REHEARSAL_DB" > /dev/null || fail "could not create $REHEARSAL_DB"
  REHEARSAL_CREATED=1
  new_private_file "$PREFIX-rehearsal-restore.log"
  docker exec -i "$PG_CONTAINER" pg_restore -U "$DB_USER" -d "$REHEARSAL_DB" --no-owner < "$DUMP" >> "$PREFIX-rehearsal-restore.log" 2>&1 \
    || log "pg_restore reported warnings; see $PREFIX-rehearsal-restore.log"
  copy_count="$(psql_db "$REHEARSAL_DB" 'SELECT count(*) FROM pgmigrations')" || fail "could not count migrations in the copy"
  [ "$copy_count" = "$COUNT" ] || fail "the restored copy has $copy_count migrations, not $COUNT"
  local INNER="$PREFIX-rehearse-inner.sh"
  new_private_file "$INNER"
  cat >> "$INNER" <<INNER_SCRIPT
# Runs inside a one-off container of the release image. It changes only the
# database name of the direct connection and never prints the connection URL.
case "\$DATABASE_DIRECT_URL" in *\?*) echo "direct URL has parameters; stop"; exit 9;; esac
case "\$DATABASE_DIRECT_URL" in */$LIVE_DB) ;; *) echo "direct URL does not end with the live database name; stop"; exit 9;; esac
DATABASE_URL="\${DATABASE_DIRECT_URL%/*}/$REHEARSAL_DB" node scripts/run-reviewed-migrations.mjs --target $TARGET --migrations-dir migrations "\$@"
INNER_SCRIPT
  local step flag step_log want
  for step in dry-run apply repeat; do
    flag=""
    [ "$step" != dry-run ] || flag="--dry-run"
    step_log="$PREFIX-rehearsal-$step.log"
    new_private_file "$step_log"
    sudo -n env ONSERVICE_RELEASE_SHA="$SHA" bash -c 'cd "$1" && source scripts/server/release-api-common.sh && release_compose run --rm --no-deps -T api sh -s -- ${2:+"$2"} < "$3"' \
      _ "$PROJECT_DIR" "$flag" "$INNER" >> "$step_log" 2>&1 || fail "rehearsal $step failed; see $step_log"
    log "rehearsal $step: $(tail -n 1 "$step_log")"
    copy_count="$(psql_db "$REHEARSAL_DB" 'SELECT count(*) FROM pgmigrations')" || fail "could not count migrations in the copy"
    want="$EXPECTED_AFTER"
    [ "$step" != dry-run ] || want="$COUNT"
    [ "$copy_count" = "$want" ] || fail "after rehearsal $step the copy has $copy_count migrations, expected $want"
    if [ "$step" = repeat ]; then
      grep -q '; 0 pending file(s)\.' "$step_log" || fail "the repeat run did not report 0 pending migrations; see $step_log"
    fi
  done
  local has_target
  has_target="$(psql_db "$REHEARSAL_DB" "SELECT count(*) FROM pgmigrations WHERE name = '$TARGET'")" || fail "could not check the target in the copy"
  [ "$has_target" = "1" ] || fail "the copy does not record $TARGET as applied"
  psql_db "$LIVE_DB" "DROP DATABASE $REHEARSAL_DB" > /dev/null || fail "could not drop $REHEARSAL_DB"
  REHEARSAL_CREATED=0
  live_count="$(psql_db "$LIVE_DB" 'SELECT count(*) FROM pgmigrations')" || fail "could not count live migrations"
  [ "$live_count" = "$COUNT" ] || fail "live migrations changed during the rehearsal ($live_count)"
  local REHEARSAL_RESULT="dry run kept $COUNT; apply reached $EXPECTED_AFTER; repeat found 0 pending; copy dropped"
  log "rehearsal passed: $REHEARSAL_RESULT; live still at $live_count"

  STAGE=migrate
  log "== live migration through $TARGET"
  new_private_file "$PREFIX-migrate.log"
  MIGRATION_STARTED=1
  (cd "$PROJECT_DIR" && sudo -n env ONSERVICE_PROJECT_DIR="$PROJECT_DIR" ONSERVICE_RELEASE_SHA="$SHA" MIGRATION_TARGET="$TARGET" \
    bash scripts/server/run-production-migrations.sh) >> "$PREFIX-migrate.log" 2>&1 || fail "live migration failed; see $PREFIX-migrate.log"
  log "migration: $(tail -n 1 "$PREFIX-migrate.log")"
  live_count="$(psql_db "$LIVE_DB" 'SELECT count(*) FROM pgmigrations')" || fail "could not count live migrations"
  [ "$live_count" = "$EXPECTED_AFTER" ] || fail "live database has $live_count migrations after migrating, expected $EXPECTED_AFTER"
  has_target="$(psql_db "$LIVE_DB" "SELECT count(*) FROM pgmigrations WHERE name = '$TARGET'")" || fail "could not check the live target"
  [ "$has_target" = "1" ] || fail "the live database does not record $TARGET as applied"
  log "live migrations: $live_count through $TARGET"

  STAGE=activate
  log "== activate the API"
  new_private_file "$PREFIX-activate.log"
  (cd "$PROJECT_DIR" && sudo -n env ONSERVICE_PROJECT_DIR="$PROJECT_DIR" ONSERVICE_RELEASE_SHA="$SHA" \
    bash scripts/server/activate-api-release.sh) >> "$PREFIX-activate.log" 2>&1 || fail "activation failed; see $PREFIX-activate.log"
  grep -qF "API activation verified: revision=$SHA image=$IMAGE_ID" "$PREFIX-activate.log" || fail "activation did not report the expected revision and image"
  local ACTIVATED_AT now_image
  ACTIVATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  now_image="$(docker inspect --format '{{.Image}}' "$API_CONTAINER")" || fail "could not inspect the running API after activation"
  [ "$now_image" = "$IMAGE_ID" ] || fail "the running API image is $now_image, not $IMAGE_ID"
  log "API activation verified at $ACTIVATED_AT: revision $SHA image $IMAGE_ID"

  STAGE=record
  local RECORD="$PREFIX-record.txt"
  new_private_file "$RECORD"
  {
    echo "release_state=deployed (API only; web, APK and the post-deploy checklist are separate steps)"
    echo "environment=tester server"
    echo "commit=$SHA"
    echo "previous_commit=$PREV"
    echo "previous_image_id=$running_image"
    echo "rollback_image=onservice-api:$PREV"
    echo "image=onservice-api:$SHA"
    echo "image_id=$IMAGE_ID"
    echo "backup_file=$(basename "$DUMP")"
    echo "backup_bytes=$dump_bytes"
    echo "backup_sha256=$dump_sha"
    echo "rehearsal_database=$REHEARSAL_DB"
    echo "rehearsal_result=$REHEARSAL_RESULT"
    echo "migrations_before=$COUNT"
    echo "migrations_after=$live_count"
    echo "migration_target=$TARGET"
    echo "shared_config_changed=${shared_changes:-none}"
    echo "nginx_config_drift=$NGINX_DRIFT"
    echo "activated_at=$ACTIVATED_AT"
    echo "log=$(basename "$LOG")"
  } >> "$RECORD"
  log "release record written: $(basename "$RECORD")"
  log "== deploy done. State: deployed (API only). Next: web publish, APK if mobile code changed, catalog cache, post-deploy checklist."
  DONE=1
}

main "$@"; exit "$?"
