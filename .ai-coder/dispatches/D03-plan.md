# Dispatch 03 — Gate Hardening — Plan

Branch: `phase/14-d03-gate-hardening`
Started from: master @ `6959349` (D02 final closeout)
Source spec: `.ai-coder/phase-14/PART-3-BUG-REMEDIATION-DISPATCHES-03-04.md` §"Dispatch 03"

## Goal

Install the 5 gates (A, B, C, D, E) as binding CI checks with tiered REPORT/BLOCKING semantics so subsequent dispatches can run cleanly under branch protection without admin override. No source-code bug fixes; pure infrastructure.

## Bugs claimed fixed

**None.** Per the spec: "No source-code bugs are fixed in this dispatch. This is pure infrastructure."

Gate B is being adapted in this dispatch to honor a "no bugs claimed" declaration. The closeout will use that mechanism.

## Subtask breakdown

The dispatch is a single coherent meta-fix. Breakdown for tracking:

1. **MODES.json + tiered Gate A aggregator** — the structural change. `scripts/gates/MODES.json` declares per-fragment mode (BLOCKING / REPORT). `run-gate-a.sh` reads it, runs every fragment, fails the gate only if a BLOCKING fragment fails. REPORT fragments log status but don't block.

2. **Tiered Gate C constitution checks** — `c-constitution.sh` currently treats every article check as BLOCKING. Per EXPECTED-FAILURES.md the timeline is: console.* and money-in-transaction are REPORT until D06/D12 land; Article 7.1 (axios) was scoped wrong (catches server outbound which is allowed). Refactor c-constitution.sh to read MODES.json article entries, scope axios check to `apps/` only.

3. **Gate B no-bugs declaration** — `b-bug-deferral.sh` currently exits 1 if a closeout has no `Bug NNNN` entries. D03 has zero bug fixes by design. Adapt: if the closeout contains the literal marker `**Bugs claimed fixed:** none` (or similar), Gate B treats it as a meta-only dispatch and exits 0. The marker must be machine-checkable to prevent fake-green.

4. **Smoke tests** at `scripts/gates/__tests__/`:
   - `gate-c-constitution.test.sh` — synthesize a tree with `console.log(...)`, run gate-c against it, assert exit 1.
   - `gate-a-no-axios.test.sh` — synthesize `apps/foo/x.ts` with `import axios from 'axios'`, run a-cross-source-no-axios.sh, assert exit 1.
   - `gate-a-cancellation.test.sh` — synthesize a mobile config with literal `cancellationFees`, run that fragment, assert exit 1.
   - `gate-b-no-bugs.test.sh` — synthesize a closeout with the no-bugs marker, run gate-b, assert exit 0; flip the marker, assert exit 1.

5. **`.ai-coder/governance/GATE-AMENDMENTS.md`** — process for amending a gate when it produces a false positive. Required so Ken can approve a gate change via PR rather than the AI coder silently weakening a script.

6. **`LAUNCH-LIMITATIONS.md` §22** — declare gate enforcement is now binding. Lists which fragments are still REPORT (with owning dispatch) and which are BLOCKING.

7. **`EXPECTED-FAILURES.md`** — sync with MODES.json; preserve the historical narrative but make the file the human-readable companion to the machine-readable MODES.json.

## Dependencies / order

1 must precede 2 (MODES.json shape is the input to both aggregator and constitution refactor).
3 is independent, can interleave.
4 must follow 1, 2, 3 (smoke tests reference final scripts).
5, 6, 7 are documentation, end of dispatch.

## Test files added

- `scripts/gates/__tests__/gate-c-constitution.test.sh`
- `scripts/gates/__tests__/gate-a-no-axios.test.sh`
- `scripts/gates/__tests__/gate-a-cancellation.test.sh`
- `scripts/gates/__tests__/gate-b-no-bugs.test.sh`
- `scripts/gates/__tests__/run-all.sh` — runs every smoke test, fails if any fails

## Migrations

None. D03 touches no DB.

## Files expected to modify

- `scripts/gates/run-gate-a.sh` (tiered)
- `scripts/gates/c-constitution.sh` (tiered + axios scope fix)
- `scripts/gates/b-bug-deferral.sh` (no-bugs declaration)
- `scripts/gates/EXPECTED-FAILURES.md`
- `LAUNCH-LIMITATIONS.md`
- `.ai-coder/CURRENT-DISPATCH` (already updated to D03)
- `.ai-coder/SESSION-LOG.md` (already appended)

## Files expected to add

- `scripts/gates/MODES.json`
- `scripts/gates/__tests__/` (5 files including run-all.sh)
- `.ai-coder/governance/GATE-AMENDMENTS.md`
- `.ai-coder/dispatches/D03-plan.md` (this file)
- `.ai-coder/dispatches/D03-closeout.md` (end of dispatch)

## Acceptance criteria for D03 own-gate-pass

After all subtasks complete, on `phase/14-d03-gate-hardening`:
- `bash scripts/gates/run-gate-a.sh` exits 0 (BLOCKING fragments all pass)
- `bash scripts/gates/c-constitution.sh` exits 0 (BLOCKING articles all pass; REPORT articles log only)
- `bash scripts/gates/b-bug-deferral.sh 03` exits 0 (no-bugs declaration honored)
- `bash scripts/gates/d-visual-screenshots.sh` exits 0 (no baselines yet, skip cleanly)
- `bash scripts/gates/e-mutation-testing.sh` exits 0 (no production .ts files changed; skips per existing logic)
- `bash scripts/gates/__tests__/run-all.sh` exits 0 (every smoke test passes)
