# D06 fresh-session bootstrap prompt

This file is the one-shot prompt Ken pastes into a fresh Claude Code session to start D06. Treat the content between the `--- BEGIN PROMPT ---` and `--- END PROMPT ---` markers as the literal text to send. Everything else in this file is metadata.

## How to use

1. Open a fresh Claude Code session in this repo.
2. Paste the prompt block below verbatim.
3. The AI agent will read the named files, verify state, and run autonomously.
4. Halt only on the 5 hard stops or genuine technical blockers.

---

## --- BEGIN PROMPT ---

You are continuing Phase 14 work on the onService PH home-services platform. The prior session merged D05 (Money trust closure — 12 client-money bugs) to master and prepared a complete handoff for D06. Master HEAD is `143ce37`, tagged `v0.14.0-d05-complete`. Your job is to execute D06 (Transactional Audit Completeness — 14 money-in-transaction bugs + 2 supporting migrations + gate promotion) end-to-end and open its PR.

**Critical context inherited from D05:** the PART-3 source spec was authored against schema identifiers that don't exist in the actual database. D05 documented 10 corrections in `.ai-coder/dispatches/D05-closeout.md` §"Spec corrections applied" — including spec uses Kysely (`db.transaction().execute((trx) => ...)`) but reality uses raw pg (`db.transaction(async (client) => ...)`). **Read that section BEFORE PART-3 §06 so you know which spec passages to mentally re-translate.** The spec was not rewritten between D05 and D06 — the same divergences apply. The D06 plan doc has its own §"Spec corrections inherited" linking to the D05 mapping.

Read the following in order, all of them, before writing any code. Do NOT skim — re-read if a passage is dense.

1. `CLAUDE.md` (repo root) — project overview, autonomous-mode operating rules, what you must not do.
2. `.ai-coder/EXECUTION-DISCIPLINE.md` — session-start ritual (Section 1), dispatch loop (Section 2), pre-commit checklist (Section 3), being stuck (Section 6), decision pause protocol (Section 7), fake-green failure modes (Section 8).
3. `.ai-coder/AUTONOMOUS-EXECUTION-PROTOCOL.md` — the 5 hard stops; you halt for these and only these.
4. `.ai-coder/CURRENT-DISPATCH` — current state marker. The numbered subtask list there is the work order for D06.
5. `.ai-coder/dispatches/D05-closeout.md` — **especially §"Spec corrections applied"**. The 10-row mapping that D06 inherits.
6. `.ai-coder/dispatches/D06-plan.md` — THE handoff doc. Standing instructions on transactionality rigor, the 14 bug list with file:line + test paths, transaction-wrapping pattern, cross-cutting concerns, migration list (075 + 076 + optional 077), 18-subtask sequence, definition of done.
7. `.ai-coder/phase-14/PART-3-BUG-REMEDIATION-DISPATCHES-05-06.md` lines 1231 to end of file — the source spec for D06. The plan doc lifts the essentials but the spec has the exact diff/code blocks per bug. **Read with the D05 spec corrections in mind** — every Kysely `db.transaction().execute((trx) => ...)` in the spec maps to the existing pg-style `db.transaction(async (client) => ...)` helper at `packages/api/src/models/db.ts:17-37`.
8. `.ai-coder/governance/GATE-AMENDMENTS.md` — the process if you find a gate is wrong. Don't bypass; file an exception (D05 hit one and used this process for the Gate B SIGPIPE fix).
9. `.ai-coder/dispatches/closeout.template.md` — the closeout template you fill in at end of dispatch.
10. `scripts/gates/MODES.json` and `scripts/gates/EXPECTED-FAILURES.md` — gate tier state. You'll modify both in subtask 16 (promote `gate_c_articles.money-in-transaction` REPORT → BLOCKING).

Then verify state:

