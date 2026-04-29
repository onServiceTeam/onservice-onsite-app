# Dispatch D<NN> — <name> — Closeout

Branch: phase/14-d<NN>-<slug>
Final commit: <sha>
Tag: v0.14.0-d<NN>-complete

---

## Bugs claimed fixed

For each bug, cite file:line and test reference. Gate B parses this section. The format below is mechanical — Gate B's parser depends on it.

- Bug <N> — <short title> — <file:line> — test: <test_file>:<test_name>
- Bug <N> — <short title> — <file:line> — test: <test_file>:<test_name>
- ...

If a bug is "encompassed by" another fix, write a paragraph here explaining the mechanism. Vague encompassment claims fail Gate B.

---

## Gates run

- [ ] Gate A — cross-source-of-truth — PASSED at <commit>
- [ ] Gate B — bug-deferral — PASSED at <commit>
- [ ] Gate C — constitution — PASSED at <commit>
- [ ] Gate D — visual-screenshots — PASSED at <commit>, <N> baselines updated
- [ ] Gate E — mutation-testing — PASSED at <commit>, score <N>%

If any gate is in REPORT mode (per `scripts/gates/EXPECTED-FAILURES.md`), document which fragments are still expected to fail and confirm the count did NOT increase from prior dispatch.

---

## Audit chain artifacts (required for autonomous mode)

Per Ken's instruction (full audit chain, not spot-check), every dispatch produces:

- [ ] `.ai-coder/checkpoints/logs/PHASE-14/D<NN>/sanity-checks.log` — entries proportional to diff size, per `.ai-coder/CONTINUOUS-SANITY-CHECK.md`
- [ ] `.ai-coder/checkpoints/logs/PHASE-14/D<NN>/checks/INDEX.md` — applicable MASTER-QA check IDs with PASS/N-A/FAIL state
- [ ] `.ai-coder/checkpoints/logs/PHASE-14/D<NN>/visual/REPORT.md` — visual UX 5-pass per UI screen (if dispatch touches UI)
- [ ] `.ai-coder/checkpoints/logs/PHASE-14/D<NN>/EVIDENCE-MANIFEST.md` — claim → artifact mapping
- [ ] `.ai-coder/checkpoints/logs/PHASE-14/D<NN>/HONESTY-CHECK.md` — substantive answers to the 3 honesty questions
- [ ] `.ai-coder/checkpoints/logs/PHASE-14/D<NN>/HASHES.sha256` — cryptographic chain of all artifacts in this dispatch
- [ ] All 6 gates of `.ai-coder/100-PERCENT-ACCURACY-PROTOCOL.md` produced their per-gate artifacts under `.ai-coder/checkpoints/logs/PHASE-14/D<NN>/gates/`

---

## Files added (count: <N>)

```
<list — paths only>
```

---

## Files modified (count: <N>)

```
<list — paths only>
```

---

## Files deleted (count: <N>)

```
<list — paths only>
```

---

## Documentation updates

- `LAUNCH-LIMITATIONS.md`: <what changed>
- `docs/SECURITY-POSTURE.md`: <what changed>
- `docs/STRATEGIC-DECISIONS-LOG.md`: <what changed>
- `scripts/gates/EXPECTED-FAILURES.md`: <which fragments moved from REPORT to BLOCKING>
- ...

---

## Decision points surfaced for Ken

Architectural decisions Ken needs to weigh in on. Each entry references a `.ai-coder/decisions/D<NN>-<topic>.md` file with the question, options, and recommendation.

- D<NN> — <topic>: <one-line summary>
- ...

If none, write "None this dispatch."

---

## Open questions / known limitations

Anything the AI coder couldn't resolve and is deferring. Each must reach `LAUNCH-LIMITATIONS.md` if it survives the dispatch.

- <topic>: <what was deferred and why>
- ...

If none, write "None this dispatch."

---

## What dispatches D<NN+1>+ now have available

Brief list of new abstractions, gates, scripts, or patterns this dispatch introduced that subsequent dispatches will consume.

- <abstraction or gate>: <where it lives, what it does>
- ...

---

## Auto-proceed decision

Per Constitution Article 16 + Master Brief §3 step 9 + the autonomous-mode reconciliation in `CLAUDE.md`:

- [ ] All 5 gates green at this commit
- [ ] PR opened at https://github.com/onServiceTeam/onservice-onsite-app/pull/<N>
- [ ] CI run triggered and gates running

If all three checked: AI coder immediately begins Dispatch <NN+1> on a new branch `phase/14-d<NN+1>-<slug>` from this dispatch's HEAD. Does NOT wait for Ken to merge. PRs queue.

If any unchecked: AI coder halts and writes `.ai-coder/escalations/E<NN>-<reason>-<date>.md` per the escalation protocol, does NOT proceed.
