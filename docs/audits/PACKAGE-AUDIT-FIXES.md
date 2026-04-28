# PACKAGE AUDIT — what was wrong

I cloned the repo at https://github.com/onServiceTeam/onservice-onsite-app.git (commit 322330a) and audited my entire package against it line by line. Here's what I found wrong and what I'm fixing.

You were right to push back. Some of these errors are mechanical (paths that don't exist, dependencies forbidden that you actually use). Some are deeper — my package didn't integrate with the substantial governance structure already in your repo.

---

## CATEGORY 1 — INVENTED PATHS (hallucinations)

### 1.1 The `/frozen/` folder — DOES NOT EXIST

| File | Line | Error |
|---|---|---|
| `AI-CODER-PROMPT.md` | 42 | "You never delete code in `/frozen/`" |
| `AI-CODER-PROMPT.md` | 66 | "Modify any file in `/frozen/`" |
| `CONSTITUTION.md` | 248 | "You'd need to change something in `/frozen/`" |

**Fix:** Remove all three references. The /frozen/ concept was something I imagined would exist but never created. There is no such folder.

### 1.2 Centralized `@/components/icons` module — DOES NOT EXIST YET

I wrote rules saying "all icons imported from `@/components/icons`" — this module doesn't exist. It's something Phase 02 should create. The rule needs to be conditional on phase.

**Fix:** Move the rule to "after Phase 02 completes."

---

## CATEGORY 2 — WRONG DEPENDENCIES

My `verify-deps.sh` had FORBIDDEN entries that are actually IN USE in your repo:

| Dependency | My status | Actual status in repo |
|---|---|---|
| `zustand` | FORBIDDEN | Used in admin AND mobile (state management — already chosen) |
| `axios` | "only if pre-existing" | Pre-existing — used in both admin and mobile |
| `react-hook-form` | Approved | Pre-existing |
| `@hookform/resolvers` | Approved | Pre-existing |

My `verify-deps.sh` had APPROVED entries that aren't actually installed (they'd be added by phases):

| Dependency | My status | Reality |
|---|---|---|
| `lucide-react` | Approved | Not installed yet (Phase 01 adds it) |
| `@radix-ui/*` | Approved | Not installed; admin uses **shadcn/ui v4** per package.json description |
| `date-fns` | Approved | Not installed |
| `decimal.js` | Approved | Not installed; money is integer centavos so this isn't needed anyway |
| `leaflet` / `react-leaflet` | Approved | Not installed; mobile uses `react-native-maps` |
| `papaparse` / `xlsx` / `pdfmake` | Approved | Not installed |
| `Stryker` mutation testing | Approved | Not installed; Phase 00 must add it |
| `Playwright` | Approved | Not installed; would be added for browser validation |
| `lodash` / `moment` | FORBIDDEN | Not present — correct call |
| `redux` / `mobx` | FORBIDDEN | Not present — but these are **NOT** alternatives to zustand which IS used |

My package was MISSING deps you actually use:

| Dependency | Where used | Status in my package |
|---|---|---|
| `bullmq` | API queue (replaces node-cron for jobs) | Missing — must add to approved list |
| `react-native-mmkv` | Mobile encrypted storage | Missing |
| `react-native-maps` | Mobile maps | Missing |
| `react-native-reanimated` | Mobile animations | Missing |
| `react-native-screens` | Mobile navigation | Missing |
| `react-native-safe-area-context` | Mobile layout | Missing |
| `@react-native-community/netinfo` | Mobile offline detection | Missing |
| `expo-router` | Mobile navigation (file-based) | Missing |
| `expo-clipboard` / `expo-application` / `expo-device` / `expo-image` / `expo-image-manipulator` / `expo-crypto` / `expo-constants` | Mobile features | Missing |
| `socket.io-client` | Mobile real-time | Missing |
| `node-pg-migrate` | Migrations runner | Missing — and I wrote my own migration assumptions instead |
| `morgan`, `compression`, `express-rate-limit`, `winston` | API middleware | Missing |
| `@testing-library/react-native`, `jest-expo` | Mobile testing | Missing |

