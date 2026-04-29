# EXECUTION DISCIPLINE

This is the AI coder's session-by-session operating manual for executing Phase 14. It is consulted at the start of every session, every time. It exists because Phase 13 produced 1,371 bugs while AI coders ran without procedures and improvised. The procedures here are the structural defense.

This document is read-only for the AI coder. If you find an error in it, write `.ai-coder/escalations/E<NN>-discipline-error-<date>.md` and halt.

---

## Section 0 — Operating mode

Ken has authorized **autonomous between dispatches** and **full audit chain (not spot-check) at every dispatch**. The combined model:

- After a dispatch's PR opens with all 5 gates green, you immediately begin the next dispatch on a new branch from the prior dispatch's HEAD. You do NOT wait for Ken to merge.
- Every dispatch produces the full audit chain: continuous sanity per meaningful change, 100% accuracy 6 gates at end, MASTER-QA applicable check artifacts with CHECK INDEX, visual UX 5-pass report (real Playwright/Maestro screenshots), evidence manifest, honesty check answers, cryptographic HASHES.sha256.
- Hard stops (the 5 conditions in `.ai-coder/AUTONOMOUS-EXECUTION-PROTOCOL.md`) still pause autonomous mode. Outside those, keep moving.
- You never merge your own PRs (Constitution Article 8.1). Ken merges. PRs queue.
- You never lower rigor when auto-proceeding. There is no human gate to catch shortcuts; your discipline IS the gate. Phase 13's 9 falsified gate logs are the cautionary tale.

This Section 0 reflects Ken's explicit instruction in this session. Where any earlier passage of this document or `CLAUDE.md` says "stop and wait for Ken's merge approval" between dispatches, the autonomous-mode interpretation supersedes it: open PR, post summary, start the next dispatch.

---

## Section 1 — The session-start ritual

Every session, in order, before writing any production code:

**Step 1.1.** Read `CLAUDE.md` at the repo root. Even if you read it last session.

**Step 1.2.** Run `git status` and `git branch --show-current`. Confirm you know what branch you are on. If you are on `main` or `master`, stop — you should be on a `phase/14-d<NN>-*` branch (or `phase/14-bootstrap` during bootstrap).

**Step 1.3.** Read `.ai-coder/CURRENT-DISPATCH`. This file tells you which dispatch you are working on, the branch name, and the last subtask you completed. If the file is missing or stale, you are between dispatches; consult Section 4 "Starting a new dispatch."

**Step 1.4.** Read `.ai-coder/SESSION-LOG.md`. This is the running log of what happened in prior sessions. Check the last entry to confirm continuity. If the log claims work was completed but `git log` does not show the commits, you have an inconsistency; halt and escalate.

**Step 1.5.** Run the gates locally on the current branch:
```bash
bash scripts/gates/run-gate-a.sh
bash scripts/gates/c-constitution.sh
```
Gates B, D, E require CI infrastructure and are checked at PR time, not session-start. But A and C run locally in seconds. If either is red, your last session left work in a broken state. Read what is failing and fix it before doing anything else.

**Step 1.6.** Append a new entry to `.ai-coder/SESSION-LOG.md` with the current timestamp, your read-at commit SHA, and a one-line statement of what you intend to do this session.

**Step 1.7.** Begin work per the appropriate procedure (Section 4 if starting a dispatch, Section 5 if mid-dispatch).

The ritual takes about 5 minutes. It catches inconsistencies early. Skipping the ritual is how you end up with `main` polluted by half-merged work.

---

## Section 2 — The dispatch loop

A dispatch follows a strict 7-phase loop. The loop is the same for Dispatches 01 through 14.

### Phase 1 — Open the dispatch

When `.ai-coder/CURRENT-DISPATCH` is empty, you are starting a new dispatch.

1. Determine the next dispatch number. Read all closeout files in `.ai-coder/dispatches/`. The next dispatch is one higher than the highest closeout number.
2. Confirm the prior dispatch was merged. Run `git log --oneline main | grep "Dispatch <N-1>"`. The merge commit must be on main. If not, the prior dispatch is not done; halt and read the prior dispatch's closeout to understand state.
3. Read the relevant Part 3 document for this dispatch in full. The 14 dispatches are paired into 7 documents at `.ai-coder/phase-14/PART-3-BUG-REMEDIATION-DISPATCHES-<NN>-<NN>.md`. Open the right one.
4. Create the dispatch branch: `git checkout -b phase/14-d<NN>-<slug>` where `<slug>` is the kebab-case dispatch name from the Part 3 doc.
5. Write `.ai-coder/CURRENT-DISPATCH` with: dispatch number, branch name, planned bug list, started-at timestamp.

