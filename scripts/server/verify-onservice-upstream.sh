#!/usr/bin/env bash
# Regression check for the shared-edge DNS collision found 2026-08-22.
#
# The onService nginx container joins multiple project networks. More than one
# project can expose a generic `api` hostname, so this test verifies nginx uses
# onService's unique alias and can reach the real API through both Docker DNS
# and the public-facing local TLS proxy.
set -euo pipefail

cd /opt/onservice

api_id="$(docker compose -f docker-compose.prod.yml ps -q api)"
nginx_id="$(docker compose -f docker-compose.prod.yml ps -q nginx)"

if [[ -z "$api_id" || -z "$nginx_id" ]]; then
  echo "FAIL: onService api or nginx container is not running" >&2
  exit 1
fi

resolved_ips="$(docker exec "$nginx_id" getent hosts onservice-api-backend | awk '{print $1}' | sort -u)"
api_ips="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{"\n"}}{{end}}' "$api_id" | sed '/^$/d' | sort -u)"

if [[ -z "$resolved_ips" ]]; then
  echo "FAIL: nginx cannot resolve onservice-api-backend" >&2
  exit 1
fi

if ! comm -12 <(printf '%s\n' "$resolved_ips") <(printf '%s\n' "$api_ips") | grep -q .; then
  echo "FAIL: onservice-api-backend resolves to [$resolved_ips], but the onService API uses [$api_ips]" >&2
  exit 1
fi

docker exec "$nginx_id" curl -fsS http://onservice-api-backend:7381/health/ready >/dev/null
curl -kfsS -H 'Host: app.onservice.ph' https://127.0.0.1:8443/api/v1/config >/dev/null

echo "PASS: shared nginx resolves and proxies to the onService API"