**Fix:** Rewrite `verify-deps.sh` from scratch using the actual `package.json` files in the repo as the canonical baseline, with phase-driven additions tracked separately.

---

## CATEGORY 3 — WRONG SCRIPT NAMES

My package referenced npm scripts that don't exist:

| My script | Actual script |
|---|---|
| `npm run db:reset` | DOES NOT EXIST |
| `npm run db:migrate` | Should be `npm run migrate:up --workspace=packages/api` or `bash scripts/run-migrations.sh up` |
| `npm run lint` | Exists ✓ |
| `npm run typecheck` | Exists ✓ |
| `npm run api:test` | Exists ✓ |
| `npm run admin:dev` | Exists ✓ |
| `npm run admin:build` | Exists ✓ |
| `npm run mobile:start` | Exists ✓ |
| `npm run loadtest:smoke` | Exists ✓ (uses k6) |

**Fix:** Phase 00 must add a `db:reset` script (or replace my references with the actual workflow). Use real script names everywhere.

---

## CATEGORY 4 — MIGRATIONS

My package said "every migration named `NNN_description.sql`" — this matches the repo's pattern (049_provider_cancellation_tracking.sql).

But my package said "Phase 03 adds migrations 050+051" without verifying that migration sequence. Migration 050 should be the next one — confirmed (latest is 049).

My package said `npm run db:migrate` works. It doesn't — the actual command is `npm run migrate:up --workspace=packages/api` (uses node-pg-migrate, not a custom runner).

**Fix:** Update verify-migrations.sh to use node-pg-migrate's actual interface. Update phase docs to use real commands.

---

## CATEGORY 5 — INTEGRATION WITH EXISTING REPO DOCS

The repo already contains 9 substantial spec/governance documents totaling ~120KB+:

| Existing doc | Size | Purpose |
|---|---|---|
| `.cursorrules` (== CLAUDE.md == AI-CODER-MASTER-INSTRUCTIONS.md) | 34KB each | The current AI coder rulebook (3 copies of same) |
| `COMPLETE-PH-Home-Services-Platform-Specification.md` | 122KB | Master business + product spec |
| `EXPANSION-v2-SDLC-SRS-Infrastructure-Issues.md` | 46KB | SDLC + 200+ FRs/NFRs |
| `COMPREHENSIVE-271-ISSUE-AUDIT.md` | 39KB | The 271-issue audit referenced everywhere |
| `RUNTIME-CONFIG-SYSTEM-SPEC.md` | 39KB | Runtime config spec |
| `CODE-AUDIT-AND-FIX-INSTRUCTIONS.md` | 53KB | Existing audit instructions |
| `SETUP-README.md` | 3KB | Setup instructions |
| `README.md` | 2KB | Repo readme |

My package said "read HONEST-AUDIT.md, STRATEGY.md" — but ignored that the AI coder must ALSO read the 9 existing docs. The existing `.cursorrules` is 34KB of rules already in place. My constitution has to acknowledge and integrate with these, not pretend they don't exist.

**Fix:** AI-CODER-PROMPT.md must list the 9 existing docs as required reading. Constitution must say "this constitution supersedes the previous .cursorrules where they conflict, but the spec documents are still authoritative for product requirements."

---

## CATEGORY 6 — DESIGN SYSTEM REALITY

My package said "the admin panel uses Tailwind 4" — confirmed.
My package said "use lucide-react" — but admin is set up for **shadcn/ui v4** (per package.json description).
My package said "icons from `@/components/icons`" — this module doesn't exist; needs creation in Phase 01 OR 02.
My package's `tokens.json` defines colors that may not match the existing CSS variables already in the admin (it uses `var(--color-secondary)`, `var(--color-text)`, etc — I never checked what those resolve to).

