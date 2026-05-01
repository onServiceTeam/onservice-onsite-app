# Reading protocol — when full reads are mandatory

Ken's complaint, on 2026-05-01: "you have a tendency to skim... read the first 100 lines of this, the first 200 lines of that, partial reads."

He's right. Partial reads + grep snippets miss the alignment between what a doc says and what the code does. They're the proximate cause of every "the closeout claimed X but the code does Y" finding in the Phase 14 audit.

This protocol replaces "read enough to start" with explicit rules for when full reads are mandatory.

---

## Hard rule: full read required

When ANY of these is true, you read the file end-to-end (no `offset`, no `limit`) before acting on it:

1. **The file is the source of truth for a decision you're about to make.**
   - Examples: `.ai-coder/PHASE-14-REMEDIATION-MASTER-INSTRUCTION.md`, any `.ai-coder/decisions/D*.md`, any `.ai-coder/dispatches/D*-closeout.md` that you're about to reference, `LAUNCH-LIMITATIONS.md` when you're adding/editing a section, `CLAUDE.md` at session start.

2. **You're going to claim something is done based on what's in the file.**
   - Re-read what you wrote in the closeout AND re-grep the underlying repo state to verify the claim is true. Don't trust your memory of what you wrote 30 minutes ago.

3. **The file is short.** Anything under 500 lines: read it whole, every time. The cost is seconds. The cost of missing a contradiction is hours.

4. **The file documents a contract.** Examples: `docs/MONEY-HANDLING.md`, `docs/architecture/SPEC.md`, `docs/SECURITY-POSTURE.md`, every gate script in `scripts/gates/`. These are constraints on your work — not knowing them is breaking them.

5. **The file is what Ken pointed you at.** When Ken says "read X" or "the rule is in Y," read the entire file.

---

## When chunked reads are OK

Files >2000 lines (rare in this repo, but Phase 14 spec parts are this big): read in chunks of 500-1000 lines, but read EVERY chunk in order. Don't read first 500 + last 500 and call it covered.

For very long generated files (`package-lock.json`, big SQL migration outputs): you may grep without reading whole. But name what you skipped.

---

## When grep is acceptable

Grep is for **discovery**, not understanding. After grep finds a match:
- If the match is in a file you haven't read before, READ the relevant section (50-100 lines around the match minimum).
- Do not act on a grep snippet alone. The snippet is missing the context that decides whether the match is relevant.

The pattern "I greped X, found Y, therefore Z" is wrong if you haven't read the context around Y.

---

## Pre-claim checklist

Before claiming a fix or wiring or test is complete, run this checklist:

1. **Re-read the closeout you're about to write.** Does each claim state something you can verify by grep + Read right now?
2. **For each Bug NNNN claim**: grep the test file diff for `Bug NNNN`. The grep must return at least one hit, AND the hit must be inside an `it()` block that asserts something real (not `expect(closeout.match(...)).toBeTruthy()`).
3. **For each "wired into screen X" claim**: grep the screen file for the component name. Verify the grep returns a JSX render (`<ComponentName ...>` or `React.createElement(ComponentName, ...)`), not just an unused import.
4. **For each "RESOLVED" status in LAUNCH-LIMITATIONS**: re-read the relevant code path. Verify the resolution is real, not a comment that says "TODO: actually resolve this."

If the checklist fails on any item, the claim is wrong. Fix the underlying state, then update the closeout.

---

## Documentation alignment sweep

When you finish a meaningful chunk of work (PR, dispatch, remediation):

1. Read `CLAUDE.md` end-to-end. Does any rule there contradict what you just shipped? If yes, update CLAUDE.md (and tell Ken what changed).
2. Read `LAUNCH-LIMITATIONS.md` end-to-end. Should any section's status change? RESOLVED items stay (don't delete), but new RESOLVED markers go in.
3. Skim `README.md`. Has the dependency table or directory structure drifted?
4. For audit-chain documents: read the most recent closeout and the master instruction it references. Are they consistent?

If you find drift, fix the drift in the same commit as the work that caused it. Do not let drift accumulate.

---

## Anti-patterns Ken has called out

- **"Read first 100 lines of this, first 200 lines of that."** This is the pattern Ken explicitly rejected. Don't do it.
- **"Skim X then move on."** "Skim" is a code word for "I'm about to miss something."
- **Calling something done before re-reading the closeout.** "Done" claims need verification, not vibes.
- **Trusting your memory of what you wrote earlier in the session.** Memory drifts. Re-read.

---

## How this maps to tool calls

- **Read tool**: use without `offset`/`limit` for files <2000 lines. Use chunked offset/limit for longer files but cover the whole file.
- **Grep tool**: discovery only. Always follow up with `Read` of the matching region.
- **Glob tool**: file discovery only.
- **Multiple tool calls in parallel**: fine for discovery. Don't fire 5 grep calls and act on the snippets without reading the actual files.

---

## Why this exists

The Phase 13 reconciliation audit and the Phase 14 F#7 audit both found the same root cause: gates that say "green" while the underlying state was wrong, because the people writing the gate output (AI coders) read enough to write the claim but not enough to verify the claim.

The remediation cost orders of magnitude more than the original work. Reading fully takes minutes; doing the work over takes hours or days.

Read the docs in full. Every time the rule says full read, do it.
