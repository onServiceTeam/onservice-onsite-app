# Server Consolidation — READ ME FIRST

**Goal (Ken, 2026-07-17):** get everything onto ONE server to cut costs, without
breaking anything. The old server is decommissioned only after the new one is
proven.

| Server | IP | What is on it | Fate |
|---|---|---|---|
| Hetzner OLD | 5.78.143.185 | LIVE onservice.ph + onservice.com.ph production (`/opt/onservice`, docker compose: postgres, pgbouncer, redis, api, nginx, certbot, prometheus, grafana) · medclaimspro.com · possibly a Cochi Loco restaurant POS · possibly more | Migrate everything off, then delete |
| Hetzner KEEPER | 46.62.207.225 | agents.onservice.us dashboard and other working apps. Hardened: key-only SSH, root login disabled, admin user + sudo, fail2ban | Everything consolidates here |
| Contabo | 144.126.134.77 | Odoo 17 Community CRM (`crm.onservice.us`) | Separate, later project. Not part of this migration unless Ken says so |

## Rules for every human or AI touching these servers

1. **Fingerprint before you trust a label.** Run
   `scripts/migration/discover-server.sh` and read its FINGERPRINT section.
   Nicknames like "server 1" and "server 2" have been mixed up before; the
   script output is the truth.
2. **Nothing on the keeper that already works may be disturbed.** The agents
   dashboard and its neighbours keep their directories, databases, domains, and
   ports. Migrated apps get their own separate space (`02-keeper-layout.md`).
3. **Delete nothing until its replacement is verified AND a burn-in period has
   passed.** Decommissioning is the last step, at least 14 days after cutover
   (`06-decommission.md`).
4. **5.78.143.185 is live production with real customers and real money**
   (PayMongo escrow). Follow `CLAUDE.md` discipline. Read
   `.ai-coder/escalations/E08-accidental-rm-on-live-server-2026-06-10.md` for
   why every delete is guarded.
5. **No secrets in this repo, ever.** Passwords, keys, and `.env` values live on
   the servers and in Ken's password manager. These docs say where secrets
   live, never what they are.
6. On the keeper, `/opt/SERVER-MAP.md` is the index of every project. Read it
   before touching anything on that box.

## Where the domains point today (verified 2026-07-17)

Everything for onservice and medclaimspro sits on the old server; only the
agents dashboard is already on the keeper.

| Domain | Points at |
|---|---|
| onservice.ph, www, app, admin, api | 5.78.143.185 (old) |
| onservice.com.ph, www, app, admin | 5.78.143.185 (old) |
| medclaimspro.com, www | 5.78.143.185 (old) |
| agents.onservice.us | 46.62.207.225 (keeper) |
| crm.onservice.us | 144.126.134.77 (Contabo Odoo) |
| onservice.us, www | 50.87.146.164 (HostGator shared hosting, unrelated) |

Eleven A-records move to the keeper. Nothing needs re-registering and no SSL
needs buying; Let's Encrypt issues free certificates that renew themselves
(`05-dns-godaddy-cutover.md`).

## Facts verified against this codebase (so nobody re-litigates them)

- onservice.ph has **no** code-level integration with Odoo, 3CX, or Discord,
  and sends no email itself. It uses PayMongo (payments), Semaphore (SMS/OTP),
  Expo (push), and Sentry. So moving it does not disturb the Odoo server, and
  vice versa.
- Its irreplaceable data is three docker volumes: `onservice_pgdata_prod`
  (database), `onservice_uploads_data` (all photos and KYC documents — S3 is
  disabled, this is the only copy), `onservice_redisdata_prod` (sessions and
  job queue).
- Files that are NOT in git and exist only on that server: `/opt/onservice/.env`,
  `nginx/.htpasswd`, `certbot/conf/`, `apps/admin/dist/`,
  `apps/mobile/dist-web/`, `backups/`, and root's nightly backup crontab.
- PayMongo webhooks arrive by hostname
  (`https://api.onservice.ph/api/v1/webhooks/paymongo`), so a DNS repoint is
  enough — no PayMongo dashboard change if the hostname stays the same.
  Semaphore SMS is outbound only.
- GitHub Actions deploys target repo secrets `DEPLOY_HOST`/`DEPLOY_USER`/
  `DEPLOY_SSH_KEY`; these must be repointed at the keeper after cutover.
- The nginx api vhost carries a pre-launch gate (`allow 124.105.80.4; deny all;`)
  and the box runs staging flags (see escalation E07). Carry them across
  unchanged. Turning them into real production settings is launch-cutover work,
  a separate decision, not part of moving servers.

## The documents in this folder

| Doc | What it covers |
|---|---|
| `01-access.md` | How to log into each server, and how to run the inventory |
| `02-keeper-layout.md` | How the keeper is organized so nothing gets confused; the single front door for ports 80/443 |
| `03-onservice-migration.md` | The full onservice.ph move, rehearsal first, then cutover, then verification |
| `04-medclaims-and-pos-migration.md` | The pattern for medclaimspro.com and the possible POS |
| `05-dns-godaddy-cutover.md` | Exact GoDaddy steps, TTL handling, and SSL issuance |
| `06-decommission.md` | The gate that must be met before deleting the old server, final backups, and password rotation |

## Order of work

1. Run `discover-server.sh` on **both** servers. Read both reports with Ken.
   Decide what moves, what gets archived, what is dropped. **Stop here for
   Ken's sign-off.**
2. Prepare the keeper (`02`): capacity check, front door, directory layout,
   `/opt/SERVER-MAP.md`.
3. Migrate the smallest thing first (likely the POS, or medclaimspro) to prove
   the pattern on something low-risk.
4. Migrate medclaimspro.com.
5. Migrate onservice.ph last, since it is the highest risk and benefits from
   the practice.
6. Burn in for two weeks, then decommission (`06`) and rotate passwords.

## Where the hands-on work runs

A machine that can SSH to the servers: Ken's PC (Git Bash or Claude Code
desktop) or the GitHub Codespace (`scripts/dev/restore-ssh.sh` restores the key
from the `SSH_PRIVATE_KEY` secret at start). Claude Code **web** sessions
attached to this repo run in a sandbox with no route to the servers (port 22
blocked, outbound limited to GitHub) — they plan and write documents, they
cannot execute against the servers.