### Phase 2 — Plan the work

Before writing code, write `.ai-coder/dispatches/D<NN>-plan.md` containing:

- The full bug list (copy from the Part 3 dispatch goal section)
- Subtask breakdown (group bugs by file or by architectural pattern)
- The order you will tackle them (dependencies first; e.g., schema migrations before service code that uses the new tables)
- Test files you will add (one per bug minimum)
- Migrations you will add (with sequential numbering continuing from the highest existing migration)
- Files you expect to modify (best estimate; will be refined as work progresses)

The plan is a working document; it is not the closeout. It exists so that when you halt mid-dispatch and resume next session, you know where you were.

### Phase 3 — Execute the work

For each bug in the planned order:

3a. Open the file at the cited file:line from the Part 3 doc. Read enough surrounding context to understand the change.
3b. Write the test FIRST. The test must reference the bug number explicitly (e.g., `describe('Bug 176 — addon prices server-canonical')` or `// Bug 176 fix verified`). The test must fail before your fix is applied.
3c. Run the test to confirm it fails. If it passes before your fix, the test is not actually testing the bug; rewrite it.
3d. Apply the fix per the Part 3 spec. Do not improvise — if the spec is ambiguous, halt and consult Section 6 "Being stuck."
3e. Run the test to confirm it passes.
3f. Run any tests that were already passing to confirm you have not broken them.
3g. Run gates A and C locally.
3h. Commit with the message format: `fix(<area>): <description> — Bug <NNNN>`. Example: `fix(api): server-canonical addon prices — Bug 176`.
3i. Update `.ai-coder/CURRENT-DISPATCH` "last subtask completed" field.

Repeat for every bug. Do not batch multiple bugs into one commit. One bug, one commit. This makes Gate B's verification trivial and rollback possible.

### Phase 4 — Pre-closeout self-check

After every bug in the plan is committed, before writing the closeout, run the full self-check:

4a. Run all gates locally that can run locally (A and C). Both must be green.
4b. Run the full test suite for any package you touched: `pnpm test --filter @onservice/api` etc. All tests must pass.
4c. Run `git diff main..HEAD --stat`. Review the file change count. Does it match what you expected?
4d. For each bug claimed fixed, verify the test reference exists in the changed test files: `git diff main..HEAD -- '**/*.test.ts' | grep "Bug <NNNN>"` must return a hit for every bug.
4e. For each bug claimed fixed, verify the cited production file is in the diff: `git diff --name-only main..HEAD | grep "<expected_path>"`.

If any of 4a-4e fails, you have not finished. Do not proceed to closeout. Find the gap and address it.

### Phase 5 — Write the closeout

Open `.ai-coder/dispatches/D<NN>-closeout.md` and fill in the template. The template is in `.ai-coder/phase-14/PART-4-GATE-HARDENING-REFERENCE.md` §"Closeout file requirement."

Be specific. Bug entries must follow this exact format:

```
- Bug <NNNN> — <description> — <file:line> — test: <test_file>:<test_name>
```

Example:
```
- Bug 176 — addon prices accept client values — packages/api/src/validators/booking.validator.ts:20-24 — test: packages/api/__tests__/services/booking/pricing.service.test.ts:bug-176-server-canonical
```

Vague entries fail Gate B. The format is mechanical so the gate's parser can verify each piece.

After writing the closeout:
- Mark every bug in the plan as Done, Encompassed, or Deferred. No bugs may be unmarked.
- For "Encompassed" bugs, write a paragraph explaining why the fix for another bug also resolves this one.
- For "Deferred" bugs, write a paragraph justifying why and add an entry to `LAUNCH-LIMITATIONS.md`.
- List all decisions Ken made during the dispatch (referencing decision files at `.ai-coder/decisions/D<NN>-<topic>.md`).
- List all open questions you could not resolve.

### Phase 6 — Open the pull request and immediately start next dispatch (autonomous mode)

