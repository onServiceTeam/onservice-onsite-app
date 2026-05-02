# Audit 2026-05-01 — Phase H COMPLETE — Test quality audit done

**Status:** Phases A-H complete. Phase I (master AI-coder dispatch — split into I-A infrastructure + I-B per-CRIT) also complete this session. The audit is **DONE** for the line-by-line + classification scope.

**Master commit at audit start:** `b8bd2f2`. Working tree clean apart from `.ai-coder/audit-2026-05-01/` (untracked).

---

## Phase reads to date

| Phase | Status | Lines fully read | Findings docs |
|---|---|---:|---|
| A — Inventory + risk ranking | ✅ Done | n/a | INVENTORY.md |
| B — Money path | ✅ Done | 13,599 | B01–B09 (9 docs) |
| C — Auth + RBAC + sessions | ✅ Done | 6,075 | C01–C05 (5 docs) |
| D — Customer mobile | ✅ Done | 18,979 | D01–D12 (12 docs) |
| E — Provider mobile | ✅ Done | 14,031 | E01–E06 (6 docs) |
| F — Admin web | ✅ Done | ~21,111 | F01–F07 (7 docs) |
| G — Migrations + RLS | ✅ Done | ~2,400 fully read of 3,999 SQL (rest grep-verified) | G01 |
| **H — Test quality audit** | ✅ **DONE** | **218 test files signature-classified + 8 spot-read in full = ~1,200 lines** | **H01 + H02 + H03 (3 docs)** |
| **I — Master AI-coder dispatch** | ✅ **DONE** | n/a (synthesis) | **I-A + I-B (2 docs)** |

**Codebase total: ~140,380 lines.** Coverage so far: **~77,400 / 140,380 = ~55.1%** (line-by-line for source code; classification + signature-grep for the 218 test files; full spot-reads for representative samples).

---

## Phase H summary — what was done

### H01 — Test classification (every one of 218 test files)

Every test file was scanned for signature patterns (readFileSync count, render count, it.todo count, toMatch count, toBe count, describe/it counts, real-source imports). All 218 files bucketed:

| Bucket | Files | Meaning |
|---|---:|---|
| **SRC-REGEX** (F#7 audit smell) | **25** | `readFileSync(source) + expect(content).toMatch(/Bug NNNN/)`. Tests source-file content, not behavior. |
| **SHALLOW** (R7-real fallback) | **114** | `render()` with 3 shallow assertions. R7-real claims 5 assertions in comments; only 3 are present. When pre-render fails, falls through to `it.todo`. Test suite green even with 80%+ todos. |
| **REAL-UNIT** | **74** | Real services / validators / money math. |
| **REAL-RENDER** | **4** | Real DOM-render with behavioral assertions. Use as template. |
| **MIXED (REAL-RENDER + STUB)** | **1** | d11-customer-polish-real.test.tsx — 33% real assertions. |

**3 new CRITs:** CRIT-154 (25 SRC-REGEX files), CRIT-155 (114 SHALLOW R7-real), CRIT-156 (Gate B "reference coverage" CI rule).
**12 new MEDs:** MED-399 through MED-410.

### H02 — Per-feature test coverage matrix

Enumerated every customer flow, provider flow, admin action. Cross-tabulated against happy / failed / empty / permission / network / duplicate / race / edge / mobile / tablet / desktop / abuse axes. Each cell marked: ✅ REAL test exists / 🟡 SHALLOW test exists / 🔴 no test / ⚙️ runtime-only.

**Result:** ~30% of customer flows covered by REAL tests, ~25% provider, ~40% admin. The 🔴 cells (NO test) include critical scenarios — RACE on dual-provider-accept, erasure-DSR-actually-erases, junior-admin-protected-mutations, webhook idempotency, all currently 🔴.

**~240 tests need to be written** (29 admin behavior + 85 mobile behavior + 50 missing service paths + 25 SRC-REGEX replacements + 30 P0/P1 E2E + smaller items).

### H03 — Runtime-evidence harness gap

Inventory of what runtime infrastructure exists vs what's missing.

**Exists (foundation is strong):**
- Docker Compose dev stack (Postgres 18 + PostGIS, Redis 8, MinIO, MailHog, Prometheus, Grafana, API container)
- 84 Maestro YAMLs scaffolded for mobile screens
- 29 Playwright spec files for admin pages (visual snapshot only)
- Seed scripts for the dev DB
- F#3 + F#4 baseline-capture handoff docs

**Missing (the gap to close):**
- Multi-step E2E flow specs (only single-page snapshots exist)
- DB-state-diff helper
- Audit-log-diff helper
- Evidence bundle writer (screenshots + network + DB + audit per step)
- Per-test seed isolation
- The "AI coder runs the test and shows proof" workflow that Ken's brief asks for

The 25 SRC-REGEX files + 114 SHALLOW R7-real files + Gate B CI rule are the test-quality blockers. Phase I-A closes both the SHALLOW pairing AND the runtime harness gap.

---

## Cumulative running totals

| | Total | Phase H additions |
|---|---:|---:|
| **CRITICAL** | **155 real** (1 invalidated of 156) | **+3** |
| **MEDIUM** | **422** | **+12** |
| Lines fully read (incl. test classification) | ~77,400 | +1,200 spot reads + 218 file classifications |
| Coverage of ~140,380 codebase | 55.1% | |

---

## Phase H + I deliverables — files written this session

```
.ai-coder/audit-2026-05-01/findings/
├── H01-test-classification.md          ~600 lines
├── H02-feature-coverage-matrix.md      ~700 lines
├── H03-runtime-harness-gap.md          ~350 lines
├── I-A-runtime-harness-dispatch.md     ~900 lines
└── I-B-per-crit-dispatches.md          ~700 lines

.ai-coder/audit-2026-05-01/phase-H-tests/
├── test-signatures.tsv                 219 rows (218 files + header)
└── buckets.tsv                          219 rows (full bucket assignment)
```

---

## What ships when Phase I dispatches land (operator runbook)

**Order of execution per the Phase I-B dependency graph:**

### Wave 1 — P0 launch-blocking critical path (4 weeks of AI-coder work)

1. **P0-1: Erasure DSR actually erases.** New migration 089 + erasure-executor.service.ts + UI rewrite. ~1,100 lines. Closes CRIT-136 + CRIT-153.
2. **P0-2: Staff permissions enforcement.** require-permission middleware + 11 route guards + 11 client gates. ~2,800 lines. Closes 11 CRITs (CRIT-23/56/120/121/130/131/137/142/144/147/148).
3. **P0-3: KYC document wireup.** Service-layer wireup to existing provider_documents schema + admin UI fix + mobile upload fix. ~1,050 lines. Closes CRIT-128.
4. **P0-4: All-PII-files-proxied.** New /download routes + signed-url service + UI replacement of direct S3 URLs. ~1,100 lines. Closes CRIT-125 + CRIT-128 download path + CRIT-140.
5. **P0-5: Audit log integrity.** Migration 090 + redact middleware + sensitive-setting masking. ~1,000 lines. Closes CRIT-135 + CRIT-150 + CRIT-152 + MED-389 + MED-397.
6. **P0-6: PII redaction by role.** RedactPii component + per-route + 11 admin pages. ~1,700 lines. Closes CRIT-63 + CRIT-132 + CRIT-149.
7. **P0-7: Notification template safety.** Migration 091 + role gate + XSS sanitization + multi-language + test-send. ~1,400 lines. Closes CRIT-138.
8. **P0-8: Webhook idempotency.** Migration 092 + idempotency_key. ~550 lines. Closes CRIT-19/20/21 + MED-390.

**Wave 1 net: ~10,700 lines of code + ~5,000 lines of tests = ~15,700 lines.**

### Wave 2 — P1 production-quality (3 weeks)

9-20. The 12 P1 dispatches per Phase I-B. ~6,000 lines code + ~3,000 lines tests.

### Wave 3 — P2 polish (post-launch v1.1)

21-27. The 7 P2 dispatches. ~2,000 lines.

### Wave 0 — Phase I-A (must land BEFORE Wave 1)

The runtime-evidence harness dispatch. ~3,500 lines (test-harness package + helpers + boot scripts + first 3 P0 flow specs + Gate B replacement). Without this, none of the Wave 1 dispatches can prove their fixes via evidence bundles.

**Total estimate: 8-9 weeks of AI-coder execution + 2 manual operator sessions (F#3 + F#4 baseline capture).**

---

## What's confirmed REAL vs what's THEATRE

### REAL (verified at code + schema + test level across A-H)

- **Cancellation policy** (Bug 1170/1198, Phase 14 D02). Migration 071 + admin route + admin UI + validators all consistent. Gold-standard pattern.
- **Admin CSRF tokens** (Bug 1251, Phase 14 D01). Migration 070 + middleware + cookie scheme + UI all correct.
- **Native fetch wrapper with 401-refresh** (Bug 1271, Phase 14 D01). Lib/api.ts verified.
- **PH lat/lng + radius bounds** (Bug 320/322, Phase 14 D05). Migration 074 DB CHECK + Zod validators both enforce.
- **Consent type CHECK constraint** (Bug 117, Phase 14 D08). Migration 080 with backfill of typos.
- **Audit log self-audit on CSV export** (Bug 401, Phase 14 D08). Endpoint writes admin_actions on every export.
- **Consent search DPO-only** (Bug 402, Phase 14 D08). Server middleware + self-audit.
- **Breach log + 72h NPC SLA** (Bug 1366, Phase 14 D08). Migration 082 + cron job + DPO-gated endpoints.
- **Provider documents schema for KYC** (Bug 1193/1194/1195, Phase 14 D09). Migration 085 EXISTS — service-layer wireup is the gap.
- **Admin TOTP backup codes** (Bug 360, Phase 14 D10). Migration 087 + bcrypt-hashed + soft-delete.
- **Feature flags for v1.0 pulls** (Bug 44/45/152, Phase 14 D13). Migration 088 + admin UI banner.
- **Money widening to BIGINT** (Phase 13 Dispatch E). Migration 059 covers 37 columns.
- **74 REAL-UNIT tests** including escrow-money-conservation, commission, all 19 validators, financial-bir-admin (1,585 lines), booking-dispute-admin (1,032 lines).

### THEATRE (caught + dispatched in Phase I)

- **25 SRC-REGEX test files** that "test" by `readFileSync(source) + .toMatch(/Bug NN/)`. Delete + replace with real behavior tests (Dispatch P0-2 / Phase I-A).
- **Gate B "reference coverage" CI rule** that demanded the SRC-REGEX tests. Replace with behavioral-coverage check (Phase I-A).
- **114 R7-real "shallow render" tests** with 3 assertions (mounts/has-children/valid-root). Comment claims 5 assertions; only 3 implemented. Pair with `*.behavior.test.tsx` per CRIT-155 fix dispatch.
- **"Government ID — not stored" UI string** while schema has provider_documents. Service-layer drift (Dispatch P0-3).
- **Erasure DSR "Mark Complete" doesn't erase data** — UI literally admits this. Schema has no erasure_executions table. Dispatch P0-1 fixes both.
- **All platform settings editable by junior admin** because `rbacMiddleware('admin', 'super_admin')` accepts both at the router level. Dispatch P0-2.
- **Source-content tests dressed as behavioral** in d07/d08/d09/d10/d13-encompassed-bugs.test.ts and d14-cutover-harness. CRIT-154.

---

## Resume prompt for the AI coder (Phase I execution session)

> "Begin executing Phase I per `.ai-coder/audit-2026-05-01/findings/I-A-runtime-harness-dispatch.md`. First wave is the runtime-evidence harness. Land the new `packages/test-harness/` package + `scripts/test/run-e2e-local.sh` + the first 3 P0 flow specs (junior-admin-protected-mutations, customer-money-path, erasure-dsr-actually-erases). Then delete the 25 SRC-REGEX files per the H01 file list and replace the Gate B CI rule with the behavior-coverage check. After Wave 0 lands and CI is green, proceed sequentially through the 8 P0 dispatches in I-B. Each P0 dispatch must end with a green E2E flow spec + evidence bundle as proof. Keep `.ai-coder/audit-2026-05-01/findings/` as the source of truth — read the relevant H01 / H02 / H03 / I-A / I-B section before each dispatch. Use CancellationPolicyPage + migration 071 + proof/login.dom.test.tsx as gold-standard templates."

---

## Discipline notes carried forward

1. **The R7-real `it.todo(todoReason(...))` fallback pattern hides ~80% of intended assertions.** It looks like a real test (uses `render()`); reads green; doesn't actually assert. Phase I-A pairs every R7-real with a `*.behavior.test.tsx` so real behavior is verified.

2. **Phase 14 D-series dispatches landed real schemas.** Phase G corrected F03 CRIT-128 ("schema doesn't exist") to "schema exists; service layer drifts." Future findings should always cross-check schema before assuming a missing-table fix is needed.

3. **The "Gate B reference coverage" CI rule is the root cause** of the 25 SRC-REGEX files. It demanded every claimed-fixed bug have a "test reference," and the team complied with regex-match instead of behavior. Removing the rule + adding a behavior-coverage rule is a single small dispatch (Phase I-A Step 5) that prevents recurrence.

4. **Truth-in-UI banners ("DEPRECATED", "not stored — see HONESTY-CHECK", "ETA Phase 14") are CRIT-discovery signals.** The team flagged gaps in the UI itself. Phase G CRIT-128 + CRIT-136 + Phase F CRIT-146 were all caught by reading these warnings carefully.

5. **The audit's coverage stopped at code review + classification.** Runtime evidence (Docker boot + click-through + DB diff + screenshots) is what Phase I-A delivers — and what Ken's brief asks for. The fact that this layer doesn't exist yet is not the same as the layer being broken; it just isn't built. Phase I-A builds it.

6. **Most fixes are application-layer, not migration-layer.** Phase G confirmed: Phase 14 schemas are correct. The remaining work is service wireup + role gating + audit redaction + UI conditional rendering. This is a key insight for sizing Phase I-B dispatches.

---

## Final audit numbers

| | Total |
|---|---:|
| Lines source-read in full | ~77,400 / ~140,380 (~55%) |
| Test files signature-classified | 218 / 218 (100%) |
| Test files spot-read in full | 8 (representative samples per bucket) |
| Migration files fully read | 18 (foundational + high-stakes) of 77 |
| Migration files grep-verified for CHECK / RLS / money | 77 / 77 (100%) |
| **CRITICAL bugs** | **155 real** (1 invalidated of 156) |
| **MEDIUM bugs** | **422** |
| Phase I dispatches | **27** (8 P0 + 12 P1 + 7 P2) |
| Estimated AI-coder execution effort | 8-9 weeks |
| Estimated new code | ~25,000 lines |
| Estimated new test code | ~18,000 lines |
| Lines deleted (25 SRC-REGEX files) | ~3,000 |

The audit is complete. Phase I is the runbook for the AI coder. After all 27 dispatches land + verify, `v1.0.0-launch-ready` can be applied.