- You are on branch `phase/14-d06-money-in-transaction`. Run `git branch --show-current`. If not, `git checkout phase/14-d06-money-in-transaction`.
- The branch HEAD equals master HEAD (`143ce37` at the time the handoff was written; `git fetch origin master && git rebase origin/master` if master moved between handoff and your session).
- Run `bash scripts/gates/run-gate-a.sh` and `bash scripts/gates/c-constitution.sh`. Expected REPORT failures: `money-in-transaction` (the one D06 owns and will promote), plus any other REPORT fragments still pending (likely just `a-cross-source-no-emoji-icons` per D05's MODES.json state). Expected BLOCKING failure: `article-16-closeout-exists` (mid-dispatch normal — clears in subtask 17). If you see other BLOCKING failures, halt and investigate.
- **Verify each function on the 14-bug list (in `D06-plan.md` §"Bug list") actually exists at the cited file:line at master HEAD `143ce37`.** D05 found that the spec's table/column names diverged from reality; D06 should expect that function names may also have shifted. Document any verified-mismatches in a §"Spec corrections inherited + extended" addendum to `D06-plan.md` (don't edit the spec itself — `.ai-coder/phase-14/*` is read-only per CLAUDE.md).
- Append a fresh entry to `.ai-coder/SESSION-LOG.md` with the timestamp, your read-at commit SHA, and a one-line statement of intent ("Beginning D06 implementation per handoff doc.").

Then execute. The numbered subtasks in `CURRENT-DISPATCH` (and `D06-plan.md` §"Subtask list") are sequential. Each subtask is a coherent commit-sized unit. Subtask 1 is read+verify; subtasks 2–4 are migrations; subtasks 5–15 are the 14 bug fixes; subtask 16 is gate promotion (LAST); subtask 17 is closeout; subtask 18 is full audit chain + push + PR.

Standing instructions for D06 (these come from Ken; non-negotiable):

- This is the INTEGRITY layer on top of D05's price-validity layer. D05 made the price come from the server; D06 makes the mutation atomic. Together: a request fully succeeds OR fully fails — no partial state.
- **Use the existing `db.transaction(async (client) => ...)` helper.** Do not introduce a new ORM. Do not write raw `BEGIN/COMMIT/ROLLBACK` SQL. The helper handles rollback-on-throw, COMMIT-on-success, client release in `finally`.
- **The trx-passing pattern.** Top-level service functions wrap; helper functions accept the `client` parameter. Per spec line 1762: "the helper takes `trx` parameter generalizes across all 14 bugs in this dispatch. Use it everywhere."
- **Tests verify ROLLBACK behavior, not just commit.** For each bug, write at least one test that mocks one query inside the transaction to throw, then asserts the database state is unchanged after the function rejects. Happy-path commit tests are necessary but not sufficient. Spec example at lines 1520–1562.
- **Honesty check at end of D06 closeout MUST include 3 partial-failure scenarios manually traced.** Each must end with one of these two statements:
  - "DB state is unchanged from before the request" (all-or-nothing rollback) OR
  - "DB state reflects only the part that committed successfully and the user-visible response is consistent with that."
  No third option. If a scenario can leave the DB in an inconsistent state, the fix is incomplete.
- **No `db.query(...)` for mutations inside a transactional service function — use `client.query(...)` only.** A common mistake: half the writes go through `client`, half through the global `db` — only the `client` writes are atomic; `db` writes leak. The `c-constitution-money-in-transaction` gate will catch most cases, but read each commit's diff yourself.
- **The gate promotion (subtask 16) is LAST.** Promoting `money-in-transaction` to BLOCKING before all 14 bug fixes land would block D06's own PR from merging. Verify locally that the gate exits 0 on this branch before flipping the mode.
- **Migration numbering: D05 took 074. D06 uses 075 (admin_actions full_notes) and 076 (soft-delete columns) per the spec; if you opt to include the optional `promo_redemptions` table from D05's deferred per-customer enforcement, that is migration 077.**
- **D05 cross-cutting awareness.** D05 modified `provider.service.ts` (Bug 1230 added `addProviderService` bounds), `recurring.service.ts`, `tip.service.ts`, `booking.service.ts` (Bug 175/176 + 1219), `services/booking/{pricing,promo,surge,from-quote}.service.ts` (new resolver namespace), and admin route handlers. D06 modifies DIFFERENT functions in some of the same files — read `D06-plan.md` §"Cross-cutting concerns with D05" before each subtask that touches a D05-modified file. The boundary: D06 modifies money-MUTATION code; D05's pricing/promo/surge/from-quote services are READ-ONLY price RESOLVERS — D06 doesn't modify them.

Hard stops (halt and surface to Ken):

