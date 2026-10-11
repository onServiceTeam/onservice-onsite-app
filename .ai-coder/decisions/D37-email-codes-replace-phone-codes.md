# D37: Email codes replace phone codes while SMS is unavailable

Status: **Ken decided 2026-10-11 (~23:00 Manila).** Design below by Claude, same night.
Open items for Ken are at the end.

## Ken's instruction (summary)

Philippine carriers will not deliver our SMS until we send them corporate
registration documents, which we do not have yet. So:

- Temporarily turn off every phone/SMS one-time code (OTP) in the app.
- On the customer, provider (and provider staff) and admin sign-in screens,
  replace it with an email code.
- The email is short and professional, has a clear subject, and shows the
  code bigger and bolder than the rest.
- The code is valid for exactly 5 minutes, honoured to the millisecond.
- A resend button. Inside the 5 minutes it sends the **same** code again.
  After the 5 minutes the code is dead and a new one is needed.
- It must really work: buttons, delivery, and landing in the inbox, not spam.
- Keep all the phone-code code in the codebase, switched off and commented,
  so it can be turned back on later without rebuilding it.
- Email-service credentials live in the server's `.env`, clearly labelled.
- Same changes in the Android APK. The APK must learn about updates from the
  live server and stay aligned with the web app.

## What existed before this decision

- Phone OTP sign-in (`/api/v1/auth/send-otp`, `/verify-otp`). Signs in
  customers, providers and staff; creates a new customer account on first
  sign-in. Admin roles are refused (SEC-075).
- Admin sign-in: email + password, then an authenticator-app code (TOTP).
  No SMS anywhere. On the live server 2FA is ON and all active admin accounts
  have an authenticator set up.
- A dormant email sign-in built 2026-10-09 (`/api/v1/auth/email/*`, migrations
  175-179, `email-sign-in.service.ts`). It only signs in accounts that already
  linked a verified email, and linking needs an SMS code, so with SMS off
  nobody could ever use it. Each request makes a new code. Text-only email.
  Default off; never enabled anywhere.

## Decisions

### 1. Email provider: Resend over HTTPS

- The server cannot send mail itself: Hetzner blocks outgoing ports 25, 465
  and 587. HTTPS to Resend works (checked 2026-10-11).
- The code already speaks Resend's API, with no new software dependency.
- `onservice.ph` has no MX, SPF, DKIM or DMARC records. Inbox delivery needs
  Resend's DKIM and SPF records plus a DMARC record in GoDaddy. Ken owns both
  the Resend account and GoDaddy (Claude may not create accounts).
