# Phase 16 — Runtime bring-up checklist

**Goal:** Working local stack so Phases 17+ can drive real flows
through real HTTP, real Postgres, and a real browser.

**Owner:** Either the operator (Ken) or me (Claude) if explicitly
authorized to install tooling. Per-step authorization noted inline.

## Prerequisites — install / start

| # | Tool | Why | How | Auth needed |
|---|---|---|---|---|
| 1 | Docker Desktop daemon | Containers for postgres + redis | Start "Docker Desktop" from Start menu | Operator click only |
| 2 | psql client | DB inspection from CLI | `winget install PostgreSQL.PostgreSQL` (CLI only) or `choco install postgresql` | Authorize me OR operator runs |
| 3 | terraform | `terraform validate` / `plan` for IAM module | `winget install HashiCorp.Terraform` or `choco install terraform` | Authorize me OR operator runs |
| 4 | Chrome | Already installed; Chrome MCP tool reaches it | n/a | n/a |

## Step 1 — Postgres + Redis containers

Once Docker Desktop is running:

```bash
cd /c/Users/kmoul/OneDrive/Documents/GitHub/onservice-onsite-app
# Check if a compose file already exists
ls infra/docker/
```

Expected: a `docker-compose.dev.yml` or similar. If present, run
`docker compose -f infra/docker/docker-compose.dev.yml up -d`.
If not present, write one with this minimum:

- postgres:18-alpine on 5432
- redis:7-alpine on 6379
- volumes for data persistence
- env vars matching `packages/api/.env.example`

Verify:
```bash
docker ps   # both containers Running
psql -h localhost -U onservice -d onservice -c "SELECT version();"
```

## Step 2 — Apply migrations

```bash
cd packages/api
# Find the migration runner (likely a script in scripts/ or package.json script)
grep -E "migrate|migration" package.json
```

Once located:
```bash
npm run migrate    # or whatever the actual command is
```

Verify:
```bash
psql -h localhost -U onservice -d onservice -c "
  SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';
"
# Expect 50+ tables
```

## Step 3 — Seed minimal data

Need a seed script that produces:

| Role | Count | Notes |
|---|---:|---|
| super_admin | 1 | email: super@onservice.test, known password, TOTP enabled |
| admin (junior) | 1 | email: admin@onservice.test, password rotation NOT required |
| admin (legacy hash) | 1 | email: legacy@onservice.test, must_rotate_password=TRUE |
| dpo | 1 | email: dpo@onservice.test |
| customer (verified) | 1 | phone: +639170000001 |
| provider (approved) | 1 | phone: +639170000002, services attached |
| booking (received) | 1 | linking the above |
| consent_version (material) | 1 | published, material=true |

If `packages/api/scripts/seed-dev.ts` exists, run it. If not, write
one and check it in.

## Step 4 — API server

```bash
cd packages/api
npm run dev   # or `npm start`
```

Verify:
```bash
curl http://localhost:3001/health
# Expect 200 + {ok: true}
curl http://localhost:3001/api/v1/auth/me
# Expect 401 (not authenticated)
```

## Step 5 — Admin web

```bash
cd apps/admin
npm run dev
```

Verify in Chrome MCP:
- Navigate to `http://localhost:7382`
- Should land on login page
- Take screenshot

## Step 6 — Mobile (defer or Bluestacks)

**Decision point:** mobile runtime testing is heavier. Options:

A. **Defer to Phase 22+** — backend + admin web are enough to
   drive most flows because the mobile app talks to the same API.
   We'd be testing the mobile UI separately as its own phase.

B. **Use Bluestacks now** — install the APK if we can build it,
   exercise screens. Heavier setup; worth it only if a customer-
   or provider-flow regression is suspected to be mobile-side
   only.

Recommend A. Bluestacks gets activated when Phase 22 starts.

## Acceptance criteria for Phase 16 close

- [ ] Docker Desktop running
- [ ] postgres + redis containers up
- [ ] All 105 migration files applied (sequentially, each succeeding)
- [ ] Seed produces the 8 rows above
- [ ] API server responds 200 on /health
- [ ] Admin web loads in Chrome MCP and takes a screenshot
- [ ] No errors in the API server log on startup

When all six are checked, Phase 16 closes and Phase 17 (verify the
5g–5r fix wave) can begin.
