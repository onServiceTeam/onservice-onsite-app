#!/usr/bin/env bash
# TEST DOUBLE for scripts/release/__tests__ only. Stands in for docker: keeps
# images, the running API image and database migration counts in files under
# $FAKE_STATE, logs every call to $FAKE_LOG, and refuses any command the release
# scripts are not expected to run. No daemon or database is used.
set -uo pipefail
S="$FAKE_STATE"
scenario="${FAKE_SCENARIO:-success}"
printf 'docker %s\n' "$*" >> "$FAKE_LOG"
lookup() { awk -v r="$1" '$1==r || $2==r { hit=$2" "$3 } END { if (hit) print hit }' "$S/images.txt"; }

pg() {
  case "$1" in
    psql)
      [ "$2 $3 $4 $6 $7 $8" = "-U onservice_user -d -v ON_ERROR_STOP=1 -Atc" ] || { echo "fake psql: unexpected arguments" >&2; exit 60; }
      local db="$5" sql="$9" t name
      case "$sql" in
        'SELECT count(*) FROM pgmigrations')
          [ -f "$S/db/$db.count" ] || { echo "fake psql: no database $db" >&2; exit 2; }
          cat "$S/db/$db.count";;
        "SELECT count(*) FROM pgmigrations WHERE name = '"*"'")
          t="${sql#*name = \'}"; t="${t%\'}"
          if [ -f "$S/db/$db.target" ] && [ "$(cat "$S/db/$db.target")" = "$t" ]; then echo 1; else echo 0; fi;;
        "SELECT count(*) FROM pg_database WHERE left(datname, 20) = 'onservice_rehearsal_'")
          [ "$scenario" != list_databases_fails ] || { echo "fake psql: connection lost" >&2; exit 2; }
          ls "$S/db" | grep -c '^onservice_rehearsal_.*\.count$' || true;;
        'CREATE DATABASE '*)
          name="${sql#CREATE DATABASE }"
          [ ! -f "$S/db/$name.count" ] || { echo "fake psql: database exists" >&2; exit 1; }
          echo 0 > "$S/db/$name.count"; echo "CREATE DATABASE";;
        'DROP DATABASE '*)
          name="${sql#DROP DATABASE }"
          if [ "$name" = onservice ]; then echo "DROPPED-LIVE-DATABASE" >> "$FAKE_LOG"; exit 99; fi
          mkdir -p "$S/dropped"
          mv "$S/db/$name.count" "$S/dropped/"
          [ ! -f "$S/db/$name.target" ] || mv "$S/db/$name.target" "$S/dropped/"
          echo "DROP DATABASE";;
        *) echo "fake psql: unexpected SQL: $sql" >&2; exit 61;;
      esac;;
    pg_dump)
      [ "$*" = "pg_dump -U onservice_user -d onservice -Fc" ] || exit 62
      [ "$scenario" != dump_empty ] || exit 0
      # A server-only file appears in the live checkout after the fetch-stage
      # check (as a certificate renewal could), at a path the release adds.
      if [ "$scenario" = clobber_during_backup ]; then
        mkdir -p "$FAKE_PROJECT/certbot/conf"
        printf 'LIVE-SERVER-ONLY\n' > "$FAKE_PROJECT/certbot/conf/server-only.txt"
      fi
      printf 'FAKEDUMP count=%s\n' "$(cat "$S/db/onservice.count")";;
    pg_restore)
      [ "$2 $3 $4 $6" = "-U onservice_user -d --no-owner" ] || exit 63
      local line; line="$(head -n 1)"
      echo "${line#FAKEDUMP count=}" > "$S/db/$5.count"
      [ ! -f "$S/db/onservice.target" ] || cp "$S/db/onservice.target" "$S/db/$5.target";;
    *) exit 64;;
  esac
}

