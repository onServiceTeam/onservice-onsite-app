#!/usr/bin/env bash
# F#3 — capture the 84 mobile visual baselines on a local Android emulator.
#
# Prereqs (see .ai-coder/handoff/F3-maestro-baseline-capture.md):
#   - local dev stack up (scripts/dev/up.sh) — API on :7381 with dev OTP
#   - an Android emulator booted with the app installed (debug build,
#     EXPO_PUBLIC_API_URL=http://10.0.2.2:7381) and Metro running
#   - maestro on PATH
#
# Resolves the dynamic-route ids from the seeded database, then runs the
# customer and provider flow directories (each starts with its own
# 000-setup-login.yaml, so ordering inside a directory matters and is
# alphabetical — which maestro honors).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT/apps/mobile"

PSQL="docker exec onservice-postgres psql -U onservice -d onservice_dev -t -A -c"

CUSTOMER_PHONE="${MAESTRO_CUSTOMER_PHONE:-9171234567}"
PROVIDER_PHONE="${MAESTRO_PROVIDER_PHONE:-9221234567}"

echo "==> Resolving seeded entity ids from the local database..."
BOOKING_ID=$($PSQL "SELECT b.id FROM bookings b JOIN users u ON u.id=b.customer_id WHERE u.phone='+63${CUSTOMER_PHONE}' ORDER BY b.created_at DESC LIMIT 1")
JOB_ID=$($PSQL "SELECT b.id FROM bookings b JOIN providers p ON p.id=b.provider_id JOIN users u ON u.id=p.user_id WHERE u.phone='+63${PROVIDER_PHONE}' ORDER BY b.created_at DESC LIMIT 1")
CATEGORY_ID=$($PSQL "SELECT id FROM service_categories ORDER BY sort_order NULLS LAST, name LIMIT 1")
PROVIDER_ID=$($PSQL "SELECT p.id FROM providers p JOIN users u ON u.id=p.user_id WHERE u.phone='+63${PROVIDER_PHONE}' LIMIT 1")
CONVERSATION_ID=$($PSQL "SELECT id FROM conversations ORDER BY created_at DESC LIMIT 1" || true)
RECURRING_ID=$($PSQL "SELECT id FROM recurring_bookings ORDER BY created_at DESC LIMIT 1" || true)

for v in BOOKING_ID JOB_ID CATEGORY_ID PROVIDER_ID; do
  if [ -z "${!v}" ]; then
    echo "ERROR: could not resolve $v from seeds — is the stack up and seeded?" >&2
    exit 1
  fi
done
# Conversations / recurring may legitimately be absent from seeds; the two
# affected flows then capture the screen's not-found state. Flag it loudly
# so the operator can decide.
[ -z "$CONVERSATION_ID" ] && echo "WARN: no conversations row — chat flows will capture the not-found state" && CONVERSATION_ID="00000000-0000-0000-0000-000000000000"
[ -z "$RECURRING_ID" ] && echo "WARN: no recurring_bookings row — recurring-detail flow will capture the not-found state" && RECURRING_ID="00000000-0000-0000-0000-000000000000"

echo "    booking=$BOOKING_ID job=$JOB_ID category=$CATEGORY_ID provider=$PROVIDER_ID"
echo "    conversation=$CONVERSATION_ID recurring=$RECURRING_ID"

run_kind() {
  local kind="$1"
  echo "==> Capturing $kind flows..."
  maestro test ".maestro/visual/$kind/" \
    -e MAESTRO_CUSTOMER_PHONE="$CUSTOMER_PHONE" \
    -e MAESTRO_PROVIDER_PHONE="$PROVIDER_PHONE" \
    -e MAESTRO_BOOKING_ID="$BOOKING_ID" \
    -e MAESTRO_JOB_ID="$JOB_ID" \
    -e MAESTRO_CATEGORY_ID="$CATEGORY_ID" \
    -e MAESTRO_PROVIDER_ID="$PROVIDER_ID" \
    -e MAESTRO_CONVERSATION_ID="$CONVERSATION_ID" \
    -e MAESTRO_RECURRING_ID="$RECURRING_ID"
}

run_kind customer
run_kind provider

echo "==> Done. Baselines under apps/mobile/.maestro/visual/baselines/"
