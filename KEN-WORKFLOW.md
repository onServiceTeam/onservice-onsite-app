# KEN'S WORKFLOW

How you spend your time as the QA reviewer. This document is for you, not the AI coder.

---

## Your role in 3 sentences

You are not coding. You are running the project. The AI coder writes the code; you check the screens, read the logs, and decide when each phase is good enough to merge.

## Your daily rhythm

The AI coder works on one phase at a time. Phases take from 1 hour (Phase 00) to 30 hours (Phase 09 — split into 5 batches). You don't sit and watch. You wait for the AI coder to ping you.

When the AI coder pings:

```
Phase NN — [Title]
Status: PASS
Summary: ...
Files changed: ...
Checkpoint log: .ai-coder/checkpoints/logs/PHASE-NN.log
Screens to review: ...
Next phase: PHASE-NN+1 (pending your approval)
```

## Your 5-step review (15-60 min depending on phase)

### 1. Read the checkpoint log (5 min)

Open `.ai-coder/checkpoints/logs/PHASE-NN.log`. Look at the bottom. Three things:

- Are there any FAIL lines? If yes, the phase is not actually done. Tell the AI coder to fix.
- Did the test count go up by the expected amount? (The phase document says how many new tests there should be.)
- Did the typecheck and lint both show 0 errors?

If all green, move on.

### 2. Read the AI coder's self-audit answers (5 min)

The phase log includes the AI coder's answers to the 14 self-audit questions. Read questions 2-5 specifically:

- "What is the riskiest line of code in the diff?" — this tells you where to look extra hard
- "What edge case am I least confident about?" — this might be the bug
- "If this introduced a bug that won't surface for 2 weeks, what is it?" — most likely future regression
- "What did I almost do but caught myself?" — reveals quality of attention

If any answer is "I don't know" or "nothing," that's a signal the AI coder isn't paying attention. Push back.

### 3. Click through the screens (5-30 min)

The phase report lists "Screens to review." For each:

**Admin screens (web browser):**
- Open localhost:5173 (or whatever port admin runs on)
- Click each screen
- Try the buttons
- Submit a form
- Check the empty state (logout, view as new user)
- Check the error state (kill the API briefly, refresh)

**Mobile screens:**
- Open Expo Go on your phone, or the iOS simulator on a Mac
- Navigate to each screen
- Same checks as admin
- Test on landscape and portrait

You're not reading code. You're using the product. If something feels wrong, say so.

### 4. Spot-check the code (5 min, optional)

Pick ONE file the phase changed. Open it. Read the diff. Don't try to understand everything — just look for:
- Obvious copy-paste errors
- Comments that say "I'm not sure if this works"
- Hardcoded values that look like temp test data ($, "test@example.com", "TODO")
- Suspiciously short error handling

If anything looks wrong, ask the AI coder about it.

### 5. Decide

Either:

**Approve:** Reply "Approved, proceed to Phase NN+1."

**Reject:** Reply with what's wrong:

```
Phase NN — Issues found:

1. The dashboard chart for revenue is showing zero even though there's data in the DB.
2. When I click "Approve provider," the modal opens but the Save button does nothing.
3. The mobile help screen has a 🔧 emoji icon — should be lucide.

Please fix these and re-run the verification scripts. Don't start phase NN+1.
```

## Total time investment

| Phase | Your review time |
|---|---|
| 00 — Bootstrap | 5 min |
| 01 — Design System | 30 min (no UI changes, just file inspection) |
| 02 — Icon Replacement | 30 min (click through everything) |
| 03 — Runtime Config | 60 min (test live config change end-to-end) |
| 04 — Admin Dashboard | 30 min (verify charts, alerts, links work) |
| 05 — Provider 360 | 60 min (7 tabs to test) |
| 06 — Customer 360 | 30 min (6 tabs to test) |
| 07 — Booking 360 | 60 min (test a real dispute resolution end-to-end) |
| 08 — Financial & BIR | 60 min (review one OR PDF, one 2307 PDF, one VAT report PDF) |
| 09 — Stitch screens | 5x 30 min = 2.5 hr (split across 5 sub-batches) |
| 10 — Real-time dispatch | 30 min (test that booking updates appear without refresh) |
| 11 — Compliance | 30 min (test DSR creation end-to-end) |
| 12 — Launch readiness | 60 min (deployment runbook walkthrough + smoke tests) |

**Total:** ~9 hours spread across 8-14 weeks.

## When you're stuck

If you can't tell whether something is right:
- Ask the AI coder: "Is the X behavior correct? It looks weird to me."
- Or paste a screenshot in chat with: "Should it look like this?"
- Or ask me (Claude in a planning session) for a sanity check

If the AI coder says "I'm done" and the screen is broken:
- Don't accept the phase
- Send the screen + the error message back
- Tell it to re-verify

If the AI coder asks YOU a question (escalation):
- Answer if you know
- If you don't know, ask me
- Don't guess on technical questions; the AI coder will run with whatever you say

## What you don't do

- You don't write code
- You don't fix bugs (the AI coder does)
- You don't make architecture decisions (those are in the phase docs and constitution)
- You don't deploy (that's the deployment runbook from Phase 12)
- You don't manage the database (the AI coder runs migrations)
- You don't talk to PayMongo, Igloo, or any vendor (operational, not coding)

## What you DO do (outside the AI coder loop)

- Marketing — execute MARKETING-PLAYBOOK.md
- Provider recruitment — TESDA partnerships, OWWA, FB recruiting
- Hiring — Boracay city manager (after m4), Kalibo city manager (m5-6), provider ops, marketing lead
- Customer support escalation — disputes >₱5,000 or unusual cases
- Strategic decisions — when to expand, which city next, when to raise capital
- Investor / partner conversations
- Legal — accountant review of BIR setup, lawyer review of corporate structure

## How to know things are healthy

Watch for these signs in the AI coder's behavior:

**Good signs:**
- Phase reports include caveats and self-criticism
- Tests caught real bugs and the AI coder fixed them
- Screen reviews surface things the AI coder didn't realize
- Self-audit answers are specific (not "all good!")

**Bad signs:**
- Every phase reports PASS without any flagged issues (suspicious — perfection is rare)
- Self-audit answers are vague ("I don't know," "nothing comes to mind")
- The AI coder gets defensive when you point out a bug
- Test count keeps decreasing or staying flat (tests being skipped or removed)
- Lots of `// @ts-expect-error` or `// eslint-disable` (silencing problems)

If you see bad signs, tell the AI coder: "I want you to re-read the constitution. Specifically Articles 2 and 4. Then re-do the self-audit honestly."