- Credentials, in the server `.env` under a labelled block:
  `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `EMAIL_AUTH_DELIVERY_ENABLED`.

### 2. A new email-code flow, not an edit of the dormant 2026-10-09 flow

The dormant flow's core guarantees (sign-in only for pre-linked identities,
a new code on every request, one send per code, no account creation)
contradict Ken's instruction. Rewriting it in place would also rewrite its
55 passing tests into something else. Instead:

- New table `email_code_challenges`, new service
  `email-code-auth.service.ts`, new routes `/api/v1/auth/email-code/*`.
- The dormant flow stays in the codebase unchanged and switched off
  (`EMAIL_SIGN_IN_ENABLED` unset). This decision supersedes it as the email
  sign-in for now.

### 3. Who can sign in with an email code

- **An existing customer, provider or staff account whose email matches**
  (case-insensitive). The code proves the person controls that inbox right
  now; the first success stamps `users.email_verified_at`.
- **A new email address creates a new customer account**, as a new phone
  number did. After the code is accepted, a "Create your account" step asks
  for name and mobile number, and only then is the account created (the
  database requires a phone on every account, and about ten features use it).
  The mobile number is contact information: it is not verified by SMS
  (`users.phone_verified_at` stays NULL), so it never acts as identity. Phone
  sign-in will not open such an account, and a team invite addressed to that
  phone does not match it.
- **Admin, super admin and DPO accounts are refused** on the marketplace
  screens. They use the admin console.
- **Deactivated accounts are refused**, as with phone.

Risk accepted (Ken to confirm, item A below): an older account whose
contact email was typed in without verification can be entered by whoever
owns that inbox. Today no live account's email can receive mail. All are
@onservice.ph (no mailboxes) or @test.ph (someone else's domain). So nothing
real is exposed now. New accounts are verified at creation.

### 4. Same code within the window, without storing the code

- The code is computed from a server secret and the challenge id:
  `HMAC-SHA256(key, challengeId)` reduced to six digits. The key is derived
  with HKDF from the existing `JWT_SECRET`, with a purpose label.
- Nothing about the code is stored. A resend recomputes the identical code.
  Checking a typed code recomputes it and compares in constant time. There
  is no scrypt cost per request.
- Each send uses a new Resend idempotency key (`<challengeId>/<sendNumber>`).
  Resend deduplicates a repeated key for 24 hours.

### 5. The 5-minute window

- `expires_at = clock_timestamp() + 300000 ms`, set once in the database when
  the code is created. A resend never moves it.
- Every expiry comparison happens inside PostgreSQL against
  `clock_timestamp()` (microsecond precision). JavaScript `Date` objects are
  never compared, because node-pg truncates to milliseconds.
- The moment of judgement is when the server checks the typed code: after the
  code's row is locked, a separate statement asks the database clock whether
  `expires_at` has passed. A code checked 1 ms before expiry is accepted (its
  sign-in then completes); a code checked at or after expiry is refused. This
  replaces an earlier draft line promising a second check just before commit,
  which would have shortened the window by the time sign-in takes.
- The app shows a countdown from the server's own remaining milliseconds, so a
  wrong phone clock cannot shorten or extend it.

### 6. Abuse limits (NAT-friendly)

Philippine mobile networks put many people behind one IP address, so:

- Per email: 1 send per 30 s, at most 5 sends per code, at most 5 new codes
  per hour. Five wrong tries kill a code. Customer and admin codes are counted
  separately, so customer-side requests can never use up an admin's allowance.
- Per IP address: 30 new codes per hour, and 30 wrong guesses per hour before
  code checks from that network pause for the rest of the hour.
- Only real wrong guesses are recorded (`login_attempts`, identified by a
  digest of the email, never the address). Codes the provider refused do not
  count toward any limit, and a refused resend is undone.
- The phone lockout (`checkOtpLockout`) is NOT reused. The first build reused
  it; review showed it counted every failure and locked whole shared mobile
  addresses, so anyone could lock a person out of their own email for a day.
  Nothing now locks an individual email address.
- Before sending, the recipient domain must have an MX record. This blocks
  typos (gmial.com) and dead domains, whose bounces would damage our sender
  reputation. (Domains that receive mail only through an A record are also
  refused; review agreed this is the safer choice.)

### 7. Phone codes switched off, not deleted

- `PHONE_OTP_SIGN_IN_ENABLED=0` makes `/send-otp` and `/verify-otp` answer
  503 with code `phone_sign_in_paused`. Unset means on, as before.
- `GET /api/v1/auth/methods` reports both switches. The web app and the APK
  read it at the sign-in screen, so turning phone codes back on later is a
  server setting, not an app release. With both on, email shows first with a
  "Use my mobile number instead" button. While the answer loads, neither form
  shows; if the server cannot be reached, the last answer is used, or else the
  server default (phone on, email off).
- All phone screens, services and tests stay. Comments mark them
  "paused by D37". Paused requests are refused before anything is recorded.
- **Before email codes are ever switched off again**, accounts created by email
  need a way to prove their mobile number by SMS (to set
  `phone_verified_at`). That flow does not exist yet. Until it does, email
  codes must stay on, or those accounts could not sign in.

### 8. Admin second step

- `ADMIN_SECOND_FACTOR=totp|email`. Unset means `totp` (today's behaviour).
- With `email`, after a correct password the admin gets an emailed code (same
  5-minute and same-code-resend rules), then the session is issued. The
  authenticator steps and code stay, unused while `email` is set.
- It is only switched to `email` after every active admin account has a real
  inbox. All live admin emails are @onservice.ph today, which has no
  mailboxes.
- It can never lock admins out: if the email cannot be sent (provider
  refusal, outage, limit, a domain that takes no mail), admin sign-in falls
  back to the authenticator step, and an admin with an authenticator can
  always choose it instead. Switching back to `totp` also stops pending
  emailed codes from working.
- The admin email says plainly that an unexpected code means someone has
  the password.

## Rollout order (never lock people out)

1. Deploy the code with every new switch off. Nothing changes for anyone.
2. Ken creates the Resend account, adds the DNS records in GoDaddy and gives
   Claude the sending key. Claude installs it in the server `.env`.
3. Claude turns email codes on with phone still on, and proves a real code
   reaches Ken's Gmail inbox (not spam), plus Outlook/Yahoo if available.
4. Phone codes off.
5. Admin emails changed to real inboxes, then `ADMIN_SECOND_FACTOR=email`.

## Open items for Ken

- **A.** Confirm the risk in section 3, or instead require existing accounts
  to be re-created by email.
- **B.** Which real inbox each admin account should use.
- **C.** Where replies should go. `onservice.ph` has no mailbox, so the email
  says not to reply. A support inbox can be added later (`EMAIL_REPLY_TO`).
- **D.** A mobile number typed at email sign-up occupies that number (the
  database allows one account per number). Someone who types another
  person's number, by mistake or on purpose, blocks the real owner from using
  it until support clears it by hand. Options: an admin action to clear an
  unverified number (small), or move unverified numbers out of the unique
  column (larger). Recommended: the admin action, before real launch.
- **E.** Admin activity views look up sign-in attempts by phone number, so
  they do not show email-code attempts. A small follow-up.

## Review record

The first build was reviewed on 2026-10-12 by four independent reviewers
(server security, app and admin screens, rollout and regressions, email
delivery), each finding checked by a skeptic. 28 findings were confirmed (one
critical: a successful code sent people back to the sign-in screen) and 2
refuted. All 28 are fixed or recorded above as items D and E; details in
`docs/audits/EMAIL-CODE-SIGN-IN-2026-10-12.md`.
