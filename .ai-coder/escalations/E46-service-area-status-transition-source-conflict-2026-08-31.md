# E46: service-area status-transition source conflict

Date: 2026-08-31
Status: OPEN
Scope: Admin Service Areas lifecycle

## Conflict

The current operating documents disagree about the supported path from a newly
created market to a customer-bookable market:

- `docs/operations/03-provider-recruiting-sop.md` calls
  `planned -> recruiting -> soft_launch -> active` the Service Areas ground
  truth.
- `docs/operations/11-admin-system-training-manual.md` tells an operator that
  Activate moves any `planned`, `recruiting`, or `soft_launch` area directly to
  `active`.
- The current admin UI and API implement the training-manual behavior and do
  not expose a supported action for moving a planned area to `recruiting` or a
  recruiting area to `soft_launch`.

This is operationally material because `recruiting` controls provider-market
visibility while `soft_launch` and `active` are customer-bookable.

## Safe work continuing around the conflict

The following changes do not choose either transition policy and can proceed:

- require super-admin for market mutations;
- validate IDs and request bodies;
- require and atomically preserve operator reasons;
- enforce the configured `min_providers_to_launch` floor before `active`;
- keep default markets limited to customer-bookable statuses;
- correct responsive UI, role visibility, source states, and waitlist truth.

## Decision needed

Choose one canonical lifecycle:

1. Enforced staged progression: `planned -> recruiting -> soft_launch -> active`.
2. Direct activation remains supported from planned/recruiting/soft-launch.

Recommendation: option 1. It makes recruiting visibility and soft-launch
readiness explicit and prevents an operator from skipping the supply-building
stages. A later implementation also needs an agreed resume/retire transition
matrix.
