# D05 fresh-session bootstrap prompt

This file is the one-shot prompt Ken pastes into a fresh Claude Code session to start D05. Treat the content between the `--- BEGIN PROMPT ---` and `--- END PROMPT ---` markers as the literal text to send. Everything else in this file is metadata for you (the human) and the AI agent answering this prompt.

## How to use

1. Open a fresh Claude Code session in this repo.
2. Paste the prompt block below verbatim.
3. The AI agent will read the named files, verify state, and run autonomously.
4. Halt only on the 5 hard stops or genuine technical blockers.

---

## --- BEGIN PROMPT ---

You are continuing Phase 14 work on the onService PH home-services platform. The prior session merged D03 + D04 to master and prepared a complete handoff for D05. Your job is to execute D05 (Money Trust Closure — 8 client-money bug fixes + 4 new service files + migration 073 + gate promotion) end-to-end and open its PR.

Read the following in order, all of them, before writing any code. Do NOT skim — re-read if a passage is dense.

1. `CLAUDE.md` (repo root) — project overview, autonomous-mode operating rules, what you must not do.
2. `.ai-coder/EXECUTION-DISCIPLINE.md` — session-start ritual (Section 1), dispatch loop (Section 2), pre-commit checklist (Section 3), being stuck (Section 6), decision pause protocol (Section 7), fake-green failure modes (Section 8).
3. `.ai-coder/AUTONOMOUS-EXECUTION-PROTOCOL.md` — the 5 hard stops; you halt for these and only these.
4. `.ai-coder/CURRENT-DISPATCH` — current state marker. The numbered subtask list there is the work order for D05.
5. `.ai-coder/dispatches/D05-plan.md` — THE handoff doc. Standing instructions, bug list, service-file specs (responsibilities, signatures, validators consumed, DB tables, bugs closed, test cases), migration 073 exact SQL, gate-promotion ordering, cross-cutting concerns. Treat it as authoritative.
6. `.ai-coder/phase-14/PART-3-BUG-REMEDIATION-DISPATCHES-05-06.md` lines 10–1228 — the source spec. The plan doc lifts the essentials, but the spec has the exact diff/code blocks per bug. Cross-check against it for each bug.
7. `.ai-coder/governance/GATE-AMENDMENTS.md` — the process if you find a gate is wrong (e.g., a false positive). Don't bypass; file an exception.
8. `.ai-coder/dispatches/closeout.template.md` — the closeout template you fill in at end of dispatch.
9. `scripts/gates/MODES.json` and `scripts/gates/EXPECTED-FAILURES.md` — gate tier state. You'll modify both in subtask 16.

Then verify state:

- You are on branch `phase/14-d05-money-trust-closure`. Run `git branch --show-current`. If not, `git checkout phase/14-d05-money-trust-closure`.
- The branch HEAD equals master HEAD (`808208f` at the time the handoff was written; fetch + rebase if master moved). Run `git log --oneline -3` and confirm the top commit is the D04 squash-merge.
- Local gates pass with the expected REPORT failures: `bash scripts/gates/run-gate-a.sh` and `bash scripts/gates/c-constitution.sh`. The REPORT failures you should see: `a-cross-source-no-client-money`, `a-cross-source-no-emoji-icons`, plus `article-4.2-no-console` (if any) and `money-in-transaction` (if any). If you see BLOCKING failures you don't expect, halt and investigate.
- Append a fresh entry to `.ai-coder/SESSION-LOG.md` with the timestamp, your read-at commit SHA, and a one-line statement of intent ("Beginning D05 implementation per handoff doc.").

Then execute. The numbered subtasks in `CURRENT-DISPATCH` are sequential. Each subtask is a coherent commit-sized unit. Subtask 1 is the read + verify step; subtask 2 (`pricing.service.ts`) is your first code commit. Follow the order — pricing.service is the architectural pattern that subsequent bugs consume, so it lands first.

Standing instructions for D05 (these come from Ken; non-negotiable):

