#!/usr/bin/env bash
# Publish the admin and customer/provider web builds of one exact commit to the
# live TESTER server, the paired-release way. Read
# docs/runbooks/tester-server-release.md first. Tester server only.
#
# Usage, on the server, after scripts/release/deploy-tester-release.sh has put
# the same commit live:
#
#   ONSERVICE_RELEASE_DIR=<release folder> bash publish-web-builds.sh <full sha>
#
# The release folder must already hold three files, built and checksummed on
# the build machine and uploaded unchanged:
#   admin-dist-<full sha>.tar.gz        the admin build (apps/admin/dist)
#   mobile-dist-web-<full sha>.tar.gz   the customer/provider web build (apps/mobile/dist-web)
#   web-builds-<full sha>.sha256        sha256sum output for exactly those two files
#
# ONSERVICE_PROJECT_DIR may name the live checkout. It defaults to
# /opt/onservice, as in scripts/server/*.sh.
#
# What it does, in order, stopping at the first problem:
#   1. checks the sha, the folders, and that the live checkout and the running
#      API are both at this commit (web and API must match);
#   2. checks both archives against the checksum file (a cut-off upload fails
#      here), lists them, and refuses absolute paths, '..' parts, links and
#      special files, and a missing index.html;
#   3. unpacks both into a new staging folder and compares every file below the
#      top level with the live folders: a file that already exists must have
#      identical bytes. One conflict stops everything before anything is
#      written, for both builds;
#   4. adds the new files beside the old ones (copy to a temporary name, set
#      mode 644, rename), never overwriting or removing anything, so open
#      browser tabs and a rollback keep working;
#   5. checks that every file is visible inside the nginx container;
#   6. copies the current top-level files (index.html and friends) into the
#      release folder for rollback, then switches each top-level file with a
#      same-folder rename, index.html last, and checks that nginx serves the
#      new index.html;
#   7. writes a record with the entry script names and index.html checksums.
#
# It never deletes, never runs rsync --delete, never reloads or recreates nginx
# and never replaces a mounted folder.
set -euo pipefail
umask 022

readonly API_CONTAINER=onservice-api-1
readonly NGINX_CONTAINER=onservice-nginx-1
readonly LABEL_FORMAT='{{index .Config.Labels "org.opencontainers.image.revision"}}'
readonly NAMES=(admin app)

SHA="" RELEASE_DIR="" PROJECT_DIR="" LOG="" STAGE=start LOCKED=0 DONE=0 SWITCHING=""

usage_error() {
  echo "ERROR: $*" >&2
  echo "usage: ONSERVICE_RELEASE_DIR=<release folder> publish-web-builds.sh <full sha>" >&2
  exit 2
}

