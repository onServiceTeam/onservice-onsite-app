# THE AUTONOMOUS EXECUTION PROTOCOL

**The default workflow for this project is: AI coder runs phase → self-verifies → moves to next phase. No human gate between phases. Ken catches up at his pace, with the evidence chain available for any phase he wants to audit.**

This document defines exactly when the AI coder may auto-proceed and when it MUST stop.

---

## The default: keep going

Once Ken says "begin Phase 00," the AI coder runs the entire chain Phase 00 → 01 → 02 → ... → 12 without pausing for approval, **provided every gate at the end of each phase passes.**

If a gate passes, the AI coder:

1. Commits the phase work
2. Pushes the branch
3. Writes the phase report to `.ai-coder/checkpoints/logs/PHASE-NN/REPORT.md`
4. Sends Ken a brief one-message summary: "Phase NN complete. Verified. Proceeding to Phase NN+1."
5. Immediately starts Phase NN+1 without waiting for response

Ken does not need to reply. Ken does not need to approve. Ken can sleep, eat, fly to Boracay — the system continues.

If at any point Ken says "stop" or "pause" or "wait, let me look at NN," the AI coder stops at the next clean checkpoint (end of current phase). Ken can review, then say "continue" — and the AI coder resumes.

---

## The hard stops — when the AI coder MUST pause

There are exactly five conditions under which the AI coder stops and waits for Ken:

### Stop 1 — Verify-master.sh exits non-zero

If `bash .ai-coder/checkpoints/verify-master.sh PHASE-NN` returns exit code 1 after the AI coder has completed the phase, the AI coder must:

1. Inspect the failure reason
2. Attempt to fix (3 attempts maximum)
3. If still failing after 3 attempts: stop, write a detailed `BLOCKER.md` to the phase log directory, send Ken a focused message with the blocker
4. Wait for Ken's input

The AI coder must not silently lower a check, suppress a warning, or move on with a known failure. The penalty is a constitutional violation under Article 2 (Truth-Telling).

### Stop 2 — Architectural decision required

Per the constitution, certain decisions are above the AI coder's authority:

- Adding a new top-level dependency not on the approved list
- Choosing between two materially different technical approaches when the spec is silent
- Modifying the existing repo-root spec documents (COMPLETE-PH-Home-Services-Platform-Specification.md, etc.)
- Introducing a new pattern that would propagate across the codebase
- Changing the multi-service / multi-city / pricing strategy
- Anything that would affect customer-visible behavior beyond what the phase doc specifies

For these, the AI coder writes `.ai-coder/checkpoints/logs/escalations/ESC-<date>-<topic>.md` describing the situation, the options, the AI coder's recommendation, and waits.

### Stop 3 — Money or compliance risk

Anything that touches money flow correctness or regulatory compliance with non-trivial implications:

- A money calculation bug that requires changing the commission / fee / refund / VAT / withholding logic
- An inconsistency between the existing spec docs and what the phase requires
- A potential BIR / NPC / DTI / Anti-Dummy compliance issue not covered by the phase doc
- A PII handling decision not covered by the phase doc

The AI coder must escalate, not improvise.

### Stop 4 — Production data risk

Anything that could affect real customer data:

- A migration that would drop or rename a column with existing data
- A backfill script
- A delete or truncate operation against any table
- Any operation against `DATABASE_URL` pointing to staging or production

The AI coder must write the operation as a dry-run plan and wait for Ken to confirm.

### Stop 5 — Spec contradiction

If during a phase, the AI coder discovers that:

- The phase doc says X
- The existing spec docs (COMPLETE-PH-Home-Services-Platform-Specification.md, EXPANSION-v2-SDLC-SRS-Infrastructure-Issues.md, COMPREHENSIVE-271-ISSUE-AUDIT.md) say Y
- And X and Y are materially different (not just clarifications)

→ Stop. Document. Ask Ken which is correct. Update the source of truth.

---

## The auto-proceed gate criteria

### Which gate applies per phase

