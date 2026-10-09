# E25: Suki redemption credits 100 times less than the stated rate

Date: 2026-08-25
Status: Open hard stop
Area: Customer wallet, Suki rewards, admin settings

## What I found

The platform stores wallet money in centavos. The configured Suki conversion
rate is `100`, documented and displayed as 100 points = PHP 1.00. The redemption
service currently calculates:

```ts
const amountCredited = points / pointsToPesoRate;
```

That result is then written directly to `wallets.available_balance` and
`wallet_transactions.amount`, both centavo fields. At the default rate, 100
points therefore credits 1 centavo (PHP 0.01), not PHP 1.00. The existing unit
test repeats the incorrect unit assumption and expects 1 instead of 100.

The same audit found a related display-contract defect: booking discounts use
the admin-configured `suki_tiers`, but `/api/v1/suki/tiers`, membership
formatting, and provider-customer formatting still use fallback constants. The
apps can therefore show a discount or multiplier different from the one the
booking path applies.

## Production evidence

Read-only checks on 46.62.207.225 on 2026-08-25 found:

- `suki_points_to_peso_rate` is `100`.
- The configured tier JSON currently matches the fallback defaults.
- There are zero `suki_rewards` rows with type `redeemed`.
- There are zero `wallet_transactions` rows with description `Suki points redemption`.

No historical customer redemption or wallet backfill is therefore required at
the time of this check.

## Options

1. Correct the service to convert pesos to centavos before crediting the wallet:
   `Math.round((points / pointsToPesoRate) * 100)`. Keep the current public
   promise that 100 points = PHP 1.00. Make Suki response formatting use the same
   live admin settings. This is my recommendation because it matches the written
   product contract and there are no historical production redemptions to repair.
2. Keep the current centavo credit and change all product copy/configuration to
   state 10,000 points = PHP 1.00. This makes the reward worth 100 times less than
   the existing promise and is not recommended.
3. Disable redemption until a different economics policy is selected. This
   avoids a future bad credit but leaves an advertised feature unavailable.

## Decision required

Approve option 1, or specify a different points-to-peso policy. This is a money
path, so the repository hard-stop rule prevents an autonomous production change
without Ken's decision even though the intended unit conversion appears clear.

## 2026-09-02 containment

No conversion, wallet, reward, tier, discount, or historical record changed.
Because both current settings can change money or customer value while this
decision and E44 remain open, `suki_tiers` and `suki_points_to_peso_rate` are
now explained **Launch hold** rows. Admin can inspect their existing values and
history but cannot update or reset them through the Settings API or UI.

