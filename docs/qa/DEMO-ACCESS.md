# Demo access — no-login testing (customer, provider, admin)

Demo mode lets testers land directly in each area with **no login typing**. It is
turned on only in the staging/demo builds now live on the server. Production
builds do not set the demo flags, so demo entry is absent there and normal
login (phone + OTP for the app, email + password + 2FA for admin) is the default.

## Step 1 — the site gate (one-time per area)

Both sites sit behind a single shared gate (a browser username/password pop-up).
Enter it once per site:

- Username: `tester`
- Password: `12345`

The app (`app.onservice.ph`) and admin (`admin.onservice.ph`) are separate
addresses, so the pop-up appears once for each the first time you open them.

## Step 2 — the three demo links

Open these after passing the gate:

| Area | Link | Lands on |
| --- | --- | --- |
| Customer | https://app.onservice.ph/?demo=customer | Customer home (active bookings + services) |
| Provider | https://app.onservice.ph/?demo=provider | Provider dashboard (online toggle, jobs, earnings) |
| Admin | https://admin.onservice.ph/login?demo=1 | Admin dashboard |

Customer and provider are the **same app** at different links — that is how a
tester reaches both without two accounts. Use the customer link for the customer
experience and the provider link for the provider experience.

## Leaving feedback

After testing, testers go to the public feedback page (no login):

- https://app.onservice.ph/feedback

It has the instructions, the same demo links above, and the full questionnaire,
and submits straight into our database. See
[ux-testing/README.md](ux-testing/README.md) for the whole UX-testing pack and
[ux-testing/INTAKE-TRIAGE.md](ux-testing/INTAKE-TRIAGE.md) for how to read the
collected feedback back out.

## Step 3 (alternative) — the manual buttons

If you are already on a login screen, you do not need the links:

- App login screen: **Enter as Customer** / **Enter as Provider** buttons under
  the "Send Verification Code" button.
- Admin login screen: **Enter as Admin (demo)** button under "Sign In".

## The seeded demo accounts

- Customer: Makati customer with two active bookings (Carpentry, General Cleaning)
- Provider: "Roberto", verified, online, with an active Plumbing job and a service list
- Admin: "QA Tester" with full admin access (Dashboard, Providers, Customers,
  Bookings, Dispatch, Disputes, Financials, etc.)

## Normal login still works (for testing the real flow)

Demo mode is additive. The normal flows are unchanged:

- App: enter a phone number, then OTP. On staging the dev OTP is `000000`.
- Admin: email + password (+ 2FA). Tester admin is `tester@onservice.ph`.

## Turning demo OFF for launch

Nothing to delete. Production builds simply omit the demo env vars:

- Mobile: build without `EXPO_PUBLIC_DEMO_MODE=1`
- Admin: build without `VITE_DEMO_MODE=1`

With the flags unset, `DEMO_MODE` is `false`, so the auto-login on `?demo=...`,
the `?demo=1` admin handler, and all three demo buttons are gone, and only normal
login remains. No code change is needed to ship the production (login-required)
version.