- **All phases (PHASE-00..PHASE-12)** — gate is `bash .ai-coder/checkpoints/verify-phase.sh PHASE-NN`, which is a thin wrapper around `verify-master.sh PHASE-NN` (full 6-gate gauntlet: mechanical, behavioral, adversarial, visual, integration, evidence).
- Per **TD-001** (resolved), every gate that surface-scans the repo (forbidden patterns, emoji-as-icon, phantom tests, N+1) is **baseline-delta-aware**: it accepts `--phase PHASE-NN`, reports both absolute and phase-introduced violation counts, and **fails only on violations introduced by this phase**. Pre-existing violations are reported informationally and accumulated by `verify-master.sh` into `BASELINE-DEBT.md`.
- **PHASE-02** remains the primary cleanup phase. Its job is to drive the absolute-violation counts in `BASELINE-DEBT.md` to zero. Until PHASE-02 completes, absolute counts will be non-zero and that is **expected, not a regression** — but each later phase must still introduce zero new violations, and any deferred items must be enumerated in the phase's `EVIDENCE-MANIFEST.md` "Deferred to later phases" section.
- `verify-bootstrap.sh` remains in the tree as a focused PHASE-00 preflight (scripts/templates/tokens/baseline-capture present) and may be invoked explicitly by the Phase 00 plan, but is no longer dispatched by `verify-phase.sh`.

### Required gate exit codes

For the AI coder to auto-proceed from PHASE-NN to PHASE-NN+1, ALL of the following must be true:

1. `bash .ai-coder/checkpoints/verify-phase.sh PHASE-NN` returns exit code 0 (delegates to `verify-master.sh PHASE-NN`)
2. `bash .ai-coder/checkpoints/verify-no-forbidden.sh --phase PHASE-NN` returns exit code 0 (also covered by gate 1)
3. `bash .ai-coder/checkpoints/verify-no-emoji.sh --phase PHASE-NN` returns exit code 0 (also covered by gate 1)
4. `bash .ai-coder/checkpoints/verify-no-phantom-tests.sh --phase PHASE-NN` returns exit code 0 (also covered by gate 1)
5. `bash .ai-coder/checkpoints/verify-money-conservation.sh` returns exit code 0
6. `bash .ai-coder/checkpoints/verify-deps.sh` returns exit code 0
7. The full test suite passes: `npm run api:test` (no failures, no skips beyond pre-existing baseline)
8. Build succeeds: `npm run admin:build` (admin only after Phase 04+)
9. Typecheck passes: `npm run typecheck`
10. Lint passes: `npm run lint`
11. Visual UX audit report exists for any UI phase: `.ai-coder/checkpoints/logs/PHASE-NN/visual/REPORT.md` referencing every modified screen
12. Sanity-check log exists: `.ai-coder/checkpoints/logs/PHASE-NN/sanity-checks.log` with entries proportional to diff size
13. Evidence manifest exists: `.ai-coder/checkpoints/logs/PHASE-NN/EVIDENCE-MANIFEST.md` with attestation
14. Honesty check exists with substantive answers: `.ai-coder/checkpoints/logs/PHASE-NN/HONESTY-CHECK.md`
15. Hash chain generated: `.ai-coder/checkpoints/logs/PHASE-NN/HASHES.sha256`
16. Baseline-debt summary generated: `.ai-coder/checkpoints/logs/PHASE-NN/BASELINE-DEBT.md` (auto-written by `verify-master.sh`); absolute counts must be **non-increasing** vs the prior phase's `BASELINE-DEBT.md`

If ALL pass: the AI coder auto-proceeds to PHASE-NN+1.

If ANY fail: the AI coder MUST stop, fix, re-run. Cannot proceed with red.

---

## The phase report (sent to Ken on every auto-proceed)

When the AI coder auto-proceeds, it sends Ken ONE concise message:

```
Phase NN — [Title] — COMPLETE & VERIFIED

Summary (3 lines):
- What changed
- What was verified
- What's next

Evidence:
- Manifest: .ai-coder/checkpoints/logs/PHASE-NN/EVIDENCE-MANIFEST.md
- Visual report (if UI phase): .ai-coder/checkpoints/logs/PHASE-NN/visual/REPORT.md
- Hash chain: .ai-coder/checkpoints/logs/PHASE-NN/HASHES.sha256

Now executing Phase NN+1 — [Title].
```

