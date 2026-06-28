# E11 — PayMongo LIVE keys on the open test box (money risk)

Date: 2026-06-28
Status: OPEN — needs Ken. Hard stop (money risk).

## What

The staging box (5.78.143.185) is now deliberately OPEN for testing: the nginx
gate is off and dev OTP (000000) lets anyone log in as any seeded account. At the
same time, `/opt/onservice/.env` carries **PayMongo LIVE keys**:

```
PAYMONGO_PUBLIC_KEY=pk_live_…
PAYMONGO_SECRET_KEY=sk_live_…
```

So if a tester goes through checkout and pays with **card or GCash/Maya**, the
app creates a REAL PayMongo payment intent against the live account — a real
charge. (Paying from the in-app **Wallet** is internal and does NOT hit PayMongo,
so wallet bookings are safe.)

This was surfaced by the 2026-06-28 security audit and confirmed against the live
`.env`.

## Why it matters

The whole point of opening the box was to let people test freely. With live keys,
"test freely" includes the risk of real money moving on the Pay button.

## Recommended fix (needs Ken — I can't do it alone)

I do not have the PayMongo TEST keys (they are not on the box), so I cannot switch
this myself. Pick one:

1. **Best:** give me the PayMongo TEST keys (`pk_test_…`, `sk_test_…`, and the
   test webhook secret). I will set them in the server `.env`, restart the API,
   and run `bash scripts/verify-paymongo.sh`. Then testers can hit Pay with the
   PayMongo test cards and nothing real is charged. Switch back to live keys only
   at the production cutover, on the production box.
2. **Stopgap:** until then, tell testers to pay using the in-app **Wallet** only
   (the demo customer has a wallet balance) and NOT to complete a card/GCash
   payment.

See `docs/runbooks/security-test-mode-revert.md` item 4 and
`docs/qa/TEST-ENVIRONMENTS.md`.
