# API security / integration suite

Integration tests that run over HTTP against a **running** API (not the
in-process unit harness). They verify authorization boundaries, IDOR, RBAC,
token integrity, input validation, and cross-actor consistency.

- `authz.test.mjs` — 14 checks: token integrity, booking IDOR, RBAC (customer
  cannot reach admin/DPO routes), mass-assignment privilege escalation, input
  validation + boundary clamping, wallet self-scoping.
- `multi-actor.test.mjs` — 3 checks: a booking's owner and assigned provider
  both see a consistent view; an unrelated customer cannot see it.

## Prerequisite

The local dev stack must be up and seeded:

```
bash scripts/dev/up.sh        # API on :7381, dev OTP 000000, seeded accounts
```

## Run

### Direct-mint mode (deterministic, CI-friendly — recommended)

Mints HS256 tokens from the dev JWT secret, so it never touches the rate-limited
OTP login. Resolves seeded user ids from the DB:

```powershell
# Windows PowerShell
cd qa/api-security
$rows = docker exec onservice-postgres psql -U onservice -d onservice_dev -t -A -F '|' `
  -c "SELECT phone, id, role FROM users WHERE phone IN ('+639171234567','+639181234567','+639221234567','+639231234567')"
$map = @{}; foreach ($r in $rows) { if ($r) { $p,$id,$role = $r -split '\|'; $map[$p]=@{id=$id;role=$role} } }
$env:MINT_SECRET = docker exec onservice-api printenv JWT_SECRET
$env:MINT_IDS = ($map | ConvertTo-Json -Compress)
$env:API_URL = 'http://localhost:7381'
node --test
```

```bash
# bash
cd qa/api-security
export API_URL=http://localhost:7381
export MINT_SECRET=$(docker exec onservice-api printenv JWT_SECRET)
export MINT_IDS=$(docker exec onservice-postgres psql -U onservice -d onservice_dev -t -A \
  -c "SELECT json_object_agg(phone, json_build_object('id', id, 'role', role)) \
      FROM users WHERE phone IN ('+639171234567','+639181234567','+639221234567','+639231234567')")
node --test
```

`MINT_SECRET` is the **dev-only** secret of a box you legitimately control. Never
point this at production. Nothing secret is committed; it is read at runtime.

### OTP-login mode (one-off local run)

Without `MINT_SECRET`, the suite logs in via the dev-OTP flow (code `000000`).
This is subject to the auth rate limiter (10/min). If you hit 429, reset:

```
docker exec onservice-redis redis-cli FLUSHDB
docker exec onservice-postgres psql -U onservice -d onservice_dev -c "DELETE FROM login_attempts"
```

## What a pass means

All green = the API correctly denies cross-tenant and cross-role access, validates
tokens and input, and presents a consistent multi-actor view. Each negative test
has a positive control, so green means the control works, not that the endpoint is
simply unreachable.