check_dir() {
  local name="$1" value="$2" real
  [[ "$value" =~ ^/[A-Za-z0-9._/-]+$ ]] || { echo "ERROR: $name must be an absolute path made of letters, digits, '.', '_', '-' and '/'" >&2; return 1; }
  case "$value/" in */../*|*/./*|*//*) echo "ERROR: $name must not contain '..', '.' or '//' parts" >&2; return 1;; esac
  [ -d "$value" ] && [ ! -L "$value" ] || { echo "ERROR: $name is not a folder, or is a symbolic link" >&2; return 1; }
  real="$(cd "$value" && pwd -P)" || return 1
  [ "$real" != "/" ] || { echo "ERROR: $name must not be the filesystem root" >&2; return 1; }
  printf '%s\n' "$real"
}

inside() { case "$1/" in "$2"/*) return 0;; *) return 1;; esac; }

log() {
  local line
  line="$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"
  printf '%s\n' "$line"
  if [ -n "$LOG" ]; then printf '%s\n' "$line" >> "$LOG"; fi
}
fail() { log "STOP: $*"; exit 1; }

# Fixed mapping. These literal folders are the nginx bind mounts named in
# docker-compose.prod.yml and docs/runbooks/paired-web-api-release.md.
# Every path a root command (sudo cp, chmod, mv, mkdir) writes to is built
# only from ${name:?} expansions, so an empty variable stops the run instead
# of writing next to the filesystem root (the E08 lesson, 2026-06-10).
# release-scripts-safety.test.mjs rejects an unguarded expansion on those
# sudo lines and on the dest= lines that build their targets.
archive_of() { case "$1" in admin) echo "admin-dist-$SHA.tar.gz";; app) echo "mobile-dist-web-$SHA.tar.gz";; esac; }
live_of() { case "$1" in admin) echo "$PROJECT_DIR/apps/admin/dist";; app) echo "$PROJECT_DIR/apps/mobile/dist-web";; esac; }
container_of() { case "$1" in admin) echo /usr/share/nginx/admin;; app) echo /usr/share/nginx/app;; esac; }

on_exit() {
  local code=$?
  trap - EXIT
  if [ "$DONE" != 1 ]; then
    [ "$code" -ne 0 ] || code=1
    log "FAILED during stage '$STAGE' (exit $code)."
    if [ -n "$SWITCHING" ]; then
      log "entry files were being switched for: $SWITCHING. Check what nginx serves for each build before anything else (runbook: web publish failed)."
    else
      log "no entry file was switched; the old index.html files are still live. Any files already added sit unused beside the old ones."
    fi
  fi
  if [ "$LOCKED" = 1 ]; then
    rmdir "$RELEASE_DIR/.web-publish-lock" || log "could not remove the lock folder $RELEASE_DIR/.web-publish-lock"
  fi
  exit "$code"
}

main() {
  [ "$#" -eq 1 ] || usage_error "expected exactly 1 argument, got $#"
  SHA="$1"
  [[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || usage_error "the commit must be a full 40-character lower-case sha"
  local release_raw="${ONSERVICE_RELEASE_DIR:?set ONSERVICE_RELEASE_DIR to the release folder that holds the uploaded archives}"
  RELEASE_DIR="$(check_dir ONSERVICE_RELEASE_DIR "$release_raw")" || exit 2
  PROJECT_DIR="$(check_dir ONSERVICE_PROJECT_DIR "${ONSERVICE_PROJECT_DIR:-/opt/onservice}")" || exit 2
  ! inside "$RELEASE_DIR" "$PROJECT_DIR" || usage_error "the release folder must be outside the live checkout"
  ! inside "$PROJECT_DIR" "$RELEASE_DIR" || usage_error "the live checkout must not be inside the release folder"
  local name live
  for name in "${NAMES[@]}"; do
    live="$(live_of "$name")"
    [ -d "$live" ] && [ ! -L "$live" ] || usage_error "live web folder $live is missing or is a symbolic link"
  done

  local SHORT="${SHA:0:12}" STAMP
  STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
  local PREFIX="$RELEASE_DIR/web-$SHORT-$STAMP-$$"
  mkdir "$RELEASE_DIR/.web-publish-lock" 2>/dev/null || usage_error "another web publish is running, or a stale lock folder $RELEASE_DIR/.web-publish-lock needs review"
  LOCKED=1
  trap on_exit EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  set -o noclobber
  [ ! -e "$PREFIX.log" ] || fail "log $PREFIX.log already exists"
  : > "$PREFIX.log"
  LOG="$PREFIX.log"
  log "== web publish start: $SHA; live checkout $PROJECT_DIR; release folder $RELEASE_DIR"

  STAGE=preflight
  local head running_image running_rev
  head="$(sudo -n git -c safe.directory="$PROJECT_DIR" -C "$PROJECT_DIR" rev-parse HEAD)" || fail "could not read the live checkout"
  [ "$head" = "$SHA" ] || fail "the live checkout is at $head, not $SHA. Deploy the API for this commit first."
  running_image="$(docker inspect --format '{{.Image}}' "$API_CONTAINER")" || fail "could not inspect the running API container"
  running_rev="$(docker image inspect --format "$LABEL_FORMAT" "$running_image")" || fail "could not read the running API image label"
  [ "$running_rev" = "$SHA" ] || fail "the running API is labelled '$running_rev', not $SHA. Web and API must be the same commit."
  log "live checkout and running API are at $SHA"

  STAGE=checksums
  local sums="$RELEASE_DIR/web-builds-$SHA.sha256"
  [ -f "$sums" ] && [ ! -L "$sums" ] || fail "checksum file web-builds-$SHA.sha256 is missing"
  local -a lines=()
  mapfile -t lines < <(tr -d '\r' < "$sums")
  [ "${#lines[@]}" -eq 2 ] || fail "the checksum file must have exactly 2 lines, found ${#lines[@]}"
  local i archive expected actual
  for i in 0 1; do
    archive="$(archive_of "${NAMES[$i]}")"
    [[ "${lines[$i]}" =~ ^([0-9a-f]{64})\ [\ *](.+)$ ]] || fail "checksum line $((i + 1)) is not sha256sum output"
    expected="${BASH_REMATCH[1]}"
    [ "${BASH_REMATCH[2]}" = "$archive" ] || fail "checksum line $((i + 1)) names '${BASH_REMATCH[2]}', expected $archive"
    [ -f "$RELEASE_DIR/$archive" ] && [ ! -L "$RELEASE_DIR/$archive" ] || fail "archive $archive is missing"
    actual="$(sha256sum "$RELEASE_DIR/$archive" | cut -d' ' -f1)" || fail "could not hash $archive"
    [ "$actual" = "$expected" ] || fail "$archive does not match its checksum (cut-off or changed upload); upload it again"
    log "$archive: sha256 $actual matches"
  done

  STAGE=stage
  mkdir "$PREFIX-stage" || fail "could not create the staging folder"
  local stage member
  for name in "${NAMES[@]}"; do
    archive="$(archive_of "$name")"
    stage="$PREFIX-stage/$name"
    mkdir "$stage" || fail "could not create $stage"
    while IFS= read -r member; do
      case "$member" in
        /*) fail "$archive has an absolute path: $member";;
        ..|../*|*/..|*/../*) fail "$archive has a '..' path: $member";;
      esac
    done < <(tar --absolute-names -tzf "$RELEASE_DIR/$archive")
    # Only plain files ('-') and folders ('d'); links and devices are refused
    # before anything is unpacked.
    while IFS= read -r member; do
      case "$member" in
        -*|d*) ;;
        *) fail "$archive contains a link or special file: $member";;
      esac
    done < <(tar --absolute-names -tvzf "$RELEASE_DIR/$archive")
    tar xzf "$RELEASE_DIR/$archive" -C "$stage" --no-same-owner || fail "could not unpack $archive"
    [ -f "$stage/index.html" ] && [ ! -L "$stage/index.html" ] || fail "$archive has no index.html at the top"
    [ -z "$(find "$stage" ! -type f ! -type d -print -quit)" ] || fail "$archive contains links or special files"
    [ -z "$(find "$stage" -mindepth 1 -maxdepth 1 -type f ! -name '[A-Za-z0-9_]*' -print -quit)" ] || fail "$archive has a top-level file with an unexpected name"
    [ -z "$(find "$stage" -mindepth 1 -maxdepth 1 -type f -name '*[!A-Za-z0-9._-]*' -print -quit)" ] || fail "$archive has a top-level file with an unexpected name"
    log "$name: unpacked $(find "$stage" -type f | wc -l | tr -d ' ') files from $archive"
  done

  STAGE=compare
  local f rel dest d conflicts same added missing
  local -A same_count=() new_count=()
  conflicts=0
  for name in "${NAMES[@]}"; do
    stage="$PREFIX-stage/$name"
    live="$(live_of "$name")"
    same=0 added=0
    while IFS= read -r -d '' d; do
      rel="${d#"$stage"/}"
      dest="${live:?}/${rel:?}"
      if [ -L "$dest" ] || { [ -e "$dest" ] && [ ! -d "$dest" ]; }; then
        log "CONFLICT ($name): $rel exists live and is not a folder"
        conflicts=$((conflicts + 1))
      fi
    done < <(find "$stage" -mindepth 1 -type d -print0)
    while IFS= read -r -d '' f; do
      rel="${f#"$stage"/}"
      dest="${live:?}/${rel:?}"
      if [ -L "$dest" ]; then
        log "CONFLICT ($name): $rel is a symbolic link live"
        conflicts=$((conflicts + 1))
      elif [ -e "$dest" ]; then
        if [ -f "$dest" ] && cmp -s "$f" "$dest"; then
          same=$((same + 1))
        else
          log "CONFLICT ($name): $rel exists live with different bytes"
          conflicts=$((conflicts + 1))
        fi
      else
        added=$((added + 1))
      fi
    done < <(find "$stage" -mindepth 2 -type f -print0)
    # Top-level files are replaced later; the live name must be a plain file or absent.
    while IFS= read -r -d '' f; do
      rel="${f#"$stage"/}"
      dest="${live:?}/${rel:?}"
      if [ -L "$dest" ] || { [ -e "$dest" ] && [ ! -f "$dest" ]; }; then
        log "CONFLICT ($name): top-level $rel exists live and is not a plain file"
        conflicts=$((conflicts + 1))
      fi
    done < <(find "$stage" -mindepth 1 -maxdepth 1 -type f -print0)
    same_count[$name]=$same
    new_count[$name]=$added
    log "$name: $added new files, $same already identical"
  done
  [ "$conflicts" = 0 ] || fail "$conflicts conflicts; nothing was written for either build"

  STAGE=add
  for name in "${NAMES[@]}"; do
    stage="$PREFIX-stage/$name"
    live="$(live_of "$name")"
    while IFS= read -r -d '' d; do
      rel="${d#"$stage"/}"
      dest="${live:?}/${rel:?}"
      [ -d "$dest" ] || sudo -n mkdir -m 755 "${dest:?}" || fail "could not create folder $rel"
    done < <(find "$stage" -mindepth 1 -type d -print0)
    added=0
    while IFS= read -r -d '' f; do
      rel="${f#"$stage"/}"
      dest="${live:?}/${rel:?}"
      [ ! -e "$dest" ] || continue
      sudo -n cp "${f:?}" "${dest:?}.tmp-publish" || fail "could not copy $rel"
      sudo -n chmod 644 "${dest:?}.tmp-publish" || fail "could not set the mode of $rel"
      sudo -n mv "${dest:?}.tmp-publish" "${dest:?}" || fail "could not rename $rel into place"
      added=$((added + 1))
    done < <(find "$stage" -mindepth 2 -type f -print0)
    [ "$added" = "${new_count[$name]}" ] || fail "$name: added $added files, expected ${new_count[$name]}"
    log "$name: added $added files beside the old ones"
  done

  STAGE=verify-nginx
  local container
  for name in "${NAMES[@]}"; do
    stage="$PREFIX-stage/$name"
    container="$(container_of "$name")"
    missing=0
    while IFS= read -r -d '' f; do
      rel="${f#"$stage"/}"
      docker exec "$NGINX_CONTAINER" test -f "$container/$rel" || { log "not visible in nginx ($name): $rel"; missing=$((missing + 1)); }
    done < <(find "$stage" -mindepth 2 -type f -print0)
    [ "$missing" = 0 ] || fail "$name: $missing files are not visible in nginx; no entry file was switched"
    log "$name: every file is visible in nginx"
  done

  STAGE=save-previous
  local previous="$PREFIX-previous" top
  mkdir "$previous" || fail "could not create $previous"
  for name in "${NAMES[@]}"; do
    stage="$PREFIX-stage/$name"
    live="$(live_of "$name")"
    mkdir "$previous/$name" || fail "could not create $previous/$name"
    while IFS= read -r -d '' f; do
      top="${f##*/}"
      if [ -f "$live/$top" ]; then cp -p "$live/$top" "$previous/$name/$top" || fail "could not save the current $name/$top"; fi
    done < <(find "$stage" -mindepth 1 -maxdepth 1 -type f -print0)
    if [ -f "$previous/$name/index.html" ]; then
      log "$name: saved the current top-level files; current index.html sha256 $(sha256sum "$previous/$name/index.html" | cut -d' ' -f1)"
    else
      log "$name: there was no index.html live before this publish"
    fi
  done

  STAGE=switch
  local -a tops=()
  for name in "${NAMES[@]}"; do
    stage="$PREFIX-stage/$name"
    live="$(live_of "$name")"
    container="$(container_of "$name")"
    SWITCHING="$SWITCHING $name"
    mapfile -t tops < <(find "$stage" -mindepth 1 -maxdepth 1 -type f ! -name index.html -printf '%f\n' | LC_ALL=C sort)
    tops+=(index.html)
    for top in "${tops[@]}"; do
      sudo -n cp "${stage:?}/${top:?}" "${live:?}/.${top:?}.tmp-publish" || fail "could not copy $name/$top"
      sudo -n chmod 644 "${live:?}/.${top:?}.tmp-publish" || fail "could not set the mode of $name/$top"
      sudo -n mv -f "${live:?}/.${top:?}.tmp-publish" "${live:?}/${top:?}" || fail "could not switch $name/$top"
      log "$name: switched $top"
    done
    cmp -s "$stage/index.html" "$live/index.html" || fail "$name: index.html was not switched"
    docker exec "$NGINX_CONTAINER" cat "$container/index.html" | cmp -s - "$stage/index.html" || fail "$name: nginx does not serve the new index.html"
    log "$name: published; nginx serves the new index.html"
  done
  SWITCHING=""

  STAGE=record
  local RECORD="$PREFIX-record.txt" scripts
  {
    echo "release_state=deployed (web; check the served files from outside in the post-deploy checklist)"
    echo "environment=tester server"
    echo "commit=$SHA"
    for name in "${NAMES[@]}"; do
      stage="$PREFIX-stage/$name"
      scripts="$({ grep -o 'src="[^"]*\.js"' "$stage/index.html" || true; } | sed 's/^src="//; s/"$//' | tr '\n' ' ')"
      echo "${name}_archive=$(archive_of "$name")"
      echo "${name}_files_added=${new_count[$name]}"
      echo "${name}_files_already_identical=${same_count[$name]}"
      echo "${name}_index_sha256=$(sha256sum "$stage/index.html" | cut -d' ' -f1)"
      echo "${name}_entry_scripts=${scripts:-none found}"
      if [ -f "$previous/$name/index.html" ]; then
        echo "${name}_previous_index_sha256=$(sha256sum "$previous/$name/index.html" | cut -d' ' -f1)"
      fi
    done
    echo "previous_files_folder=$(basename "$previous")"
    echo "log=$(basename "$LOG")"
  } > "$RECORD"
  log "release record written: $(basename "$RECORD")"
  log "== web publish done"
  DONE=1
}

main "$@"; exit "$?"
