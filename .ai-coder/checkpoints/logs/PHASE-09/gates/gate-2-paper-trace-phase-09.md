# Gate 2 — Paper Trace (Phase 09)

## Money paths

### Marketing — promo discount math (DESIGN ONLY; no checkout integration in this phase)
Promo discount values stored in `promo_codes`:
- `discount_type='percentage'` → `discount_value` is 1..50 (integer percent)
- `discount_type='fixed_centavos'` → `discount_value` is centavos, ≥ 100
- Optional `max_discount_centavos` cap; optional `minimum_order_centavos` floor
- Math NOT applied at checkout this phase — only the schema + admin CRUD.
Trace: `marketing-admin.service.ts::createPromoCode` → validation block lines ~120-180.

### Marketing — CPA + ROI computation
- `cpaCentavos = signups > 0 ? Math.round(spend_centavos / signups) : 0`
- `roiPercent  = spend  > 0 ? Math.round((revenue_centavos - spend_centavos) / spend_centavos * 100) : 0`

Edge cases tested in `marketing-admin.test.ts`:
- "cpa = 0 when signups = 0" → PASS
- "roi = 0 when spend = 0" → PASS
- "roi negative when revenue < spend" → PASS
- "channelBreakdown sums per-channel correctly" → PASS

### Mobile screens money handling
- `payment-failed.tsx`: display only; no math. Reads `reason` + `bookingId` from URL params.
- `complete.tsx` (provider job): submits `{photos, signedAt, notes}` to backend; backend (Phase 07) handles escrow release math. No new math.
- `navigate.tsx`: no money. POSTs `arrived` event only.
- `checklist.tsx`: no money. Local-state checklist + per-item photo upload (best-effort).
- `service-area.tsx`, `skills.tsx`: settings only. No money.

## Audit trail
All marketing service writes audit a row with SQL literal `action_type='config_changed'` + `target_type='config'`. Every audit insert is wrapped in try/catch with `logger.warn` so a failed audit never aborts the main mutation. Two tests cover the audit-failure-non-fatal path explicitly.

## Boundary inputs
Validations tested:
- Promo code regex `/^[A-Z0-9_-]{3,40}$/` (rejects "ab", lower-case)
- Percentage discount 1..50, fixed_centavos ≥ 100
- Date format `^\d{4}-\d{2}-\d{2}$`
- `validFrom <= validUntil`
- `spendCentavos`, `attributed*` ≥ 0

## Idempotency
- Promo `code` UNIQUE constraint at DB level → second insert with same code → 23505 → service maps to 409 conflict.
- Campaign create has no natural key — caller-managed.
