# Demo access — no-login testing (customer, provider, admin)

Updated 2026-06-28. The staging site is now **open for testing**: the old
username/password pop-up (the nginx gate) is gone, and the links below land you
**straight inside each area with no login at all**. This is on purpose so the
whole app can be walked through to find GUI and UX problems. Production builds
will simply omit the demo flags, so real login (phone + OTP for the app, email +
password + 2FA for admin) returns at cutover with no code change.

## The three straight-in links

Open any of these and you are dropped directly into the app — no pop-up, no
login screen:

| Area | Link | Lands on |
| --- | --- | --- |
| Customer | https://app.onservice.ph/?demo=customer | Customer home (active bookings + services) |
| Provider | https://app.onservice.ph/?demo=provider | Provider dashboard (online toggle, jobs, earnings) |
| Admin | https://admin.onservice.ph/login?demo=1 | Admin dashboard (full super-admin access) |

Customer and provider are the **same app** at different links — that is how one
person reaches both experiences without juggling two accounts.

## Mobile view vs desktop view

The customer/provider app runs in the browser in two layouts. Add `?view=` to
either app link:

| View | Link example | What you get |
| --- | --- | --- |
| Mobile (default) | https://app.onservice.ph/?demo=customer | The app centered in a phone-width column — the phone experience |
| Desktop | https://app.onservice.ph/?demo=customer&view=desktop | The app widened to a desktop content width; service grids reflow to more columns |

The view choice sticks while you navigate (it is remembered in the browser), so
you can set it once with `&view=desktop` and keep testing. Switch back any time
with `&view=mobile`. The **admin** area (`admin.onservice.ph`) is a desktop web
app already — open it on a full browser window.

## Leaving feedback

After testing, go to the public feedback page (no login):

- https://app.onservice.ph/feedback

It has the instructions, the same demo links, and the full questionnaire, and
submits straight into our database. In "Bugs & rough spots" you can attach a
screenshot of a broken screen (JPG/PNG/WebP). See
[ux-testing/README.md](ux-testing/README.md) for the whole UX-testing pack and
[ux-testing/INTAKE-TRIAGE.md](ux-testing/INTAKE-TRIAGE.md) for reading the
collected feedback back out.

## The seeded demo accounts

- Customer: Metro Cebu customer with active bookings and a populated home screen
- Provider: "Roberto", verified, online, with an active job and a service list
- Admin: super-admin with full access (Dashboard, Providers, Customers,
  Bookings, Dispatch, Disputes, Financials, Service Areas, etc.)

## Manual buttons (if you ever land on a login screen)

The login screens also carry one-tap demo buttons:

- App login screen: **Enter as Customer** / **Enter as Provider**.
- Admin login screen: **Enter as Admin (demo)**.

## Turning demo + open access OFF for launch

No code to delete. At the production cutover:

- Mobile: build without `EXPO_PUBLIC_DEMO_MODE=1`.
- Admin: build without `VITE_DEMO_MODE=1` (and rotate the demo admin password).
- nginx: restore the private gate (or rely on real SMS OTP + admin 2FA being on).

With the demo flags unset, the `?demo` auto-logins and the demo buttons are gone
and only normal login remains.
