# E44: Suki redemption policy and customer copy diverge

Date: 2026-08-31
Status: OPEN
Area: Customer Suki loyalty, wallet credit, admin platform settings
Risk: Money-path and customer-promise mismatch

## What was found

The customer screen and API enforce different redemption rules:

- Mobile `platformConfig.sukiMinRedeemPoints` is 500. The Suki screen blocks
  redemption below 500 and requires multiples of 500.
- API `platformConfig.sukiPointsRedemptionRate` is 100. The validator accepts a
  minimum of 100 and the service requires multiples of 100.
- The API converts points using admin-tunable
  `platform_settings.suki_points_to_peso_rate`.
- The customer screen always says `100 points = PHP 1.00` and has no endpoint
  from which to read the live conversion rate.

This mismatch was previously noted in
`.ai-coder/audit-2026-05-01/findings/D09-customer-screens-final.md` but remains
in production code.

## Customer and admin impact

Customers can be blocked from redemptions the server supports. If an admin
changes the conversion setting, the amount preview and program explanation can
be false even though the eventual server credit uses the new value. Support
cannot reliably explain the policy from the customer screen.

## Why this is a hard stop

Changing either threshold alters wallet-credit eligibility. Choosing whether
100 or 500 is the intended minimum is a money-policy decision. Copy alone cannot
fix the lack of a server-canonical customer configuration.

## Recommended resolution

1. Choose one server-owned `redemption_multiple` and `minimum_redemption`.
2. Expose a public authenticated Suki program-config response containing the
   live minimum, multiple, points-to-peso rate, and current tier rules.
3. Make API validation and service logic read the same setting.
4. Make customer and provider program copy derive from that response.
5. Record settings changes in the admin audit log and show their effective
   time, because changing a rate changes customer value.
6. Add behavior tests proving the client preview, validator, service credit,
   wallet ledger entry, and admin setting agree for default and changed values.

## Work paused

No Suki redemption threshold, conversion rate, or wallet-credit behavior was
changed in this audit wave. Non-financial UI defects can continue independently.
