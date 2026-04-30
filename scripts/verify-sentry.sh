#!/usr/bin/env bash
# Phase 14 Dispatch 14 — Item 6 verification: Sentry production project.
set -euo pipefail

if [ -z "${SENTRY_API_DSN:-}" ]; then
  echo "FAIL: SENTRY_API_DSN missing"
  exit 1
fi

if [ -z "${SENTRY_ENVIRONMENT:-}" ] || [ "$SENTRY_ENVIRONMENT" != "production" ]; then
  echo "FAIL: SENTRY_ENVIRONMENT must equal 'production' (got: '${SENTRY_ENVIRONMENT:-unset}')"
  exit 1
fi

# DSN format: https://<key>@<org>.ingest.sentry.io/<project_id>
if [[ ! "$SENTRY_API_DSN" =~ ^https://[a-f0-9]+@[a-z0-9.-]+\.ingest\.(us|de)\.sentry\.io/[0-9]+$ ]]; then
  if [[ ! "$SENTRY_API_DSN" =~ ^https://[a-f0-9]+@[a-z0-9.-]+\.ingest\.sentry\.io/[0-9]+$ ]]; then
    echo "FAIL: SENTRY_API_DSN does not look like a valid DSN"
    exit 1
  fi
fi

# If a release is pinned, sanity-check it
if [ -n "${SENTRY_RELEASE:-}" ]; then
  echo "  release: $SENTRY_RELEASE"
fi

echo "OK: Sentry production DSN configured"
echo "  environment: $SENTRY_ENVIRONMENT"
echo "  DSN host: $(echo "$SENTRY_API_DSN" | sed -E 's|^https://[^@]+@([^/]+).*|\1|')"
echo
echo "Manual: trigger a test error and confirm it appears in Sentry within 60s."
echo "  curl -fsS \"\$API_BASE_URL/internal/sentry-test\""
