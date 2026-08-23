# AI-coder feedback review — how the AI reads, interprets, and fixes from tester feedback

This is the runbook the AI coder follows to turn live tester feedback into real
improvements and fixes. Ken (or anyone) kicks it off by saying, in chat:

> "Pull the latest tester feedback and triage it."

The AI coder then does the steps below. Everything here is repeatable and needs
only the export key.

## What the AI coder needs

- The export key (`FEEDBACK_EXPORT_KEY`, kept by Ken). It is given to the AI coder
  at review time and is never committed.
- Nothing else. The feedback lives in the production database and is pulled on
  demand.

## Step 1 — Pull the feedback into the repo

```
FEEDBACK_EXPORT_KEY=<key> node scripts/feedback/pull.mjs
```

This writes, all gitignored (live data + tester PII, regenerated on demand):

- `docs/qa/ux-testing/FEEDBACK-INBOX.md` — the readable digest, newest first,
  with every rating, written answer, idea, price, and logged bug per submission.
- `docs/qa/ux-testing/FEEDBACK-INBOX.json` — the same data, machine readable.
- `docs/qa/ux-testing/feedback-screenshots/` — the actual screenshot images a
  tester attached, downloaded locally. The digest's image links are rewritten to
  point at these local files.

## Step 2 — Read and interpret

The AI coder reads `FEEDBACK-INBOX.md`. For each submission it separates:

- **Bugs** — broken or wrong behavior (from the "Logged items" and low ratings).
- **Friction** — confusing flows, unclear wording, hesitation points (from the
  open answers like "what confused you", "confusing words", "payment trust").
- **Ideas / features** — what testers want added, removed, simplified, or changed
  (the "Make it better" answers).
- **Service & pricing signals** — new service ideas + names, how to group them,
  and price reactions (too cheap / fair / too expensive).
- **Priority** — testers' own "fix first / second / third" answers.

It clusters duplicates across testers (the same complaint from many people is
high priority even if each phrasing differs) and scores ideas, following
[INTAKE-TRIAGE.md](INTAKE-TRIAGE.md).

## Step 3 — Look at the screenshots

When a logged item has a screenshot, the digest shows a local image link like
`feedback-screenshots/<file>.png`. The AI coder **opens that image with its
vision** (the Read tool renders images) to see the actual broken screen — the
error message, the misaligned layout, the wrong number — instead of guessing from
the text. It then locates the matching code and fixes the real cause.

So the loop for a screenshot bug is: read the tester's words → open their
screenshot → reproduce/locate in code → fix → add a test → verify.

## Step 4 — Turn it into action

The AI coder converts the triaged list into:

- **Fixes it lands directly** — bugs with a clear cause get fixed, tested, and
  pushed (one bug, one test, per the project rules in CLAUDE.md).
- **Design / product items** — friction and feature ideas it can't decide alone
  get written up for Ken with a recommendation.
- **Pricing / service decisions** — summarized for Ken with the tester numbers.

It reports back in plain English: what testers said, what it fixed, what needs a
Ken decision.

## Where to read it without the AI coder (humans)

Day-to-day company triage now belongs in the admin app at **Tester Feedback**
(`/feedback`). Start in New, filter by customer/provider/admin area, assign an
active named admin, and record the verification or dismissal note. These changes
are audit-logged, and ordinary admins receive masked contact/free-text PII.

The same data remains available for private analysis or backup using the key:

- Spreadsheet: `https://app.onservice.ph/api/v1/feedback/export.csv?key=<key>`
- Readable report: `https://app.onservice.ph/api/v1/feedback/export.md?key=<key>`

(Screenshots in the human exports are full `https://app.onservice.ph/uploads/...`
links you can click; the local-file rewrite only happens in the AI coder's repo
pull.)