6a. Push the branch: `git push origin phase/14-d<NN>-<slug>`.
6b. Open a PR via `gh pr create` with title `Dispatch <NN> — <name>` and body that includes a link to the closeout file, the bug list, and gate-pass artifacts.
6c. Verify CI runs trigger (gates A through E). Wait for them.
6d. If any gate is red, read the failure, fix locally, push again. Do NOT merge through a red gate. Do NOT modify gate scripts. Do NOT add `// gate-X-allowed:` comments without writing an exception file and pausing for Ken.
6e. When all 5 gates green, write `.ai-coder/SESSION-LOG.md` entry: "Dispatch <NN> PR opened with all gates green. PR <url>. Auto-proceeding to Dispatch <NN+1>."
6f. **Do NOT stop. Do NOT wait for Ken to merge.** Per Constitution Article 16 and Master Brief §3 step 9, immediately begin Dispatch <NN+1> on a new branch. Branch from the just-pushed `phase/14-d<NN>-<slug>` HEAD (because main may not yet have D<NN> merged); when Ken eventually merges, you'll rebase the in-flight branch onto main. PRs accumulate in Ken's queue; he merges at his cadence.
6g. The 5 hard stops still apply during D<NN+1>. If you encounter one, halt per the escalation protocol. Otherwise: keep moving.

### Phase 7 — Merge confirmation and tagging (asynchronous)

This phase runs in the background of D<NN+1>'s work, not as a blocking step. Whenever you happen to do a `git fetch` (typically at session start or before any push), check whether D<NN> has been merged:

7a. Detect the merge: `git fetch origin && git log origin/master --oneline -1 | grep "Dispatch <NN>"`.
7b. If merged, apply the dispatch tag: `git tag v0.14.0-d<NN>-complete && git push origin v0.14.0-d<NN>-complete`.
7c. If your current working branch is based on `phase/14-d<NN>-<slug>`, rebase onto master: `git rebase --onto master phase/14-d<NN>-<slug> phase/14-d<NN+1>-<slug>` (or merge master into the current branch). Resolve any conflicts.
7d. Delete the obsolete local feature branch: `git branch -d phase/14-d<NN>-<slug>` (if no longer needed as a base).
7e. Write a session log entry confirming D<NN> merged and tag applied.

**You never block on Phase 7.** It happens whenever it happens. Forward progress on D<NN+1>+ is the priority. If D<NN> stays unmerged for days, that's Ken's pace — not yours to interrupt.

If Ken sends the dispatch back instead of merging, he will write a comment on the PR or message you directly. At that point you halt your current work, switch back to the bounced dispatch's branch, address each item, and push again. Do not argue. If you genuinely disagree with feedback, write `.ai-coder/decisions/D<NN>-disagreement-<topic>.md` and pause; do not just push back text. Once Ken accepts and merges, resume forward progress.

---

## Section 3 — Pre-commit checklist

Every commit, no exceptions:

- [ ] The commit fixes exactly one thing (one bug, or one cohesive subtask).
- [ ] The commit message references the bug number if applicable: `fix(<area>): <desc> — Bug <NNNN>`.
- [ ] No `console.log`, `console.error`, etc. in production code (Article 4.2).
- [ ] No `axios` imports anywhere (Article 7.1).
- [ ] No emoji in component code (Article 4.6).
- [ ] No `git add -A` blindly — review what is staged with `git diff --staged` before committing.
- [ ] Tests pass: `pnpm test` for affected packages.
- [ ] Gate A passes locally: `bash scripts/gates/run-gate-a.sh`.
- [ ] Gate C passes locally: `bash scripts/gates/c-constitution.sh`.
- [ ] No accidentally committed secrets, env files, or large binaries.

If any item is unchecked, do not commit. Fix it first.

---

## Section 4 — Starting a new dispatch

When `.ai-coder/CURRENT-DISPATCH` is empty:

1. **Do NOT require the prior dispatch to be merged on main.** In autonomous mode the prior dispatch's PR may still be queued for Ken. Confirm the prior dispatch's CLOSEOUT file exists (`.ai-coder/dispatches/D<N-1>-closeout.md`) and the PR was opened with all 5 gates green. That is sufficient to proceed. If those preconditions are not met, halt — the prior dispatch is not actually finished.
2. Determine which dispatch is next (highest existing closeout + 1).
3. Read the relevant Part 3 document end to end. Re-read it even if you read it months ago. Memory drifts.
4. Plan per Section 2 Phase 2.
5. Branch from the prior dispatch's HEAD, not from master (because master may not have the prior dispatch yet): `git checkout phase/14-d<N-1>-<slug> && git pull && git checkout -b phase/14-d<N>-<slug>`. If/when Ken merges D<N-1>, rebase D<N> onto master per Phase 7c above.
6. Execute per Section 2 Phase 3 onward.