1. `verify-master.sh` (or any local gate after 3 fix attempts) keeps failing — write `.ai-coder/escalations/E<NN>-<topic>-<date>.md` and stop.
2. Architectural decision required not covered by spec — write `.ai-coder/decisions/D06-<topic>.md` with options + recommendation, halt.
3. Money or compliance risk discovered beyond what the spec names — escalate.
4. Production data risk (a migration that drops a column with existing data, a backfill, etc.) — write a dry-run plan, halt.
5. Spec contradiction — D06 plan vs PART-3 vs existing code says materially different things — escalate. **Note: spec/reality divergences inherited from D05 are NOT escalations — they're documented in the plan's §"Spec corrections inherited". Apply the corrections and proceed.** A NEW divergence not covered by the D05 mapping IS an escalation.

Outside those 5: keep moving. Don't pause for permission. Don't ask "should I do X" when the plan answers it. Open the D06 PR autonomously when CI is green.

When D06 merges (Ken does the merge or self-merge per the atomic relax-merge-restore pattern documented in D01-final-closeout.md and used through D05): autoproceed to **D07 — Provider job execution trust**. The spec is at `.ai-coder/phase-14/PART-3-BUG-REMEDIATION-DISPATCHES-07-08.md` (D07 + D08 are paired in one Part 3 document). The same handoff pattern applies — D06's closeout authors `D07-FRESH-SESSION-PROMPT.md` and `D07-plan.md` so the next fresh session starts with full context.

The repo is at `/c/Users/kmoul/OneDrive/Documents/GitHub/onservice-onsite-app` (Windows git-bash). The user (Ken) is non-developer; communicate in plain English when you surface anything to him.

Begin.

## --- END PROMPT ---

---

## Why each section is in the prompt

- **Numbered file list including D05-closeout.md as item 5** — D06 inherits 10 spec corrections from D05; reading them before PART-3 §06 saves the 30-minute investigation that produced them.
- **Verify-state block including the function-existence check** — D05 found schema divergences; D06 should expect function-name divergences too. The check catches them in subtask 1, before they cost a subtask of wasted code.
- **Standing instructions repeated inline** — the discipline document covers process; the standing instructions cover the dispatch's specific rigor (transactionality, rollback tests, partial-failure honesty).
- **Hard-stops list** with the explicit clause about "spec divergences inherited from D05 are NOT escalations" — without that clause the fresh session might escalate every spec mismatch and stall.
- **"Begin."** at the end is the autonomous-mode bootstrap.

## What is intentionally NOT in the prompt

- The exact 14 bug file:line citations (in the plan doc; prompt-bloat avoidance).
- The full transaction-wrapping pattern code (in the plan doc).
- Migration SQL details (in the plan doc).
- The decision on whether to include the optional Migration 077 (deferred to subtask 1 — fresh session decides based on time/scope).

If the fresh session truncates or skips the plan doc, the handoff fails — but the prompt makes clear that the plan doc is authoritative.

## Open verification questions for the fresh session to resolve in subtask 1

1. **Function existence:** does each named function on the 14-bug list still live at the cited file:path? D05 found that table/column names diverged from spec; function names may have similarly shifted. Update citations + document in plan addendum.
2. **`processRecurringBookings` transactionality:** the daily job at `recurring.service.ts:processRecurringBookings` does multi-table writes (insert booking + insert recurring_instance + update recurring_booking) without a transaction. NOT on the 14-bug list. Include as Bug-d06-extra OR defer to follow-up dispatch with written justification?
3. **`booking.service.createBooking` transactionality:** D05's bug-176 fix made addon prices server-canonical but did NOT wrap the booking + addon INSERTs in a transaction. If addon insert fails after booking insert succeeds, partial state. NOT on the 14-bug list. Include as Bug-d06-extra OR defer?
4. **Migration 077 decision:** include `promo_redemptions` table to close D05's deferred per-customer promo limit (D05 closeout §"Open questions" item 1), or defer to D07+? Including means promo.service.resolvePromo can finally enforce `usage_limit_per_customer`.
5. **Bug 237 scope:** "catalog.service.* mutations" is vague in the spec. Verify the exact set of mutating functions in `catalog.service.ts` (likely `createSubcategory`, `updateSubcategory`, `deleteSubcategory`, `createCategory`, etc.) and document in the plan addendum which ones the bug-237 commit covers.
