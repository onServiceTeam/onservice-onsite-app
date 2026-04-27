# onService PH — Complete AI Coder Package

**For:** Ken
**Date:** April 27, 2026
**Repo:** https://github.com/onServiceTeam/onservice-onsite-app
**Last verified commit:** `322330a` (feat(platform): audit fixes - JWT security, GPS enforcement, provider accountability)

---

## What this package is

This is the complete plan for taking your codebase from its current state (substantial backend, 19-page admin panel that looks toy-like, 83 mobile screens with gaps, 39 missing Stitch screens, 271-issue audit) to a production-ready, multi-city, multi-service home-services platform.

It is structured so that you — a non-coder — can hand it to an AI coder (Cursor, Claude Code, Copilot Workspace) phase by phase, and the AI coder is forced into strict self-verification before claiming a phase is done.

## What's in the package

```
repo-root/
├── README-FOR-KEN.md                    ← This file
├── AI-CODER-PROMPT.md                   ← The literal prompt to paste into Cursor
├── KEN-WORKFLOW.md                      ← Your day-to-day workflow as QA reviewer
├── HONEST-AUDIT.md                      ← Where I was wrong + ground truth from codebase
├── STRATEGY.md                          ← Multi-service vs single, city decision, scope
├── ADMIN-SPEC.md                        ← The 18-module commercial-grade admin panel spec
├── MOBILE-SPEC.md                       ← Customer + provider app screen-by-screen spec
├── DESIGN-CONTRACT.md                   ← Design tokens, icon library, component standards
├── MARKETING-PLAYBOOK.md                ← PH-specific marketing with budget and channels
├── COMPLIANCE.md                        ← BIR, NPC, DTI, SEC, Anti-Dummy checklist
├── INSURANCE.md                         ← SiguradoShield + Igloo / Malayan integration plan
│
├── .ai-coder/
│   ├── CONSTITUTION.md                  ← Strict rules the AI coder MUST follow (13 articles)
│   ├── DEFINITION-OF-DONE.md            ← 14+1 conditions; non-negotiable
│   ├── MASTER-QA-SYSTEM.md              ← The 463 explicit checks (THE big one)
│   ├── 100-PERCENT-ACCURACY-PROTOCOL.md ← Six-gate verification system
│   ├── SELF-VERIFICATION-PROTOCOL.md    ← Failure patterns and 14 self-audit Qs
│   ├── ESCALATION-PROTOCOL.md           ← When to stop and ask Ken
│   ├── checkpoints/                     ← 14 verification scripts
│   │   ├── verify-master.sh             ← One-command full validation
│   │   ├── verify-no-forbidden.sh       ← TODO/console.log/any/etc
│   │   ├── verify-no-emoji.sh           ← Emoji as iconography
│   │   ├── verify-no-phantom-tests.sh   ← Fake/skipped tests
│   │   ├── verify-mutation-coverage.sh  ← Stryker mutation testing
│   │   ├── verify-money-conservation.sh ← Sacred money tests
│   │   ├── verify-evidence-manifest.sh  ← Evidence chain validation
│   │   ├── verify-deps.sh               ← Dependency policy
│   │   ├── verify-clean-state.sh        ← Build from fresh clone
│   │   ├── verify-migrations.sh         ← Migration safety
│   │   ├── verify-no-n-plus-1.sh        ← Query pattern detector
│   │   ├── verify-screens.sh            ← Screen inventory
│   │   ├── verify-database.sh           ← Schema integrity
│   │   └── verify-phase.sh              ← Friendly wrapper
│   ├── templates/                       ← Phase log, evidence, honesty, bug, screen
│   └── phases/
│       ├── PHASE-00-bootstrap.md
│       ├── PHASE-01-design-system.md
│   │   ├── PHASE-02-icon-replacement.md
│   │   ├── PHASE-03-runtime-config.md
│   │   ├── PHASE-04-admin-dashboard.md
│   │   ├── PHASE-05-provider-360.md
│   │   ├── PHASE-06-customer-360.md
│   │   ├── PHASE-07-booking-360.md
│   │   ├── PHASE-08-financial-and-bir.md
│   │   ├── PHASE-09-missing-stitch-screens.md
│   │   ├── PHASE-10-real-time-dispatch.md
│   │   ├── PHASE-11-compliance-center.md
│   │   └── PHASE-12-launch-readiness.md
│   ├── checkpoints/
│   │   ├── verify-phase.sh
│   │   ├── verify-money-conservation.sh
│   │   ├── verify-no-emoji.sh
│   │   ├── verify-typecheck.sh
│   │   ├── verify-tests.sh
│   │   ├── verify-screens.sh
│   │   └── verify-database.sh
│   └── templates/
│       ├── PHASE-LOG-TEMPLATE.md
│       ├── BUG-REPORT-TEMPLATE.md
│       └── SCREEN-AUDIT-TEMPLATE.md
│
└── docs/design-system/
    ├── tokens.json                      ← Color, spacing, typography tokens
    ├── icon-catalog.md                  ← The 73 emojis to replace, with lucide replacements
    └── component-contracts.md           ← Reusable component specs
```

