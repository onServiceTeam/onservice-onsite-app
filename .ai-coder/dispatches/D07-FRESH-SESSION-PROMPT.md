# D07 fresh-session bootstrap prompt

This file is the one-shot prompt Ken pastes into a fresh Claude Code session to start D07. Treat the content between the `--- BEGIN PROMPT ---` and `--- END PROMPT ---` markers as the literal text to send. Everything else in this file is metadata.

## How to use

1. Open a fresh Claude Code session in this repo.
2. Paste the prompt block below verbatim.
3. The AI agent will read the named files, verify state, and run autonomously.
4. Halt only on the 5 hard stops or genuine technical blockers.

---

## --- BEGIN PROMPT ---

You are continuing Phase 14 work on the onService PH home-services platform. The prior session merged D06 (Transactional audit completeness — 14 money-in-transaction bugs + 2 adjacent inline fixes + new BLOCKING gate) to master and prepared a complete handoff for D07. Master HEAD is `c9632a9`, tagged `v0.14.0-d06-complete`. Your job is to execute D07 (Provider job execution trust — 12 bugs spanning mobile photo/signature upload, server-side checklist templates, and S3 storage) end-to-end and open its PR.

**Critical context inherited from D05 + D06:**

1. **Spec/reality divergences.** The PART-3 source spec was authored against schema and file-layout assumptions that don't match the actual codebase. D05 documented 10 corrections; D06 found 15 more. Read both [`.ai-coder/dispatches/D05-closeout.md`](D05-closeout.md) §"Spec corrections applied" AND [`.ai-coder/dispatches/D06-closeout.md`](D06-closeout.md) §"Spec corrections inherited from D05 + extended in D06" before reading PART-3 §07. Most likely D07 inheritances:
   - Migrations: D06 took 075 + 076. D07's spec calls its first migration "076" — that conflicts; use **078** (checklist_templates) and **079** (booking_photos_signatures).
   - DB style: spec uses Kysely; codebase uses raw pg `db.query` / `db.transaction(async (client) => ...)`.
   - Table name `subcategories` → reality `service_subcategories`.
   - `admin_users` table referenced in spec FK does not exist — admins are tracked via `admin_staff` (migration 046) and `users.role`. Reconcile.
   - File paths in `apps/mobile/app/...` may have shifted; verify each.

2. **Trx-aware composition pattern.** D06 introduced helpers like `releaseEscrowInTransaction(client, ...)` so callers can compose money/audit atomically. D07's checklist completion + photo upload + audit trail follow the same shape: top-level service wraps in `db.transaction`, helpers accept `client` parameter.

3. **The `money-in-transaction` gate is now BLOCKING.** Any new code that does top-level `db.query("INSERT INTO admin_actions ...")` or `db.query("UPDATE wallets ...")` outside a `db.transaction` will fail Gate C. Use `// gate-c-allowed:` markers only for documented best-effort audit patterns (try/catch + logger.warn).

Read the following in order, all of them, before writing any code. Do NOT skim — re-read if a passage is dense.

1. `CLAUDE.md` (repo root) — project overview, autonomous-mode operating rules, what you must not do.
2. `.ai-coder/EXECUTION-DISCIPLINE.md` — session-start ritual (Section 1), dispatch loop (Section 2), pre-commit checklist (Section 3), being stuck (Section 6), decision pause protocol (Section 7), fake-green failure modes (Section 8).
3. `.ai-coder/AUTONOMOUS-EXECUTION-PROTOCOL.md` — the 5 hard stops; you halt for these and only these.
4. `.ai-coder/CURRENT-DISPATCH` — current state marker. The numbered subtask list there is the work order for D07.
5. **`.ai-coder/dispatches/D05-closeout.md` §"Spec corrections applied"** AND **`.ai-coder/dispatches/D06-closeout.md` §"Spec corrections inherited from D05 + extended in D06"** — the combined 25 spec/reality corrections that D07 inherits.
6. `.ai-coder/dispatches/D07-plan.md` — THE handoff doc. Standing instructions on photo-upload integrity, the 12 bug list with file:line + test paths, S3 + KMS architecture, migration list (078 + 079), 18-subtask sequence, definition of done.
7. `.ai-coder/phase-14/PART-3-BUG-REMEDIATION-DISPATCHES-07-08.md` lines 10–926 — the source spec for D07. The plan doc lifts the essentials but the spec has the exact diff/code blocks per bug. **Read with the D05 + D06 spec corrections in mind.**
8. `.ai-coder/governance/GATE-AMENDMENTS.md` — the process if you find a gate is wrong. Don't bypass; file an exception.
9. `.ai-coder/dispatches/closeout.template.md` — the closeout template you fill in at end of dispatch.
10. `scripts/gates/MODES.json` and `scripts/gates/EXPECTED-FAILURES.md` — gate tier state. D07's spec doesn't promote any new gate to BLOCKING (D11/D12 own the visual + console.* + emoji gates per the timeline).

