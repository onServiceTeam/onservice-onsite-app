# Changelog

All notable changes to onService are documented here, in
reverse-chronological order, organised by phase. Sources of truth
remain the per-phase evidence manifests under
`.ai-coder/checkpoints/logs/PHASE-NN/EVIDENCE-MANIFEST.md` and the
phase plans under `.ai-coder/phases/`.

## Phase 13 — Reconciliation & Hardening (in progress)

Reconciliation audit, then four hardening dispatches that close out
debt accumulated across Phases 00-12. Branch:
`phase/13-reconciliation`. Source: `RECONCILIATION-AUDIT.md`.

- Dispatch B — forbidden-pattern reduction across the API (logger
  PII masking, `as any` removals).
- Dispatch C — hCaptcha verification utility, admin password
  opportunistic rehash, `LAUNCH-LIMITATIONS` §11-§12.
- Dispatch E — BIGINT money inventory, N+1 elimination in invoice
  bulk + commission tier, `SAFE-N+1` annotations,
  `LAUNCH-LIMITATIONS` §15-§17.
- Dispatch F — admin a11y sweep (filter inputs, icon-only buttons,
  checkbox htmlFor/id, BARE modal Label+Input refactor),
  `@axe-core/react` dev integration with limitation noted in
  `LAUNCH-LIMITATIONS` §18, doc-tree consolidation under
  `docs/architecture/`, `docs/strategy/`, `docs/ai-coder/`,
  `docs/audits/`, root README/LICENSE/CONTRIBUTING/CHANGELOG,
  design-token sync + `verify-design-tokens.sh`, k6 load gate +
  `perf-budgets.json` + `verify-load.sh`.

## Phase 12 — Launch Readiness

E2E smoke coverage, load-test harness scaffolding, security pass,
deployment runbook (`docs/DEPLOYMENT.md`), security posture doc
(`docs/SECURITY-POSTURE.md`), pre-launch infra checklist
(`INFRA-CHECKLIST.md`).

## Phase 11 — Compliance Centre + Audit Log Depth

NPC consent log, DSR queue and processor (with cooling-off
anonymisation), BIR filing calendar, audit-log diff viewer,
admin-side compliance dashboard.

## Phase 10 — Real-Time Dispatch Console

Socket.io-driven dispatch console; live booking + provider state
streaming into the admin dashboard.

## Phase 09 — Missing Stitch Screens + Marketing Admin

39 missing mobile screens shipped (customer + provider). Marketing
admin (promos, campaigns, channels) added.

## Phase 08 — Financial Dashboard + BIR Compliance

Real reconciliation, sequential OR generation, 2307 PDF generation,
monthly VAT report PDFs, financial admin dashboard.

## Phase 07 — Booking 360 + Dispute Detail

Booking detail view with full evidence package (timeline, photos,
messages, payment history, escrow status). Dispute detail view with
admin actions.

## Phase 06 — Customer 360

Customer detail view with six tabs: profile, bookings, addresses,
payments, support, and audit.

## Phase 05 — Provider 360

Provider detail view with seven tabs: profile, services, schedule,
earnings, reviews, compliance, and audit.

## Phase 04 — Admin Dashboard

Real-data admin dashboard with `recharts`, alert feed, quick
actions.

## Phase 03 — Runtime Configuration

DB-backed, Redis-cached runtime settings with admin UI; commission
rates, fees, escrow timeouts now editable without redeploy.

## Phase 02 — Icon Replacement

73 emoji icons across admin and mobile replaced with `lucide-react`
(admin) and equivalent mobile icons.

## Phase 01 — Design System

Design tokens (`docs/design-system/tokens.json`), icon catalog,
component contracts, and the admin UI primitive layer
(`Button`, `Input`, `Label`, `Dialog`, `Select`, etc.).

## Phase 00 — Bootstrap

Tooling install (lucide-react, design tokens), `.ai-coder/`
governance directory, checkpoint scripts (`verify-master.sh`,
`verify-phase.sh`, etc.), evidence-chain templates.
