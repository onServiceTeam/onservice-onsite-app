# E07 — CAPTCHA provider conflict + client side not wired (2026-06-05)

**Status:** OPEN — needs Ken's decision (provider choice) before it can be finished.
**Severity:** Medium. Not a hard blocker (rate limiting + OTP are the live baseline
defense), but launch-cutover Item 5 lists CAPTCHA in the must-pass set, and the
runbook currently tells you to configure the WRONG product.

## What I found

While verifying launch-cutover Item 5 (CAPTCHA) I found three different sources
disagree, and the client side isn't wired at all:

1. **Live server path = Cloudflare Turnstile.** `auth.routes.ts` calls
   `securityService.verifyCaptchaToken()`, which POSTs to
   `challenges.cloudflare.com/turnstile/v0/siteverify` using
   `process.env.CAPTCHA_SECRET_KEY`. This is the only captcha code that actually
   runs.
2. **Dead code = hCaptcha.** `packages/api/src/utils/hcaptcha.ts` verifies
   against `hcaptcha.com/siteverify` using `process.env.HCAPTCHA_SECRET`. It is
   imported by **nothing** — pure dead code.
3. **Runbook = hCaptcha, third env name.** `docs/runbooks/launch-cutover.md`
   Item 5 tells you to sign up for **hCaptcha** and set `HCAPTCHA_SITE_KEY` /
   `HCAPTCHA_SECRET_KEY` — a product the live code doesn't use and an env name
   nothing reads.
4. **No client widget.** Neither `apps/mobile` nor `apps/admin` renders a
   Turnstile or hCaptcha widget or references a site key. So even the live
   Turnstile path can't receive a real token from a client today; when a login
   becomes captcha-gated (after the failed-attempt lockout threshold),
   `verifyCaptchaToken` gets no token and returns false.

## Why I did not just "fix" it

- **Provider is your call.** Turnstile (free, Cloudflare) vs hCaptcha (free tier
  + paid) changes what you sign up for and the keys you paste. Aliasing the env
  names wouldn't help — a Turnstile secret does not validate against hCaptcha's
  endpoint or vice-versa.
- **Client wiring needs device testing.** Adding the widget to mobile/admin and
  confirming a real token round-trips needs an emulator/device I can't drive
  here.

## Recommendation

1. **Pick Cloudflare Turnstile** (it's what the live code already uses, it's
   free, and it has a React Native + web SDK). Then:
   - I wire the Turnstile widget into the mobile OTP-request + admin-login
     screens behind the existing `captchaRequired` signal.
   - I delete the dead `utils/hcaptcha.ts`.
   - I correct launch-cutover Item 5 to say Turnstile + `CAPTCHA_SECRET_KEY` +
     the public site key env the client reads.
   - You create a Turnstile site for `*.onservice.ph` and paste the secret into
     `.env`; the public site key goes into the client build env.
2. If you'd rather use hCaptcha, say so and I'll switch the server path to it
   instead (and still wire the client + fix the runbook).

Either way, tell me the provider and I'll finish it end to end and verify. Until
then the live baseline is rate limiting + OTP, which is functional but weaker on
the SMS-cost/bot-abuse vector that captcha is meant to cover.
