# Demo access — no-login testing (customer, provider, admin)

Updated 2026-08-24. Customer, provider, and admin demo auto-login is disabled on
the public deployment. Customer/provider test phones and the development OTP
are no longer compiled into the public app. Testing requires normal authorized
login unless a separately protected demo build is created.

## Test entry links

All three links stop at normal login on the public deployment. A `?demo` query
is ignored when the build has no protected demo configuration:

| Area | Link | Lands on |
| --- | --- | --- |
| Customer | https://app.onservice.ph/?demo=customer | Normal app login |
| Provider | https://app.onservice.ph/?demo=provider | Normal app login |
| Admin | https://admin.onservice.ph/login | Real admin login; no public auto-login |

Customer and provider are the **same app** at different links — that is how one
person reaches both experiences without juggling two accounts.

## Phone, tablet, and desktop views

The customer/provider app responds to the browser width automatically. Resize
the browser or use its device toolbar to exercise each layout:

| View | Browser width | What you get |
| --- | --- | --- |
| Phone | Under 700 px | The app fills the viewport |
| Tablet | 700–999 px | A centered surface up to 920 px with roomier layouts |
| Compact desktop | 1,000–1,179 px | A centered content surface up to 1,100 px |
| Desktop workspace | 1,180 px and wider | Role navigation plus customer, provider, or staff content, capped at 1,320 px |

For a single-page screenshot test, `?view=mobile` or `?view=desktop` can force
that URL's shell. The override is intentionally not remembered after navigation;
an old test link must not leave a customer or provider stuck in phone mode. The
**admin** area (`admin.onservice.ph`) is a desktop web app already, so open it in
a full browser window.

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

The public login screens do not carry one-tap demo buttons. In a separately
protected demo build:

- App login screen: **Enter as Customer** / **Enter as Provider**. The build
  must set `EXPO_PUBLIC_DEMO_MODE=1`, `EXPO_PUBLIC_DEMO_CUSTOMER_PHONE`,
  `EXPO_PUBLIC_DEMO_PROVIDER_PHONE`, and `EXPO_PUBLIC_DEMO_OTP`.
- Admin login screen: the demo button appears only in a separately protected build made with `VITE_DEMO_MODE=1`; it is absent from the public deployment.

## Turning demo + open access OFF for launch

No code to delete. At the production cutover:

- Mobile: build without all four `EXPO_PUBLIC_DEMO_*` variables.
- Admin: build without `VITE_DEMO_MODE=1` (and rotate the demo admin password).
- nginx: restore the private gate (or rely on real SMS OTP + admin 2FA being on).

With the demo flags unset, the `?demo` auto-logins and the demo buttons are gone
and only normal login remains.
