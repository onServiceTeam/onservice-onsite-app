#!/usr/bin/env bash
# Throwaway end-to-end test of the admin browser login + session-cookie flow.
# Creates a temp admin, completes password + 2FA enrollment, captures cookies,
# then checks whether /auth/me authenticates via the cookie (what the SPA does
# on every page load). Cleans up the temp admin at the end.
set -uo pipefail
cd /opt/onservice
ORIGIN="https://admin.onservice.ph"
EMAIL="qa-session-$(date +%s)@onservice.ph"
PW='QaSess-Harbor-9-Marlin-Z!'
JAR=/tmp/qa_admin_jar.txt
rm -f "$JAR"

echo "EMAIL=$EMAIL"
echo "--- 1. bootstrap throwaway admin ---"
docker compose -f docker-compose.prod.yml run --rm -T \
  -e ADMIN_BOOTSTRAP_PASSWORD="$PW" -e ADMIN_BOOTSTRAP_ROLE='admin' \
  api npx tsx scripts/bootstrap-admin.ts "$EMAIL" 2>&1 | grep -iE "created|updated|complete" | head -2

echo "--- 2. login (password) ---"
LOGIN=$(curl -s -X POST "$ORIGIN/api/v1/auth/admin/login" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}")
PT=$(echo "$LOGIN" | grep -o '"preAuthToken":"[^"]*"' | head -1 | sed 's/"preAuthToken":"//;s/"//')
echo "requires2FASetup: $(echo "$LOGIN" | grep -o '"requires2FASetup":[a-z]*')"

echo "--- 3. 2fa/setup (get secret) ---"
SECRET=$(curl -s -X POST "$ORIGIN/api/v1/auth/admin/2fa/setup" -H "Authorization: Bearer $PT" -H 'Content-Type: application/json' -d '{}' | grep -o '"secret":"[^"]*"' | sed 's/"secret":"//;s/"//')
echo "secret: ${SECRET:0:8}..."

echo "--- 4. generate TOTP code (in running api container) ---"
CODE=$(docker exec onservice-api-1 node -e '
const crypto=require("crypto");
function b32d(s){const a="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";let bits="";s=s.replace(/=+$/,"").toUpperCase();for(const c of s){const v=a.indexOf(c);if(v<0)continue;bits+=v.toString(2).padStart(5,"0");}const out=[];for(let i=0;i+8<=bits.length;i+=8)out.push(parseInt(bits.slice(i,i+8),2));return Buffer.from(out);}
const t=Math.floor(Date.now()/1000/30);const buf=Buffer.alloc(8);buf.writeBigInt64BE(BigInt(t));
const h=crypto.createHmac("sha1",b32d(process.argv[1])).update(buf).digest();const o=h[h.length-1]&0xf;
console.log(((h.readUInt32BE(o)&0x7fffffff)%1000000).toString().padStart(6,"0"));
' "$SECRET")
echo "code: $CODE"

echo "--- 5. 2fa/enable (capture Set-Cookie into jar) ---"
ENABLE_HDRS=$(curl -s -D - -o /dev/null -c "$JAR" -X POST "$ORIGIN/api/v1/auth/admin/2fa/enable" -H "Authorization: Bearer $PT" -H 'Content-Type: application/json' -d "{\"totpCode\":\"$CODE\"}")
echo "$ENABLE_HDRS" | grep -iE "^HTTP/|set-cookie" | sed -E 's/(admin_session=|admin_refresh=)[^;]+/\1<redacted>/'
echo "--- cookies captured ---"
grep -E "admin_session|admin_refresh|admin_csrf" "$JAR" | awk '{print $6, $7, "(flags from jar)"}'

echo "--- 6. THE KEY TEST: does /auth/me authenticate via the cookie jar (what the SPA does on load)? ---"
echo "GET /auth/me with cookie: $(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' "$ORIGIN/api/v1/auth/me")"
echo "GET /admin/dashboard with cookie: $(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' "$ORIGIN/api/v1/admin/dashboard")"

echo "--- 7. cleanup: delete throwaway admin ---"
docker exec -i onservice-postgres-1 sh -c "psql -tA -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"DELETE FROM users WHERE email='$EMAIL';\"" 2>&1 | head -1
rm -f "$JAR"
echo "DONE"
