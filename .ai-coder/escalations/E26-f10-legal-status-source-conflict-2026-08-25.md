# E26 — F#10 legal status sources contradict each other

Date: 2026-08-25
Raised by: AI coder during the customer Legal screen audit
Status: OPEN — legal wording remains unchanged pending Ken + Philippine counsel

## Conflict

`.ai-coder/decisions/D14r-10-legal-disclaimer.md` says in its opening update that
the no-insurance/liability disclaimer was “FINALIZED at Ken's direction.” The
same decision file later says the production text is interim, that attorney
review is still required before `v1.0.0-launch-ready`, and that the final wording
has not shipped.

The current controlling operational sources agree with the second position:

- `CLAUDE.md` lists F#10 attorney-reviewed wording as still pending.
- `docs/runbooks/launch-cutover.md` lists F#10/E10 as an open launch blocker.
- `docs/operations/09-trust-safety-and-disputes.md` calls the wording interim and
  prohibits expanding it without attorney review.
- The Legal screen itself labels the text “Interim text updated.”

Its source comment, however, incorrectly calls the wording finalized.

## Containment applied

- No Terms, Privacy, disclaimer, liability, guarantee, retention, or insurance
  wording was changed in this audit batch.
- UI-only work may improve responsive layout, accessibility, and loading/error
  presentation without changing the legal effect of the text.
- `v1.0.0-launch-ready` remains blocked.

## Decision needed

Ken and Philippine counsel must choose one status and provide the authoritative
artifact:

1. **Attorney-approved final:** identify the reviewer/date and approve the exact
   Terms, Privacy, Help, and Safety wording, then update all F#10 sources.
2. **Interim:** keep the current wording but remove “finalized” claims and retain
   the launch blocker until counsel approves it.

Recommendation: option 2 unless there is a real attorney approval artifact that
is not yet in the repository.
