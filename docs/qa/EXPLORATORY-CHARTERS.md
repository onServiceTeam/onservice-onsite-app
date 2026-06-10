# onService — Exploratory Test Charters

Session-based testing. Each charter is a time-boxed (60–90 min) mission with a
focus, not a script. Record: what you explored, bugs, questions, and follow-ups.
These target the areas automation reaches last and where judgment matters most.

Format per session: **Charter / Areas / Risks to probe / Data needed / Notes**.

---

## C-1 — Booking lifecycle state machine (Tier 2)
**Charter:** Explore every booking transition and the messy branches.
**Areas:** create → confirm → en route → arrived → in progress → completed; plus
cancel-by-customer, cancel-by-provider, cancel-by-admin, dispute, change-order,
reschedule, no-show.
**Risks to probe:** illegal transitions (can a completed booking be cancelled?);
state shown inconsistently to customer vs provider vs admin; money side-effects
firing on the wrong transition; double-submission.
**Data needed:** seeded bookings in each status (the local seed has them).

## C-2 — Money correctness (Tier 1)
**Charter:** Follow the money through a booking, end to end.
**Areas:** price quote, escrow hold at payment, commission split at completion,
refund (full + partial), payout to provider, wallet top-up.
**Risks to probe:** commission wrong for a tier; rounding (centavos); refund
exceeding the held amount; double-credit on a retried webhook; negative or
zero-amount edge cases; currency/locale formatting (₱, en-PH).
**Data needed:** a provider in each tier; a booking ready to complete.
**Note:** on staging, PayMongo is LIVE — do not complete a real charge. Use the
local stack for payment-path exploration.

## C-3 — Multi-actor race conditions (Tier 2)
**Charter:** Two actors touch one booking at once.
**Areas:** customer cancels while provider taps "en route"; dispute opened during
escrow release; admin reassigns while provider is acting; change-order accepted
and rejected near-simultaneously.
**Risks to probe:** lost updates, inconsistent final state, money applied twice
or not at all, notifications to the wrong party.

## C-4 — Authorization / IDOR (Tier 2, security)
**Charter:** Try to see or change data that isn't yours.
**Areas:** another customer's booking / wallet / address by changing an id; a
customer hitting admin/provider/DPO endpoints; a provider acting on a booking
they're not assigned to.
**Risks to probe:** any 200 where a 403/404 is expected.
**Note:** the automated suite `qa/api-security/authz.test.mjs` covers the core of
this; the charter is for the long tail of endpoints it doesn't yet enumerate.

## C-5 — Provider onboarding + KYC review (Tier 2)
**Charter:** Walk an application from submit to admin decision.
**Areas:** the 10-screen onboarding, document upload, selfie, admin approve /
reject / send-back with reason, resubmission.
**Risks to probe:** KYC documents reachable by storage URL (must be 404 / proxy
only); send-back without a reason; state stuck after resubmission.

## C-6 — Compliance: DSR + consent (Tier 1)
**Charter:** Exercise the data-subject-request and consent flows.
**Areas:** submit access/erasure DSR; DSR history view; consent grant/revoke;
material re-consent banner; NPC escalation reference format.
**Risks to probe:** a user enumerating another user's DSRs; erasure not starting
the deletion pipeline; consent version drift; rate-limit on DSR submission.

## C-7 — The known-weak chat (Tier 2)
**Charter:** Stress the customer↔provider chat (known unreliable, LL §25).
**Areas:** send text, attach a photo, send while offline, reopen the thread.
**Risks to probe:** messages lost until app restart; attachments not reaching the
recipient; confirm the "Call provider" fallback always works.

## C-8 — Web (desktop/tablet browser) parity (Tier 3)
**Charter:** Use the app as a browser user at desktop and tablet widths.
**Areas:** login, browse, book up to payment, provider dashboard/jobs, uploads,
the signature pad, the captcha.
**Risks to probe:** native-only features degrading badly; layout blowout past the
centered column; camera buttons; map placeholders.

## C-9 — Notifications + offline (Tier 3)
**Charter:** Observe notification and offline behavior.
**Areas:** push (native), in-app notification badges, the offline banner.
**Risks to probe:** badge counts wrong; offline banner showing when online;
actions silently failing offline.

---

## Running a session
1. Pick a charter; time-box it.
2. Take notes as you go (a screen recording is ideal).
3. File bugs per `docs/qa/DEFINITION-OF-DONE.md` bug standard.
4. Note any new charter the session suggests.