## The structure of the work

The plan is **13 phases**, numbered 00 through 12. Each phase is atomic: it has a clear goal, exact file changes, a verification protocol, and a rollback plan. The AI coder MUST complete one phase fully — including self-verification — before starting the next.

**The phases by category:**

| Phase | Purpose | Estimated AI coder time | Your review time |
|---|---|---|---|
| 00 — Bootstrap | Set up tooling, install lucide-react, configure design tokens, create checkpoint scripts | 1 hour | 5 min |
| 01 — Design System | Build the design contract: colors, spacing, typography, icon catalog, component primitives | 4 hours | 30 min |
| 02 — Icon Replacement | Replace all 73 emoji icons with lucide-react across admin and mobile | 3 hours | 30 min |
| 03 — Runtime Config | Make commission rates, fees, escrow timeouts editable from admin (per RUNTIME-CONFIG-SYSTEM-SPEC.md) | 8 hours | 1 hour |
| 04 — Admin Dashboard | Rebuild dashboard with real charts (recharts is installed but unused), alert feed, quick actions | 6 hours | 30 min |
| 05 — Provider 360 | Build the missing provider detail page with 7 tabs | 12 hours | 1 hour |
| 06 — Customer 360 | Build the missing customer detail page with 6 tabs | 8 hours | 30 min |
| 07 — Booking 360 | Build the missing booking detail page with full evidence package | 10 hours | 1 hour |
| 08 — Financial & BIR | Real reconciliation, sequential ORs, 2307 generation, monthly reports | 10 hours | 1 hour |
| 09 — Missing Stitch Screens | Build the 39 mobile screens that are missing per the audit | 30 hours | 3 hours |
| 10 — Real-time Dispatch | Socket.io-driven dispatch console, real-time admin dashboard | 8 hours | 30 min |
| 11 — Compliance Center | NPC consent log, DSR queue, BIR filing calendar, audit log diff viewer | 6 hours | 30 min |
| 12 — Launch Readiness | E2E tests, load tests, security pass, deployment runbook | 6 hours | 1 hour |

**Total AI coder execution time:** ~112 hours of focused work
**Total your review time:** ~10 hours spread across phases
**Calendar time:** 8-14 weeks at a sustainable pace

## How to use this package

### Step 1 — Extract everything to your repo

Copy all files from this package into your repo at the appropriate paths. Commit them in one commit titled `chore: install AI coder execution plan`. The AI coder will read these files when you start each phase.

### Step 2 — Read these three files yourself

In order, before you start any phase:

1. **`HONEST-AUDIT.md`** — what I was wrong about and what's actually in your codebase right now
2. **`STRATEGY.md`** — the city decision, scope decision, what we're actually building
3. **`KEN-WORKFLOW.md`** — your role as QA reviewer, day-to-day

Don't skip these. They will save you from acting on stale assumptions from earlier chats.

### Step 3 — Start Phase 00

Open Cursor or Claude Code in your repo. Start a new session. Paste the entire contents of `AI-CODER-PROMPT.md` into the chat. The AI coder will read the package and start Phase 00.

