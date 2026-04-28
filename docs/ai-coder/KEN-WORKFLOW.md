# KEN-WORKFLOW — onService Onsite App

This is the consolidated guide for Ken (founder / QA reviewer) and any
AI coding agent working in this repo. It merges the three legacy
top-level files into a single source of truth:

- `START-HERE.md` (orientation + autonomous-execution notes)
- `KEN-WORKFLOW.md` (day-to-day QA review rhythm)
- `README-FOR-KEN.md` (package contents + how to use it)

The canonical agent prompt remains
[`docs/ai-coder/AI-CODER-PROMPT.md`](AI-CODER-PROMPT.md). Paste it into
a fresh agent session before saying "begin Phase NN".

---

## 1. Daily workflow (you, the QA reviewer)

You are not coding. You are running the project. The AI coder writes
the code; you check the screens, read the logs, and decide when each
phase is good enough to merge.

### When the AI coder pings

```
Phase NN — [Title]
Status: PASS
Summary: ...
Files changed: ...
Checkpoint log: .ai-coder/checkpoints/logs/PHASE-NN.log
Screens to review: ...
Next phase: PHASE-NN+1 (pending your approval)
```

### The 5-step review (15-60 min depending on phase)

1. **Read the checkpoint log (5 min).** Open
   `.ai-coder/checkpoints/logs/PHASE-NN.log`. Look at the bottom for
   any FAIL lines, the test-count delta, and confirm typecheck + lint
   are 0 errors.
2. **Read the AI coder's self-audit answers (5 min).** Focus on
   questions 2-5: riskiest line, weakest edge case, the most likely
   2-week-out regression, what the agent almost did but caught itself
   on. Vague answers are a signal — push back.
3. **Click through the screens (5-30 min).**
   - Admin: `localhost:7382` (the admin dev port). Click each new
     screen, try the buttons, submit a form, verify empty/error
     states.
   - Mobile: Expo Go on your phone or the iOS simulator. Same checks.
4. **Spot-check the code (5 min, optional).** Open one changed file.
   Skim for copy-paste errors, "I'm not sure if this works" comments,
   hardcoded test data, or suspiciously short error handling.
5. **Decide.** Either reply "Approved, proceed to Phase NN+1" or
   itemize the issues and tell the AI coder not to start the next
   phase until they're fixed.

### How to know things are healthy

**Good signs:** phase reports include caveats and self-criticism;
tests caught real bugs and were fixed; screen reviews surface things
the AI coder didn't realize; self-audit answers are specific.

**Bad signs:** every phase reports PASS with no flagged issues;
self-audit answers are vague; the AI coder gets defensive; the test
count keeps decreasing or staying flat; lots of new
`// @ts-expect-error` or `// eslint-disable` lines.

If you see bad signs, tell the AI coder: "Re-read the constitution,
specifically Articles 2 and 4. Then re-do the self-audit honestly."

### Time investment per phase (historical estimate)

| Phase | Your review time |
|---|---|
| 00 — Bootstrap | 5 min |
| 01 — Design System | 30 min |
| 02 — Icon Replacement | 30 min |
| 03 — Runtime Config | 60 min |
| 04 — Admin Dashboard | 30 min |
| 05 — Provider 360 | 60 min |
| 06 — Customer 360 | 30 min |
| 07 — Booking 360 | 60 min |
| 08 — Financial & BIR | 60 min |
| 09 — Stitch screens | 5x 30 min = 2.5 hr |
| 10 — Real-time dispatch | 30 min |
| 11 — Compliance | 30 min |
| 12 — Launch readiness | 60 min |

Total: ~9 hours spread across 8-14 weeks.

### What you DO outside the AI coder loop

Marketing (per [docs/strategy/MARKETING-PLAYBOOK.md](../strategy/MARKETING-PLAYBOOK.md)),
provider recruitment, hiring, customer-support escalation for unusual
disputes, strategic decisions (when to expand, which city next),
investor / partner conversations, and legal review (BIR setup, SEC
filing).

---

## 2. First-time setup

### Install the AI-coder package into the repo

The repo already contains the `.ai-coder/` governance directory and
the `docs/` tree. If you are setting up a fresh clone:

```bash
git clone https://github.com/onServiceTeam/onservice-onsite-app.git
cd onservice-onsite-app
git checkout main
npm install
```

For Windows users (PowerShell):

```powershell
cd C:\Users\<you>\GitHub\onservice-onsite-app
npm install
```

### Read these three docs yourself first (~30 minutes)

- [`docs/audits/HONEST-AUDIT.md`](../audits/HONEST-AUDIT.md) — what was wrong
  in earlier plans and what is actually in the codebase right now.
- [`docs/strategy/STRATEGY.md`](../strategy/STRATEGY.md) — city
  decisions, scope decisions, what we are actually building.
- This file (the workflow you are reading).

### Open the AI agent in the repo

Start a fresh chat in Cursor / Claude Code / VS Code Copilot. Paste
the entire contents of
[`docs/ai-coder/AI-CODER-PROMPT.md`](AI-CODER-PROMPT.md) as the first
message. The agent will read all required documents and reply with a
specific confirmation, then wait.

