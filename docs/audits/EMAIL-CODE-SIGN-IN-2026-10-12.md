# Email codes replace phone codes (D37), October 12

## What Ken asked for (2026-10-11)

Philippine carriers will not deliver our SMS until they receive our corporate
documents, so phone one-time codes are paused. Customer, provider, staff and
admin sign-in use an emailed 6-digit code instead:

- valid exactly 5 minutes;
- Resend repeats the same code inside the window, and a new code is sent after it;
- a short professional email with the code big and bold, landing in the inbox.

The phone-code code stays, switched off. The APK gets the same screens and
learns about updates from the live server.

Decision record: `.ai-coder/decisions/D37-email-codes-replace-phone-codes.md`.
Setup steps for Ken: `docs/operations/email-sending-setup.md`.

## What was built

**API** (`packages/api`):

- Migration `180_email_code_sign_in.sql`:
  - table `email_code_challenges`, which stores no code and no address (only a SHA-256 digest);
  - `users.email_verified_at`;
  - `users.phone_verified_at` (existing accounts stamped; email sign-ups NULL);
  - a unique index on `lower(email)`.
- `email-code-auth.service.ts`:
  - the switches;
  - code = HMAC of the challenge id with a key derived from `JWT_SECRET`, so a resend rebuilds the same code;
  - send reservation with the 30 s pause, 5 sends per code and per-purpose hourly caps;
  - expiry judged by the database clock after the row lock;
  - marketplace sign-in, the "create your account" token, admin request/verify, and clean-up.
- `email-code-message.ts`: subject, plain-text and HTML parts, with the code in a large bold block.
- `email-domain-check.service.ts`: the recipient domain must publish MX.
- `email-code-delivery.service.ts`: new `sendEmailCodeMessage` (HTML, from-name, reply-to).
- Routes:
  - `/api/v1/auth/email-code/request|verify|complete-signup`;
  - `/api/v1/auth/methods` reports both switches;
  - the phone routes answer 503 `phone_sign_in_paused` when `PHONE_OTP_SIGN_IN_ENABLED=0`, before recording anything;
  - the admin login email step plus `/admin/email-code/resend|verify`, falling back to the authenticator.
- Phone sign-in refuses accounts whose number was never proven. Phone-addressed team invites need a proven number.
- Data export and erasure include the new table.
- The scheduler closes expired codes.

**Web app and Android app** (`apps/mobile`):