Then verify state:

- You are on branch `phase/14-d07-provider-job-trust`. Run `git branch --show-current`.
- The branch HEAD equals master HEAD (`c9632a9` at handoff time; rebase if master moved).
- Run `bash scripts/gates/run-gate-a.sh` and `bash scripts/gates/c-constitution.sh`. Both should be green except `article-16-closeout-exists` BLOCKING (mid-dispatch normal — clears in subtask 17).
- **Verify each of the 12 functions/files on D07's bug list at master HEAD.** Same playbook as D06 subtask 1: paths shift between Phase 13 and Phase 14; document in a §"Spec corrections inherited + extended" addendum to `D07-plan.md`.

Then execute. The numbered subtasks in `CURRENT-DISPATCH` (and `D07-plan.md` §"Subtask list") are sequential. Each subtask is a coherent commit-sized unit.

Standing instructions for D07 (these come from Ken; non-negotiable):

- **This is the integrity layer for the customer ↔ provider trust model.** Customer pays into escrow → provider does the work → photos prove the work → checklist documents it → server verifies → customer reviews → escrow releases. Every link in that chain currently has a hole; D07 closes them.
- **Photos must reach S3.** Mobile uploads use the existing `upload.service.ts` (or its successor) with multipart form data. Server stores the S3 URL, never `file://`. Validate URL shape on receipt.
- **Photo-upload tests must verify the S3 path is valid + the URL is NOT a `file://` URI.** Same test rigor as D06's rollback assertions: write the test FIRST, simulate the failure mode, assert the system rejects it.
- **Checklist templates ship per service category.** D07 ships starter templates for cleaning, aircon, plumbing, electrical, beauty, massage, pest control, gardening. Ken's operations lead validates each template — Decision point flagged in closeout.
- **Signature is captured as PNG** (not just `signedAt` timestamp). Stored in S3 alongside photos. Provider IC agreement screen and customer review screen both render from S3.
- **Server-side checklist completion validation.** Provider can NOT mark a job complete until: (a) all required template items are checked, (b) photo-required items have ≥1 photo, (c) total ≥2 after-photos uploaded.
- **D06 cross-cutting awareness.** D06 modified `services/booking-admin.service.ts` (cancelBookingAsAdmin, manualReleaseEscrow, refundBookingEscrow), `services/escrow.service.ts` (added 3 trx-aware helpers), `services/dispute.service.ts` + `services/dispute-admin.service.ts` (added resolveDisputeInTransaction), `services/business.service.ts` (transferOwnership, removeMember soft delete), `services/staff.service.ts` (deleteRole soft delete), `services/catalog.service.ts` (mutations extracted from routes), `services/provider-admin.service.ts` (notes + profile + wallet adjust). D07 modifies DIFFERENT functions in some of the same files (e.g., `provider-admin.service.ts:approveProvider`); read the D06 closeout's "Files modified" list before each subtask that touches a D06-modified file.
- **The new D07 migrations are 078 (checklist_templates) and 079 (booking_photos_signatures).** D06 took 075 + 076; D05 took 074. The PART-3 spec calls them 076 + 077 — those numbers are taken; renumber.
- **EAS rebuild required after this dispatch** because of `react-native-signature-canvas` native dependency. Document in closeout.

