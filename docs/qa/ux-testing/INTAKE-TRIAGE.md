# onService PH — Feedback Intake & Triage

This is the team-facing half of the UX testing pack. Testers send back filled
[QUESTIONNAIRE.md](QUESTIONNAIRE.md) and [FEEDBACK-LOG.md](FEEDBACK-LOG.md) files.
This doc is how you turn that pile into a short, sorted list of actions: things
the AI coder fixes, things the design/product side decides, and things we file for
later.

Ken: you do not need to be technical to run this. The goal is to end each round
with a clean list of "here's what to fix and why," in a form the AI coder can pick
up cold.

## Where the feedback lives

Most feedback now comes through the live page at
**https://app.onservice.ph/feedback** and lands in the database automatically.
You don't have to chase files. There are four ways to read it back. The first is
the day-to-day operating workflow; the other three use the export key
(`FEEDBACK_EXPORT_KEY` on the server, kept by Ken; hand it to the AI coder when
you want a review):

1. **In the admin app** (operations): open **Tester Feedback** (`/feedback`),
   filter New work by customer/provider/admin area, preserve the original
   evidence, assign an active named admin, and record a triage, completion, or
   dismissal note. Ordinary admins see masked contact and free-text PII.
2. **In a browser export** (private analysis): open
   `https://app.onservice.ph/api/v1/feedback/export.csv?key=THEKEY` for a
   spreadsheet, or `…/export.md?key=THEKEY` for a readable digest.
3. **Into the repo** (AI coder): run `node scripts/feedback/pull.mjs` with
   `FEEDBACK_EXPORT_KEY` set. It writes
   [FEEDBACK-INBOX.md](FEEDBACK-INBOX.md) (readable) and `FEEDBACK-INBOX.json`
   (machine) into this folder, so the AI coder can review feedback in-repo and
   turn it into fixes.
4. **Ask the AI coder** to "pull the latest tester feedback and triage it" — it
   runs the pull and works through the steps below.

The markdown files testers can fill by hand ([QUESTIONNAIRE.md](QUESTIONNAIRE.md),
[FEEDBACK-LOG.md](FEEDBACK-LOG.md)) still apply for anyone off the web page; fold
those into the same flow.

## Step 1 — Collect into one place

Drop every tester's items into one spreadsheet, one row per item, with columns:
`Tester`, `Area`, `Type`, `How bad`, `Where`, `What happened`, `What expected`,
`Repro`, `Device`, `Screenshot`. (Most tester logs already use these labels, so
it's copy-paste.) If you used the live page, the export from "Where the feedback
lives" already is this spreadsheet.

If you used a Google Form for the questionnaire, the rating sections come out as a
sheet automatically. Keep the free-text "ideas" and "prices" answers, those are
the most valuable.

## Step 2 — Cluster and de-duplicate

Five testers will report the same confusing price screen five different ways.
Group them. One real problem, reported by 4 of 5 testers, is a top priority even
if each report sounds minor. Add a `Count` column = how many testers hit it.

A problem that shows up for **most** testers is almost always worth fixing before
a problem only one person hit, regardless of how each person rated its severity.

## Step 3 — Sort each item into a lane

| If it is... | Lane | Goes to |
| --- | --- | --- |
| Broken / wrong / stuck (a Bug) | **Fix** | AI coder |
| Confusing layout, wording, or flow (Friction) | **Design** | Design/product, then AI coder to build |
| A new feature request | **Product** | Ken + design decide, then AI coder |
| A missing service type | **Product** | Ken decides (it's a data/config call, often just admin) |
| A price reaction | **Pricing** | Ken + the pricing analysis below |
| Praise | **Keep** | Note it so we don't break it |

## Step 4 — Set priority

Combine how bad it is with how many testers hit it:

| | 1 tester | 2-3 testers | Most testers |
| --- | --- | --- | --- |
| **Blocker** | High | Critical | Critical |
| **Major** | Medium | High | Critical |
| **Minor** | Low | Medium | High |
| **Idea** | score it (Step 6) | score it | score it |

Critical and High get worked first. A blocker, even from one tester, should be
reproduced and fixed before launch.

## Step 5 — Hand a bug to the AI coder

For each Fix-lane item, paste a block like this into a chat with the AI coder. It
matches how this repo expects work to land (one bug, one test, real repro). The
AI coder fills in the file paths and the fix.

```
UX tester bug — <short title>

Area:        Customer / Provider / Admin
Priority:    Critical / High / Medium / Low   (reported by N of 5 testers)
Screen:      <where the tester was>
Steps:       1. ...
             2. ...
             3. ...
Expected:    <what should happen>
Actual:      <what happens now>
Evidence:    <screenshot filename, if any>

Please reproduce, fix, and land it with a real test that fails before the fix and
passes after (one bug, one test, one file per the project rules). Tell me in plain
English what was wrong and how you fixed it.
```

You don't have to know the cause. "It does X, it should do Y, here's how to see
it" is enough for the AI coder to work from.

## Step 6 — Score the ideas (features, services)

Ideas can't all be built, so score them simply. For each idea, rate 1-5:

- **Reach** — how many users would this touch? (a few = 1, almost everyone = 5)
- **Impact** — how much would it help them? (barely = 1, game-changer = 5)
- **Confidence** — how sure are we testers are right? (a hunch = 1, many said it = 5)
- **Effort** — how big a build? (tiny = 1, huge = 5)

Score = (Reach × Impact × Confidence) ÷ Effort. Sort high to low. The top handful
become the next product conversation. Low scorers go in a "someday" list, not the
trash, patterns show up across rounds.

Hand a chosen idea to the design/product side like this:

```
UX tester idea — <short title>

Asked by:    N of 5 testers
What:        <the idea in one sentence>
Why:         <the user problem it solves, in their words>
Score:       Reach _ × Impact _ × Confidence _ ÷ Effort _ = _
Notes:       <quotes from testers, screenshots>
```

## Step 7 — Make sense of the prices

The questionnaire asks four price points per service (too cheap, a deal, getting
expensive, too expensive). For each service:

- Take the **middle** of "a deal" and "getting expensive" across testers. That
  band is roughly where price feels right.
- "Too cheap" tells you the floor below which people doubt quality.
- "Too expensive" tells you the ceiling where people walk away.

You don't need math. Even eyeballing 5-10 testers' numbers tells you whether the
current price is inside the comfortable band or outside it. Feed that to whoever
sets prices in the admin Pricing Rules page.

## Step 8 — Track the usability score over time

The 10 agree/disagree statements in questionnaire Section 4 give a usability score
you can compare round to round. You don't need to compute it precisely; what
matters is the trend. If round 2 testers agree more that the app is "easy to use"
and disagree more that it's "awkward," you're improving. Save each round's
questionnaires so you can look back.

## The loop

Each round: collect → cluster → sort into lanes → fix the bugs → decide the ideas
and prices → ship → test again with fresh people. The same friction showing up
twice after a "fix" means the fix missed; send it back with the new reports
attached.