**Fix:** Phase 01 must inspect the existing CSS variables in admin (search for `--color-` definitions), align tokens.json with reality, decide whether shadcn or Radix-based custom is the icon framework path. Cannot assume.

---

## CATEGORY 7 — APP/MOBILE STRUCTURE

My package said `apps/mobile/app/` has 83 screens — confirmed (83 .tsx files).
My package said `apps/admin/src/components/` has only 7 reusable components — actually 4 (Badge, DataTable, KpiCard, Pagination + index.ts) plus 3 layout (AdminLayout, Header, Sidebar). My count was off but close.

My package's icon catalog assumes 73 emoji to replace — let me verify the actual count is correct:

<count of emoji icons in actual repo to be verified during Phase 02>

---

## CATEGORY 8 — TEST INFRASTRUCTURE

My package referenced tests:
- `escrow-money-conservation.test.ts` — EXISTS ✓
- `commission.test.ts` — EXISTS ✓
- `dispute.test.ts` — DOES NOT EXIST (the file is `dispute-refund-processing.test.ts` and `dispute-validators.test.ts`)
- `refund.test.ts` — DOES NOT EXIST (covered by `dispute-refund-processing.test.ts`)
- `payout.test.ts` — DOES NOT EXIST (only `payout-validators.test.ts`)

My `verify-money-conservation.sh` references tests that don't exist. It would fail with "Sacred test missing" on day one.

**Fix:** Update verify-money-conservation.sh to use actual existing test files. Add new tests Phase 00 should create as part of bootstrap.

---

## CATEGORY 9 — WHAT'S MISSING FROM THE GOVERNANCE LAYER

After this audit, the following are missing or weak:

1. **Browser validation** — no instructions for the AI coder to actually open the dev server in a headless browser and check what the user sees. AI coders in Cursor/Claude Code can do this with Playwright. My package doesn't tell it to.

2. **Visual quality reasoning** — my package has the "stranger test" but doesn't explicitly tell the AI coder to ask "does this look like $100K UX or like a toy?" with a calibration scale.

3. **Cross-platform validation** — no per-screen iOS / Android / desktop / tablet matrix.

4. **Autonomous progression** — my package has Ken approving each phase. You said you want auto-progression with AI coder self-confirming. This is a workflow change.

5. **Flow / click-count optimization** — my package doesn't explicitly require minimum clicks per task or prove this with telemetry.

---

## REMEDIATION PLAN

I will now do the following, in order, and not stop until done:

1. Fix every hallucinated path (CATEGORY 1)
2. Rewrite verify-deps.sh from the actual package.json files (CATEGORY 2)
3. Fix every npm script reference (CATEGORY 3)
4. Update verify-migrations.sh to use node-pg-migrate (CATEGORY 4)
5. Add the 9 existing repo docs to required reading; explain how my new docs relate (CATEGORY 5)
6. Add a Phase 00 step to inspect the existing design system before adding new tokens (CATEGORY 6)
7. Update test references to actual existing tests; specify new tests Phase 00 creates (CATEGORY 8)
8. Add the missing governance pieces (CATEGORY 9):
   - **VISUAL-UX-AUDIT-PROTOCOL.md** — browser validation, $100K-vs-toy reasoning, click-count optimization
   - **AUTONOMOUS-EXECUTION-PROTOCOL.md** — AI coder self-confirms and proceeds, no Ken-gating
   - **CROSS-PLATFORM-MATRIX.md** — per-screen iOS / Android / desktop / tablet check requirements
9. Update AI-CODER-PROMPT.md, CONSTITUTION.md, DEFINITION-OF-DONE.md, MASTER-QA-SYSTEM.md to wire it all in
10. Create THIS audit doc as a permanent record

When done, the package will reflect the real codebase, integrate with existing rules instead of replacing them blindly, and add the missing visual/autonomy/cross-platform layers.
