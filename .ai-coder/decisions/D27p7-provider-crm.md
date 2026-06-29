# D27 Phase 7 — Provider CRM: what "value-added per category" should it be?

Status: OPEN — needs Ken
Date: 2026-06-29
Author: AI coder

## Background

D27 Phase 7 is "provider CRM depth." The ask (Ken, earlier): the provider area
should feel "like a CRM with value added per category."

I built the concrete, no-decision slice now: a **client book** — `My Clients`
under the provider profile, showing each customer the provider has served, with
job count, completed count, last-served date, repeat-client flag, and total job
value (gross). API: `GET /api/v1/providers/me/clients`.

What I did NOT build, because it's underspecified and I won't invent it, is the
"value-added per category" part. That phrase can mean several different things,
and which one Ken wants changes the build a lot.

## What "value-added per category" might mean (pick any)

1. **Category playbooks / SOP templates.** Per-service checklists the provider
   works through on a job (e.g. aircon: gas check, coil clean, drain flush).
   Builds on the existing Provider Standards screen.
2. **Category-specific quote templates.** Pre-filled line-item sets per service
   (materials + typical labour) so a painter's quote starts from a sensible
   template instead of blank. Builds on the quote line-items (Phase 3/4).
3. **Per-category performance insights.** "You complete aircon jobs 20% faster
   than average; your plumbing rating is 4.9." Analytics over the provider's own
   history, sliced by category.
4. **Lead/pipeline management.** A light pipeline for the provider's open quotes
   and follow-ups (extends Phase 1 leads): contacted / quoted / won / lost.
5. **Client notes + reminders.** Free-text notes per client and a "follow up in
   N days" nudge (a true CRM feature on top of the client book just shipped).

## Recommendation

The client book (shipped) is the foundation any of these build on. My pick for
the highest provider value next is **#5 client notes + reminders** (turns the
read-only book into an actual CRM) plus **#2 category quote templates** (saves
real time on every quote). Both are buildable without money-path risk.

But these are product calls. I'll build whichever Ken points at rather than
guess, since "value-added per category" spans five quite different features.

## What I need from Ken

Which of #1–#5 (one or several) do you want for the provider CRM, and in what
order? Or describe the specific provider workflow you had in mind.
