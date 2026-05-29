# How to run and test onService (all four roles)

This guide is written for a non-developer. It explains how to start the app on
your own computer and walk through it as a **customer**, a **provider (the
worker)**, an **admin/super-admin**, and a **support/back-office** user.

There are three pieces of software:
- **The backend** (the server + database) — the brain. Everything talks to it.
- **The admin website** — the back office you (and your staff) use in a web browser.
- **The mobile app** — what customers and providers use on their phones.

You run the backend once, then open the admin website and the mobile app
against it.

---

## 0. One-time setup

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/) and
[Node.js 24+](https://nodejs.org) installed, and Docker Desktop must be
**running**. Nothing else — Windows PowerShell is built in.

Then install the project's dependencies once, from the project folder:
```
npm install
```

---

## 1. Start the backend (the brain)

Open a terminal in the project folder.

**Windows (PowerShell):**
```
./scripts/dev/up.ps1
```

**Mac / Linux:**
```
bash scripts/dev/up.sh
```

This starts the database and the server, applies the database structure, and
loads demo data (sample users, Cebu services, providers, and bookings). When
it finishes it prints the addresses. The server runs at `http://localhost:7381`.

- **Stop it later:** `./scripts/dev/down.ps1` (Windows) or `bash scripts/dev/down.sh`.
- **Reset the demo data** (gives the demo accounts/catalog back, safe to
  repeat): `./scripts/dev/reset-demo.ps1`.
- **Full wipe and fresh start:** `./scripts/dev/down.ps1 -Volumes`, then
  `./scripts/dev/up.ps1` again.

> The demo OTP login (Step 3) and the test fixtures are turned ON by default
> in this local setup. They are physically impossible to turn on in
> production, so this is safe.

---

## 2. The demo accounts you get

Loading the demo data creates these accounts. **All phone logins use the demo
code `000000`** (see Step 3).

**Customers** (log in on the mobile app):
| Name | Phone |
|---|---|
| Maria Santos | +639171234567 |
| Juan Dela Cruz | +639181234567 |
| Anna Reyes | +639191234567 |
| Paolo Garcia | +639201234567 |
| Rica Mercado | +639211234567 |

**Providers / workers** (log in on the mobile app — same app, the account just
*is* a provider):
| Business | Phone |
|---|---|
| Roberto's Plumbing | +639221234567 |
| Elena's Cleaning | +639231234567 |
| Aquino Electrical | +639241234567 |
| Jasmine Aircon | +639251234567 |
| Ramos Carpentry | +639261234567 |

**Admin / back-office** (log in on the admin website): `admin@onservice.ph`
and `superadmin@onservice.ph`. These have **no password yet** — see Step 4.

---

## 3. The phone login code (important)

Real logins send a 6-digit code by SMS. On your own computer there is no SMS,
so we added a **demo code that only works locally**: type **`000000`** as the
code for any phone number, and you're in. (This never works on the real
production app.)

So the mobile login is: enter a phone number from the table above → tap send →
enter `000000` → you're logged in as that person.

---

## 4. Run the admin website (back office)

In a new terminal:
```
npm run dev --workspace=apps/admin
```
Open `http://localhost:7382` in your browser.

**First time only — create your admin password.** Run this once (pick a strong
password, at least 16 characters with an uppercase letter, a number, and a
symbol):
```
ADMIN_BOOTSTRAP_PASSWORD='YourStrongPassw0rd!' ADMIN_BOOTSTRAP_ROLE='admin' npx tsx packages/api/scripts/bootstrap-admin.ts admin@onservice.ph
```
For the super-admin account, use `superadmin@onservice.ph`, set
`ADMIN_BOOTSTRAP_ROLE='super_admin'`, and add `--confirm-super-admin` at the end.

**Two-factor (one-time):** the first time you log in, the site asks you to set
up an authenticator app (Google Authenticator, Authy, or similar on your
phone). Scan the code it shows, type the 6-digit number from the app, and
you're in. After that, logging in just needs your password plus the current
number from the app.

Super-admin sees everything (money, settings, staff). Plain admin sees most
things but a few money/settings actions are super-admin only.

---

## 5. Run the mobile app (customer and provider)

In a new terminal:
```
npm run start --workspace=apps/mobile
```
Then press `w` for a quick web preview, or `a` / `i` to open an Android
emulator / iPhone simulator, or scan the QR code with the **Expo Go** app on a
real phone.

> If you use a real phone, it can't reach "localhost" (that means the phone
> itself). Set `EXPO_PUBLIC_API_URL` to your computer's network address
> (e.g. `http://192.168.1.50:7381`) before starting.

**Be a customer:** log in with a customer phone (e.g. `+639171234567`) and code
`000000`. Browse services, book one, pay (use the in-app wallet for the
smoothest demo), track it, and after it's done, rate and tip.

**Be a provider:** log in with a provider phone (e.g. `+639251234567` Jasmine
Aircon) and code `000000`. You'll see the provider side: incoming job requests,
quotes, your jobs, earnings, and payouts. A brand-new phone number starts as a
customer and can apply to become a provider through the onboarding screens.

**Tip:** run two devices (or one emulator + the web preview) so you can be the
customer on one and the provider on the other and watch a booking move between
them live.

---

## 6. The support / back-office roles

Beyond `admin` and `super_admin`, the system supports `dpo` (data-privacy
officer), `finance`, `support`, and `dispatcher`. Create one the same way as in
Step 4, changing the role, e.g.:
```
ADMIN_BOOTSTRAP_PASSWORD='YourStrongPassw0rd!' ADMIN_BOOTSTRAP_ROLE='support' npx tsx packages/api/scripts/bootstrap-admin.ts support@onservice.ph
```
The admin website has the support tools (support tickets, disputes,
compliance/DPO, financials).

> Note: today the admin website's login only admits `admin`, `super_admin`,
> and `dpo`. A pure `support`/`finance`/`dispatcher` account is a valid role in
> the database but may not be able to sign in to the admin site yet. If you
> want those staff to log in, tell me and I'll open the login to them.

---

## 7. A full end-to-end test you can run

1. **Admin:** log in, go to Catalog, confirm the services and prices look right.
2. **Customer (phone A):** book a service, pay with wallet, see it as "active".
3. **Provider (phone B):** see the request, send a quote / accept the job, mark
   it on-the-way, then complete it.
4. **Customer (phone A):** confirm the job is done (this releases the money from
   escrow to the provider), then leave a rating and a tip.
5. **Admin:** open the booking, the financials, and the payout — confirm the
   money math and that a payout to the provider is queued.
6. **Support:** open Support Tickets / Disputes and practice replying or
   resolving one.

---

## 8. What's still rough for testing (honest list)

- **You run three things in three terminals:** the backend (Step 1), the admin
  site (Step 4), and the mobile app (Step 5). The backend is one command; the
  other two are one command each.
- **The admin 2FA step** needs an authenticator app once. There's no skip.
- **The mobile app is easiest to demo on the web preview (`w`) or an
  emulator.** A real phone needs the network-address step in Step 5.
- **The 5 demo providers are in Metro Cebu** (the launch market). Book a Cebu
  address and auto-dispatch will offer the job to a matching provider. If you
  book far outside Cebu, no demo provider will match — use the admin
  "Dispatch" console to assign one manually, or book in Cebu.
