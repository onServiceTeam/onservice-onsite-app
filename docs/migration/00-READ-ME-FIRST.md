# Server Consolidation — READ ME FIRST

**Goal (Ken, 2026-07-17):** end up with ONE server. Everything moves to the keeper.
Contabo and the old Hetzner box get verified, then cancelled.

| Server | IP | What is on it | Fate |
|---|---|---|---|
| Contabo VPS | 144.126.134.77 | Odoo 17 Community + custom code + its Postgres database (the CRM; sends company email; the agents dashboard talks to it) | Migrate to keeper, then cancel |
| Hetzner (old) | 5.78.143.185 | LIVE onservice.ph production (`/opt/onservice`, docker compose: postgres, pgbouncer, redis, api, nginx, certbot, prometheus, grafana) + medclaimspro.com (being built mid-2026-07) | Migrate to keeper, then delete |
| Hetzner (KEEPER) | 46.62.207.225 | agents.onservice.us dashboard, custom MCP app, a stray Odoo install (to be removed), possibly more (inventory pending) | Everything consolidates here |

**Rules for every AI or human touching these servers:**

1. **Never trust the labels above until you have fingerprinted the box.** Run
   `scripts/migration/discover-server.sh` on the server and read the
   FINGERPRINT section. Ken has mixed up "Hetzner 1" and "Hetzner 2" before;
   the script output is the truth, not the nickname.
2. **Nothing gets deleted, cancelled, stopped, or overwritten until its
   replacement is verified working on the keeper AND a burn-in period has
   passed.** Cancelling Contabo/Hetzner-old is the LAST step, weeks after
   cutover, never before.
3. **5.78.143.185 is live production with real customers and real money
   (PayMongo escrow).** Any work on it follows the discipline in
   `CLAUDE.md` and `docs/HETZNER-DEPLOY.md`. Read
   `.ai-coder/escalations/E08-accidental-rm-on-live-server-2026-06-10.md`
   for why we guard every delete.
4. **No secrets in this repo, ever.** Passwords, private keys, API keys and
   .env values live on the servers and in Ken's password manager. These docs
   reference where secrets live, never what they are.
5. On the keeper, every project lives in its own clearly named area with its
   own README, database, and ports. The master map is `/opt/SERVER-MAP.md`
   on the keeper itself (created in phase 1). If you are an AI on that box:
   read it before touching anything.

**Key architecture facts (verified against this repo, 2026-07-17):**

- The onservice.ph app has NO code-level integration with Odoo, 3CX, or
  Discord, and sends no email itself. Those integrations belong to the
  agents.onservice.us dashboard (a separate codebase on the keeper). So
  moving Odoo does not touch this app at all; what it CAN break is the
  dashboard's Odoo connection settings, which must be found and updated
  during discovery on the keeper.
- onservice.ph state that must move: docker volumes `onservice_pgdata_prod`,
  `onservice_redisdata_prod`, `onservice_uploads_data`, plus host files not
  in git: `/opt/onservice/.env`, `nginx/.htpasswd`, `certbot/conf/`,
  `apps/admin/dist/`, `apps/mobile/dist-web/`, `backups/`, and root's
  crontab (nightly 02:00 backup, installed by `scripts/server/04-ops.sh`).
- The stack's own nginx binds host ports 80/443. The keeper already serves
  agents.onservice.us, so port ownership on the keeper is a phase-1 design
  decision (single front proxy routing by hostname).
- PayMongo webhooks arrive by HOSTNAME (`api.onservice.ph/api/v1/webhooks/paymongo`).
  Repointing DNS is enough; no PayMongo dashboard change unless the hostname
  changes. Semaphore SMS is outbound-only; no change needed.
- GitHub Actions deploys use repo secrets `DEPLOY_HOST`/`DEPLOY_USER`/
  `DEPLOY_SSH_KEY`; they must be repointed to the keeper after cutover.
- The nginx api vhost carries a pre-launch gate (`allow 124.105.80.4; deny all;`)
  and the box runs staging flags (`ALLOW_DEV_OTP`, etc. — see E07). Carry
  them over as-is during migration; flipping them is launch-cutover business,
  not migration business.

**The phases** (each has/gets its own numbered doc in this folder):

- Phase 0 — `01-access.md` + run `discover-server.sh` on all three servers.
  Output decides everything below. STOP after this and review with Ken.
- Phase 1 — prepare the keeper: capacity check, docker, directory layout,
  front-proxy design, `/opt/SERVER-MAP.md`.
- Phase 2 — migrate Odoo (Contabo → keeper, target hostname crm.onservice.us),
  parallel-run, verify, leave Contabo untouched.
- Phase 3 — migrate medclaimspro.com.
- Phase 4 — migrate onservice.ph production (maintenance window, final data
  sync, DNS cutover, full post-move audit per the handoff §5 checklist).
- Phase 5 — burn-in (1-2 weeks), off-server final snapshots, THEN cancel
  Contabo and delete the old Hetzner box. Rotate every password that was
  shared in chat during this project. Re-enable/verify backups on the keeper.

**Where the hands-on work runs:** a machine that can SSH to the servers —
Ken's PC (Git Bash / Claude Code desktop) or the GitHub Codespace (the
`SSH_PRIVATE_KEY` secret restores `~/.ssh/onservice_hetzner` on start via
`scripts/dev/restore-ssh.sh`). Claude Code web sessions attached to this
repo CANNOT reach the servers (HTTPS-only sandbox; port 22 blocked) — they
plan and write, they do not execute.
