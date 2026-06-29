# onService PH — Full Handoff for a New AI Coding Agent (2026-06-29)

You are taking over development of **onService PH**. Read this entire file before
doing anything. Then read `CLAUDE.md` at the repo root in full — it is the
binding rulebook and overrides anything you assume.

This document gives you: who/what the project is, how to access everything
(local, GitHub, server, database), the exact current state, how to run a full
audit of all three environments, a review of every major thing the founder asked
for (with status to double-check), all open/pending items and concerns, and how
to continue. A new feature to build is at the end.

---

## 0. Golden rules (from CLAUDE.md — do not violate)

- **Ken is the founder and your only reviewer. He is a non-developer.** Speak in
  plain English, not engineer English. Lead with bad news. No marketing words
  ("robust", "seamless"). No em dashes in informal writing.
- **Be honest about what is and isn't done.** Phase 13 of this project produced
  1,371 bugs by faking gates and tests. Never fake a passing test or a green
  gate. Every test renders + asserts on real output, or is an honest `it.todo`.
- **Money is always server-canonical.** Clients send IDs/quantities, never
  prices. The server computes every peso. This rule is absolute.
- **Hard stops (pause + write `.ai-coder/escalations/E<NN>-...md`, tell Ken):**
  money/compliance risk, production-data risk (a migration that drops/renames
  columns with data), an architecture decision that needs Ken, a spec
  contradiction, or a legal-language requirement that needs an attorney.
- **master is the only branch.** Push directly to master. CI gates (5 gates +
  "All gates passed") must be green or the push fails — fix forward immediately.
  Use a topic branch + PR only for risky money-path or breaking-schema changes.
- **Never `git push --force` on master.** Never falsify a gate log. Never edit
  `LAUNCH-LIMITATIONS.md` to make a problem disappear.

---

## 1. What the project is

A remote/in-home home-services marketplace for the Philippines (cleaning, aircon,
plumbing, electrical, etc.), built **city-agnostic** — cities and service areas
are data configured in the admin "Service Areas" page, not hardcoded. Default
launch market is **Metro Cebu** (Cebu City, Mandaue, Lapu-Lapu, Talisay). Other
markets (Davao, Boracay, GenSan, Metro Manila, Bacolod) get turned on in admin
when ready. (Historical note: some `.ai-coder/` files mention a Boracay-first
strategy that was superseded — leave them as point-in-time history.)

**Monorepo (`apps/` + `packages/`):**
- `apps/admin/` — React 19 + Vite + Tailwind 4 + shadcn/ui (admin web app)
- `apps/mobile/` — React Native 0.83 + Expo SDK 55 + Expo Router (customer +
  provider app; also exported to web for `app.onservice.ph`)
- `packages/api/` — Node 24 + Express 5 + raw `pg` + Postgres 18 (runs via `tsx`,
  not compiled). Background jobs via BullMQ. Redis for cache + queues.
- `infra/` — Terraform (not the live deployment; the live box is hand-managed)

---

## 2. Access — local, GitHub, server, database

> **CREDENTIAL SAFETY:** Do NOT copy secret values into any file, commit, or
> chat. Every secret already lives in a file on disk (the SSH key, the server
> `.env`). Reference those locations and read them at runtime. Never hardcode a
> password, key, or token. Never enter credentials into a web form yourself —
> ask Ken to do it.

### 2.1 Local machine (Ken's Windows 11 box)
- Repo: `C:\Users\kmoul\OneDrive\Documents\GitHub\onservice-onsite-app`
- Shell: PowerShell 7 (primary) + Git Bash available. OS: Windows 11.
- Node 24. Package manager: npm workspaces.
- Local dev stack: `scripts/dev/up.sh` brings up Docker Postgres + Redis + API;
  Expo web on port 8081. Seeded test accounts; **dev OTP is `000000`**. Stop
  with `docker compose stop` — **never** run a `down.sh`/`rm` that wipes volumes.

