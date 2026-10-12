# onService PH: tester feedback (version 2)

This folder is how we test the onService app with everyday people (not engineers) and turn what they tell us into fixes. Version 2 started on October 12, 2026. It replaced the old long questionnaire with short, realistic missions.

## Read these first

| File | Who it is for | What it is |
|---|---|---|
| [FEEDBACK-V2-AUDIT-AND-PLAN-2026-10-12.md](FEEDBACK-V2-AUDIT-AND-PLAN-2026-10-12.md) | Ken, the AI coder | Why version 1 failed, what the research says, and the design of version 2. |
| [TESTER-MESSENGER-MESSAGES.md](TESTER-MESSENGER-MESSAGES.md) | Ken | The messages to paste into Messenger for testers, and what not to say while they test. |
| [TESTER-GUIDE.md](TESTER-GUIDE.md) | Testers | A short guide Ken can send if a tester wants the steps in writing. |
| [INTAKE-TRIAGE.md](INTAKE-TRIAGE.md) | Ken, staff | How to sort reports in the admin and decide what gets fixed first. |
| [AI-CODER-REVIEW.md](AI-CODER-REVIEW.md) | The AI coder | The runbook for "pull the latest tester feedback and triage it". |
| [ANALYSIS-PROTOCOL.md](ANALYSIS-PROTOCOL.md) | The AI coder, a researcher | How to code the answers, rank the problems and write the insights report. |
| `insights/INSIGHTS-YYYY-MM-DD.md` | Everyone | The dated result of each round. Safe to commit: no names or contact details. |

Kept for history only (version 1): [QUESTIONNAIRE.md](QUESTIONNAIRE.md), [FEEDBACK-LOG.md](FEEDBACK-LOG.md), [FEEDBACK-RESPONSE-2026-06-16.md](FEEDBACK-RESPONSE-2026-06-16.md). Do not send them to testers.

## How a round works

1. **Ken sends Message 1** from [TESTER-MESSENGER-MESSAGES.md](TESTER-MESSENGER-MESSAGES.md): install the Android app, but do not explore it yet.
2. **Testers sign up with their own email.** They open the app, tap Create Account on the sign-in screen, enter their email address and type the 6-digit code that arrives by email. There is no shared test login and no site password any more. A tester who wants to try the worker side chooses "I provide services" when the app asks right after sign-up (that choice appears only once) and goes through the real provider sign-up; Ken approves them in the admin under Providers. Some provider missions only work after that approval. What testers upload for the ID and NBI steps is still open (decision D5 in the plan), and so is sign-up for testers outside Metro Cebu (D6).
3. **Ken sends Message 2** with the link **app.onservice.ph/feedback**. On that page the tester:
   - agrees to the privacy notice and says which side they are testing;
   - writes a first impression before tapping anything in the app;
   - does short missions in the app, in any order, and answers a few questions after each one;
   - reports problems any time with "Report a problem" on the page (newer app builds also have "Send feedback or report a problem" under Help, and in provider Settings, which opens the same form);
   - finishes with the wrap-up: 10 quick statements, the three things they would change, and two price questions.

   Answers are saved as they go. They can stop and come back later on the same phone and browser.
4. **Staff triage** in the admin under **Tester feedback** (Overview, Problems, Testers, and Earlier feedback for version 1). See [INTAKE-TRIAGE.md](INTAKE-TRIAGE.md).
5. **The AI coder pulls and analyses** the round ([AI-CODER-REVIEW.md](AI-CODER-REVIEW.md), [ANALYSIS-PROTOCOL.md](ANALYSIS-PROTOCOL.md)) and writes `insights/INSIGHTS-YYYY-MM-DD.md` with ranked issues and repair tasks.
6. **Fix, then test again** with fresh people.

## Before sending Message 2

- **Check that sign-up works.** Email codes need the Resend account and DNS records from [docs/operations/email-sending-setup.md](../../operations/email-sending-setup.md). Sign up yourself with an email address that has never been used, and confirm the code arrives (and whether it lands in Spam). Until that works, new testers cannot get in.
- **Pilot first.** Send to 2 or 3 people, wait a day, fix anything about the test itself that confused them, then send to everyone.

## What testers can and cannot do in this build

- Nothing is real: no money is charged and no worker comes to anyone's house. Missions stop before payment.
- Sample providers and bookings are test data.
- So we never ask testers how paying, cashing out or refunds *felt*. We only ask whether they could find and understand the information.

## How many testers

About 5 testers per side find most of the big usability problems. Aim for a mix: someone who books home help often, someone who never does, an older and a younger person, and 2 or 3 people who actually do aircon, cleaning or repair work for the provider side. Prices need more answers, so everyone is asked.

## Privacy

- Tester answers live in the database and the admin. Ordinary admins see phone numbers and emails inside answers masked, and no tester names. Super admins see everything.
- The private pull (`scripts/feedback/pull.mjs`) writes to folders that git ignores. Never commit them: they hold tester answers, screenshots and sometimes names and contact details.
- Insights files quote testers without names.
