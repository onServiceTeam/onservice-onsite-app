# DEFINITION OF DONE

A phase is "done" only when EVERY one of the following is true. There is no "mostly done." There is no "done with caveats." There is "done" or "not done."

---

## The 14 Conditions of Done

### 1. The phase's stated goal is achieved

The phase document opens with a "Goal" section. The goal is achieved if a non-technical user could perform the action(s) described in the goal without seeing an error.

### 2. Every step in the phase document is complete

The phase has numbered steps. You completed each one. You did not skip any. You did not declare a step "not applicable" without writing in the log why and getting Ken's acknowledgment.

### 3. `npm run typecheck` returns zero errors and zero warnings

You run it. The terminal shows zero errors and zero warnings. You include the output in the phase log. You do not interpret "type warning" as acceptable. Zero is zero.

### 4. `npm run lint` returns zero errors and zero warnings

Same standard.

### 5. `npm run test` and `npm run api:test` pass with the count expected

The expected count is in the phase document. If the phase added 5 tests, the count must increase by 5 (or the phase document explicitly says some tests are deleted). If existing tests fail, the phase is not done.

### 6. Every checkpoint script for this phase passes

The phase lists which checkpoint scripts to run. Each script returns exit code 0. Each script's output is included in the log.

### 7. The money conservation test passes

`escrow-money-conservation.test.ts` must always pass after every phase. If your phase touched any money-handling code and the test breaks, the phase is not done. If your phase did not touch money code and the test breaks, you stop and report a regression to Ken.

### 8. No emoji-as-iconography is introduced

After Phase 02, no emoji as iconography is allowed in committed code. If you introduce one, the phase is not done. The `verify-no-emoji.sh` checkpoint script catches this; you must run it.

### 9. No `// TODO`, `// FIXME`, `// HACK`, `// PENDING`, `console.log`, or `console.error` in production paths

Run `grep -rn "TODO\|FIXME\|HACK\|PENDING\|console\.log\|console\.error" packages/api/src apps/admin/src apps/mobile/app | grep -v node_modules | grep -v __tests__`. Result must be empty for committed code (test files may have console output during dev — but committed test files should use `expect()` not `console.log`).

### 10. No `any` type introduced

Run `grep -rn ": any\b\|as any\b\|<any>" packages/api/src apps/admin/src apps/mobile/app | grep -v node_modules`. Result must be empty.

### 11. The phase log is committed

The log is at `.ai-coder/checkpoints/logs/PHASE-NN.log`. It contains:
- Phase number, title, branch name
- Start timestamp, end timestamp
- Every checkpoint script output (full, not summarized)
- Every test output (full)
- The final `git status` showing clean working tree
- The final `git log -1 --format=fuller` showing the merge commit

### 12. The branch is up to date with main and merge-ready

You rebased onto `main` at the start of the phase. You handled any conflicts. The branch is one PR away from being merged.

### 13. The phase report message is sent to Ken

You wrote the phase report message per `AI-CODER-PROMPT.md` Section "How you communicate with Ken." It includes status, summary, files changed, log path, screens to review, open questions, and next phase.

### 14. You stopped

You did not start the next phase. You sent the phase report. You waited. If Ken approved, only then do you start the next phase.

---

## What "Done" is NOT

- "Done" is not "the code I wrote works on my machine."
- "Done" is not "the tests I wrote pass."
- "Done" is not "the new feature works." (The new feature works AND no regression.)
- "Done" is not "I'm 95% sure it's done."
- "Done" is not "Ken can probably figure out the rest."
- "Done" is not "I added a TODO for the edge case."
- "Done" is not "I'll fix it in the next phase."
- "Done" is not "the failing test is unrelated to my change."

---

## Self-attestation

At the end of every phase, before sending the phase report, you write the following sentence at the top of the phase log file:

> "I attest that all 14 Conditions of Done are met for Phase NN. I ran every checkpoint script myself in this session. I read every error message in full. I did not skip, suppress, or work around any check. If any of this is untrue, I commit a constitutional violation."

If you cannot truthfully write that sentence, the phase is not done. You stop, you tell Ken what's blocking, and you wait.

## Condition 15 — The 100% Accuracy Protocol

For any phase that produces production code (Phases 02 through 12), the 14 conditions above are necessary but not sufficient. You must additionally pass all six gates of `100-PERCENT-ACCURACY-PROTOCOL.md`:

- **Gate 1** — Mechanical correctness (zero typecheck/lint/forbidden errors, with logs)
- **Gate 2** — Behavioral correctness (paper trace + boundary test matrix + tests run)
- **Gate 3** — Adversarial self-review (mutation testing + delete-and-check + hostile inputs + pre-mortem)
- **Gate 4** — Visual & interactive (screen audit + interaction recording + stranger test)
- **Gate 5** — Integration & regression (fresh DB + money conservation + smoke test + N+1 detector)
- **Gate 6** — Evidence audit (manifest + honesty check + adversarial review of evidence)

The phase is NOT done until `bash .ai-coder/checkpoints/verify-evidence-manifest.sh PHASE-NN` returns exit code 0.

The evidence manifest at `.ai-coder/checkpoints/logs/PHASE-NN/EVIDENCE-MANIFEST.md` is the artifact that lets Ken audit your claims. Without it, the phase cannot be approved.

## Condition 16 — The Continuous Sanity-Check Log

The phase is NOT done until `.ai-coder/checkpoints/logs/PHASE-NN/sanity-checks.log` exists, contains the structured per-change entries defined in `CONTINUOUS-SANITY-CHECK.md`, and has at least one entry per meaningful change in the phase's git diff.

A phase with 12 significant changes and only 1 sanity-check entry indicates the AI coder skipped the after-every-change ritual. The phase fails Gate 6 (Evidence Audit). The AI coder must redo the work with the ritual actually performed.

The sanity-check log is reviewed by `verify-master.sh` and is part of the cryptographic hash chain.

---

## When the AI coder lies

If Ken later discovers that a Condition of Done was not actually met but was attested as met, that is a constitutional violation under Article 2 (Truth-Telling). Ken's response options include:

- Reverting the commit and starting the phase over
- Asking the AI coder to write a public correction in `.ai-coder/checkpoints/violations.log`
- Switching AI coder vendor (the next vendor reads the violations log as cautionary tale)

The system depends on the AI coder being honest about checks. There is no shortcut around this.