Ken can ignore this message and the chain continues. Ken can reply "stop" / "show me NN" / specific question, and the AI coder pauses at the next clean checkpoint.

---

## Catch-up audit (Ken's review at his own pace)

Whenever Ken wants to audit any past phase, he runs:

```bash
# Re-verify any phase
bash .ai-coder/checkpoints/verify-master.sh PHASE-NN

# Read what happened
cat .ai-coder/checkpoints/logs/PHASE-NN/REPORT.md
cat .ai-coder/checkpoints/logs/PHASE-NN/EVIDENCE-MANIFEST.md
cat .ai-coder/checkpoints/logs/PHASE-NN/HONESTY-CHECK.md
cat .ai-coder/checkpoints/logs/PHASE-NN/visual/REPORT.md  # if UI phase

# Check screenshots
ls .ai-coder/checkpoints/logs/PHASE-NN/visual/

# Verify the hash chain (proves nothing was altered after the fact)
cd .ai-coder/checkpoints/logs/PHASE-NN
sha256sum -c HASHES.sha256
```

If Ken finds an issue post-hoc, he writes a bug report and sends to the AI coder, which stops, addresses the bug, and continues.

---

## The fail-closed default

If the AI coder is uncertain whether to auto-proceed or stop, the AI coder STOPS. Default is conservative.

Examples of "uncertain":
- "verify-master.sh passed but I noticed something in the logs that worried me"
- "Tests pass but I don't fully understand why this fixes the bug"
- "I think this works but the spec doc is ambiguous"

In all such cases: stop, escalate, wait. Continuing through uncertainty is how systems break in production.

---

## The momentum vs. integrity balance

Auto-proceed is the default because Ken's time is more valuable than waiting on async approval. But auto-proceed is NOT a license for less rigor. The AI coder must do MORE rigor when auto-proceeding, not less, because there's no human gate to catch mistakes.

Specifically:

- The Honesty Check answers must be substantive, not perfunctory
- The Visual UX audit must include actual browser screenshots, not just descriptions
- The Pre-mortem (Gate 3e) must include scenarios specific to this phase, not generic ones
- The Evidence Manifest must reference real artifacts, not "TODO"
- The Sanity-Check log must show genuine cross-cutting checks, not skim entries

If the AI coder cannot maintain this rigor, it must slow down to stop-and-confirm mode.

---

## When to ask Ken explicitly anyway

Even if no Stop condition is triggered, the AI coder may CHOOSE to ask Ken when:

- A judgment call has high impact (e.g., naming a customer-facing feature, choosing default copy for a key screen)
- The result is hard to reverse (e.g., committing to a third-party integration architecture)
- Ken indicated preference for a specific approach earlier in the conversation

In these cases, asking is not a stop — it's a sanity check. Frame it tightly: "I'm about to choose A over B because X. Stop me if you'd prefer B."

If Ken doesn't reply within a reasonable window: proceed with the AI coder's recommendation, document the decision, and continue. Ken's silence is permission, given that he asked for autonomy.

---

## The ratchet

After 3 consecutive phases with passing audits and no Ken-initiated rollbacks, the AI coder may **increase autonomy** further:

- Skip the explicit "Now executing Phase NN+1" message — just do it
- Send a summary at the end of every 3 phases instead of every phase

After any failed audit or any Ken-initiated stop, the ratchet **resets** — back to per-phase notification.

---

## The end of the chain

When PHASE-12 completes successfully, the AI coder:

1. Tags the commit `v1.0.0-launch-ready`
2. Generates `LAUNCH-READINESS-REPORT.md` summarizing all 13 phases
3. Sends Ken a final message:

```
All 13 phases complete. Codebase is production-ready per the package definition.

Summary:
- N tests passing
- M screens shipping
- All 463 applicable QA checks passed across phases
- Money conservation verified
- Visual UX audited at $100K standard
- Cross-platform validated

LAUNCH-READINESS-REPORT.md is the master summary.

Awaiting your decision on launch.
```

At THIS point — and only this point — does the AI coder stop and require Ken's explicit input. Launch decisions are not the AI coder's authority.