### 2.2 GitHub
- Repo: **https://github.com/onServiceTeam/onservice-onsite-app** (PRIVATE).
- **Local machine:** the local clone's `origin` is HTTPS and already authenticated
  on Ken's machine (`git push origin master` works). Use the `gh` CLI for
  PRs/issues/CI status (`gh run list --branch master`). If you run in a *different*
  environment (e.g. a cloud agent, not Ken's box), you will need Ken to provide a
  GitHub token/credential — do not assume one.
- **Server (`/opt/onservice`):** authenticates to GitHub with a **read-only deploy
  key** (set up 2026-06-29). The server's git remote is **SSH**
  (`git@github.com:onServiceTeam/onservice-onsite-app.git`), and the repo is wired
  to the key via `git config core.sshCommand "ssh -i ~/.ssh/github_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"`.
  The private key is `/root/.ssh/github_deploy` on the server (never copy it); the
  public key (`github_deploy.pub`) is registered under the repo's GitHub
  **Settings → Deploy keys** (read-only, no write access). So the server can
  `git fetch origin && git reset --hard origin/master` on its own during deploys.
  - **Verify it works:** `ssh -i ~/.ssh/github_deploy -o IdentitiesOnly=yes -T git@github.com`
    should print "Hi onServiceTeam/onservice-onsite-app! You've successfully
    authenticated".
  - **If the server can't fetch GitHub** (e.g. `could not read Username for
    'https://github.com'`): the remote got reset to HTTPS or the deploy key was
    removed/rotated. Fix: `cd /opt/onservice && git remote set-url origin git@github.com:onServiceTeam/onservice-onsite-app.git && git config core.sshCommand "ssh -i ~/.ssh/github_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"`,
    then test the ssh line above. If the key itself is gone/revoked, generate a new
    one on the server (`ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N "" -C "onservice-server-deploy"`),
    print `~/.ssh/github_deploy.pub`, and have **Ken** add it as a read-only deploy
    key at GitHub repo → Settings → Deploy keys → Add deploy key (adding a deploy
    key is a repo-access change — only Ken/an owner does that in the GitHub web UI,
    not the agent).
  - **Fallback if you cannot fix auth and need to ship code to the server:** create
    a git bundle of the missing commits locally and apply it on the server (this
    transfers the exact commit hashes without GitHub auth):
    `git bundle create /tmp/sync.bundle <serverHEAD>..master` → scp to the server →
    `git fetch /tmp/sync.bundle master && git reset --hard FETCH_HEAD`.
- Git author for commits: `Phase13 Agent`. End commit messages with a
  `Co-Authored-By:` line.

### 2.3 Live server (Hetzner, single box — runs API, DB, Redis, nginx, web)
- IP: **5.78.143.185**, root user.
- SSH key file on Ken's machine: `~/.ssh/onservice_hetzner`
- Connect with: `ssh -i ~/.ssh/onservice_hetzner -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new root@5.78.143.185`
- App lives at **`/opt/onservice`** on the server. That is a full git checkout on
  master (an off-site code backup). It is kept in sync by `git fetch origin &&
  git reset --hard origin/master` during deploys.
- Everything runs via `docker compose -f docker-compose.prod.yml`. Services:
  `postgres`, `pgbouncer`, `redis`, `api`, `nginx`, plus monitoring.
- **All server secrets are in `/opt/onservice/.env`** (DB password, REDIS_PASSWORD,
  JWT secrets, PayMongo keys, FEEDBACK_EXPORT_KEY, etc.). Read them from there;
  never print or copy them.
- **DANGER (real incident E08):** an `rm -rf $VAR/*` with an empty `$VAR` once
  destroyed the host OS. ALWAYS guard server deletes with `${VAR:?}` and prefer
  literal paths. Use `cd /opt/onservice` before any `docker compose` command
  (the compose file is there, not in `/root`).

### 2.4 Database (Postgres 18, inside the `postgres` container on the server)
- DB name: `onservice`. DB user: **`onservice_user`** (NOT "onservice"). Password
  is in the server `.env` (`DB_PASSWORD`) and the container env (`POSTGRES_USER`/
  `POSTGRES_DB`).
- Connect from the server:
  ```
  cd /opt/onservice
  DBC=$(docker compose -f docker-compose.prod.yml ps -q postgres)
  docker exec -i "$DBC" psql -U onservice_user -d onservice -c "SELECT 1;"
  ```
- Migrations are **hand-numbered SQL files** in `packages/api/migrations/` and
  **applied by hand** (NOT via an auto-runner on boot). Apply with:
  `docker exec -i "$DBC" psql -U onservice_user -d onservice -v ON_ERROR_STOP=1 < packages/api/migrations/NNN_name.sql`
- Highest applied migration is **145** (`145_hourly_pricing.sql`). Next free
  number is **146**.
- The `pgmigrations` tracking table is accurate through **145** (migrations 135–145
  were hand-applied via psql and the tracker was backfilled 2026-06-29 so it
  matches the live schema). Every migration 001–145 is reflected in the live DB.
  If you hand-apply a new migration, add a tracker row so it stays accurate:
  `INSERT INTO pgmigrations (name, run_on) SELECT '146_xxx', NOW() WHERE NOT EXISTS (SELECT 1 FROM pgmigrations WHERE name='146_xxx');`

### 2.5 Redis cache gotcha (you WILL hit this)
- `/api/v1/catalog/full` (and other catalog GETs) are cached in Redis for **1
  hour**. After any deploy that changes catalog output, the live response stays
  stale until you bust the key. The app only auto-invalidates on an admin catalog
  mutation. Bust it manually:
  ```
  cd /opt/onservice
  RPW=$(grep -E '^REDIS_PASSWORD=' .env | head -1 | cut -d= -f2-)
  RC=$(docker compose -f docker-compose.prod.yml ps -q redis)
  docker exec "$RC" redis-cli -a "$RPW" --no-auth-warning --scan --pattern '*catalog*' \
    | while read k; do docker exec "$RC" redis-cli -a "$RPW" --no-auth-warning DEL "$k"; done
  ```
  `redis-cli` MUST get `-a $REDIS_PASSWORD` or `--scan` silently returns nothing
  and writes fail with `NOAUTH` (which looks like "no keys exist").

---

## 3. Live URLs

| What | URL | Notes |
|---|---|---|
| Customer/Provider web app | https://app.onservice.ph | Expo web export, served by nginx |
| Admin web app | https://admin.onservice.ph | React/Vite build |
| API (same-origin) | https://app.onservice.ph/api/v1/... | **This is the path the app uses.** Returns 200. |
| API (direct host) | https://api.onservice.ph | Returns 403 directly (IP allowlist / not the app path). Don't test the API here; use the same-origin path above. |
| Feedback page | https://app.onservice.ph/feedback | Public UX feedback form. Demo gate password is `12345`, user `tester`. |
| Also wired | https://www.onservice.com.ph | Works. The bare apex `onservice.com.ph` does NOT (GoDaddy DNS gap — pending). |

**Demo / straight-in entry** (one-tap into a role for testing): the app supports
`/?demo=customer` (and provider/admin variants) and `?view=mobile` / `?view=desktop`
to force a layout. Login uses phone + OTP; **dev OTP `000000`** works when the
server runs with `ALLOW_DEV_OTP=1` (staging mode). Confirm the current entry
links by reading `apps/mobile/app/index.tsx` and `apps/mobile/app/auth/login.tsx`.

---

## 4. Current state (as of commit 94f3139, 2026-06-29)

**Local = GitHub = server are all in sync at commit `94f3139` on `master`.** Clean
working tree. Apply this as the source of truth and re-verify (see audit below).

Test suites (all green at this commit):
- API: ~278 jest suites / ~3025 tests. Run: `cd packages/api && npx jest`
- Mobile: 170 jest suites / 699 passing + 88 `it.todo`. Run: `cd apps/mobile && npx jest`
- Admin: 45 vitest files. Run: `cd apps/admin && npx vitest run`
- **You must run BOTH `npx tsc --noEmit` AND the jest/vitest suite per app before
  pushing.** tsc alone is not enough — CI gates the mobile jest render suite. If
  a screen uses a new React Native API/hook, add it to
  `apps/mobile/__mocks__/react-native.js` or the mobile suite breaks.

### What shipped recently (the "D27" program — variable pricing, projects, CRM)
All of these are built, tested, deployed, and live:
- **Phase 1** — custom-quote lead discovery (requests now reach matched providers)
- **Phase 2** — per-subcategory structured intake forms (admin defines questions
  like "area in sqm", "door material"; customer answers; provider sees them)
- **Phase 3** — itemized parts/materials line items on change orders (server sums
  them; customer + admin see the breakdown)
- **Phase 4** — per-unit pricing (₱X/sqm rate + estimate; routes to quote flow)
- **Phase 4b** — **hourly pricing** (capped pre-authorization; customer authorizes
  estimate×rate into escrow, billed for actual server-clocked time capped at the
  estimate, remainder refunded; the 24h auto-confirm worker was patched to settle
  hourly correctly)
- **Phase 5** — project layer for big multi-stage jobs (milestones, material
  selections, documents, progress). **Money does NOT move per milestone yet** —
  that's escalated (see §6).
- **Phase 7 + 7b** — provider CRM: client book, client notes, follow-up reminders
  (daily scheduler fires them), reusable quote templates (one-tap into the quote
  builder), per-category performance insights.

Migrations 140–145 belong to this program. Decision files documenting the choices
are in `.ai-coder/decisions/D27*.md`.

---

## 5. FULL AUDIT — run this across all three environments

The founder wants a complete audit of local, GitHub, and the server/database.
Do all of it and report findings in plain English, leading with anything broken.

### 5.1 Sanity / three-way sync
```
# Local
cd <repo>; git fetch origin; git status; git rev-parse --short HEAD
git log --oneline -15
# GitHub vs local
git rev-parse --short origin/master      # must equal local HEAD
gh run list --branch master --limit 5    # CI must be green on the tip
# Server vs local
ssh ... root@5.78.143.185 'cd /opt/onservice && git rev-parse --short HEAD'  # must equal local HEAD
```
Confirm all three short hashes match. If the server is behind, that's a deploy
gap — note it.

### 5.2 Codebase audit (local)
- `cd packages/api && npx tsc --noEmit && npx jest`
- `cd apps/admin && npx tsc --noEmit && npx vitest run`
- `cd apps/mobile && npx tsc --noEmit && npx jest`
- Grep for fake tests (these patterns are banned): `expect(existsSync(` and
  `.match(/Bug` used as assertions. Any hit is a real finding.
- Read `LAUNCH-LIMITATIONS.md` and the `.ai-coder/escalations/` + `.ai-coder/decisions/`
  folders to understand known-open items.
- Check the money path is server-canonical: no route should accept a `price`/
  `amount` from the client for a booking (only `addonId`+`quantity`, `estimatedHours`,
  line items that the server re-totals). Verify `packages/api/src/services/booking/pricing.service.ts`
  and `escrow.service.ts` conservation guards still fire.

### 5.3 Server audit
```
ssh ... root@5.78.143.185
cd /opt/onservice
docker compose -f docker-compose.prod.yml ps        # all services Up/healthy?
docker compose -f docker-compose.prod.yml logs --tail=200 api   # any errors?
df -h ; free -m                                     # disk + memory headroom
```
- Confirm the API container is running the latest source: it runs `tsx src/...`
  from the image; rebuild is `docker compose -f docker-compose.prod.yml up -d --build api`.
- Confirm nginx serves the latest web bundles (the bundle filenames are hashed;
  check `app.onservice.ph` loads and the admin loads).

### 5.4 Database audit
```
DBC=$(docker compose -f docker-compose.prod.yml ps -q postgres)
# Applied schema vs migration files: spot-check the latest tables/columns exist
docker exec -i "$DBC" psql -U onservice_user -d onservice -c "\dt" | head -60
# Verify the D27 tables landed:
docker exec -i "$DBC" psql -U onservice_user -d onservice -c "\d subcategory_intake_fields"
docker exec -i "$DBC" psql -U onservice_user -d onservice -c "\d change_order_line_items"
docker exec -i "$DBC" psql -U onservice_user -d onservice -c "\d projects"
docker exec -i "$DBC" psql -U onservice_user -d onservice -c "\d provider_quote_templates"
docker exec -i "$DBC" psql -U onservice_user -d onservice -c "SELECT column_name FROM information_schema.columns WHERE table_name='bookings' AND column_name LIKE '%hour%';"
# Money sanity: are there orphaned escrows / negative wallet balances?
docker exec -i "$DBC" psql -U onservice_user -d onservice -c "SELECT count(*) FROM wallets WHERE available_balance < 0 OR pending_balance < 0;"
docker exec -i "$DBC" psql -U onservice_user -d onservice -c "SELECT status, count(*) FROM bookings GROUP BY status;"
```
- **Read-only audit only.** Do NOT insert/update test rows on the live DB. If you
  must test writes, do it on the local Docker DB. Any production-data change is a
  hard stop — ask Ken first. (The host's auto-classifier will also block live DB
  writes.)
- Confirm migration files 001–145 are all reflected in the schema; flag any drift.

---

## 6. Open items, escalations, and things to double-check

Read each of these files — they are the live "needs a human" list:

| File | What it is | Status |
|---|---|---|
| `.ai-coder/escalations/E10-customer-fees-and-service-guarantee-2026-06-28.md` | The ₱10,000 service guarantee + fee policy needs an attorney | OPEN — attorney |
| `.ai-coder/escalations/E11-paymongo-live-keys-on-open-test-box-2026-06-28.md` | Don't put live PayMongo keys on the open test box until cutover | OPEN — ops |
| `.ai-coder/escalations/E12-milestone-escrow-fund-holding-2026-06-29.md` | **Per-milestone project escrow** holds customer funds for weeks → may need BSP e-money/escrow licensing. Designed + money-safe but NOT built pending legal sign-off | OPEN — hard stop, legal |
| `.ai-coder/escalations/E13-calls-video-infra-2026-06-29.md` | **In-app calls/video**: needs paid infra (LiveKit+coturn, bigger box), firewall UDP ports, DNS, and a fresh EAS NATIVE build (no OTA). App scaffolding can land behind a `CALLS_ENABLED` flag once Ken greenlights | OPEN — Ken infra |
| `.ai-coder/decisions/D27p4-hourly-pricing.md` | Hourly — DECIDED + BUILT. Confirm policy: overage past the estimate is unpaid unless a change order is raised; 1h-min / 30-min increments | Confirm with Ken |
| `.ai-coder/decisions/D27p5-milestone-escrow.md` + `D26-calls-video-provider.md` | The design context for E12 / E13 | Reference |

**Pending / launch-blocking (from `CLAUDE.md` and memory):**
- F#3 Maestro mobile baselines (84 YAML flows committed; the baseline PNGs need a
  simulator/emulator session). F#4 admin Playwright baselines are DONE.
- F#10 final attorney-reviewed legal disclaimer wording (interim wording in prod;
  CI guard active).
- 12 D14 operational items before `v1.0.0-launch-ready` (NPC DPO registration,
  BIR ATP, PayMongo live mode, S3 Object Lock, Postgres PITR, DNS+TLS). Runbook:
  `docs/runbooks/launch-cutover.md`.
- `.com.ph` bare apex DNS (GoDaddy) — `www` works, apex doesn't.

**Things worth double-checking during your audit:**
- Hourly end-to-end on the local stack: create an hourly subcategory in admin →
  book it as a customer (hours stepper) → as provider start + complete → confirm
  as customer → verify the provider was paid on actual hours and the customer got
  the remainder refunded in `wallet_transactions`. (The unit math is tested; an
  end-to-end smoke is still worth doing.)
- Reminders firing: the BullMQ daily job `provider-reminders-fire` is registered
  in `packages/api/src/jobs/workers.ts`. Confirm it's in the live scheduler queue.
- Responsive sweep (ongoing): list screens reflow to 2 columns on tablet/desktop;
  **form/detail screens still need centering on wide desktop**. See
  `apps/mobile/src/utils/responsive.ts` + `useResponsive`. Finish the sweep.

---

## 7. Review every major thing Ken asked for (verify each was done right)

These are the founder's asks across the engagement. For each, confirm it's
actually working in the code + live, not just claimed. Most are DONE; a few are
escalated. **Do not take "done" on faith — verify.**

1. **Integration inventory** (maps, payments, SMS, push, storage) — documented in
   memory (`reference_integration_inventory`). Email is NOT built; payouts + KYC
   are manual; SMS (Semaphore) is the only login path; maps + PayMongo + push are
   wired. Verify each integration's status.
2. **Internal communication customer↔provider↔admin:**
   - Chat — DONE + live. Verify customer + provider chat screens + sending.
   - Admin chat moderation (read, flagged queue, redact) — DONE + live.
   - User report-message (long-press a message → report) — DONE.
   - **Calls + video** — designed, NOT built → escalation E13. This includes the
     "remote expert help / live camera diagnosis" idea (e.g. customer shows a
     tripped breaker over video). It's all gated on E13.
3. **Variable pricing / custom quotes / parts & materials (the D27 program):**
   - Per-subcategory intake (photos, video, measurements, material types, color
     codes via custom fields) — DONE (Phase 2). The intake-fields engine is how
     "color codes / material types / measurements" get captured per service.
   - Itemized change orders for special parts — DONE (Phase 3).
   - Pricing models: per-sqm / per-unit — DONE (Phase 4); hourly — DONE (Phase 4b);
     one-time/fixed — already existed; **milestones** — tracking DONE (Phase 5),
     **money per milestone escalated** (E12).
   - Provider area "like a CRM with value per category" — DONE (Phase 7/7b:
     client book, notes, reminders, quote templates, per-category insights). The
     "value-added per category" could go further (playbooks, pipeline) — see
     `.ai-coder/decisions/D27p7-provider-crm.md`.
4. **Projects** (home building, interior design, roof, condo complexes, blueprints,
   project management, milestones, selections like door type/colors/materials) —
   tracking layer DONE (Phase 5: projects + milestones + selections + documents).
   Per-milestone escrow money flow is E12.
5. **Remove customer fees + add rewards + ₱10k protection + escrow assurance** —
   fees removed (migration 137, customer service fee = 0); rewards + escrow
   assurance shipped; **₱10k guarantee terms need an attorney** (E10).
6. **Quality + vetting SOP** baked into signup / admin / reviews / notifications —
   DONE. Low ratings (≤2) trigger a provider quality-standing notification; an
   in-app Provider Standards screen exists.
7. **D25 admin PII masking** (mask customer/provider phone+email for non-super_admin,
   audit-logged reveal) — DONE + live.
8. **Responsive phone/tablet/desktop** — foundation DONE; list screens reflow;
   form/detail centering on desktop still pending (finish it).
9. **Session-integrity audit + "fix anything pre-existing, even cosmetic"** — a
   7-agent audit ran; findings fixed. Worth re-running a fresh audit (this is part
   of §5).
10. **Keep local = GitHub = server in sync, ready for users** — currently true at
    `94f3139`. Maintain this after every change.

---

## 8. NEW FEATURE TO BUILD — in-home beauty / grooming / salon services

Ken wants to add **onsite / in-home personal-care services**. The catalog is
data-driven (managed in the admin **Catalog** page: categories → subcategories →
add-ons, plus the D27 intake-fields per subcategory), so most of this is data
entry + intake-field config, not new code — but confirm the booking flow handles
these cleanly and add code only where needed (e.g. category icons, any
gender/duration nuances).

Proposed structure (refine with Ken):

**Category: "Beauty & Grooming (In-Home)"** — subcategories:
- **Haircut — Men / Barber** (fade, trim, beard trim, kids' haircut)
- **Haircut — Women** (cut, trim, blow-dry/styling)
- **Hair Color** (root touch-up, full color, highlights/balayage) — intake fields:
  current hair color, target color, **color code/brand**, hair length, allergy notes
- **Rebonding / Hair Straightening / Keratin** — intake: hair length, hair type,
  previous treatments
- **Hair Spa / Treatment**
- **Manicure** (regular, gel, removal) — intake: nail length, gel/regular, design notes
- **Pedicure** (regular, gel, foot spa)
- **Manicure + Pedicure combo**
- **Eyelash extensions / Lash lift**
- **Eyebrow threading / shaping / tint**
- **Waxing** (various areas) — handle discreetly; consider gender-of-provider
  preference as an intake/booking option
- **Makeup** (everyday, event/bridal) — intake: occasion, look reference photo
- **Massage / Spa (in-home)** if Ken wants it (separate from beauty)

Notes for building it well:
- Most of these are **fixed-price** or **per-service** with optional add-ons; some
  (hair color, rebonding, bridal makeup) are good candidates for the **quote** or
  **per-unit/hourly** flow since price depends on hair length/condition. Use the
  pricing models already built (Phase 4/4b).
- Use the **intake-fields engine (Phase 2)** for hair length, current/target
  color + color code, allergy notes, reference photos (the photo-upload path
  already exists). This is exactly what that engine was built for.
- Consider a **provider gender preference** option for personal-care bookings
  (some customers will want a same-gender provider) — check if the booking/intake
  layer can express this; add it if not.
- Vetting matters more here (in-home personal care) — make sure these providers
  go through the existing vetting + standards flow.
- Add tasteful category icons/tints (see `getCategoryTint` in the mobile theme).
- These are services people book in their home, so the existing address + schedule
  + escrow flow applies unchanged.

Suggested approach: add the categories/subcategories + intake fields via the admin
Catalog page (or a seed migration `146_seed_beauty_services.sql` if Ken wants them
version-controlled), wire icons, smoke-test booking one of each pricing type, and
confirm they appear in `/catalog/full` (remember to bust the catalog Redis cache
after — §2.5).

---

## 9. How to continue (deploy procedure + gotchas)

**Standard change → ship loop (matches how this project is run):**
1. Make the change. Run `tsc --noEmit` AND the test suite for each app you touched.
2. New money-path or schema change → use a topic branch + PR; otherwise push
   straight to master. CI must go green (`gh run list`).
3. If you added a migration: it's hand-applied. Number it next-free (146+).
   Additive only (no drops/renames on tables with data) unless Ken approves.
4. Deploy:
   - Sync server source: `ssh ... 'cd /opt/onservice && git fetch origin && git reset --hard origin/master'`
   - Apply any new migration (psql, see §2.4).
   - Rebuild API if backend changed: `docker compose -f docker-compose.prod.yml up -d --build api`
   - Rebuild + ship web bundles if frontend changed:
     - Admin: `cd apps/admin && npm run build` → tar `dist/` → scp → extract in
       place into `/opt/onservice/apps/admin/dist` (rm the contents, keep the dir
       — the inode is bind-mounted into nginx; replacing the dir serves stale).
     - Mobile web: `cd apps/mobile && EXPO_PUBLIC_API_URL=https://app.onservice.ph npx expo export -p web --output-dir dist-web`
       → tar → scp → extract in place into `/opt/onservice/apps/mobile/dist-web`.
       (Note: the API URL resolves to the same-origin `app.onservice.ph`; Metro
       caches the inlined value, so both old and new bundles show that host —
       that's correct.)
   - If catalog output changed, **bust the Redis catalog cache** (§2.5).
5. Verify live (curl the same-origin API path + load the web apps) and confirm
   local = GitHub = server hashes match. Report to Ken in plain English.

**Gotchas that have bitten before:**
- Mobile jest mock: new RN APIs must be added to `apps/mobile/__mocks__/react-native.js`.
- `redis-cli` needs `-a $REDIS_PASSWORD` or it silently no-ops.
- Migration CHECK-constraint amendments on `admin_actions` must anchor the splice
  on `])))` (Postgres re-canonicalizes the per-element cast away).
- `z.record(...)` in this codebase's Zod needs TWO args: `z.record(keySchema, valueSchema)`.
- The server's working dir defaults to `/root`; always `cd /opt/onservice` before
  `docker compose`.

**Where to learn the project deeply:** read `CLAUDE.md` (rules), the
`.ai-coder/decisions/` and `.ai-coder/escalations/` folders (every real decision
and open issue), `docs/operations/` (company handbook + policies), and
`docs/runbooks/launch-cutover.md` (the path to launch).

Begin by running the full audit in §5 and reporting what you find.
