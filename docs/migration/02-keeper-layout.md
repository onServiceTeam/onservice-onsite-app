# 02 — How the keeper server is organized (46.62.207.225)

This is the rule book for the server we are keeping. Its whole purpose is that
**no human and no AI can ever confuse one project for another** on this box.

## The layout

Every project gets its own top-level directory under `/opt`, its own database,
its own internal port, and its own README. Nothing is shared except the front
door.

```
/opt/
├── SERVER-MAP.md          <- THE INDEX. Read this first, always.
├── agents-dashboard/      <- agents.onservice.us   (already here, DO NOT DISTURB)
│   └── README.md
├── onservice/             <- onservice.ph + onservice.com.ph  (migrated in)
│   └── README.md
├── medclaimspro/          <- medclaimspro.com  (migrated in)
│   └── README.md
└── cochi-loco-pos/        <- restaurant POS, if it exists (migrated in)
    └── README.md
```

(The exact names of what is already on the keeper come from the discovery
report. If the dashboard lives somewhere else already and is working, leave it
where it is and just record its real path in SERVER-MAP.md. Moving working
things for tidiness is not worth the risk.)

## Every project README.md must answer these, in plain English

```markdown
# <project name>
WHAT THIS IS:      one paragraph, what the product does, who uses it
DOMAINS:           every hostname that serves this project
CODE LIVES IN:     absolute path + git remote + branch
HOW IT RUNS:       docker compose file path, or systemd unit, or process manager
INTERNAL PORT:     127.0.0.1:PORT  (the front door proxies to this)
DATABASE:          engine, container name, database name, user, where the password lives
DATA THAT MATTERS: volumes / directories holding data that cannot be rebuilt
BACKUPS:           what is backed up, when, to where, how to restore
DEPLOY:            exact commands to ship a change
DO NOT:            the specific footguns for this project
OWNER CONTACT:     Ken (admin@onservice.us)
```

## The front door (this is the important architectural decision)

Only ONE thing on this server may hold ports 80 and 443: a single host-level
nginx acting as the front door. It terminates SSL for every domain and routes
by hostname to each project on its own local port.

```
internet :443 ──> host nginx (front door, holds all SSL certs)
                    ├── agents.onservice.us    -> 127.0.0.1:<existing port>
                    ├── app/admin/api/www.onservice.ph -> 127.0.0.1:8081
                    ├── medclaimspro.com       -> 127.0.0.1:8082
                    └── pos.<domain>           -> 127.0.0.1:8083
```

Why this way: the onservice.ph stack has its own internal nginx that does a lot
of specific work (serving the admin and mobile web bundles, serving uploads
while blocking KYC documents, rate limiting, per-host security headers). We
keep that container exactly as it is and simply stop it from grabbing the
server's ports 80/443 — it binds `127.0.0.1:8081` instead. One line changes in
`docker-compose.prod.yml`:

```yaml
  nginx:
    ports:
      - "127.0.0.1:8081:80"     # was "80:80" and "443:443"
```

TLS moves up to the front door, so the stack's internal nginx serves plain HTTP
on localhost only. The front door passes the original hostname and client IP
through (`proxy_set_header Host $host; X-Forwarded-For; X-Forwarded-Proto https`).

**Port registry — keep this table current in `/opt/SERVER-MAP.md`:**

| Port (127.0.0.1) | Project | Notes |
|---|---|---|
| 8081 | onservice.ph | stack's internal nginx |
| 8082 | medclaimspro.com | assign at migration |
| 8083 | cochi-loco-pos | assign if it exists |
| existing | agents dashboard | do not change |

Databases stay **separate per project**, each in its own container with its own
volume. Do not merge them into one shared Postgres — a single shared database
server is exactly how one project's mistake takes down another. Isolation is
worth the small extra memory.

## Security posture on this box (verify during discovery, keep it)

- SSH by key only, root login disabled, admin work via a normal user + sudo.
- fail2ban active.
- Firewall (ufw or Hetzner Cloud Firewall, likely both): only 22, 80, 443 open.
- Every project's database bound to `127.0.0.1` or a docker-internal network
  only, never `0.0.0.0`.

Keep all of that. When the onservice stack arrives, its Postgres and Grafana
must stay bound to localhost exactly as they are today.

## Capacity check before migrating anything

Add up the old server's used disk and RAM (from its discovery report) and
compare to the keeper's free disk and RAM. The onservice stack alone runs
8 containers (Postgres/PostGIS, pgbouncer, Redis, API, nginx, certbot,
Prometheus, Grafana). If the keeper is short, resize it in the Hetzner console
**before** migrating (Hetzner resize is a reboot, minutes, and disk can only
grow). Do not start a migration onto a box that will run out of space.
