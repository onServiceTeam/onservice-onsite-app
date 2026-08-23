# E14 — PayMongo hosted checkout flow does not exist

Date: 2026-08-24
Status: OPEN — needs Ken and PayMongo test-mode validation
Severity: CRITICAL — customer card, GCash, Maya, QR Ph, and wallet top-up launch blocker
Hard stop: money path and external payment architecture

## What I found

The API creates a PayMongo **Payment Intent** at
`POST https://api.paymongo.com/v1/payment_intents`, stores its `client_key`, and
then invents a hosted URL in `packages/api/src/services/payment.service.ts`:

```text
https://checkout.paymongo.com/intent/<client_key>?method=<payment_method>
```

That route is not returned by PayMongo. A direct request to the same
`/intent/...` URL shape returned HTTP 404 on 2026-08-24. The official PayMongo
material distinguishes the Payment Intent workflow from the Checkout Session
workflow. The hosted Checkout Session request includes `success_url`,
`cancel_url`, payment method types, and line items; a bare Payment Intent client
key is not documented as a hosted checkout URL.

The mobile app then compounds the problem:

- `wallet-topup.tsx` opens the invented URL and immediately navigates back;
- `booking/checkout.tsx` and `booking/pay.tsx` navigate to confirmation before
  the customer has paid, then open the invented URL;
- there is no top-up result route, return/cancel URL, app-link callback, pending
  payment workspace, or authenticated top-up status endpoint;
- comments claim PayMongo redirects the user back, but no such callback is
  implemented.

## Production evidence

Read-only production checks on `46.62.207.225` found:

- `PAYMONGO_CHECKOUT_BASE` is not configured, so the code uses the invalid
  hardcoded default;
- the configured secret key is live-mode (`sk_live_` prefix; no key value was
  read or printed);
- the database has 12 top-up payment intents: 5 GCash, 2 Maya, 2 card, and 3 QR
  Ph;
- all 12 remain `awaiting_payment`;
- zero top-up intents are `succeeded` or `failed`;
- attempts span 2026-06-14 through 2026-06-30, including the tester-feedback
  period.

This matches the tester report that QR top-up did not return cleanly. The
historical fixes made top-up rows insertable and made webhooks capable of
crediting a wallet, but they did not create a valid customer authorization
flow.

## Why I stopped

Changing from Payment Intents to Checkout Sessions, or adding a client-side
Payment Method + attach-confirm flow, changes the external money path. It also
changes redirect handling, webhook correlation, retry/idempotency rules, and
possibly the local payment-intent data model. The repository's hard-stop rule
does not allow that architecture to be guessed or tested against live keys.

I did not:

- create or complete any PayMongo payment;
- read, print, or move secret key values;
- mark the 12 stale intents failed;
- credit or debit any wallet;
- change refunds, escrow, fees, payouts, or payment methods;
- expose a customer UI that implies the current external flow works.

## Decision needed

### Option A — PayMongo Checkout Sessions (recommended)

Use PayMongo's hosted Checkout Session API for card, GCash, Maya, and QR Ph.
Store the returned session identifier and exact `checkout_url`, provide HTTPS
success/cancel routes that can deep-link back to the native app and render in a
desktop/tablet browser, and keep webhooks as the only authority for paid state.

Why recommended: this matches the product's existing hosted-redirect UX and
keeps card details outside onService. It gives us explicit success and cancel
URLs instead of inventing one from a client key.

### Option B — Payment Intent + client payment-method flow

Keep Payment Intents, but implement PayMongo's client-side payment method and
attach/confirm sequence for each supported method. This is more custom UI and
more platform-specific work. It needs a clear PCI review and native/web SDK
plan before implementation.

## Required inputs before implementation

1. Ken chooses Option A or B. My recommendation is Option A.
2. PayMongo **test** secret/public keys and a test webhook secret are installed
   on a protected test environment. Live keys must not be used for integration
   development.
3. Confirm the public return host. Recommended shape:
   `https://app.onservice.ph/payment/return` with signed state that routes to a
   booking or top-up result without treating the browser redirect as proof of
   payment.
4. Confirm which methods are activated on the PayMongo merchant account. The
   UI must show only server-confirmed available methods.

## Implementation acceptance criteria after approval

1. The API returns PayMongo's exact hosted URL, never a constructed URL.
2. Success, cancel, app-resume, browser refresh, and abandoned-payment paths all
   land on an honest pending/succeeded/failed result screen.
3. Paid state comes from a verified, idempotent webhook or server retrieval,
   never from the redirect query string.
4. Retrying reuses or safely supersedes the prior intent without duplicating a
   booking or wallet credit.
5. A top-up belongs to the authenticated customer; no user can query another
   user's status.
6. Admin Financials and Support can find the attempt by booking/top-up,
   customer, gateway identifier, method, status, and time without exposing
   secrets or full payment credentials.
7. Real behavior tests cover webhook-before-return, return-before-webhook,
   cancel, failure, duplicate webhook, duplicate tap, app killed/resumed, and
   desktop browser return.
8. Test-mode end-to-end evidence exists before any live-key deployment.

## Source checked

PayMongo's official payment-splitting documentation shows the two separate
workflows and the Checkout Session fields (`success_url`, `cancel_url`, payment
method types, and line items):
https://developers.paymongo.com/docs/seeds-payment-splitting
