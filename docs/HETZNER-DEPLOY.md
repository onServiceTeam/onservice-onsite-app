# Deploying onService PH to a Hetzner server (self-hosted)

This is a step-by-step runbook for standing up a **Hetzner Cloud** server and
letting the AI coder (running on Ken's computer) connect to it over SSH to
deploy and operate the app. It uses the repo's self-hosted production stack
(`docker-compose.prod.yml`: Postgres+PostGIS, pgBouncer, Redis, the API, Nginx,
Certbot/TLS, Prometheus + Grafana).

> **Do this as STAGING first.** Stand the server up, deploy, and let the QA
> team test on it over the internet. Only flip it to true production after QA passes and the
> `docs/runbooks/launch-cutover.md` items are signed off. The steps are
> identical either way.

---

## How "connecting the AI coder" actually works

The AI coder runs on Ken's computer and drives a terminal there. It operates a
remote server the normal way: by running `ssh` commands from Ken's machine to
the server. So "connecting" means three things:

1. A Hetzner server exists and is reachable.
2. Ken's computer can SSH into it **with a key** (no password prompts).
3. Ken tells the AI coder the server's **IP address and SSH user**.

After that, the AI coder can install Docker, pull the code, deploy the stack,
run migrations, configure TLS, and check logs — all over SSH.

**Secrets rule:** production values belong only in `/opt/onservice/.env`, with
mode 600, or in an approved secret manager. The tracked examples contain names
and placeholders only. Do not print secrets in logs, chat, command output, or
Git. When a third-party credential must be installed, edit it directly on the
server and verify only presence or a masked prefix.

---

## What you need before starting

- A **Hetzner Cloud** account: https://www.hetzner.com/cloud (sign up, add a
  payment method).
- A **domain name** you control (e.g. `onservice.ph`), so we can put it behind
  HTTPS. For staging a subdomain is fine (e.g. `staging.onservice.ph`,
  `api.staging.onservice.ph`). You'll need access to the domain's DNS settings.
- No third-party object storage is required for launch uploads. The production
  stack uses the external `onservice_uploads_data` Docker volume on the Hetzner
  server, which is included in the backup job. S3-compatible object storage is
  an optional later migration, not a prerequisite.

> **Latency note:** Hetzner Cloud has offered a Singapore location since August
> 2024. For a new Philippines deployment, choose **Singapore** unless a tested
> legal, resilience, or existing-infrastructure requirement points elsewhere.
> The current shared server is an existing deployment and is not moved by this
> runbook correction. Source: https://www.hetzner.com/pressroom/new-location-singapore/

---

## Step 1 — Create your SSH key (on your computer)

The AI coder can generate this for you. It creates a private key (stays on your
computer, secret) and a public key (you give to Hetzner). If you'd rather do it
yourself, in PowerShell:

```powershell
ssh-keygen -t ed25519 -C "onservice-hetzner" -f $env:USERPROFILE\.ssh\onservice_hetzner
```

Press Enter through the prompts (a passphrase is optional). This makes:
- `C:\Users\<you>\.ssh\onservice_hetzner`  ← private key (keep secret, never share)
- `C:\Users\<you>\.ssh\onservice_hetzner.pub`  ← public key (paste into Hetzner)

---

## Step 2 — Create the Hetzner server