nginx_exec() {
  local cmd="$1" p mapped
  case "$cmd" in
    test) [ "$2" = -f ] || exit 71; p="$3";;
    cat) p="$2";;
    *) exit 72;;
  esac
  case "$p" in
    # The copy of nginx.conf the running container reads (a state file).
    /etc/nginx/nginx.conf) [ "$cmd" = cat ] || exit 73; mapped="$S/nginx.conf";;
    /usr/share/nginx/admin/*) mapped="$FAKE_PROJECT/apps/admin/dist/${p#/usr/share/nginx/admin/}";;
    /usr/share/nginx/app/*) mapped="$FAKE_PROJECT/apps/mobile/dist-web/${p#/usr/share/nginx/app/}";;
    *) exit 70;;
  esac
  if [ -n "${FAKE_NGINX_BLIND:-}" ] && [[ "$p" == *"$FAKE_NGINX_BLIND"* ]]; then exit 1; fi
  if [ -n "${FAKE_NGINX_STALE_INDEX:-}" ] && [ "$cmd" = cat ]; then echo "<html>stale</html>"; exit 0; fi
  if [ "$cmd" = test ]; then test -f "$mapped"; else cat "$mapped"; fi
}

case "$1" in
  inspect)
    [ "$2" = --format ] && [ "$3" = '{{.Image}}' ] || exit 51
    [ "$(cat "$S/running_image")" != absent ] || { echo "Error: No such object: $4" >&2; exit 1; }
    cat "$S/running_image";;
  image)
    [ "$2" = inspect ] && [ "$3" = --format ] || exit 52
    hit="$(lookup "$5")"
    [ -n "$hit" ] || { echo "Error: No such image: $5" >&2; exit 1; }
    case "$4" in
      '{{.Id}}') echo "${hit%% *}";;
      '{{index .Config.Labels "org.opencontainers.image.revision"}}') echo "${hit#* }";;
      *) exit 53;;
    esac;;
  build)
    [ "$2 $3 $4 $6 $8" = "-f packages/api/Dockerfile --label -t ." ] || { echo "fake build: unexpected arguments" >&2; exit 54; }
    printf 'build-checkout-head %s\n' "$(git -C "$PWD" rev-parse HEAD)" >> "$FAKE_LOG"
    [ "$scenario" != build_fails ] || { echo "fake build failure"; exit 1; }
    label="${5#org.opencontainers.image.revision=}"
    [ "$scenario" != wrong_label ] || label=0000000000000000000000000000000000000000
    echo "$7 sha256:$FAKE_NEW_IMAGE_HEX $label" >> "$S/images.txt"
    echo "fake image built";;
  exec)
    shift
    [ "$1" != -i ] || shift
    container="$1"; shift
    case "$container" in
      onservice-postgres-1) pg "$@";;
      onservice-nginx-1) nginx_exec "$@";;
      "$FAKE_CONTAINER_ID") [ "$1" = curl ] || exit 56;;
      *) exit 57;;
    esac;;
  compose)
    [ "$2 $3 $4 $5" = "-f docker-compose.prod.yml -f docker-compose.release.yml" ] || exit 80
    shift 5
    case "$1" in
      up)
        [ "$*" = "up -d --no-deps --no-build --pull never api" ] || exit 81
        [ "$scenario" != activation_fails ] || exit 43
        hit="$(lookup "onservice-api:$ONSERVICE_RELEASE_SHA")"
        echo "${hit%% *}" > "$S/running_image";;
      ps)
        [ "$*" = "ps -q api" ] || exit 82
        echo "$FAKE_CONTAINER_ID";;
      run)
        shift
        [ "$1 $2" = "--rm --no-deps" ] || exit 83
        shift 2
        [ "$1" != -T ] || shift
        [ "$1 $2" = "api sh" ] || exit 84
        shift 2
        export DATABASE_DIRECT_URL="${FAKE_DIRECT_URL:-postgresql://fixture:fixture@postgres:5432/onservice}"
        export PATH="$FAKE_CONTAINER_BIN:$PATH"
        if [ "$1" = -s ]; then
          shift
          [ "${1:-}" != -- ] || shift
          exec bash -s -- "$@"
        elif [ "$1" = -lc ]; then
          exec bash -c "$2"
        fi
        exit 85;;
      *) exit 86;;
    esac;;
  *) echo "fake docker: unexpected command $1" >&2; exit 50;;
esac
