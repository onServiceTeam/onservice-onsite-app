# Deploying onService PH to a Hetzner server (self-hosted)

This is a step-by-step runbook for standing up a **Hetzner Cloud** server and
letting the AI coder (running on Ken's computer) connect to it over SSH to
deploy and operate the app. It uses the repo's self-hosted production stack
(`docker-compose.prod.yml`: Postgres+PostGIS, pgBouncer, Redis, the API, Nginx,
Certbot/TLS, Prometheus + Grafana).

> **Do this as STAGING first.** Stand the server up, deploy, and let the QA
> team test on it over the internet. Only flip it to true production (real
> PayMongo keys, real customers) after QA passes and the
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

**Secrets rule:** the AI coder will generate non-sensitive config and strong
random values it's allowed to create (database password, JWT signing secret)
directly on the server. It will **not** handle third-party money/identity
secrets — PayMongo keys, SMS gateway key, S3 keys. Ken pastes those into the
server's `.env.production` file himself (in an SSH session the AI coder opens
for him, or via a editor). Never paste those secrets into the chat.

---

## What you need before starting

- A **Hetzner Cloud** account: https://www.hetzner.com/cloud (sign up, add a
  payment method).
- A **domain name** you control (e.g. `onservice.ph`), so we can put it behind
  HTTPS. For staging a subdomain is fine (e.g. `staging.onservice.ph`,
  `api.staging.onservice.ph`). You'll need access to the domain's DNS settings.
- Object storage for uploads + BIR receipts. Options: AWS S3, DigitalOcean
  Spaces, or **Hetzner Object Storage** (all S3-compatible). You can add this
  later; uploads just won't work until it's set.

> **Latency note (be aware):** Hetzner's data centers are in Europe and the US
> (no Asia region today). For a Philippines launch, pick the **US-West
> (Hillsboro)** location for the best latency. It's perfectly fine for staging
> and an early launch; if latency ever becomes a concern at scale, a
> Singapore-based host (DigitalOcean/Vultr/AWS ap-southeast-1) would be lower
> latency. The deploy steps are the same on any of them.

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
   - **Location:** Hillsboro, US-West (best for PH) — or your preference.
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
4. Create `.env.production` from `.env.production.example`, generating the
   safe secrets (DB password, `JWT_SECRET`) and leaving placeholders for the
   ones **you** must paste (PayMongo, SMS, S3 keys).
5. Bring up the stack: `docker compose -f docker-compose.prod.yml up -d`.
6. Run database migrations (`bash scripts/run-migrations.sh`).
7. Provision **HTTPS/TLS** via the built-in Certbot service against your domain.
8. Run the smoke gate and health checks, and confirm the API, admin site, and
   monitoring are up.

You'll be asked, once, to paste the third-party secrets into the server's env
file (the AI coder will open the editor for you). Nothing sensitive goes
through the chat.

---

## Step 6 — Secrets you'll provide (on the server, not in chat)

From `.env.production.example` — the AI coder fills the rest:
- `PAYMONGO_PUBLIC_KEY`, `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`
  (use **test-mode** keys for staging; live keys only at production cutover).
- `SEMAPHORE_API_KEY` (SMS one-time codes).
- `S3_BUCKET` / `S3_REGION` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_ENDPOINT`
  (uploads + BIR receipts).
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

---

## Safety guardrails (important)

- **Staging until ready.** Don't put real customers or live PayMongo keys on
  this server until QA passes and the launch checklist is signed off.
- **Backups before production.** Before real money flows, set up automated
  Postgres backups (e.g. nightly `pg_dump` to object storage + Hetzner
  snapshots). The AI coder will configure this as part of the production
  cutover, not staging.
- **Destructive operations are hard stops.** The AI coder will pause and ask
  before anything that could drop or wipe data on a server that holds real
  data.
- **The firewall stays tight:** only 22/80/443 inbound. Database, Redis, and
  Grafana are reachable only from inside the server.
- **Never commit `.env.production`** or any secret to the repository.
- For real production, consider locking SSH to your home/office IP and
  disabling password login entirely (key-only, which the default Hetzner image
  already does).

---

## TL;DR for Ken

1. Make a Hetzner account + pick a server (Ubuntu 24.04, CPX31, US-West).
2. Let the AI coder generate your SSH key (or run the `ssh-keygen` command above).
3. Paste the **public** key into Hetzner, create the server, open ports 22/80/443.
4. Confirm `ssh root@<IP>` works from your computer.
5. Add DNS A records for your domain → server IP.
6. Tell the AI coder the IP, user, key path, and domain — it deploys the rest.
7. Paste your PayMongo/SMS/S3 keys into the server when asked (use test keys for staging).