In the Hetzner Cloud Console (https://console.hetzner.cloud):

1. Create a **Project** (e.g. "onService").
2. **Security → SSH Keys → Add SSH Key** → paste the contents of your
   `onservice_hetzner.pub` file. Name it (e.g. "Ken laptop").
3. **Servers → Add Server**:
   - **Location:** Singapore (lowest-latency Hetzner region for the Philippines)
     unless your deployment requirements dictate another region.
   - **Image:** Ubuntu 24.04.
   - **Type:** start with **CPX31** (4 vCPU / 8 GB RAM / 160 GB) for staging or
     a small launch. You can resize up later without rebuilding.
   - **SSH key:** select the key you added in step 2.
   - **Firewall:** create one allowing inbound **22 (SSH)**, **80 (HTTP)**,
     **443 (HTTPS)** only. (Postgres, Redis, Grafana stay internal.)
   - **Name:** `onservice-staging`.
   - Create it. Note the **public IP address** it gives you.

---

## Step 3 — Verify you can connect (from your computer)

In PowerShell:

```powershell
ssh -i $env:USERPROFILE\.ssh\onservice_hetzner root@<SERVER_IP>
```

The first time it asks to trust the host — type `yes`. You should land in a
shell prompt on the server (e.g. `root@onservice-staging:~#`). Type `exit` to
return. **If this works, the connection is ready.**

(Optional, so you don't type the key path every time — the AI coder can add a
`~/.ssh/config` entry named `onservice-staging` pointing at the IP + key.)

---

## Step 4 — Point your domain at the server (DNS)

In your domain's DNS settings, add **A records** pointing at the server IP:
- `api.staging.onservice.ph` → `<SERVER_IP>`
- `admin.staging.onservice.ph` → `<SERVER_IP>` (if hosting the admin site there)

DNS can take a few minutes to a few hours to propagate. TLS (Step 6) needs DNS
working first.

---

## Step 5 — Tell the AI coder, and it takes over

Once SSH works (Step 3), tell the AI coder:
> "The Hetzner server is ready. IP is `<SERVER_IP>`, SSH user `root`, key at
> `~/.ssh/onservice_hetzner`. Domain is `<your domain>`."

From there the AI coder will, over SSH:
1. Harden the box (updates, a non-root deploy user, firewall sanity).
2. Install **Docker + Docker Compose**.
3. Pull the code onto the server (clone the GitHub repo, or copy a release).
4. Create `/opt/onservice/.env` from `.env.production.example`, generating the
   safe secrets (DB password, `JWT_SECRET`) and leaving placeholders for the
   protected third-party values. Run `node scripts/verify-env-contract.mjs`
   against the tracked templates before copying values.
5. Run `scripts/server/02-deploy.sh`; it creates the external uploads volume on
   a verified first install, brings up the data plane, and runs migrations. A
   rerun fails closed if that volume is unexpectedly missing.
6. Provision **HTTPS/TLS** via the built-in Certbot service against your domain.
7. Run the smoke gate and health checks, and confirm the API, admin site, and
   monitoring are up.

You'll be asked, once, to paste the third-party secrets into the server's env
file (the AI coder will open the editor for you). Nothing sensitive goes
through the chat.

---

## Step 6 — Secrets you'll provide (on the server, not in chat)

From `.env.production.example` — the AI coder fills the rest:
- `PAYMONGO_PUBLIC_KEY`, `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`.
  E14 currently requires `EXTERNAL_PAYMENT_AUTHORIZATION_ENABLED=0`; configured
  keys are not authority to enable the invalid hosted redirect.
- `SEMAPHORE_API_KEY` (SMS one-time codes).
- `S3_*` values only if a later, separately tested upload object-storage
  migration is approved. The current production upload backend is the server's
  persistent Docker volume and deliberately forces `S3_BUCKET` empty.
- `AWS_S3_BUCKET`, `AWS_REGION`, and AWS credentials only after launch-cutover
  Item 8's separate BIR receipt-retention backend is approved and provisioned.
- Push (`FCM_*`) and email (`RESEND_API_KEY`) keys, if used.
- `DOMAIN` + `CERTBOT_EMAIL` for TLS (the AI coder sets these with you).

The AI coder generates `JWT_SECRET`, the database password, and
`GRAFANA_ADMIN_PASSWORD` on the server.

---

## Step 7 — Keeping it updated

After the first deploy, shipping a new version is: the AI coder SSHes in,
pulls the latest code, runs the pre-flight checks (typecheck, tests, smoke
gate per `docs/DEPLOYMENT.md`), runs any new migrations, and restarts the API
container. Rollback procedure is in `docs/DEPLOYMENT.md`.

### Frontend (customer/provider web app + admin)

The two web frontends are served by nginx from build artifacts that are
**gitignored** (`apps/mobile/dist-web` and `apps/admin/dist`), so `git pull`
on the server never updates them. They are built locally and transferred:

```
# Customer/provider web app (Expo web export). The API URL must be set at
# build time, otherwise a production build throws (platform.config.ts).
cd apps/mobile
EXPO_OS=web EXPO_PUBLIC_API_URL=https://app.onservice.ph \
  npx expo export -p web --output-dir dist-web --clear
# EXPO_OS=web tells app.config.ts to omit native-only EAS Update and Google Maps
# values. The app URL is intentionally same-origin because nginx proxies /api,
# /socket.io, and /uploads for the browser build. A separately authorized
# controlled-demo build must set EXPO_PUBLIC_DEMO_MODE=1 together with
# EXPO_PUBLIC_DEMO_CUSTOMER_PHONE, EXPO_PUBLIC_DEMO_PROVIDER_PHONE, and
# EXPO_PUBLIC_DEMO_OTP. Verify that the public bundle has app.onservice.ph and
# no "DEV_MISSING", "localhost:7381", or known demo credential.

# Admin (Vite build):
cd apps/admin
VITE_API_URL=https://admin.onservice.ph VITE_DEMO_MODE=0 npm run build

# Transfer (example for the web app):
tar czf /tmp/dist-web.tar.gz -C dist-web .
scp -i ~/.ssh/onservice_hetzner /tmp/dist-web.tar.gz root@<IP>:/tmp/
```

**GOTCHA — bind-mount inode trap.** nginx bind-mounts these paths into the
container. If you *replace* the path (rename the directory via `mv`, or rewrite
a single config file via `git pull`), the container keeps serving the OLD inode
and you get stale content or 404s — an `nginx -s reload` does NOT fix it because
it re-reads the same orphaned inode. Two safe options:

1. **Extract in place** (preserves the directory inode), e.g.
   `tar xzf /tmp/dist-web.tar.gz -C /opt/onservice/apps/mobile/dist-web`.
   Current `index.html` references only the new hashed assets, so old hashes
   can remain until a separately reviewed cleanup.
2. **Force-recreate** so the mount re-resolves to the current inode:
   `docker compose -f docker-compose.prod.yml up -d --force-recreate nginx`.

This same trap applies to `nginx/nginx.conf`: after `git pull` rewrites it,
the running container still has the old config until you `--force-recreate nginx`
(a plain reload is not enough). Always verify the live result with
`curl -sI https://app.onservice.ph/_expo/static/js/web/entry-<hash>.js`.

---

## Safety guardrails (important)

- **A staging label is not a payment sandbox.** Keep
  `EXTERNAL_PAYMENT_AUTHORIZATION_ENABLED=0` while E14 is open and never use
  real customer money for QA, even if live credentials happen to be installed.
- **Backups before production.** Before real money flows, set up automated
  Postgres backups (e.g. nightly `pg_dump` to object storage + Hetzner
  snapshots). The AI coder will configure this as part of the production
  cutover, not staging.
- **Destructive operations are hard stops.** The AI coder will pause and ask
  before anything that could drop or wipe data on a server that holds real
  data.
- **The firewall stays tight:** only 22/80/443 inbound. Database, Redis, and
  Grafana are reachable only from inside the server.
- **Never commit `/opt/onservice/.env`, `.env.production`, or any secret** to the repository.
- For real production, consider locking SSH to your home/office IP and
  disabling password login entirely (key-only, which the default Hetzner image
  already does).

---

## TL;DR for Ken

1. Make a Hetzner account + pick a server (Ubuntu 24.04, CPX31, Singapore for a new Philippines deployment).
2. Let the AI coder generate your SSH key (or run the `ssh-keygen` command above).
3. Paste the **public** key into Hetzner, create the server, open ports 22/80/443.
4. Confirm `ssh root@<IP>` works from your computer.
5. Add DNS A records for your domain → server IP.
6. Tell the AI coder the IP, user, key path, and domain — it deploys the rest.
7. Install only the protected credentials required for the approved environment. Keep external payments held under E14 and leave S3 blank while the persistent uploads volume is the active backend.
