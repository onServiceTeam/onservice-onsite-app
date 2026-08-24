#!/usr/bin/env bash
# Launch cutover Item 5: verify the production Cloudflare Turnstile
# configuration used by the mobile OTP lockout flow.
set -euo pipefail

SITE_KEY="${TURNSTILE_SITE_KEY:-${EXPO_PUBLIC_TURNSTILE_SITE_KEY:-${CAPTCHA_SITE_KEY:-}}}"
SECRET_KEY="${TURNSTILE_SECRET_KEY:-${CAPTCHA_SECRET_KEY:-}}"

if [ -z "$SITE_KEY" ]; then
  echo "FAIL: TURNSTILE_SITE_KEY (or EXPO_PUBLIC_TURNSTILE_SITE_KEY) missing"
  exit 1
fi

if [ -z "$SECRET_KEY" ]; then
  echo "FAIL: TURNSTILE_SECRET_KEY (or CAPTCHA_SECRET_KEY) missing"
  exit 1
fi

# Cloudflare's documented dummy credentials must never reach production.
case "$SITE_KEY" in
  1x00000000000000000000AA|2x00000000000000000000AB|1x00000000000000000000BB|2x00000000000000000000BB|3x00000000000000000000FF)
    echo "FAIL: configured Turnstile site key is a Cloudflare test key"
    exit 1
    ;;
esac

case "$SECRET_KEY" in
  1x0000000000000000000000000000000AA|2x0000000000000000000000000000000AA|3x0000000000000000000000000000000AA)
    echo "FAIL: configured Turnstile secret is a Cloudflare test key"
    exit 1
    ;;
esac

# An intentionally invalid response token should produce
# invalid-input-response. invalid-input-secret proves the configured secret is
# not accepted. This checks the real Siteverify endpoint without needing a
# short-lived browser token and without printing any credential or response.
RESPONSE=$(curl -fsS --max-time 15 \
  "https://challenges.cloudflare.com/turnstile/v0/siteverify" \
  -d "secret=$SECRET_KEY" \
  -d "response=onservice-launch-readiness-invalid-token" || true)

if [ -z "$RESPONSE" ]; then
  echo "FAIL: Cloudflare Turnstile Siteverify endpoint unreachable"
  exit 1
fi

if ! printf '%s' "$RESPONSE" | node -e '
  let input = "";
  process.stdin.on("data", (chunk) => { input += chunk; });
  process.stdin.on("end", () => {
    try {
      const result = JSON.parse(input);
      const codes = Array.isArray(result["error-codes"]) ? result["error-codes"] : [];
      if (typeof result.success !== "boolean" || codes.includes("invalid-input-secret")) {
        process.exit(1);
      }
    } catch {
      process.exit(1);
    }
  });
'; then
  echo "FAIL: Turnstile Siteverify rejected the configured secret or returned invalid JSON"
  exit 1
fi

echo "OK: Turnstile production keys configured and Siteverify accepted the secret"
echo "  site key prefix: ${SITE_KEY:0:8}..."
