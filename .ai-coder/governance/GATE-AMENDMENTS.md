# Gate amendment process

The five gates (A through E) installed by Dispatch 03 are the structural defense against fake-green. Every PR must pass them; the AI coder cannot bypass them, weaken them, or silently update baselines without producing an exception file.

> **Correction (2026-10-14, D40):** The sentence above is not true today. Nothing technical stops a bypass.
>
> - GitHub reports that `master` has no branch protection and no rulesets. Checked read-only on 2026-10-14: the protection API answers "Branch not protected" and the rulesets list is empty.
> - Even with protection switched on, GitHub settings would guard against accidents only, not against the account Claude uses (checked the same day; details in the private records, moved there on 2026-10-17).
> - Gates B, D and E report green on `master` without checking anything. In Gates run 38555374447 on `8d319a18`, Gate B's "Run Gate B" step was skipped, and Gates D and E printed "REPORT mode" and exited 0.
> - Ken chose on 2026-10-14 to keep GitHub protection off for now (`.ai-coder/decisions/D40-adopt-engineering-standard-v2.md`, point 4).
>
> Until Ken turns protection on, the gates are a rule Claude follows by choice. They are not enforced. Gate changes follow "Current gate-change rule (D40)" below.

This document is the process for changing a gate when the gate is wrong.

## Current gate-change rule (D40, 2026-10-14)

This is the one rule for changing a gate. It is the rule D40 sets ("A gate change goes in its own commit with a test that proves it still rejects bad input"), plus Ken's yes before any loosening. CLAUDE.md's gate-change lines say the same thing (aligned on 2026-10-17, including allowlist entries; the first CLAUDE.md draft called a legitimate-path allowlist entry "routine"). If the two ever differ, follow the stricter one until Ken decides. Ken has not yet confirmed this rule (conflict C10 in `STANDARD-V2-ADOPTION.md`). It replaces steps 3 to 5 of "Amendment process" below (a pull request that Ken merges), because work lands directly on `master` and no pull request is opened on the default path. Nothing in this rule is enforced by GitHub.

1. **Own commit.** A gate change goes in its own commit, titled `chore(gate): ...`. It never rides inside a feature or docs commit. A gate change is any edit to the scripts in `scripts/gates/`, to `scripts/gates/MODES.json`, or to `.github/workflows/gates.yml`.
2. **Proof it still rejects bad input.** The same commit adds or updates a test in `scripts/gates/__tests__/` that gives the gate a known-bad example and shows the gate fails on it. Run that test before pushing.
3. **Say what changed.** Name the change in the commit message and in the gate's own comment block, and tell Ken in plain English in the same session.
4. **Loosening needs Ken's yes first.** Loosening means any of these: moving a check from BLOCKING to REPORT, lowering a threshold, removing or skipping a check, or adding an allowlist entry or a `gate-*-allowed` marker that lets through something the gate was meant to catch. Write the request as an exception file (schema below), block only that step, and keep doing other ready work. A change may not approve itself under the weaker gate it brings in. If you are not sure whether a change loosens a gate, treat it as loosening.
5. **Tightening does not wait.** A change that only makes a gate stricter, or narrows a false positive while step 2 shows real violations still fail, lands under steps 1 to 3. Ken is told, not asked.

The hard rules further down still need Ken's written sign-off.

## When to amend a gate

A gate is "wrong" only in narrow circumstances. The bar is high.

- **False positive.** The gate flags a violation but the flagged code is correct under the constitution and the spec. Example: a regex catches a substring inside a comment that the gate writer didn't anticipate.
- **Scope error.** The gate scans a wider scope than the rule applies to. Example: the original `c-constitution.sh` Article 7.1 axios check scanned `apps/ packages/` even though the constitutional concern was client bundle bloat — server-to-server axios in `packages/api/src/services/payment.service.ts` is allowed. D03 corrected this scope.
- **Missing exception.** The gate's exception list is incomplete (e.g., a legitimate test file that references a forbidden pattern in an `expect(...).not.toMatch(...)` assertion).
- **New approved pattern.** Ken approves a new pattern that the existing gate would flag (rare). Example: adopting a different HTTP client that has a name collision with `axios` keyword matching.

A gate is **not** wrong when:

- The flagged code violates the spec but is "convenient." Fix the code, not the gate.
- The flagged code is "going to be fixed in a later dispatch." That's why the REPORT/BLOCKING tier exists. If the gate's mode in `MODES.json` is BLOCKING and a fragment is failing, either the fragment's mode is wrong (move to REPORT, document why, identify owning dispatch) or the code is wrong (fix it).
  - *Note (2026-10-14, D40):* moving a fragment to REPORT is loosening. It now needs Ken's yes first (rule 4 above).
- The gate is "annoying" or "slow." Performance issues are valid amendments; annoyance isn't.

## Amendment process

> **Historical in part / superseded by D40 (2026-10-14):** steps 3 to 5 (open a pull request, Ken merges) are replaced by "Current gate-change rule (D40)" above. Step 1 still applies to every gate change. Step 2 (write an exception file) now applies only to a loosening request under rule 4 above. A tightening change or a false-positive fix under rule 5 needs no exception file. Where step 2 says "Pause work that depended on the bypass", D40 says instead: block only that step and keep doing other ready work. The exception file schema still applies whenever an exception file is written.

1. **Don't bypass.** Never add a `// gate-X-allowed: <reason>` comment as a one-off without recording it. Never lower a threshold "temporarily." Never delete a check "for now."
2. **Write an exception file.** Create `.ai-coder/exceptions/<YYYY-MM-DD>-<short-topic>.md` per the schema below. Pause work that depended on the bypass.
   - *Note (2026-10-14, D40):* for loosening requests only (rule 4 above). Block only that step and keep doing other ready work.
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
  - *Correction (2026-10-14, D40):* this requirement is not in place. GitHub returns no branch protection and no rulesets for `master` (checked read-only on 2026-10-14). Repo records show that protection with the gate checks did exist during Phase 14 in April 2026 (`.ai-coder/SESSION-LOG.md`, the D01 to D02 gap-fill entry; `.ai-coder/dispatches/D06-plan.md`). When it was removed, and by whom, is not recorded in the repo. Ken chose on 2026-10-14 to keep it off for now (D40). Read this line as the intended setup, not the real one.
- The MODES.json schema (`mode` ∈ `{"BLOCKING", "REPORT"}`, `owning_dispatch`, `rationale`). Schema additions OK; schema changes require dispatch-level decision.
- The fail-closed default (unknown fragment → BLOCKING).
- The HTML-comment marker for no-bugs dispatches: `<!-- gate-b: no-bugs-this-dispatch -->`. Changing the marker would break Gate B's parsing of historical closeouts.

## Why this process exists

Phase 13's reconciliation found 9 phases of falsified gate logs. The root cause was AI coders editing gate scripts (or producing false claim logs) without producing a paper trail. Every gate amendment in Phase 14 produces a paper trail: an exception file, a PR, Ken's review, a smoke test that demonstrates the change is sound.

The cost of this process — a few minutes per amendment — is much smaller than the cost of a silently-weakened gate that lets fake-green ship.

> **Note (2026-10-14, D40):** the paper trail described above stopped after Phase 14. The last exception file is `.ai-coder/exceptions/2026-04-30-gate-b-pipefail-sigpipe.md`. Since then gate scripts were changed inside feature commits, for example `13206911` (2026-08-31), which touched `scripts/gates/`. The D40 rule at the top of this file is meant to stop that. It is still not enforced by GitHub.