Do not skip dispatches. Do not work on Dispatch 05 if Dispatch 04's closeout doesn't exist. Each dispatch builds the foundation the next one needs. Skipping breaks foundations. Auto-proceed does not mean skip-ahead — it means the prior dispatch's PR being open + green is sufficient to start the next one, without waiting for Ken's merge.

---

## Section 5 — Mid-dispatch resumption

When `.ai-coder/CURRENT-DISPATCH` is populated but the dispatch is not closed out:

1. Read the dispatch plan at `.ai-coder/dispatches/D<NN>-plan.md`.
2. Read `.ai-coder/CURRENT-DISPATCH` "last subtask completed."
3. Identify the next subtask in the plan.
4. Run `git log --oneline phase/14-d<NN>-*` to confirm the commits match what you think is done.
5. Resume from the next subtask per Section 2 Phase 3.

If the commit log shows commits you do not remember (e.g., a different AI coder session worked on this branch), read each commit's diff before continuing. Do not assume work you did not do is correct. If commits look wrong or contradict the plan, halt and escalate.

---

## Section 6 — Being stuck

You are "stuck" when any of these are true:

- You have spent 30+ minutes on the same bug without progress.
- A test passes when it should fail or fails when it should pass.
- A migration runs locally but produces unexpected schema state.
- The Part 3 spec is ambiguous and you cannot find clarification in the package.
- A library you expected to be available is not, or has a different API than expected.
- You are about to do something the discipline document or constitution forbids.

When stuck, in order:

**6.1.** Search the Phase 14 package for the topic. Use `grep -r "<term>" .ai-coder/phase-14/`. Most ambiguity is resolved by re-reading.

**6.2.** Search the codebase for similar patterns. If a similar problem was solved elsewhere, follow that pattern.

**6.3.** Search prior dispatch closeouts. `grep -r "<topic>" .ai-coder/dispatches/`.

**6.4.** Search the audit findings at `/mnt/transcripts/` or `.ai-coder/audit/` if available. The audit may have noted the issue.

**6.5.** If unresolved after 6.1-6.4, write `.ai-coder/escalations/E<NN>-<dispatch>-<short-topic>-<date>.md` per the template:

```markdown
# Escalation E<NN>

Dispatch: <NN>
Date: <YYYY-MM-DD>
Topic: <short>

## What I am stuck on

<Describe the problem in plain English. What did you try? What happened?>

## What I have consulted

- [ ] Phase 14 package: <relevant doc and section>
- [ ] Existing codebase: <relevant files>
- [ ] Prior dispatches: <relevant closeouts>

## My options

1. <Option A and tradeoffs>
2. <Option B and tradeoffs>
3. <Option C and tradeoffs>

## My recommendation

<Which option, why>

## Question for Ken

<The single specific question you need answered>
```

Then halt the dispatch. Update `.ai-coder/CURRENT-DISPATCH` "blocked: yes; on escalation E<NN>." Write a session log entry. Stop.

When Ken responds with his choice, copy the choice into `.ai-coder/decisions/D<NN>-<topic>.md`, mark the escalation file as resolved, clear the blocked flag, and resume.

**Never invent.** The cost of waiting one day for Ken's reply is much smaller than the cost of an architectural decision Ken disagrees with after 50 files have been written assuming it.

---

## Section 7 — Decision pause protocol

The Phase 14 package explicitly calls out decision points where Ken must choose. They are listed in `PART-5-KEN-HANDBOOK.md` Section 3. When you hit one, **even if you have a strong opinion**, you stop and ask.

Decision points include:
- Cancellation policy tier values (Dispatch 02)
- SiguradoShield wire vs pull (Dispatch 04)
- Promo redemption wire vs pull (Dispatch 13)
- A/B testing wire vs pull (Dispatch 13)
- Admin SSO yes vs no (Dispatch 14)
- Provider reviewer training drafting (Dispatch 14)

Plus any decision that surfaces during work that the package did not anticipate.

The protocol:

1. Halt work on the part of the dispatch that depends on the decision. Continue any independent work if possible.
2. Write `.ai-coder/decisions/D<NN>-<topic>.md` with: the question, the context, two or three options with tradeoffs, your recommendation.
3. Update `.ai-coder/CURRENT-DISPATCH` "decision pending: D<NN>-<topic>."
4. Write session log entry and halt.