- Login and register read the server's switches. The phone forms are kept and shown only when phone codes are on. With both on, there is a switch between them.
- New screens:
  - `auth/email-verify` (countdown from the server's remaining time, Resend after 30 s, "Send a new code" after expiry, notes for uncertain delivery or an earlier send);
  - `auth/create-account` (name and mobile number).
- The email and sign-up pass move in memory, never in the address bar.
- Bug UX-1383: a customer invited to a team can open Team Invitations.

**Admin console**: an email-code step after the password, with countdown, Resend, "Send a new code", and "Use authenticator app instead".

**APK updates** (separate piece in the same release): `/api/v1/app-releases/android/latest` plus immutable APK files, `scripts/release/publish-android-apk.sh`, an update offer on launch/foreground, and a "Check for updates" row in Help and provider Settings. The app version goes to 1.0.1 (build 2).

## How it was checked

- Real-database tests (local PostgreSQL 17). The real migration 180 is applied
  to the focused session fixture, with the real routes, SQL and token issuer;
  only the email provider is an owned loopback server.
  - `email-code-sign-in-postgres` (26), covering:
    - the exact 300000 ms window;
    - the same code and expiry on resend;
    - refusal 1 ms past expiry;
    - the wrong-guess rules;
    - limits that ignore unsent codes;
    - the undo on a refused resend;
    - the 429 retry;
    - forged sign-up tokens.
  - `email-code-admin-postgres` (10)
  - `email-signup-phone-invite-postgres` (3)
  - `phone-sign-in-unverified-number-postgres` (2)
- HTTP and unit tests:
  - `auth-methods-http`
  - `phone-otp-paused-http`
  - `email-code-message`
  - `email-domain-check`
  - `app-release-http`
  - `email-link-cleanup-scheduler` (updated for the new clean-up step)
- App tests (jest, real screens):
  - `d37-email-sign-in-screens` (18, including the exact list of navigations after sign-in)
  - `d37-auth-methods-hook`
  - `d37-auth-store-email-code`
  - `apk-update-check`
  - `bug-ux-1383-customer-team-invites-access`
- Admin tests (vitest):
  - `d37-admin-email-code-login` (8)
  - `d37-admin-demo-email-step`
- Full local runs before the review fixes:
  - API: 1084 of 1088 files. The 4 failures were:
    - 2 checks that need Docker;
    - 1 database connection timeout, which passed on rerun;
    - the scheduler test, which was then updated.
  - App: 623 of 624. The failure was a time-zone test that passes when run alone.
  - Admin: 596 of 600. Three logout tests failed under load and pass when run alone.
- The final full runs after the fixes, and GitHub CI, are recorded with the commit
  and the deployment.

## Review findings and what was done

Four independent reviewers (server security, app and admin screens, rollout and
regressions, email delivery) each had a skeptic try to refute every finding:
28 confirmed, 2 refuted. Highlights, all fixed with a test that fails without
the fix:

- **Critical:** after a correct code the app returned to the sign-in screen. Clearing the in-memory flow queued a second navigation. Tests now assert the exact list of navigations.
- **High:**
  - reusing the phone lockout let anyone lock a person out of their own email, and locked shared mobile-network addresses;
  - a typed, unproven number could claim a phone-addressed team invite;
  - customer-side requests could use up an admin's hourly allowance;
  - the sign-in screen could hide the working phone form while loading or offline.
- **Medium and low:**
  - never-sent codes counted toward limits, and a refused resend was not undone;
  - no retry on the provider's own rate limit;
  - uncertain delivery was reported as sent;
  - a dead end when asking again while a code was live;
  - a mail outage could lock admins out;
  - the admin email told admins to ignore an unexpected code;
  - no "do not reply" line, and the preview line said "valid for 5 minutes" on late resends;
  - paused phone routes still counted attempts;
  - the admin switch was not re-checked at verification;
  - double submits, "Send a new code" ignoring the server wait, and the admin demo button.
- **Recorded, not fixed (D37 items D, E):**
  - a typed number occupies that number until support clears it;
  - admin activity views do not show email attempts;
  - no SMS screen yet to prove a number, so email codes must stay on even after SMS returns.
- **Refuted:**
  - relaxing the MX check to A-records (kept strict on purpose);
  - plaintext emails in login attempts (they are now digests anyway).

## Deliberate-breakage (mutation) results

There were 31 deliberate breaks of the server code. Each was applied alone, and
every file was restored and byte-compared afterwards.

**All 31 were caught**, each by a test failing on its assertion. No logs showed
environment errors, and the unbroken baseline passed 50 of 50.

The breaks covered:

- expiry judged as always valid;
- a resend that moves the expiry or makes a new code;
- removing each of these checks:
  - the 30 s pause;
  - the 5-send limit;
  - the hourly cap;
  - the purpose-scoped caps;
  - the unsent-code exclusion;
  - wrong-guess counting;
  - consumption of a used code;
  - the sign-up proof check;
  - the domain check;
- treating a typed phone number as verified;
- not withdrawing or undoing unsent codes;
- skipping the 429 retry;
- not recording wrong guesses, recording them in plain text, or switching off the network ceiling;
- switching off the phone pause;
- letting phone sign-in reach an unproven number, or letting phone invites match one
  (list and accept were broken separately);
- removing the admin fallback, the verify-time switch check, or the admin warning;
- a broken code comparison;
- hiding `codePending` or the delivery status.

Logs are private, in the worktree's
`qa-frameworks/repair-intake-2026-10-09/email-signin-2026-10-11/mutations/`.

## What is not done

- No email can be sent until Ken sets up Resend and the GoDaddy records. Until then email codes stay off and phone codes stay on.
- Inbox placement (not spam) must be checked with real Gmail/Outlook/Yahoo inboxes after the domain is verified.
- No live account has a receivable email. Testers sign up again with their own email, or Ken maps test accounts to real inboxes.
- Admin email codes stay off until every admin account has a real inbox.
