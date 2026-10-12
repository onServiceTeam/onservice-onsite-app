# Tester feedback: intake and triage (version 2)

This is the team side of tester feedback: how to sort what testers send in and decide what gets fixed first. Ken: you do not need to be technical to run this. The goal of each round is a short, ranked list of "fix this, here is the evidence".

The deeper method (theme coding, scoring, the insights report) is in [ANALYSIS-PROTOCOL.md](ANALYSIS-PROTOCOL.md). This page is the day-to-day part.

## Where the feedback lives

Testers answer on **app.onservice.ph/feedback**. Everything is saved to the database as they go. There are two ways to read it:

1. **The admin, under Tester feedback** (day to day):
   - **Overview:** testers so far, each mission's completion rate and average ease, the usability score (SUS), and problems grouped by screen with how many different testers hit each one.
   - **Problems:** every problem report, with its screenshots next to it. Filter by status, severity and screen. This is where triage happens.
   - **Testers:** each tester's whole session in order. This is where junk sessions are dismissed.
   - **Earlier feedback:** the version 1 queue, kept for history.

   Ordinary admins see phone numbers and emails inside answers masked, and no tester names. Super admins see everything.
2. **The private pull** (analysis and backup): the AI coder runs `scripts/feedback/pull.mjs` with the export key. It writes a bundle of spreadsheets, a summary and every screenshot to a folder git ignores. See [AI-CODER-REVIEW.md](AI-CODER-REVIEW.md).

Screenshot file names are evidence identifiers, not public links. Do not paste, publish or commit them. Look at screenshots in the admin or in the private pull.

## Step 1. Clear out junk

In **Testers**, open any session that is clearly not a real test (empty, spam, someone typing nonsense, a duplicate session by the same person testing the form). Dismiss it with a note of at least 10 characters saying why. A dismissed session drops out of every number in the Overview and the pull. It can be restored.

## Step 2. Triage each new problem

In **Problems**, start with status **new**, worst severity first. For each report:

1. Read it with its screenshots.
2. Is it the same as an earlier report? Mark it **duplicate** and point to the original report (not to another duplicate).
3. Is it not a real problem (a misunderstanding of the test, or something the test build cannot do, like a real payment)? Mark it **dismissed** and say why.
4. Otherwise mark it **triaged**, choose an owner (an active admin), and write a note.

Later, move it to **planned** when a fix is scheduled and **done** when the fix is live. Triaged, planned and done all need an owner. Every change needs a note of 10 to 2,000 characters and is recorded in the audit log. If someone else changed the report after you opened it, the admin asks you to reload; this protects their decision.

## Step 3. Rank by how bad times how many

The tester's own "how bad" is one input. How many **different** testers hit it matters more: a problem that 4 of 5 testers hit is a top priority even if each called it minor.

| How bad (tester's words) | 1 tester | 2 to 3 testers | 4 or more, or most testers |
|---|---|---|---|
| **It stopped me** | High | Critical | Critical |
| **It slowed me down** | Medium | High | Critical |
| **It annoyed me** | Low | Medium | High |
| **It just looks wrong** | Low | Low | Medium |

A mission that a tester could not finish ("No, I could not" or "I gave up") counts as "It stopped me" for the problem that caused it.

Critical and High are worked first. A report of "It stopped me", even from one tester, gets reproduced and checked before launch.

## Step 4. Sort into lanes

| If it is | Lane | Goes to |
|---|---|---|
| Broken, wrong, stuck, slow | **Fix** | AI coder |
| Confusing layout, wording or flow | **Design** | Ken decides the direction, then the AI coder builds it |
| A feature the app does not have | **Product** | Ken decides, then the AI coder |
| A missing service type | **Product** | Ken (often just a catalog change in admin) |
| A price reaction | **Pricing** | Ken, using the price section of the insights report |
| Praise | **Keep** | Note it so a later change does not break it |

## Step 5. Hand work to the AI coder

The insights report ends with one repair task per top issue, ready to paste. A repair task names the screen, the evidence (how many testers, which reports, which screenshots) and an acceptance check that can actually be tested. The format is in [ANALYSIS-PROTOCOL.md](ANALYSIS-PROTOCOL.md), Step 9.

For a single urgent report, this short form is enough:

```
Tester problem: <short title>

Screen:     <screen name from the report>
Side:       customer / provider
Priority:   Critical / High / Medium / Low (N different testers)
Trying:     <what the tester was trying to do>
Happened:   <what happened>
Expected:   <what they expected>
Evidence:   problem report <id>; screenshots in the admin

Please reproduce it, fix it, and land it with a real test that fails before the
fix and passes after (one bug, one test, one file). Tell me in plain English what
was wrong and how you fixed it.
```

## Step 6. Ideas, prices and the usability score

- **Ideas** (features, services): score each one 1 to 5 for Reach (how many people it touches), Impact (how much it helps), Confidence (how many testers asked) and Effort (how big a build). Score = Reach x Impact x Confidence / Effort. The top few become the next product conversation; keep the rest on a "someday" list.
- **Prices:** each tester gives four prices for two services. The insights report turns them into a comfortable price band, a floor and a ceiling, and compares them with today's app price. Testers cannot pay in the test build, so treat these as opinions, not sales.
- **Usability score (SUS):** 0 to 100, asked once at the end. About 68 is average, under 50 means serious problems, over 80 is good. Compare round to round with the same study version; the Overview and every insights report show it.

## The loop

Each round: pilot with 2 or 3 testers, fix anything about the test itself, send to everyone, clear junk, triage, pull and analyse, fix the top issues, then test again with fresh people. The same problem showing up again after a "fix" means the fix missed: reopen it with the new reports attached.