### Authorize Phase 00

Reply: **"begin Phase 00"**

From this moment, the AI coder runs autonomously per the rules in
`.ai-coder/AUTONOMOUS-EXECUTION-PROTOCOL.md`. It only stops on the
five hard-stop conditions:

1. `verify-master.sh` fails 3 times in a row
2. Architectural decision required
3. Money or compliance risk
4. Production data risk
5. Spec contradiction with existing docs

### Audit at your pace, anytime

```bash
bash .ai-coder/checkpoints/verify-master.sh PHASE-NN
cat .ai-coder/checkpoints/logs/PHASE-NN/EVIDENCE-MANIFEST.md
cat .ai-coder/checkpoints/logs/PHASE-NN/HONESTY-CHECK.md
cd .ai-coder/checkpoints/logs/PHASE-NN && sha256sum -c HASHES.sha256
```

If the hash chain shows tamper or `verify-master.sh` fails, the
checkpoint is rejected. Revert the phase, restart it, and demand a
constitutional Truth-Telling violation entry in
`.ai-coder/checkpoints/violations.log`.

---

## 3. Reading this repo as the founder

### What's in the repo

```
repo-root/
├── README.md                            ← Short orientation
├── LICENSE                              ← Proprietary licence
├── CONTRIBUTING.md                      ← Branch + PR conventions
├── CHANGELOG.md                         ← Phase-by-phase history
├── LAUNCH-LIMITATIONS.md                ← Intentional v1 caveats
├── INFRA-CHECKLIST.md                   ← Pre-launch infra gate
│
├── apps/
│   ├── admin/                           ← React 19 + Tailwind 4 admin panel
│   └── mobile/                          ← Expo Router customer + provider apps
├── packages/
│   ├── api/                             ← Node + Express + pg API
│   └── shared/                          ← Cross-target types + utils
│
├── docs/
│   ├── architecture/                    ← Product + system specs
│   │   ├── SPEC.md
│   │   ├── EXPANSION.md
│   │   ├── RUNTIME-CONFIG.md
│   │   ├── ADMIN-SPEC.md
│   │   ├── MOBILE-SPEC.md
│   │   └── DESIGN-CONTRACT.md
│   ├── strategy/                        ← Business strategy, marketing, compliance
│   │   ├── STRATEGY.md
│   │   ├── STRATEGIC-DECISIONS-LOG.md
│   │   ├── MARKETING-PLAYBOOK.md
│   │   ├── COMPLIANCE.md
│   │   └── INSURANCE.md
│   ├── ai-coder/                        ← Agent prompt + this workflow
│   │   ├── AI-CODER-PROMPT.md
│   │   ├── KEN-WORKFLOW.md              ← (this file)
│   │   ├── HONEST-AUDIT.md
│   │   └── archive/                     ← Superseded agent prompts
│   ├── audits/                          ← Code-audit history
│   ├── design-system/                   ← Tokens + icon catalog + contracts
│   ├── DEPLOYMENT.md
│   ├── SECURITY-POSTURE.md
│   └── MONEY-HANDLING.md
│
└── .ai-coder/                           ← Phase governance + checkpoints
    ├── CONSTITUTION.md
    ├── DEFINITION-OF-DONE.md
    ├── checkpoints/                     ← verify-*.sh scripts
    ├── phases/                          ← PHASE-00 … PHASE-13 plans
    └── templates/                       ← Phase log + evidence templates
```

### What's already true in the codebase

The codebase is genuinely 70-80% complete as of Phase 13. All seven
critical money bugs are fixed; commission rates, multi-service
architecture, multi-area architecture, and the pricing-rules engine
are all real. `escrow-money-conservation.test.ts` passes. The 19-page
admin panel and 83 mobile screens exist; they have been progressively
deepened, polished, and instrumented across phases 00-13.

### What this package does NOT promise

- **Zero human review.** No AI coder produces zero-defect code on
  multi-file refactors. You will catch bugs.
- **A guaranteed timeline.** Calendar time depends on agent throughput
  and how often you can review.
- **A complete replacement for legal / financial advisors.** A
  Philippine accountant should review the BIR setup; a lawyer should
  review the SEC Beneficial Ownership filing if Ken's residency
  status is complex.
- **Marketing execution.** The playbook is detailed but running ads,
  building creatives, and managing the Messenger inbox is operational
  work that needs a human marketing lead.

### The shortest version

1. Read [`docs/strategy/STRATEGY.md`](../strategy/STRATEGY.md) and
   this file (~30 min total).
2. Open the agent in the repo, paste
   [`AI-CODER-PROMPT.md`](AI-CODER-PROMPT.md), say "begin Phase NN".
3. Let the agent run autonomously to the next checkpoint.
4. Spot-audit any phase you want, anytime, with
   `verify-master.sh PHASE-NN`.

You do not gate phases. You do not approve transitions. You audit at
your pace using the evidence chain. The AI coder runs end-to-end on
its own discipline and your script-based verification.