- This is money-handling code. Every test runs against actual computed values, not mocked returns.
- Validators must reject edge cases: 0, negatives, NaN, Infinity, scientific notation strings, leading-zero strings, hex strings, currency-mixing.
- The honesty check at end of D05 closeout MUST include 3 attack scenarios manually traced — pick from the bug list, walk the code path step-by-step citing line numbers, end at the persisted DB value.
- D02 admin-editable doctrine: anywhere D05 introduces a configurable thing (surge multipliers, promo rules, addon price max, tip max), build the admin editor in this dispatch. New tunables go in `platform_settings` with seed migration AND admin UI.
- `.strict()` on every write-side Zod schema. Unknown keys throw, never silently drop.
- The gate promotion (subtask 16) is LAST. Promoting `a-cross-source-no-client-money` to BLOCKING before the bug fixes land would block D05's own PR from merging. Verify locally that the gate exits 0 on this branch before flipping the mode.

Hard stops (halt and surface to Ken):

1. `verify-master.sh` (or any local gate after 3 fix attempts) keeps failing — write `.ai-coder/escalations/E<NN>-<topic>-<date>.md` and stop.
2. Architectural decision required not covered by spec — write `.ai-coder/decisions/D05-<topic>.md` with options + recommendation, halt.
3. Money or compliance risk discovered beyond what the spec names — escalate.
4. Production data risk (a migration that drops a column with existing data, a backfill, etc.) — write a dry-run plan, halt.
5. Spec contradiction — D05 plan vs PART-3 vs existing code says materially different things — escalate.

Outside those 5: keep moving. Don't pause for permission. Don't ask "should I do X" when the plan answers it. Open the D05 PR autonomously when CI is green.

When D05 merges (Ken does the merge or self-merge per instruction): autoproceed to D06 — Transactional audit completeness. The same handoff pattern applies — D06 has its own spec section in `PART-3-BUG-REMEDIATION-DISPATCHES-05-06.md` (lines 1231 onward, 14 bugs around money-in-transaction).

The repo is at `/c/Users/kmoul/OneDrive/Documents/GitHub/onservice-onsite-app` (Windows git-bash). The user (Ken) is non-developer; communicate in plain English when you surface anything to him.

Begin.

## --- END PROMPT ---

---

## Why each section is in the prompt

- **The numbered file list** ensures the fresh session reads the same context the handoff was built against. Skipping any of those is how dispatches go off-rails.
- **The verify-state block** catches drift: master may have moved between handoff time and fresh session, branch may not be checked out, gates may be in a different state than expected.
- **Standing instructions repeated inline** so the fresh session can't claim it didn't see them. The plan doc has the same standing instructions, but redundancy here is intentional — money-handling code rewards paranoia.
- **Hard-stops list** so the fresh session knows when to halt. Without it, the session may improvise around blockers.
- **"Begin."** at the end is the autonomous-mode bootstrap. The fresh session reads, verifies, then writes code without asking.

## What is intentionally NOT in the prompt

- The exact SQL for migration 073 (it's in the plan doc; prompt-bloat avoidance).
- The 4 service-file signatures (in the plan doc).
- The 12-bug list with file:line (in the plan doc).
- The specific test case names (in the plan doc).

If the fresh session truncates or skips the plan doc, the handoff fails — but the prompt makes clear that the plan doc is authoritative.

## Open questions surfaced by writing this handoff

1. **Does migration 050 ALREADY have a `tip_max_amount_cents` row?** The plan doc says "already in defaults at ₱5,000" but I didn't grep migration 050 to confirm. Fresh session should verify and add a new migration 074 if missing.
2. **Does the `subcategories` table have a `pricing_type` column?** The plan doc's pricing.service.ts spec assumes `pricing_type IN ('fixed','quote')`. Verify schema; if column is named differently or doesn't exist, adjust.
3. **Is there a `provider_quotes` table?** from-quote.service.ts assumes it exists with `expires_at`, `status`, `customer_id`, `subcategory_id`, `amount_cents`. Verify schema in fresh session — if the existing table has different columns, the from-quote service signature adapts but the SAME bug-fix intent stands.
4. **Routes registry update** — does `apps/mobile/src/config/navigation.ts` have a route entry for the new `/booking/preview` mobile-side query, or is it server-only? Server-only — no mobile route registry change needed. Confirm.
