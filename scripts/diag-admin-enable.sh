#!/usr/bin/env bash
# Prove the FULL admin login chain end to end on superadmin: password -> 2fa
# setup -> 2fa ENABLE -> session cookie -> /auth/me. Then RESET superadmin's 2FA
# so it stays ready for Ken to enroll fresh on his own authenticator.
set -uo pipefail
cd /opt/onservice
ORIGIN="https://admin.onservice.ph"
EMAIL="superadmin@onservice.ph"
PW='Cebu-Harbor-7-Marlin-Qx!'
JAR=/tmp/sa_jar.txt; rm -f "$JAR"

PT=$(curl -s -X POST "$ORIGIN/api/v1/auth/admin/login" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}" | grep -o '"preAuthToken":"[^"]*"' | head -1 | sed 's/"preAuthToken":"//;s/"//')
echo "1. login preAuthToken: $([ -n "$PT" ] && echo present || echo MISSING)"
SECRET=$(curl -s -X POST "$ORIGIN/api/v1/auth/admin/2fa/setup" -H "Authorization: Bearer $PT" -H 'Content-Type: application/json' -d '{}' | grep -o '"secret":"[^"]*"' | sed 's/"secret":"//;s/"//')
echo "2. setup secret: $([ -n "$SECRET" ] && echo present || echo MISSING)"
CODE=$(docker exec onservice-api-1 node -e '
const crypto=require("crypto");
function b32d(s){const a="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";let b="";s=s.replace(/=+$/,"").toUpperCase();for(const c of s){const v=a.indexOf(c);if(v<0)continue;b+=v.toString(2).padStart(5,"0");}const o=[];for(let i=0;i+8<=b.length;i+=8)o.push(parseInt(b.slice(i,i+8),2));return Buffer.from(o);}
const t=Math.floor(Date.now()/1000/30);const buf=Buffer.alloc(8);buf.writeBigInt64BE(BigInt(t));
const h=crypto.createHmac("sha1",b32d(process.argv[1])).update(buf).digest();const o=h[h.length-1]&0xf;
console.log(((h.readUInt32BE(o)&0x7fffffff)%1000000).toString().padStart(6,"0"));' "$SECRET")
echo "3. generated TOTP: $CODE"
ENA=$(curl -s -D - -o /tmp/sa_body.txt -c "$JAR" -X POST "$ORIGIN/api/v1/auth/admin/2fa/enable" -H "Authorization: Bearer $PT" -H 'Content-Type: application/json' -d "{\"totpCode\":\"$CODE\"}")
echo "4. enable HTTP status: $(echo "$ENA" | grep -i '^HTTP/' | tail -1)"
echo "   set-cookie names: $(echo "$ENA" | grep -i 'set-cookie' | grep -oiE 'admin_(session|refresh|csrf)' | paste -sd, -)"
echo "   enable returned user: $(grep -o '\"role\":\"[^\"]*\"' /tmp/sa_body.txt | head -1)"
echo "5. /auth/me via captured cookie jar: $(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' "$ORIGIN/api/v1/auth/me")"
echo "6. /admin/dashboard via cookie jar:  $(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' "$ORIGIN/api/v1/admin/dashboard")"
echo "--- RESET superadmin 2FA so Ken can enroll fresh ---"
docker exec -i onservice-postgres-1 sh -c "psql -tA -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"UPDATE users SET totp_secret=NULL, totp_enabled=FALSE WHERE email='$EMAIL';\"" 2>&1 | head -1
echo "verify reset (expect requires2FASetup again): $(curl -s -X POST "$ORIGIN/api/v1/auth/admin/login" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}" | grep -o '\"requires2FASetup\":[a-z]*')"
rm -f "$JAR" /tmp/sa_body.txt; echo DONE