### Step 4 — Let it work

The AI coder will execute Phase 00, run the verification scripts, and produce a phase log. When it claims "Phase 00 complete," you review the log (5 minutes), check the screen (5 minutes), and either say "approved, proceed to Phase 01" or "rejected, here's what's wrong."

### Step 5 — Repeat for each phase

You spend at most 1 hour reviewing each phase. The AI coder spends 4-12 hours executing each phase. The total calendar time depends on how often you have time to review.

### Step 6 — Launch

After Phase 12, the codebase is launch-ready. You finalize the marketing plan from `MARKETING-PLAYBOOK.md`, finalize providers per `STRATEGY.md`, and go live in Boracay + General Santos City.

## What this package does NOT promise

- **Zero human review.** No AI coder produces zero-defect code on multi-file refactors. You will catch bugs. The verification protocol is designed to catch most before you do, not all.
- **A guaranteed timeline.** Calendar time depends on how fast the AI coder runs and how much time you can give to review. The estimates are realistic but not contractual.
- **A complete replacement for legal/financial advisors.** The compliance and insurance docs are detailed but you should still have a Philippine accountant review BIR setup and a Philippine lawyer review the SEC Beneficial Ownership filing if Ken's residency status is complex.
- **Marketing execution.** The playbook is detailed but actually running ads, building creatives, and managing the Messenger inbox is operational work that needs a human marketing lead.

## What this package DOES guarantee

- **A complete plan.** Every phase, every file, every command, every check. Nothing left as "TBD."
- **Strict verification.** The AI coder cannot mark a phase complete without running all checks and including the log in the commit.
- **Honest scope.** I'm not going to tell you something will work that I don't believe will work. The strategy section is calibrated to what your codebase actually supports.
- **Reconciliation with reality.** This package supersedes every plan I have given you in earlier chats. If something contradicts this, this wins.

---

## What's already true in your codebase (DO NOT have the AI coder redo any of this)

I verified all of this in this session by direct git clone:

- **All 7 critical money bugs are fixed.** Commission uses `service_price` correctly. Wallet UNIQUE supports dual-role. Dispute service imports escrow service. The `escrow-money-conservation.test.ts` passes.
- **Commission rates match spec.** 15% / 13% / 11% / 9% (new / verified / pro / elite). Service fee 10%. Dispute window 48h. Min withdrawal ₱100.
- **Multi-service architecture is real.** `service_categories` and `service_subcategories` tables. `pricing_type` ENUM ('fixed' | 'quote' | 'hourly').
- **Multi-area architecture is real.** `service_areas` table with status workflow (planned → recruiting → soft_launch → active → paused → retired).
- **Pricing rules engine is real.** `pricing_rules` table with rush / holiday / peak_hours types, category and area scoping.
- **All major service files exist.** 39 services, 14,065 lines of TypeScript. Booking, dispute, escrow, commission, provider, customer, B2B, recurring, Suki, referral, etc.
- **All major admin pages exist (19 pages, 6,281 lines).** They just need depth, charts, and the icon replacement.
- **49 SQL migrations are in place.** Up through 049 (provider_cancellation_tracking).
- **21 test files (2,256 lines) including escrow-money-conservation.**

The AI coder is **not** rebuilding these. It is filling specific gaps documented in the phases.

## What's actually missing or thin (these are the phases)

- Provider detail view (7 tabs) — missing
- Customer detail view (6 tabs) — missing
- Booking detail view with evidence package — missing
- Dashboard charts (recharts is installed but unused) — missing
- Real-time dispatch console — missing
- 73 emoji icons across the codebase — to be replaced
- 39 Stitch screens (per the audit) — to be built
- BIR PDF generation — VAT computation exists, no PDF
- Sentry error tracking — missing
- Real audit log diff viewer — backend exists, UI thin
- Map view of service areas — table only
- Export functions on admin tables — missing
- Real provider quality dashboard — missing
- Compliance center (NPC DSR queue, BIR calendar) — missing
- 2FA enforcement on admin login — partial

Everything else is solid. The codebase is genuinely 70-80% there.
