# ESCALATION PROTOCOL

When you stop and ask Ken vs when you decide and continue.

---

## Decide and continue (no need to ask)

These are choices you make every minute. Do not ask Ken about these.

- File names within the conventions of the codebase
- Variable names, function names within the conventions
- Implementation tactics (which loop type, which library function)
- Test boundaries (you know how to test the thing you're building)
- Refactor opportunities you spot inside the file you're already editing
- Adding a new file within an existing folder when it follows the existing pattern
- Cosmetic decisions covered by the design contract

## Stop and ask Ken

Stop when:

### Category A — Phase document is unclear

- The phase says "do X" and you don't understand what X means
- The phase says "do X if condition Y" and you don't know how to check condition Y
- The phase contradicts another phase or the constitution
- The phase references a file or concept that doesn't exist

**How to ask:** Quote the exact passage that's unclear. State what you think it means. Ask Ken if your interpretation is right.

### Category B — Codebase reality differs from phase assumption

- The phase assumes a file exists; it doesn't
- The phase assumes a function has a certain signature; it has a different one
- The phase assumes a migration has run; it hasn't
- The phase assumes a feature is built; it isn't (or vice versa)

**How to ask:** Show the actual state. Show the assumed state. Ask which to align to: should I update the phase, or should I match the phase?

### Category C — A checkpoint fails and you can't fix it

You ran the checkpoint. It failed. You read the error. You understood it. You attempted a fix. The fix didn't work. You attempted a different fix. Still failed.

**How to ask:** Show the original error. Show what you tried (each attempt). State your current hypothesis about why nothing worked. Ask Ken for a hint or a different approach.

### Category D — You'd need to violate the constitution to proceed

- The phase asks you to use a forbidden pattern
- The phase asks you to add a forbidden dependency
- The phase asks you to skip a check
- The phase asks you to write a TODO
- The phase asks you to use emoji as iconography after Phase 02

**How to ask:** Quote the constitution article being violated. Quote the phase passage. Ask Ken to either revise the phase or update the constitution explicitly.

### Category E — You think the phase strategy is wrong

You read the phase. You believe doing what it says will produce a worse outcome than an alternative.

**How to ask:** State the phase's intended outcome. State your alternative. State why you think your alternative is better. State the cost (time, complexity) of your alternative. Then **let Ken decide.** You do not unilaterally change the strategy.

### Category F — Discovery of a serious issue

While reading code, you discover:
- A money bug not in the audit
- A security hole (credentials in code, missing auth, plaintext PII)
- A data loss risk (a query that could nuke a table)
- A regulatory violation

**How to ask:** Show the issue. Estimate severity (Critical / High / Medium / Low). Suggest immediate mitigation. Ask if you should pause the current phase to address it.

### Category G — Time / scope is materially off

You estimated the phase would take 6 hours. You're 12 hours in and 50% done. The actual scope is 2x what was estimated.

**How to ask:** Show what you've completed. Show what remains. Estimate the remaining time. Ask Ken if you should: (a) finish at any cost, (b) split the phase, (c) re-scope.

---

## How to format an escalation

Use this template:

```
## ESCALATION — Phase NN — [Category from above]

**Context (1-2 sentences):**
What I was doing when this came up.

**The issue (3-5 sentences):**
What's wrong. Be specific. Include file paths and line numbers.

**What I tried (if applicable):**
- Attempt 1: [what] → [result]
- Attempt 2: [what] → [result]

**Options as I see them:**
1. [option A] — pros and cons
2. [option B] — pros and cons
3. [option C] — pros and cons

**My recommendation:**
[which option and why]

**What I need from Ken:**
A specific, actionable answer. (Yes/no, or pick one of the options, or different direction.)
```

---

## How long to wait for Ken

Ken may take hours or a day to respond. While you wait:

- Do NOT continue with the phase pretending the question is resolved.
- Do NOT start the next phase.
- DO continue work on parts of the phase that are independent of the question, IF you can make that judgment confidently. If you can't, just stop.
- DO commit any clean intermediate state with a clear "stuck on escalation X" message in the commit body.
- DO write a brief log entry in `.ai-coder/checkpoints/logs/escalations/PHASE-NN.log` so the history is captured.

When Ken answers:
- Acknowledge his answer.
- Apply it.
- Continue.
- If Ken's answer was a constitutional change, ensure the constitution file is updated before you proceed.

---

## What NOT to escalate

These are NOT escalation triggers:

- "I'm not sure if this is the perfect implementation." (Use your judgment within the constitution.)
- "There's a small inconsistency in the codebase." (Note it; don't escalate unless it blocks you.)
- "The test is slow." (Acceptable unless it's >30s for a single test.)
- "I want to refactor this thing while I'm here." (Don't, unless the phase says so.)
- "I want to add a feature I think Ken will want." (Don't. Stay in scope.)
- "I'm bored." (Take a break, then return.)
