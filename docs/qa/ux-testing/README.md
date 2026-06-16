# onService PH — UX Testing Pack

This folder is everything you need to run a user-experience test of the onService
app with everyday people (not engineers) and turn what they say into real fixes
and improvements.

It works for the **customer** side, the **provider** side, and the **admin**
panel. A tester can do one area or all three.

## What's in here

| File | Who it's for | What it does |
| --- | --- | --- |
| [TESTER-GUIDE.md](TESTER-GUIDE.md) | The tester | Welcome, how to get in, and step-by-step "missions" that walk them through each area while reacting honestly. |
| [QUESTIONNAIRE.md](QUESTIONNAIRE.md) | The tester | Structured questions after they test: easy 1-5 ratings, a usability score, and prompts for ideas, missing services, and prices. |
| [FEEDBACK-LOG.md](FEEDBACK-LOG.md) | The tester | A repeatable form to write down every bug, friction point, or idea as it happens, in plain words. |
| [INTAKE-TRIAGE.md](INTAKE-TRIAGE.md) | You / the team | How to sort the feedback and convert it into ready-to-paste tasks for the AI coder or the design/product team. |

The tester gets the first three. You keep the fourth.

## How a test session runs (about 30-45 minutes)

1. **Send the tester the pack.** Give them [TESTER-GUIDE.md](TESTER-GUIDE.md),
   [QUESTIONNAIRE.md](QUESTIONNAIRE.md), and [FEEDBACK-LOG.md](FEEDBACK-LOG.md).
   For non-technical testers, paste these into a Google Doc, or turn the
   questionnaire into a Google Form (every question is written so it drops
   straight into a form).
2. **They get in** using the no-login demo links (see below). No account, no
   password to remember.
3. **They run the missions** in the tester guide and write anything that makes
   them pause, smile, or frown into the feedback log as they go.
4. **They fill the questionnaire** at the end while it's fresh.
5. **They send it back** to you (the filled log + questionnaire, plus any
   screenshots).
6. **You triage** with [INTAKE-TRIAGE.md](INTAKE-TRIAGE.md) and hand the sorted
   items to the AI coder or the design team.

## Getting in (no login)

The app is in demo mode, so testers land straight inside each area. Full details
are in [../DEMO-ACCESS.md](../DEMO-ACCESS.md). The short version:

First, a one-time site gate (a browser username/password pop-up), entered once
per address:

- Username: `tester`
- Password: `Bas--tgySCwfSknW`

Then the three entry links:

| Area | Link |
| --- | --- |
| Customer | https://app.onservice.ph/?demo=customer |
| Provider | https://app.onservice.ph/?demo=provider |
| Admin | https://admin.onservice.ph/login?demo=1 |

## What we are trying to learn

We want honest reactions, not polite ones. Specifically:

- **Bugs** — anything broken, wrong, or stuck.
- **Friction** — anything confusing, slow, or that made them hesitate.
- **Usability** — could they finish a task without help?
- **Trust** — would they put their money and home address into this?
- **Ideas** — features they wish existed.
- **Services** — home services they'd want that we don't offer yet.
- **Prices** — what they'd expect to pay, and what feels too cheap or too dear.
- **Advantages** — what made them prefer this over calling someone they know.

## How many testers

5 testers usually surface the large majority of usability problems. Aim for a mix:
someone who books help often, someone who never does, an older user, a younger
user, and someone who would be a provider (does aircon, cleaning, repairs, etc.).
For pricing and service ideas, more testers is better, so collect those from
everyone.

## A note on the data they'll see

The demo accounts use seeded (fake) sample data: sample customers, sample
providers, sample bookings. Testers can poke at anything. Nothing they do touches
real customers or real money.
