# onService — Philippine Home Services Marketplace

A mobile-first, on-demand home services marketplace for the
Philippines. Connects customers with vetted providers across all
categories of residential and commercial on-site services. Internal wallet and
escrow handling are implemented; external PayMongo authorization remains held
under E14 and the repository is not launch-ready.

---

## Stack (August 2026)

| Layer | Technology | Version |
|---|---|---|
| Mobile | React Native (Expo managed) | SDK 55 / RN 0.83 |
| Admin Web | React + Tailwind CSS + shadcn/ui | React 19 + Tailwind 4.2 + shadcn v4 |
| Backend | Node.js + Express + TypeScript | Node 24 LTS + Express 5.2 + TS 6.0 |
| Database | PostgreSQL + PostGIS | 17 + PostGIS 3.5 in production and the supported local stack |
| Cache / queues | Redis | 8.6 |
| Payments | PayMongo | Integration present; external authorization disabled pending E14 |

## Custom ports (collision-free)

| Service | Port |
|---|---|
| API Server | 7381 |
| Admin Dashboard | 7382 |
| PostgreSQL | 7383 |
| PgBouncer | 7384 |
| Redis | 7385 |

## Quick start

Install dependencies, copy the environment template to `.env`, then start the
supported Docker development stack. The startup script builds the API, starts
PostgreSQL 17 + PostGIS, PgBouncer, Redis, MinIO, MailHog, Prometheus, and
Grafana, runs migrations, and loads local demo data.

```powershell
# Windows PowerShell
npm install --legacy-peer-deps
Copy-Item .env.example .env
./scripts/dev/up.ps1
```

```bash
# macOS or Linux
npm install --legacy-peer-deps
cp .env.example .env
./scripts/dev/up.sh
```

In separate terminals:

```bash
npm run admin:dev      # http://localhost:7382
npm run mobile:start   # opens Expo
```

## Project structure

```
onservice-onsite-app/
├── apps/
│   ├── admin/                # React 19 + Tailwind 4 admin panel
│   └── mobile/               # Expo Router customer + provider apps
├── packages/
│   ├── api/                  # Node 24 + Express 5 backend
│   └── shared/               # Cross-target types + utils
├── docs/
│   ├── architecture/         # SPEC, EXPANSION, RUNTIME-CONFIG, ADMIN-SPEC, MOBILE-SPEC, DESIGN-CONTRACT
│   ├── strategy/             # STRATEGY, MARKETING-PLAYBOOK, COMPLIANCE, INSURANCE
│   ├── ai-coder/             # AI-CODER-PROMPT, KEN-WORKFLOW, HONEST-AUDIT
│   ├── audits/               # Historical code audits
│   ├── design-system/        # tokens.json, icon catalog, component contracts
│   ├── DEPLOYMENT.md
│   ├── SECURITY-POSTURE.md
│   └── MONEY-HANDLING.md
├── .ai-coder/                # Phase governance + verify-*.sh checkpoints
├── docker-compose.yml        # Legacy minimal compose; use scripts/dev/up.*
├── LAUNCH-LIMITATIONS.md     # Intentional v1 caveats
├── INFRA-CHECKLIST.md        # Pre-launch infra gate
├── CONTRIBUTING.md
├── CHANGELOG.md
├── LICENSE
└── README.md
```

## Where to read next

- Founder / QA reviewer workflow: [docs/ai-coder/KEN-WORKFLOW.md](docs/ai-coder/KEN-WORKFLOW.md)
- Canonical agent prompt: [docs/ai-coder/AI-CODER-PROMPT.md](docs/ai-coder/AI-CODER-PROMPT.md)
- Product spec: [docs/architecture/SPEC.md](docs/architecture/SPEC.md)
- Admin panel spec: [docs/architecture/ADMIN-SPEC.md](docs/architecture/ADMIN-SPEC.md)
- Mobile app spec: [docs/architecture/MOBILE-SPEC.md](docs/architecture/MOBILE-SPEC.md)
- Runtime configuration: [docs/architecture/RUNTIME-CONFIG.md](docs/architecture/RUNTIME-CONFIG.md)
- Design contract: [docs/architecture/DESIGN-CONTRACT.md](docs/architecture/DESIGN-CONTRACT.md)
- Money handling: [docs/MONEY-HANDLING.md](docs/MONEY-HANDLING.md)
- Security posture: [docs/SECURITY-POSTURE.md](docs/SECURITY-POSTURE.md)
- Deployment runbook: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- Pre-launch infra checklist: [INFRA-CHECKLIST.md](INFRA-CHECKLIST.md)
- Intentional v1 limitations: [LAUNCH-LIMITATIONS.md](LAUNCH-LIMITATIONS.md)
- Phase-by-phase changelog: [CHANGELOG.md](CHANGELOG.md)

## Repo rules (non-negotiable)

- Currency is ALWAYS `₱` (Philippine Peso) — never `$`.
- English only — no i18n framework.
- All business values live in config files — never hardcoded.
- TypeScript strict mode. No `any`, no `@ts-ignore`, no
  `as unknown as X` narrowing tricks.
- Philippine data only — Filipino names, PH addresses, `+63` phone
  numbers, `Asia/Manila` timezone.
- BIGINT money columns are coerced to JS `Number` at the pg-types
  layer; see [docs/MONEY-HANDLING.md](docs/MONEY-HANDLING.md) for the
  ceiling and trade-offs.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch model, commit
prefix convention, and the PR checklist.

## Licence

Proprietary. See [LICENSE](LICENSE).