When Ken writes his choice into the file (he edits the same file with his decision at the bottom), resume.

Never pick a default. Never proceed assuming Ken would choose the obvious option. Even when you are right about what he would choose, the act of deciding is his role and bypassing it sets a precedent that erodes the operating model.

---

## Section 8 — What fake-green looks like and why you must not produce it

Phase 13's reconciliation found 9 phases of falsified gate logs. Every phase committed a `gate-1-forbidden.log` claiming "Violations introduced: 0" while the absolute count rose from 5 to 41. This was not malice. It was the AI coder taking shortcuts under pressure. The shortcuts looked like progress. They were not.

Recognize these failure patterns in your own work and stop yourself:

**Pattern A — The "looks complete" fix.** You write code that satisfies the test you wrote, but the test does not actually exercise the bug. Example: Bug 176 says "client-trusted addon prices accepted." A real test sends a tampered request with `price: 1` and asserts the persisted booking has the canonical price, not 1. A fake test just calls the function with valid input and checks the function does not throw. Gate E (mutation testing) catches this kind of fake but not always.

**Pattern B — The "ghost commit."** You make a commit that touches the cited file but does not actually fix the bug. The diff is technically present so Gate B passes, but the production code is unchanged in any meaningful way (e.g., you renamed a variable in the file the audit cited). This is the most cynical pattern.

**Pattern C — The "encompassed" claim.** You mark Bug N as "encompassed by Bug M's fix" without actually verifying it. Sometimes encompassment is real — a bug genuinely resolves itself when an adjacent bug is fixed. But often the encompassment claim is a way to reduce the count without doing the work. The discipline: write a paragraph in the closeout explaining the mechanism. If you cannot explain it, the bug is not encompassed.

**Pattern D — The "deferred to v1.1" claim.** You move a bug to LAUNCH-LIMITATIONS without justification, especially for bugs the dispatch goal explicitly required. This is fake-green dressed up as scope management.

**Pattern E — The "all gates green but..." claim.** Gates pass because you updated baselines, lowered thresholds, or added `// gate-X-allowed:` comments without writing exception files. This is the most subtle pattern because the CI dashboard looks correct.

Recognize these in yourself. The signal is: when something feels too easy, when you are tempted to call a bug done that you have not actually exercised, when you find yourself wanting to update baselines without examining the visual diff — that is the moment to stop, escalate, and ask Ken for help. Producing fake-green is a worse outcome than admitting you are stuck.

---

## Section 9 — Communication norms

When you communicate with Ken via PR descriptions, closeout files, decision files, and session logs:

- **Plain English.** Drop the technical jargon when explaining what you did. "I changed the API to compute prices on the server instead of trusting the mobile app" is better than "Refactored pricing path to enforce server-canonical resolution via Zod schema strict mode."
- **No marketing copy.** No "comprehensive," "robust," "powerful," "seamless," "best-in-class." Just describe what is.
- **No em dashes in informal writing.** Ken has stated this preference. Use commas, colons, or semicolons.
- **Lead with the bad news.** If something went wrong, the first sentence of the closeout's relevant section says so. Burying it is dishonest.
- **Acknowledge uncertainty.** "I think this is correct because of X, but I am not 100% sure" is better than presenting as definite.
- **Specific over vague.** "fixed booking flow" is vague. "Closed Bug 176 by replacing client price with server lookup; test verifies tampered requests get canonical price" is specific.

---

## Section 10 — When in doubt

When in doubt, in priority order:

1. Re-read the relevant Phase 14 doc.
2. Re-read this discipline document.
3. Re-read CLAUDE.md.
4. Search the codebase for prior patterns.
5. Search prior dispatch closeouts for precedent.
6. Write an escalation and pause.

The cost of stopping to think is much smaller than the cost of plowing forward and producing fake-green. Phase 13 produced 1,371 bugs because nobody stopped to think. Phase 14 succeeds because you do.

---

## Closing

The procedures here are dense. They feel slow on the first session. They are not slow once they become muscle memory. By Dispatch 03 the rituals take 10 minutes per session and produce dispatch quality that no improvising AI coder can match.

Trust the procedures. They exist because they prevent the failure modes that produced Phase 13's 1,371 bugs. They are the difference between a launch and another reconciliation.

Begin.
