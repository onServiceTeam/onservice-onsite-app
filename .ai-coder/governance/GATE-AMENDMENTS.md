# Gate amendment process

The five gates (A through E) installed by Dispatch 03 are the structural defense against fake-green. Every PR must pass them; the AI coder cannot bypass them, weaken them, or silently update baselines without producing an exception file.

This document is the process for changing a gate when the gate is wrong.

## When to amend a gate

A gate is "wrong" only in narrow circumstances. The bar is high.

- **False positive.** The gate flags a violation but the flagged code is correct under the constitution and the spec. Example: a regex catches a substring inside a comment that the gate writer didn't anticipate.
- **Scope error.** The gate scans a wider scope than the rule applies to. Example: the original `c-constitution.sh` Article 7.1 axios check scanned `apps/ packages/` even though the constitutional concern was client bundle bloat — server-to-server axios in `packages/api/src/services/payment.service.ts` is allowed. D03 corrected this scope.
- **Missing exception.** The gate's exception list is incomplete (e.g., a legitimate test file that references a forbidden pattern in an `expect(...).not.toMatch(...)` assertion).
- **New approved pattern.** Ken approves a new pattern that the existing gate would flag (rare). Example: adopting a different HTTP client that has a name collision with `axios` keyword matching.

A gate is **not** wrong when:

- The flagged code violates the spec but is "convenient." Fix the code, not the gate.
- The flagged code is "going to be fixed in a later dispatch." That's why the REPORT/BLOCKING tier exists. If the gate's mode in `MODES.json` is BLOCKING and a fragment is failing, either the fragment's mode is wrong (move to REPORT, document why, identify owning dispatch) or the code is wrong (fix it).
- The gate is "annoying" or "slow." Performance issues are valid amendments; annoyance isn't.

## Amendment process

1. **Don't bypass.** Never add a `// gate-X-allowed: <reason>` comment as a one-off without recording it. Never lower a threshold "temporarily." Never delete a check "for now."
2. **Write an exception file.** Create `.ai-coder/exceptions/<YYYY-MM-DD>-<short-topic>.md` per the schema below. Pause work that depended on the bypass.
3. **Open a PR with the exception file AND the proposed gate change.** The PR title is `chore(gate): amend <gate> — <reason>`. Body includes:
   - The flagged-but-correct code (with file:line)
   - Why the gate is wrong (which of the four valid reasons above)
   - The proposed fix to the gate (regex change, scope tightening, allowlist addition)
   - The smoke test demonstrating the gate still rejects the actually-bad pattern
4. **Ken reviews.** Only Ken decides whether to merge. He may:
   - Approve and merge — gate is amended, work resumes.
   - Reject — the original gate is right; fix the code instead.
   - Request changes — refine the amendment (e.g., narrower allowlist).
5. **After merge, update.** If the amendment is approved, the gate change ships and the exception file moves to `.ai-coder/exceptions/resolved/`.

## Exception file schema

```markdown
# Exception <YYYY-MM-DD> — <short topic>

**Gate:** <Gate A | B | C | D | E>
**Fragment / article:** <e.g., a-cross-source-brand-color>
**Discovered in:** <branch / PR / commit>

## What is flagged

<file:line of the code the gate flagged>

```<lang>
<code excerpt>
```

## Why the gate is wrong

<one of: false positive | scope error | missing exception | new approved pattern>

<Detailed reasoning. Cite the constitution article and the spec section.>

## Proposed fix

<Diff or description of the gate change.>

## Smoke test that proves the fix

<Path to a new or updated smoke test that asserts the gate still catches the
truly-bad pattern but accepts the flagged-as-incorrect pattern.>

## What I would have done if forced to bypass

<This section forces honesty. If you would have added a // gate-X-allowed
comment, write that. The exception is the proper alternative.>
```

## Hard rules

These cannot be amended without Ken's explicit signoff in writing:

- The five gate names (A, B, C, D, E) and their CI job names.
- The branch protection requirement that all 5 gates plus `gates-summary` are required-status-checks on `master`.
- The MODES.json schema (`mode` ∈ `{"BLOCKING", "REPORT"}`, `owning_dispatch`, `rationale`). Schema additions OK; schema changes require dispatch-level decision.
- The fail-closed default (unknown fragment → BLOCKING).
- The HTML-comment marker for no-bugs dispatches: `<!-- gate-b: no-bugs-this-dispatch -->`. Changing the marker would break Gate B's parsing of historical closeouts.

## Why this process exists

Phase 13's reconciliation found 9 phases of falsified gate logs. The root cause was AI coders editing gate scripts (or producing false claim logs) without producing a paper trail. Every gate amendment in Phase 14 produces a paper trail: an exception file, a PR, Ken's review, a smoke test that demonstrates the change is sound.

The cost of this process — a few minutes per amendment — is much smaller than the cost of a silently-weakened gate that lets fake-green ship.