Hard stops (halt and surface to Ken):

1. `verify-master.sh` (or any local gate after 3 fix attempts) keeps failing — write `.ai-coder/escalations/E<NN>-<topic>-<date>.md` and stop.
2. Architectural decision required not covered by spec — write `.ai-coder/decisions/D07-<topic>.md` with options + recommendation, halt.
3. Money or compliance risk discovered beyond what the spec names — escalate.
4. Production data risk (a migration that drops a column with existing data, a backfill, etc.) — write a dry-run plan, halt.
5. Spec contradiction — D07 plan vs PART-3 vs existing code says materially different things — escalate. **Note: spec/reality divergences inherited from D05 + D06 are NOT escalations — apply the corrections and proceed.** A NEW divergence not covered by the existing mappings IS an escalation.

Outside those 5: keep moving. Don't pause for permission. Don't ask "should I do X" when the plan answers it. Open the D07 PR autonomously when CI is green.

When D07 merges (Ken does the merge or self-merge per the atomic relax-merge-restore pattern documented in D01-final-closeout.md and used through D06): autoproceed to **D08 — NPC compliance + DSR**. The spec is at `.ai-coder/phase-14/PART-3-BUG-REMEDIATION-DISPATCHES-07-08.md` lines 928–end. The same handoff pattern applies — D07's closeout authors `D08-FRESH-SESSION-PROMPT.md` and `D08-plan.md` so the next fresh session starts with full context.

The repo is at `/c/Users/kmoul/OneDrive/Documents/GitHub/onservice-onsite-app` (Windows git-bash). The user (Ken) is non-developer; communicate in plain English when you surface anything to him.

Begin.

## --- END PROMPT ---

---

## Why each section is in the prompt

- **Numbered file list including BOTH D05 and D06 closeouts** — D07 inherits 25 spec corrections combined; reading both before PART-3 §07 saves the investigation that would otherwise produce them.
- **Migration renumbering note inline** — D06 took 075 + 076; D07's spec calls its migrations 076 + 077; without the explicit renumber instruction the fresh session would either collide or have to derive the number from scratch.
- **Verify-state block including the function/file existence check** — D05 + D06 found path divergences; D07 should expect them too. The check catches them in subtask 1, before they cost a subtask of wasted code.
- **D06 cross-cutting awareness section** — explicitly lists files D06 modified so D07 can plan rebases / merges. Same as D05→D06 had.
- **"Begin."** at the end is the autonomous-mode bootstrap.

## What is intentionally NOT in the prompt

- The exact 12 bug file:line citations (in the plan doc; prompt-bloat avoidance).
- Migration SQL details (in the plan doc).
- The S3 + KMS upload-helper architecture (in the plan doc).
- The checklist template content (in the plan doc + the 8 starter templates seeded in migration 078).

If the fresh session truncates or skips the plan doc, the handoff fails — but the prompt makes clear that the plan doc is authoritative.

## Open verification questions for the fresh session to resolve in subtask 1

1. **`admin_users` table referenced in spec FKs:** the spec's CREATE TABLE statements reference `admin_users(id)` for `created_by`. That table does not exist in this codebase — admins are in `users` (role-based) with `admin_staff` linking. Choose: change FK to `users(id)` OR omit `created_by` (mention in closeout).
2. **Path verification for the 12 bugs.** Each bug has a cited file:line in PART-3. Confirm each function/file exists or document the migration in a §"Spec corrections inherited + extended" addendum to `D07-plan.md`.
3. **`react-native-signature-canvas` not yet installed.** D07 needs to add it to `apps/mobile/package.json`. EAS rebuild is required on next deploy. Document in closeout's "Decision points for Ken".
4. **S3 bucket + KMS key**: Bug 36/37/38 require an S3 bucket configured. Verify Terraform state in `infra/` has the booking-photos bucket, OR add to D07's scope as a separate Terraform commit.
5. **Bug 38 (chat broken) deferred to v1.1 per spec line 873.** Confirm and add to LAUNCH-LIMITATIONS.md.
