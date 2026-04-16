# onService — Philippine Home Services Marketplace

A mobile-first, on-demand home services marketplace for the Philippines. Connects customers with vetted service providers across all categories of residential and commercial on-site services with full escrow payment protection.

## Tech Stack (April 2026 — Latest Stable)

| Layer | Technology | Version |
|-------|-----------|---------|
| Mobile | React Native (Expo managed) | SDK 55 / RN 0.83 |
| Admin Web | React + Tailwind CSS + shadcn/ui | React 19 + Tailwind 4.2 + shadcn v4 |
| Backend | Node.js + Express + TypeScript | Node 24 LTS + Express 5.2 + TS 6.0 |
| Database | PostgreSQL | 18.3 |
| Cache | Redis | 8.6 |
| Payments | PayMongo | Latest |

## Custom Ports (no conflicts guaranteed)

| Service | Port |
|---------|------|
| API Server | 7381 |
| Admin Dashboard | 7382 |
| PostgreSQL | 7383 |
| PgBouncer | 7384 |
| Redis | 7385 |

## Quick Start

```bash
# 1. Copy environment file
cp .env.example .env

# 2. Start PostgreSQL 18 + Redis 8.6
docker compose up -d

# 3. Install dependencies
npm install

# 4. Run database migrations
npm run api:dev
```

## Project Structure

```
onservice-onsite-app/
├── apps/
│   ├── mobile/          # React Native (Expo SDK 55) — customer + provider
│   └── admin/           # React web dashboard — admin panel
├── packages/
│   └── api/             # Node.js 24 + Express 5 backend
├── docker-compose.yml   # Local dev: PostgreSQL 18 + Redis 8.6
└── *.md                 # Specification documents
```

## Specification Documents

1. **COMPLETE-PH-Home-Services-Platform-Specification.md** — Business model, user stories, UI/UX specs
2. **EXPANSION-v2-SDLC-SRS-Infrastructure-Issues.md** — SDLC, SRS, infrastructure scaling
3. **AI-CODER-MASTER-INSTRUCTIONS.md** — AI coder instructions and absolute rules

## Rules

- Currency is ALWAYS ₱ (Philippine Peso) — never $
- English only — no i18n framework (all Philippine apps use English)
- All business values in config files — never hardcoded
- TypeScript strict mode — no `any`, no `@ts-ignore`
- Philippine data only — Filipino names, PH addresses, +63 phone numbers, Asia/Manila timezone
