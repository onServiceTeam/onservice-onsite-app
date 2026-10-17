# EXPECTED-FAILURES — Gate fragments currently failing on master

Per Dispatch 0 step 0.2.4 (initial creation) and Dispatch 03 (tiered-enforcement reconciliation). This file documents which gate fragments are expected to fail on the current `master` HEAD AND which dispatch addresses each. As dispatches land, fragments move from this file to "now passing." When this file is empty, the gate suite is fully green.

**Source of truth:** the machine-readable mode declaration is [`scripts/gates/MODES.json`](MODES.json). The aggregator (`run-gate-a.sh`) and the constitution gate (`c-constitution.sh`) read MODES.json to decide whether a failing fragment fails the gate. This file is the human-readable companion. **When you change a fragment's mode, update both files in the same PR.**

The Phase 14 design accepts these failures during Dispatches 01–13 because each is owned by a specific later dispatch. **REPORT-tier fragments log failures without blocking the gate**; after the dispatch that owns each fragment lands, that fragment is promoted to BLOCKING for all subsequent PRs (update `MODES.json` in that dispatch's closeout PR).

> **Note (2026-10-14, D40):** several entries below had fallen out of step with `MODES.json`. Each one now has a dated correction under it. Nothing above or below was deleted.
>
> - `MODES.json` is the file the gates actually read. Where this file and `MODES.json` disagree, `MODES.json` describes what CI does.
> - "Green" never meant that every gate ran. On `master`, Gates B, D and E report green without checking anything. See the corrections under Gate B, Gate D and Gate E, and Gates run 38555374447 on `8d319a18`.
> - GitHub branch protection is off by Ken's choice (D40). A red gate does not block a push to `master`. The gates are followed by choice, not enforced.

---

## Gate A fragments

### `a-cross-source-cancellation-policy.sh`
- **Expected to fail on master:** NO.
- **Reason:** Bug 1170/1198 removed hardcoded cancellation tiers from the
  customer clients, but E09 later proved that the live escrow refund path still
  reads separate `cancel_refund_*` settings. The fragment now truthfully guards
  customer-display tier drift and requires the E09 mutation hold on both the
  versioned display table and all seven live refund settings. It does not claim
  the customer display and money path have one source.
- **Status:** BLOCKING immediately on the D02 branch and going forward.

### `a-cross-source-brand-color.sh`
- **Expected to fail on master:** NO (resolved by D02 Part 2).
- **Reason:** Bug 1324 fixed — `apps/mobile/src/config/theme.ts` updated to
  the canonical Stitch primary `#003D9B` (and supporting values from `tokens.json`).
  Migration 146 supersedes migration 072 and updates the same
  `platform_settings` rows; admin edits them via the existing `/admin/settings`
  page. Mobile dynamic
  theme override is tracked in LAUNCH-LIMITATIONS.md §brand-color-mobile-runtime.
- **Status:** BLOCKING immediately on D02 Part 2 branch and going forward.

### `a-cross-source-routes.sh`
- **Expected to fail on master:** NO (resolved by D02 Part 4 for static
  quoted paths). The gate as currently written catches `router.push('...')`
  / `router.push("...")` only — backtick template strings (~35 dynamic
  routes that carry `${id}` etc.) are still in flight and tracked under
  LAUNCH-LIMITATIONS §routes-registry-template-strings. Migrating those
  requires `buildRoute()` adoption case-by-case (often coupled with query-
  param refactors) and is reasonably scheduled with D12 mobile-customer
  polish.
- **Status:** BLOCKING for static-path violations on D02 Part 4 onward.

### `a-cross-source-tier-criteria.sh`
- **Expected to fail on master:** UNKNOWN
- **Reason:** Bug 974/1247 — tier criteria possibly hardcoded in client. Needs initial scan.
- **Owning dispatch:** Dispatch 02.
- **Becomes BLOCKING:** after D02 PR merges.
- **Correction (2026-10-14):** out of date. `MODES.json` marks this fragment BLOCKING (promoted in D02, "Bug 1323 fixed"). A local run of `bash scripts/gates/run-gate-a.sh` on `8d319a18` printed "tier criteria from server: OK". Expected to fail on master: NO.

### `a-cross-source-no-axios.sh`
- **Expected to fail on master:** NO (resolved by D01 admin half + D02 Part 5 mobile half).
- **Reason:** Bug 1271 fixed for clients — admin uses native fetch wrapper
  (D01 PR #7) and mobile uses native fetch wrapper (D02 Part 5).
  Server-to-server outbound HTTP (payment.service.ts, sms.service.ts hitting
  third-party APIs) was excluded from gate scope — server outbound is not
  the constitutional concern (which was about client bundle bloat + cookie
  semantics).
- **Status:** BLOCKING immediately on D02 Part 5 onward.

### `a-cross-source-no-emoji-icons.sh`
- **Expected to fail on master:** NO (resolved by the 2026-08-23 UX audit).
- **Reason:** The remaining production emoji iconography was replaced with the central Lucide vector set across customer, provider, staff, support, shared mobile UI, and the remaining admin pages. The scanner was also made fail-closed when its runtime is unavailable.
- **Status:** BLOCKING from the 2026-08-23 UX audit onward.

### `a-cross-source-no-google-maps-placeholder.sh`
- **Expected to fail on master:** YES
- **Reason:** Bug 1286 — `apps/mobile/app.json:41,67` contains `YOUR_GOOGLE_MAPS_API_KEY` literal.
- **Owning dispatch:** Dispatch 01 (deploy blockers).
- **Becomes BLOCKING:** after D01 PR merges.
- **Correction (2026-10-14):** the four lines above are out of date. `MODES.json` marks this fragment BLOCKING (promoted in D01, "Bug 1286 fixed in D01"). `apps/mobile/app.json` was removed in D01 (commit `dbcc57a3`, 2026-04-30) and replaced by `apps/mobile/app.config.ts`. The gate now scans all of `apps/mobile/` (skipping `app.config.ts` itself, which holds the sentinel string as a code constant). On `8d319a18` it finds no placeholder: `bash scripts/gates/a-cross-source-no-google-maps-placeholder.sh` printed "no Google Maps / EAS placeholders: OK". Expected to fail on master: NO.

### `a-cross-source-hashes-immutable.sh`
- **Expected to fail on master:** NO
- **Reason:** No `HASHES-CORRECTED.sha256` files exist yet to be modified. Gate is preventive.
- **Owning dispatch:** Currently passing.
- **Status:** BLOCKING immediately.
- **Tightened (2026-10-17, D40):** until this date, a comparison base (`BASE_REF`) that was not in the checkout made the check print OK having compared nothing, because the `git diff` error was thrown away. Since 2026-10-14 a push to master uses the previous master commit as the base, which a force-push can make unreachable. Now a missing base, or any `git diff` error, fails with "NOT CHECKED". Self-test: `scripts/gates/__tests__/gate-a-hashes-immutable-base.test.sh`. Expected to fail on master: still NO, as long as the base commit is in the CI checkout (the Gate A job fetches full history). If that self-test is not in the repo, this change has not landed.

### `a-cross-source-no-client-money.sh`
- **Expected to fail on master:** NO (resolved by D05).
- **Reason:** Phase 14 D05 (2026-04-30) closed Bug 175/176/208/1132/261/266/269/320/322/417/1219/1230. Every customer-facing validator now uses the server-canonical pattern (clients send IDs and quantities; server resolves prices from DB via `services/booking/pricing.service.ts`, `promo.service.ts`, `from-quote.service.ts`, etc.). Documented exceptions: `adminWalletAdjustmentSchema`, `createAddonSchema`/`updateAddonSchema`, and `// gate-a-allowed:` inline markers for legitimate admin-defined money fields (e.g., `discountValue` in `createPromoCodeSchema`).
- **Status:** BLOCKING immediately on the D05 branch and going forward.

### `a-cross-source-no-siguradoshield.sh`
- **Expected to fail on master:** NO (resolved by D04).
- **Reason:** Phase 14 D04 (Ken's Option A pull, 2026-04-30) removed SiguradoShield from all customer mobile surfaces, server config, and settings defaults. Old REPORT-only fragment is now a thin alias delegating to the stricter `c-constitution-no-shield-references.sh` (Gate C BLOCKING article).
- **Status:** BLOCKING immediately on D04 branch and going forward.

---

## Gate B (bug-deferral)

- **Expected to fail on master:** N/A
- **Reason:** Gate B operates per-dispatch by parsing `D<NN>-closeout.md`. It is invoked only when a dispatch branch with a closeout is being PR'd. Until D01's PR opens, Gate B has no input.
- **Status:** Passive; activates with first dispatch.
- **Correction (2026-10-14):** On a push to `master`, CI finds no dispatch number in the branch name, so the "Run Gate B" step is skipped and the job still reports success (`.github/workflows/gates.yml`, the `if:` on "Run Gate B"; seen in Gates run 38555374447 on `8d319a18`). Gate B checks nothing on `master`. Its green result there is not evidence.

---

## Gate C (constitution)

### Article 4.2 — no `console.*` in production
- **Expected to fail on master:** UNKNOWN, likely some violations.
- **Owning dispatch:** Dispatches 01-12 progressively clean each affected file. Dispatch 11/12 (mobile polish) finishes.
- **Becomes BLOCKING:** after D12 PR merges.
- **Correction (2026-10-14):** out of date. `MODES.json` marks `article-4.2-no-console` BLOCKING (promoted in D14r-8). A local run of `bash scripts/gates/c-constitution.sh` on `8d319a18` printed "article-4.2-no-console [BLOCKING]: OK". Expected to fail on master: NO.

### Article 4.6 — no emoji as iconography
- See `a-cross-source-no-emoji-icons.sh` above. The redundant constitution article is also BLOCKING from the 2026-08-23 UX audit onward.

### Article 7.1 — no axios
- See `a-cross-source-no-axios.sh` above.

### Article 12 — BIGINT money tests exist
- **Expected to fail on master:** NO
- **Reason:** `bigint-money-precision.test.ts` exists (created in Phase 13 Dispatch E with 5+ tests).
- **Status:** BLOCKING immediately. Verify via `find packages/api -name bigint-money-precision.test.ts`.

### Article 16 — closeout file exists for current dispatch
- **Expected to fail on master:** N/A on master itself; activates per branch.
- **Status:** BLOCKING per dispatch branch.

### Unique regression IDs
- **Expected to fail on master:** NO after the 2026-09-04 continuous-audit correction.
- **Reason:** Ten unrelated test-title collisions were assigned unique SEC, UX, or OPS identifiers. The scanner now finds 1,377 direct `it()`/`test()` regression titles across test and spec files and zero duplicate IDs.
- **Status:** BLOCKING from the 2026-09-04 continuous audit onward. The fragment is `scripts/gates/c-unique-regression-ids.py`, with an adversarial smoke test that proves duplicate titles fail and distinct titles pass.
- **Correction (2026-10-17, D40):** "zero duplicate IDs" is true only for the IDs the scanner reads. Its title pattern (`c-unique-regression-ids.py:39-41`) only matches "Bug" followed by LETTERS-DIGITS, such as "Bug UX-018". Plain numeric IDs ("Bug 870") and IDs with more than one letter group ("Bug R-CUS-09") are never checked. On 2026-10-17 "Bug 870" and "Bug 1271" each appeared in more than one direct test title, and 8 IDs of the R-XXX-NN form also repeated. Widening the scanner is backlog item BL-22 (`.ai-coder/governance/STANDARD-V2-ADOPTION.md`), a tightening for its own commit.

### No fake tests (added 2026-10-14, D40)
- **Note (2026-10-14):** the D40 gate commit adds a Gate C article, `no-fake-tests`, run from `c-constitution.sh`. Its script is `scripts/gates/c-no-fake-tests.py` and its self-test is `scripts/gates/__tests__/gate-c-no-fake-tests.test.sh`. Its mode, and what it does and does not catch, are in `MODES.json` and the script header. If `scripts/gates/c-no-fake-tests.py` is not in the repo, that commit has not landed and this entry does not apply yet.
- **Tightened (2026-10-17, D40):** an agent review found ways around both rules. The article now also rejects them (the list is under CHANGES in the script header; self-test cases I to N), and it reads every source file in a `__tests__` folder, because mobile jest runs those as tests even without `.test` in the name. On the whole worktree it then found one more case, in `packages/api/__tests__/d07-encompassed-bugs.test.ts`, which was fixed in the same change. Expected to fail on master: YES if this article lands without the 6 fixed test files (master still holds the 17 original cases).

### `c-constitution-no-admin-password-seeds.sh` (not run by anything)
- **Note (2026-10-14, D40):** this file never listed it. The script exists (added in D01), but on `8d319a18` no workflow in `.github/workflows/` and no aggregator (`c-constitution.sh`, `run-gate-a.sh`) calls it, and `MODES.json` has no entry for it. So it checks nothing in CI, even though `packages/api/seeds/README.md` calls it a CI gate. Wiring it in is a gate change for its own commit.
- **Update (2026-10-17, D40, BL-23):** the D40 gate commit wires it into `c-constitution.sh` as the BLOCKING article `no-admin-password-seeds` (`MODES.json` entry of the same name). The same change adds one tightening: any non-comment line of a `.sql` seed that names `password_hash` fails. Self-test: `scripts/gates/__tests__/gate-c-no-admin-password-seeds.test.sh`. A local run on 2026-10-17 passed on the whole worktree. Expected to fail on master: NO. If `scripts/gates/__tests__/gate-c-no-admin-password-seeds.test.sh` is not in the repo, that commit has not landed and the note above still describes master.

### Database tests fail closed in CI (added 2026-10-17, D40)
- **Note (2026-10-17):** the D40 gate commit adds a Gate C article, `db-tests-fail-closed`, run from `c-constitution.sh`. A real-database test that picks `it` or `it.skip` from a `DATABASE_URL` safety flag must also have a top-level `if (process.env.CI && !flag) throw` guard, so CI with a missing or wrong database fails instead of skipping and staying green. Script: `scripts/gates/c-db-tests-fail-closed.py`. Self-test: `scripts/gates/__tests__/gate-c-db-tests-fail-closed.test.sh`. On `8d319a18` it finds 4 files without the guard (`bug-ops-387`, `bug-ops-390`, `bug-ops-408`, `bug-ux-350`); the same commit adds the guard to all 4. Expected to fail on master after that commit: NO. Limits are in the script header (for example, a test that returns early with no database is not seen).

### Money-in-transaction
- **Expected to fail on master:** NO (resolved by D06).
- **Reason:** Phase 14 D06 (2026-04-30) closed Bugs 69, 70, 71, 78, 79, 80, 82, 83, 84, 85, 105, 106, 127, 237. Every money/audit mutation either composes via a trx-aware `*InTransaction` helper (releaseEscrowInTransaction, refundFromEscrowInTransaction, handleCancellationInTransaction, resolveDisputeInTransaction) or is annotated `// gate-c-allowed: best-effort-audit-only` for the documented non-blocking audit pattern (try/catch + logger.warn so audit failures don't roll back durable underlying state). Two real adjacent bugs were also fixed inline: `dispute.service.assignDispute` and `payout.service.approvePayout`. The gate logic itself was rewritten in D06 — the prior Kysely-pattern regex was vacuously passing because the codebase uses raw pg; the new awk pattern detects `db.query` calls with INSERT INTO admin_actions/wallet_transactions or UPDATE wallets at the top level (not inside `db.transaction`).
- **Status:** BLOCKING immediately on D06 branch and going forward.

---

## Gate D (visual screenshots)

- **Expected to fail on master:** YES (no baselines exist yet).
- **Reason:** No Playwright tests in `apps/admin/tests/visual/` and no Maestro flows in `apps/mobile/.maestro/visual/` yet.
- **Owning dispatches:** Dispatch 07 (admin Playwright + designer-grade restyle), Dispatch 08 (mobile Maestro), Dispatches 11/12 add per-screen baselines.
- **Becomes BLOCKING:** after D12 PR merges.
- **Correction (2026-10-14):** the four lines above are out of date. Counts are from `git ls-files` on `8d319a18`.
  - Admin: 34 visual spec files and 588 baseline images are tracked under `apps/admin/tests/visual/`. All 588 have Windows (`win32`) file names. None are Linux captures, and CI runs on Linux.
  - Mobile: 94 Maestro flow files are tracked under `apps/mobile/.maestro/visual/`. No mobile baseline images are committed (F#3 is still open).
  - `MODES.json` keeps Gate D in REPORT mode (`gate_d_state`). In that mode the CI job exits 0 before any screenshot check runs. In Gates run 38555374447 on `8d319a18` it logged "REPORT mode". If the D40 gate commit has landed, the same case prints "Gate D NOT RUN" instead (see `scripts/gates/d-visual-screenshots.sh`); the mode and the exit 0 are the same. So Gate D is not "expected to fail" on `master`. It does not run, and its green result checks nothing.
  - The admin visual specs are run locally only (LAUNCH-LIMITATIONS.md section 132: "Gate D is report-only, and CI never runs Playwright"). The `MODES.json` rationale says the admin baselines were "validated against a live admin app". D40 records that they were checked locally, not against the live app.

---

## Gate E (mutation testing)

- **Expected to fail on master:** UNKNOWN. Phase 13 reported 99.3% on partial run (1022/2237 mutants).
- **Reason:** Stryker not installed yet in `packages/api/node_modules`. After Dispatch 0 step 0.7.1 runs `pnpm install` for stryker packages, an initial baseline run is required (hours).
- **Owning dispatch:** Dispatch 0 step 0.7 establishes baseline. Dispatch 12 promotes from REPORT to BLOCKING.
- **Becomes BLOCKING:** after D12 PR merges.
- **Correction (2026-10-14):** `MODES.json` keeps Gate E in REPORT mode (`gate_e_state`). In that mode the CI job exits 0 before any mutation test runs, so its green result on `master` checks nothing. In Gates run 38555374447 on `8d319a18` it logged "REPORT mode". If the D40 gate commit has landed, the same case prints "Gate E NOT RUN" instead (see `scripts/gates/e-mutation-testing.sh`); the mode and the exit 0 are the same. Stryker is now declared in the root `package.json` and, on this machine, installs to the root `node_modules`, but the "stryker not installed" check in `e-mutation-testing.sh` looks for it only under `packages/api/node_modules`. Whether the BLOCKING path works has not been tested.

---

## Mode timeline summary

| Dispatch landing | Fragments promoted to BLOCKING |
|---|---|
| D01 | a-cross-source-no-google-maps-placeholder, a-cross-source-no-axios (admin only) |
| D02 | a-cross-source-cancellation-policy, a-cross-source-brand-color, a-cross-source-routes, a-cross-source-tier-criteria, a-cross-source-no-axios (mobile complete) |
| D04 | a-cross-source-no-siguradoshield (now alias) + new BLOCKING gate_c_articles.no-shield-references |
| D05 | a-cross-source-no-client-money — promoted 2026-04-30 |
| D06 | money-in-transaction in c-constitution.sh — promoted 2026-04-30 |
| D07/D08 | Visual baselines for admin + mobile populated |
| D11/D12 | a-cross-source-no-emoji-icons, console.* in c-constitution.sh, full Gate D + Gate E BLOCKING |
| Continuous audit 2026-09-04 | unique-regression-ids in c-constitution.sh |
| D13/D14 | All gates BLOCKING in CI; v1.0.0-launch-ready tag |

> **Correction (2026-10-14):** the D13/D14 row was the plan, and it did not happen. Gates D and E are still REPORT in `MODES.json`. The `v1.0.0-launch-ready` tag does not exist locally or on GitHub (checked 2026-10-14). That tag is Ken's to apply, not the AI coder's (`docs/runbooks/launch-cutover.md`).

This file is updated by each dispatch's closeout to mark which fragments moved from "expected to fail" to "now passing."
