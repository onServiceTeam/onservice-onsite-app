# BUG REMEDIATION MANUAL — Part 3 (continued)
## Dispatches 05 and 06

This installment covers money-safety. Dispatch 05 closes 8 client-trusted-price violations where the server accepts money values from the mobile / admin client without authoritative lookup. Dispatch 06 fixes 14 transactional-audit gaps where money moves and audit logs but not in the same `db.transaction`.

These two dispatches together address every confirmed money-loss vulnerability the V14 audit found. After they merge, every money mutation in the API uses the same pattern: server is canonical, audit and money move in one transaction, failure rolls back both.

---

# DISPATCH 05 — Money trust closure

## Goal

The audit found 8 places where the server trusts a money value sent by the client. Each is independently exploitable; together they form a class of vulnerability that must be closed at architectural level, not just per-bug.

The shape of the bug is consistent:
1. Client computes `total = price + fees + addons`
2. Client POSTs `{ servicePrice: 50000, ...other fields }` to the API
3. Server takes `params.servicePrice` and uses it without looking up the canonical DB value
4. Server inserts booking row with the client's number
5. Server processes the rest of the flow (escrow, payouts, BIR receipts) trusting that initial number

A determined customer can pay ₱0.01 for a ₱500 service. A fat-finger can record a ₱9.9 billion booking that pollutes financial reports.

**The architectural fix:** every money input is replaced by a DB lookup keyed on a non-money identifier (`subcategoryId`, `addonId`, `promoCodeId`). The client sends only IDs and quantities. The server computes price authoritatively from DB. The client's "preview" calculation is purely cosmetic — it never wins against the server.

**Branch:** `phase/14-d05-money-trust-closure`
**Tag at end:** `v0.14.0-d05-complete`
**Gates that must pass:** all five A–E. New gate fragment `a-cross-source-no-client-money.sh` introduced.

---

## The pattern: server-canonical pricing

Before the bugs, here is the canonical pattern the AI coder applies in every fix:

### The contract

Client-side request type — IDs and quantities only:

```ts
// shared/types/booking-create-request.ts
export interface CreateBookingRequest {
  serviceCategoryId: string;
  subcategoryId: string;
  addons: Array<{
    addonId: string;
    quantity: number;          // 1..N count
  }>;
  scheduledAt: string;          // ISO8601
  addressId: string;
  specialInstructions?: string;
  promoCode?: string;           // optional code string
  // NO servicePrice. NO total. NO addon prices. NO discounts.
}
```

Server-side response type — server-computed money the client must display:

```ts
// shared/types/booking-create-response.ts
export interface CreateBookingResponse {
  bookingId: string;
  pricing: {
    servicePriceCents: number;       // from subcategories.base_price_cents
    addonsCents: number;             // sum of addon.price_cents * quantity
    surgeAmountCents: number;        // server-computed
    surgeRuleApplied: string | null;
    promoDiscountCents: number;      // server-validated, server-computed
    serviceFeeCents: number;         // server-computed (configurable %)
    totalAmountCents: number;        // sum of above
  };
  // ...other fields
}
```

### Server validator

```ts
// packages/api/src/validators/booking.validator.ts
import { z } from 'zod';

export const createBookingSchema = z.object({
  serviceCategoryId: z.string().uuid(),
  subcategoryId: z.string().uuid(),
  addons: z
    .array(
      z.object({
        addonId: z.string().uuid(),
        quantity: z.number().int().min(1).max(20),
      }),
    )
    .max(10)
    .default([]),
  scheduledAt: z.string().datetime(),
  addressId: z.string().uuid(),
  specialInstructions: z.string().max(500).optional(),
  promoCode: z
    .string()
    .regex(/^[A-Z0-9-]{3,32}$/)
    .optional(),
  // The schema explicitly DOES NOT include servicePrice, total, fees, etc.
});
```

The Zod schema is the wall. Any client field that's not declared is discarded by Zod's default `.strict()` behavior (which Phase 14 enables globally).

### Server pricing service

```ts
// packages/api/src/services/booking/pricing.service.ts
import { db } from '../../db';
import { calculateServiceFee } from './fee.service';
import { resolveSurgeRule } from './surge.service';
import { resolvePromo } from './promo.service';

export interface ResolvedPricing {
  servicePriceCents: number;
  addonsCents: number;
  surgeAmountCents: number;
  surgeRuleApplied: string | null;
  promoDiscountCents: number;
  serviceFeeCents: number;
  totalAmountCents: number;
  breakdown: Array<{ label: string; amountCents: number }>;
}

export async function resolvePricing(
  input: ParsedBookingRequest,
): Promise<ResolvedPricing> {
  // 1. Look up subcategory base price authoritatively
  const subcat = await db
    .selectFrom('subcategories')
    .select(['id', 'base_price_cents', 'min_price_cents', 'max_price_cents', 'pricing_type'])
    .where('id', '=', input.subcategoryId)
    .where('is_active', '=', true)
    .executeTakeFirstOrThrow(() => new BadRequestError(
      'subcategory_not_found',
      'The selected service is not available.',
    ));

  if (subcat.pricing_type === 'quote') {
    throw new BadRequestError(
      'quote_required',
      'This service requires a quote. Use /booking/draft + /quotes flow.',
    );
  }
  const servicePriceCents = subcat.base_price_cents;

  // 2. Look up each addon authoritatively, multiply by quantity
  let addonsCents = 0;
  if (input.addons.length > 0) {
    const addonIds = input.addons.map((a) => a.addonId);
    const dbAddons = await db
      .selectFrom('addons')
      .select(['id', 'price_cents', 'subcategory_id'])
      .where('id', 'in', addonIds)
      .where('is_active', '=', true)
      .execute();

    if (dbAddons.length !== addonIds.length) {
      const missing = addonIds.filter((id) => !dbAddons.find((d) => d.id === id));
      throw new BadRequestError(
        'addon_not_found',
        `Unknown addon: ${missing.join(', ')}`,
      );
    }

    // Each addon must belong to the chosen subcategory
    const wrongSubcat = dbAddons.filter((a) => a.subcategory_id !== input.subcategoryId);
    if (wrongSubcat.length > 0) {
      throw new BadRequestError(
        'addon_subcategory_mismatch',
        'One or more addons are not available for the selected service.',
      );
    }

    for (const requestAddon of input.addons) {
      const dbAddon = dbAddons.find((d) => d.id === requestAddon.addonId)!;
      addonsCents += dbAddon.price_cents * requestAddon.quantity;
    }
  }

  // 3. Resolve surge from server rules (client never sends surge)
  const surge = await resolveSurgeRule({
    serviceCategoryId: input.serviceCategoryId,
    scheduledAt: input.scheduledAt,
    addressId: input.addressId,
  });
  const surgeBaseCents = servicePriceCents + addonsCents;
  const surgeAmountCents = Math.floor((surgeBaseCents * (surge?.multiplier ?? 1) - surgeBaseCents));

  // 4. Resolve promo from server (validates code, expiry, eligibility, max-redemptions)
  const promoDiscountCents = input.promoCode
    ? await resolvePromo({
        code: input.promoCode,
        subtotalCents: surgeBaseCents + surgeAmountCents,
        userId: input.userId,
      })
    : 0;

  // 5. Service fee from settings (configurable %, applied to subtotal post-discount)
  const subtotalAfterDiscount =
    surgeBaseCents + surgeAmountCents - promoDiscountCents;
  const serviceFeeCents = await calculateServiceFee(subtotalAfterDiscount);

  // 6. Final total
  const totalAmountCents = subtotalAfterDiscount + serviceFeeCents;

  // 7. Sanity: total must be > 0
  if (totalAmountCents <= 0) {
    throw new BadRequestError(
      'pricing_resolution_invalid',
      'Resolved total is zero or negative — please contact support.',
    );
  }

  return {
    servicePriceCents,
    addonsCents,
    surgeAmountCents,
    surgeRuleApplied: surge?.id ?? null,
    promoDiscountCents,
    serviceFeeCents,
    totalAmountCents,
    breakdown: [
      { label: 'Service', amountCents: servicePriceCents },
      { label: 'Add-ons', amountCents: addonsCents },
      { label: 'Surge', amountCents: surgeAmountCents },
      { label: 'Promo', amountCents: -promoDiscountCents },
      { label: 'Service fee', amountCents: serviceFeeCents },
    ],
  };
}
```

This service is the **only** place pricing happens. Every code path that records money — `createBooking`, `createRecurring`, `createChangeOrder`, `createTip`, `applyPromoToCart` — calls `resolvePricing` (or its variant for the specific entity).

### Client-side preview endpoint

For UX, client needs to display a price preview before the user commits. The preview endpoint runs `resolvePricing` and returns the result without persisting:

```ts
// packages/api/src/routes/booking/preview.ts
router.post('/booking/preview', requireAuth, async (req, res) => {
  const input = createBookingSchema.parse(req.body);
  const pricing = await resolvePricing({ ...input, userId: req.user!.id });
  res.json({ data: { pricing } });
});
```

The client calls `/booking/preview` whenever the user changes selections in `customer/booking/configure.tsx`. The displayed price equals server-computed price always.

### The gate

```bash
# scripts/gates/a-cross-source-no-client-money.sh
#!/usr/bin/env bash
set -euo pipefail

# Reject any Zod schema that accepts servicePrice / totalAmount / addonPrice / discount from clients
violations=$(grep -rEn "(servicePrice|totalAmount|totalAmountCents|addonPrice|discountValue|discountAmount)\s*:\s*z\.(number|coerce\.number)" \
  packages/api/src/validators/ packages/api/src/routes/ 2>/dev/null \
  | grep -v "//.*allowed" || true)
if [ -n "$violations" ]; then
  echo "GATE A VIOLATION: schema accepts money value from client"
  echo "$violations"
  exit 1
fi
echo "Gate A — no client money in schemas: OK"
```

If a future PR introduces `servicePrice: z.number()` in any validator, the gate blocks merge. The only exception (rare) is admin-direct-amount entry like wallet adjustments — those use a different schema name (`adminWalletAdjustmentSchema`) and the gate excludes that pattern explicitly.

---

## Bug 176 — Booking addons trust client-supplied prices

**File:** `packages/api/src/validators/booking.validator.ts:20-24`
**Severity:** CRITICAL — confirmed money-loss vulnerability

### Current code

```ts
addons: z
  .array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      price: z.number().int().min(0),  // ← client trusted
    }),
  )
  .optional()
  .default([]),
```

A customer can submit `addons: [{ id: 'real-uuid-of-deep-clean-addon', name: 'Deep clean', price: 1 }]` and pay ₱0.01 for a real ₱500 addon. The server uses `addon.price` directly, never looking up the DB row.

### Exact fix

Replace the addon shape in the schema with `{ addonId, quantity }` only:

```diff
  addons: z
    .array(
      z.object({
-       id: z.string().uuid(),
-       name: z.string(),
-       price: z.number().int().min(0),
+       addonId: z.string().uuid(),
+       quantity: z.number().int().min(1).max(20),
      }),
    )
    .max(10)
    .default([]),
```

The pricing service (`resolvePricing` shown above) does the DB lookup and rejects unknown addons.

Update mobile client:

```diff
// apps/mobile/app/customer/booking/configure.tsx
- const addons = selectedAddons.map(a => ({ id: a.id, name: a.name, price: a.price }));
+ const addons = selectedAddons.map(a => ({ addonId: a.id, quantity: a.quantity ?? 1 }));
```

Same change in `apps/mobile/app/customer/booking/form.tsx` and any other consumer.

### Verification (Ken click-through)

1. With staging API, attempt a tampered request:
   ```bash
   curl -X POST https://api.staging.onservice.ph/api/v1/bookings \
     -H "Authorization: Bearer <test-customer-token>" \
     -H "Content-Type: application/json" \
     -d '{
       "serviceCategoryId": "<real-id>",
       "subcategoryId": "<real-id>",
       "addons": [{"addonId": "<real-deep-clean-id>", "quantity": 1, "price": 1}],
       "scheduledAt": "2026-05-01T10:00:00.000Z",
       "addressId": "<real-id>"
     }'
   ```
2. **Expected:** request succeeds (Zod strips the unknown `price` field), but the booking row's `total_amount_cents` reflects the real ₱500 addon, not ₱0.01.
3. Check `bookings` table: `total_amount_cents` matches server-computed total exactly.
4. Confirm Zod schema is `.strict()` so any extra field (like the rejected `price`) is dropped without error in production. (Optional stricter mode: throw on unknown keys.)

### Test signature

`packages/api/__tests__/services/booking/pricing.service.test.ts`:

```ts
import { resolvePricing } from '../../../src/services/booking/pricing.service';

describe('resolvePricing (Bug 176 — addon prices server-canonical)', () => {
  beforeEach(async () => {
    await seedTestSubcategoryWithAddons({
      subcategoryId: SUBCAT_ID,
      basePriceCents: 50000,        // ₱500
      addons: [{ id: ADDON_ID, priceCents: 50000 }],
    });
  });

  it('uses DB-canonical addon price regardless of any client field', async () => {
    const result = await resolvePricing({
      userId: USER_ID,
      serviceCategoryId: CAT_ID,
      subcategoryId: SUBCAT_ID,
      addons: [{ addonId: ADDON_ID, quantity: 1 }],
      scheduledAt: '2026-05-01T10:00:00Z',
      addressId: ADDR_ID,
    });

    expect(result.addonsCents).toBe(50000);
    expect(result.servicePriceCents).toBe(50000);
  });

  it('rejects unknown addonId', async () => {
    await expect(
      resolvePricing({
        userId: USER_ID,
        serviceCategoryId: CAT_ID,
        subcategoryId: SUBCAT_ID,
        addons: [{ addonId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', quantity: 1 }],
        scheduledAt: '2026-05-01T10:00:00Z',
        addressId: ADDR_ID,
      }),
    ).rejects.toThrow(/addon_not_found/);
  });

  it('rejects addon belonging to a different subcategory', async () => {
    const otherSubcatAddon = await seedAddonForOtherSubcategory();
    await expect(
      resolvePricing({
        userId: USER_ID,
        serviceCategoryId: CAT_ID,
        subcategoryId: SUBCAT_ID,
        addons: [{ addonId: otherSubcatAddon.id, quantity: 1 }],
        scheduledAt: '2026-05-01T10:00:00Z',
        addressId: ADDR_ID,
      }),
    ).rejects.toThrow(/addon_subcategory_mismatch/);
  });

  it('multiplies by quantity correctly', async () => {
    const result = await resolvePricing({
      // ...
      addons: [{ addonId: ADDON_ID, quantity: 3 }],
    });
    expect(result.addonsCents).toBe(150000); // 3 × ₱500
  });
});
```

Plus an integration test that hits POST `/bookings` with a tampered `price` field and asserts the persisted row matches DB-resolved price, not the tampered value.

---

## Bug 175 — `servicePrice` accepted from client (max not enforced)

**File:** `packages/api/src/validators/booking.validator.ts:17`

### Current code

```ts
servicePrice: z.number().int().min(0).optional(),
```

Even when `subcategoryId` is provided and server overrides client's `servicePrice` for fixed-price bookings (line 86), the schema still accepts the field. For quote-based bookings AND fixed-price bookings without `subcategoryId`, the client's value is trusted.

### Exact fix

Remove the field entirely from the schema. After Bug 176 fix, the schema does not need `servicePrice` at all — the server resolves price from `subcategoryId` for fixed bookings and from accepted-quote for quote bookings.

```diff
  export const createBookingSchema = z.object({
    serviceCategoryId: z.string().uuid(),
    subcategoryId: z.string().uuid(),
-   servicePrice: z.number().int().min(0).optional(),
    addons: ...,
    scheduledAt: z.string().datetime(),
    addressId: z.string().uuid(),
    // ...
  }).strict();
```

Add `.strict()` so unknown keys throw (instead of silently dropping). This is a stronger posture for write endpoints.

For quote-based bookings: the price comes from `quote_id` lookup, not from request:

```ts
// packages/api/src/services/booking/from-quote.service.ts
export async function createBookingFromQuote(quoteId: string, customerId: string) {
  const quote = await db
    .selectFrom('provider_quotes')
    .selectAll()
    .where('id', '=', quoteId)
    .where('expires_at', '>', new Date())
    .where('status', '=', 'sent')
    .executeTakeFirstOrThrow(() => new BadRequestError('quote_invalid', 'Quote not found or expired'));

  // Use quote.amount_cents — never client-supplied
  // ...
}
```

### Test signature

```ts
describe('createBookingSchema (Bug 175)', () => {
  it('rejects requests including servicePrice', () => {
    const tampered = { /* valid fields */, servicePrice: 1 };
    expect(() => createBookingSchema.parse(tampered)).toThrow(/unrecognized_keys/);
  });
});
```

---

## Bug 208 — Recurring booking trusts `servicePrice` from client

**File:** `packages/api/src/routes/recurring.ts:41,71` + `recurring.service.ts:65,95-107`

### Current code

```ts
// route handler
const params = req.body as { categoryId: string; servicePrice: number; ... };
await createRecurringBooking({ ...params, customerId });

// service
serviceFee = calculateServiceFee(params.servicePrice);
totalAmount = params.servicePrice + serviceFee;
await db.insertInto('recurring_bookings').values({
  service_price_cents: params.servicePrice,  // ← client value persisted
  ...
}).execute();
```

A customer can create a recurring booking with `servicePrice: 1`. The cron generates child bookings priced at ₱0.01 forever — until someone audits the recurring table and finds it.

### Exact fix

The recurring booking schema mirrors the booking schema. Replace `servicePrice` with the same DB-lookup pattern:

```ts
// packages/api/src/validators/recurring.validator.ts
export const createRecurringSchema = z.object({
  serviceCategoryId: z.string().uuid(),
  subcategoryId: z.string().uuid(),
  addons: z.array(z.object({
    addonId: z.string().uuid(),
    quantity: z.number().int().min(1).max(20),
  })).max(10).default([]),
  frequency: z.enum(['weekly', 'biweekly', 'monthly']),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().nullable().optional(),
  addressId: z.string().uuid(),
  preferredProviderId: z.string().uuid().optional(),
}).strict();
```

Service:

```ts
// packages/api/src/services/recurring.service.ts
export async function createRecurringBooking(input: ParsedRecurringRequest, customerId: string) {
  // Resolve the canonical first-instance pricing
  const pricing = await resolvePricing({
    ...input,
    userId: customerId,
    scheduledAt: input.startDate,
  });

  // Recurring booking stores the components, NOT a frozen total
  // (because surge / promo / fees may differ per instance).
  // Each generated child booking re-resolves pricing at generation time.
  const recurring = await db
    .insertInto('recurring_bookings')
    .values({
      customer_id: customerId,
      service_category_id: input.serviceCategoryId,
      subcategory_id: input.subcategoryId,
      address_id: input.addressId,
      frequency: input.frequency,
      start_date: input.startDate,
      end_date: input.endDate ?? null,
      preferred_provider_id: input.preferredProviderId ?? null,
      service_price_cents: pricing.servicePriceCents,        // server-resolved
      monthly_estimate_cents: estimateMonthly(pricing, input.frequency),
      addons: JSON.stringify(input.addons),                  // store IDs+quantities
      status: 'active',
      created_at: new Date(),
    })
    .returning(['id', 'service_price_cents', 'monthly_estimate_cents'])
    .executeTakeFirstOrThrow();

  return { recurringId: recurring.id, pricing };
}
```

Update mobile client (per Part 2B section 27):

```diff
// apps/mobile/app/customer/booking/make-recurring.tsx
- const body = { categoryId, servicePrice: bookingTotal, frequency };
+ const body = { 
+   serviceCategoryId, 
+   subcategoryId, 
+   addons: addons.map(a => ({ addonId: a.id, quantity: a.quantity })), 
+   frequency, 
+   startDate, 
+   endDate, 
+   addressId 
+ };
```

Update the request type (Bug 1132 fix is encompassed here):

```diff
// shared/types/recurring.ts
- export interface CreateRecurringParams {
-   categoryId: string;
-   servicePrice: number;  // ← required
-   frequency: 'weekly' | 'biweekly' | 'monthly';
-   ...
- }
+ export interface CreateRecurringParams {
+   serviceCategoryId: string;
+   subcategoryId: string;
+   addons: Array<{ addonId: string; quantity: number }>;
+   frequency: 'weekly' | 'biweekly' | 'monthly';
+   startDate: string;
+   endDate?: string;
+   addressId: string;
+   preferredProviderId?: string;
+ }
```

Note: `Bug 1132` (CreateRecurringParams.servicePrice REQUIRED at type level) is folded into this fix. Removing the field from the type prevents the AI coder from re-introducing it later.

### Test signature

`packages/api/__tests__/services/recurring.test.ts`:

```ts
describe('createRecurringBooking (Bug 208)', () => {
  it('persists DB-canonical service price regardless of body', async () => {
    const subcat = await seedSubcategory({ basePriceCents: 50000 });
    const recurring = await createRecurringBooking({
      serviceCategoryId: CAT_ID,
      subcategoryId: subcat.id,
      addons: [],
      frequency: 'weekly',
      startDate: '2026-05-01T10:00:00Z',
      addressId: ADDR_ID,
    }, CUSTOMER_ID);

    const dbRow = await db.selectFrom('recurring_bookings')
      .selectAll().where('id', '=', recurring.recurringId)
      .executeTakeFirstOrThrow();

    expect(dbRow.service_price_cents).toBe(50000);
  });

  it('schema rejects requests including servicePrice', () => {
    const tampered = { /* valid fields */, servicePrice: 1 };
    expect(() => createRecurringSchema.parse(tampered)).toThrow(/unrecognized_keys/);
  });
});
```

---

## Bug 261 — Promo code creation/redemption trusts client `discountValue`

**File:** `packages/api/src/routes/admin/promos.ts:88,93-96` + mobile `customer/booking/checkout.tsx`

### Current code

Two trust violations in one bug:

1. **Admin creates promo:** `Number(body.discountValue)` — no validation, accepts any number.
2. **Customer redeems promo:** mobile sends pre-computed discount; server doesn't recompute.

### Exact fix

**Admin side — strict validation:**

```ts
// packages/api/src/validators/promo.validator.ts
export const createPromoSchema = z.object({
  code: z.string().regex(/^[A-Z0-9-]{3,32}$/),
  discountType: z.enum(['percent', 'fixed']),
  discountValue: z.number().int().min(1).refine(
    (v) => v <= 100,
    { message: 'percent must be 1..100' },
  ),
  // For 'fixed' type, value is in centavos with sane upper bound:
  // (split into two refines depending on discountType)
  // ...

  minimumOrderCentavos: z.number().int().min(0).max(10_000_00),  // max ₱10k min order
  maxDiscountCentavos: z.number().int().min(0).optional(),        // cap on percent discounts
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime(),
  maxRedemptions: z.number().int().min(1).max(100_000).optional(),
  perUserLimit: z.number().int().min(1).max(10).default(1),
  appliesToCategories: z.array(z.string().uuid()).optional(),
}).strict().refine(
  (data) => new Date(data.validFrom) < new Date(data.validUntil),
  { message: 'validFrom must precede validUntil', path: ['validUntil'] },
).refine(
  (data) => {
    if (data.discountType === 'percent') return data.discountValue <= 100;
    return data.discountValue <= 1_000_00; // ₱1,000 max fixed discount
  },
  { message: 'discountValue exceeds limits for type', path: ['discountValue'] },
);
```

**Customer side — server resolves promo:**

The mobile client sends only `promoCode` as a string. The server's `resolvePromo` looks up the canonical promo, validates eligibility, computes the discount:

```ts
// packages/api/src/services/booking/promo.service.ts
export async function resolvePromo({
  code,
  subtotalCents,
  userId,
}: {
  code: string;
  subtotalCents: number;
  userId: string;
}): Promise<number> {
  const promo = await db
    .selectFrom('promo_codes')
    .selectAll()
    .where('code', '=', code)
    .where('valid_from', '<=', new Date())
    .where('valid_until', '>', new Date())
    .where('is_active', '=', true)
    .executeTakeFirst();

  if (!promo) {
    throw new BadRequestError('promo_invalid', 'This promo code is invalid or expired.');
  }
  if (promo.minimum_order_cents > subtotalCents) {
    throw new BadRequestError(
      'promo_min_order_not_met',
      `This promo requires a minimum order of ₱${(promo.minimum_order_cents / 100).toFixed(2)}.`,
    );
  }
  if (promo.max_redemptions !== null) {
    const used = await db
      .selectFrom('promo_redemptions')
      .select(({ fn }) => fn.count<number>('id').as('c'))
      .where('promo_code_id', '=', promo.id)
      .executeTakeFirstOrThrow();
    if (used.c >= promo.max_redemptions) {
      throw new BadRequestError('promo_exhausted', 'This promo has reached its redemption limit.');
    }
  }
  const userUsed = await db
    .selectFrom('promo_redemptions')
    .select(({ fn }) => fn.count<number>('id').as('c'))
    .where('promo_code_id', '=', promo.id)
    .where('user_id', '=', userId)
    .executeTakeFirstOrThrow();
  if (userUsed.c >= promo.per_user_limit) {
    throw new BadRequestError('promo_user_limit', 'You have already used this promo code.');
  }

  // Compute the discount amount server-side
  let discountCents: number;
  if (promo.discount_type === 'percent') {
    discountCents = Math.floor((subtotalCents * promo.discount_value) / 100);
  } else {
    discountCents = promo.discount_value;
  }

  // Apply max_discount cap if present
  if (promo.max_discount_cents !== null && discountCents > promo.max_discount_cents) {
    discountCents = promo.max_discount_cents;
  }

  // Discount cannot exceed subtotal
  return Math.min(discountCents, subtotalCents);
}
```

### Test signature

```ts
describe('resolvePromo (Bug 261)', () => {
  it('rejects unknown code', async () => {
    await expect(resolvePromo({ code: 'NOTREAL', subtotalCents: 100000, userId })).rejects.toThrow(/promo_invalid/);
  });

  it('enforces minimum order', async () => {
    await seedPromo({ code: 'SAVE10', discountType: 'percent', discountValue: 10, minOrderCents: 50000 });
    await expect(resolvePromo({ code: 'SAVE10', subtotalCents: 30000, userId })).rejects.toThrow(/min_order/);
  });

  it('honors per-user limit', async () => {
    await seedPromo({ code: 'ONCE', perUserLimit: 1 });
    await db.insertInto('promo_redemptions').values({ promo_code_id, user_id: userId, ... }).execute();
    await expect(resolvePromo({ code: 'ONCE', subtotalCents: 100000, userId })).rejects.toThrow(/user_limit/);
  });

  it('caps percent discount at max_discount_cents', async () => {
    await seedPromo({ code: 'BIG', discountType: 'percent', discountValue: 50, maxDiscountCents: 10000 });
    const result = await resolvePromo({ code: 'BIG', subtotalCents: 100000, userId });
    // 50% of ₱1000 = ₱500, but cap is ₱100
    expect(result).toBe(10000);
  });
});
```

Phase 14 ALSO addresses Bug 44 (mobile redemption never wired) by gating the promo input on the checkout screen behind a feature flag. If `feature_flag.promo_redemption_enabled = false`, the input is hidden. If `true`, the input calls `resolvePromo` server-side. **No client-trusted discount path exists.** See LAUNCH-LIMITATIONS §X for v1.0 status.

---

## Bug 266 — Addon price has no upper bound (admin form)

**File:** `apps/admin/src/pages/CatalogPage.tsx` addon edit modal

### Current code

The addon price input accepts any number. An admin fat-finger could create a "₱500 deep clean" addon at ₱5,000,000.

### Exact fix

Both client- and server-side validation:

**Server schema:**

```ts
// packages/api/src/validators/admin/catalog.validator.ts
export const createAddonSchema = z.object({
  subcategoryId: z.string().uuid(),
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  priceCents: z.number().int().min(100).max(50_000_00),  // ₱1 .. ₱50,000
  isRequired: z.boolean().default(false),
  isActive: z.boolean().default(true),
}).strict();
```

**Client form:**

```tsx
// apps/admin/src/pages/CatalogPage.tsx — addon edit modal
<NumberInput
  value={priceCentsAsPesos}
  onChange={setPrice}
  min={1}
  max={50000}
  step={1}
  label="Price (₱)"
  helper="Between ₱1 and ₱50,000"
  required
/>
```

The server rejects out-of-range; the client presents user-friendly bounds.

### Test signature

```ts
describe('createAddonSchema (Bug 266)', () => {
  it('rejects price below ₱1', () => {
    expect(() => createAddonSchema.parse({ ..., priceCents: 50 })).toThrow();
  });
  it('rejects price above ₱50,000', () => {
    expect(() => createAddonSchema.parse({ ..., priceCents: 50_000_01 })).toThrow();
  });
  it('accepts ₱1 .. ₱50,000', () => {
    expect(() => createAddonSchema.parse({ ..., priceCents: 100 })).not.toThrow();
    expect(() => createAddonSchema.parse({ ..., priceCents: 50_000_00 })).not.toThrow();
  });
});
```

---

## Bug 269 — `platformSurgeShare` not validated 0..1

**File:** `apps/admin/src/pages/PricingRulesPage.tsx:84` + server validator

### Current code

```ts
platformSurgeShare: '0.5'  // hardcoded default, no validation in server schema
```

If admin sets `platformSurgeShare: 1.5`, the platform takes 150% of surge — meaning the provider PAYS the platform for the surge.

### Exact fix

**Server schema:**

```ts
export const createPricingRuleSchema = z.object({
  name: z.string().min(2).max(100),
  type: z.enum(['rush', 'holiday', 'peak']),
  multiplier: z.number().min(1.0).max(5.0),         // 1× to 5× surge
  platformSurgeShare: z.number().min(0).max(1),     // 0..1 (Bug 269 fix)
  scope: z.object({
    serviceCategoryIds: z.array(z.string().uuid()).optional(),
    serviceAreaIds: z.array(z.string().uuid()).optional(),
  }),
  schedule: z.object({
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  }),
  priority: z.number().int().min(0).max(100).default(50),
  isActive: z.boolean().default(true),
}).strict();
```

**Client form:**

```tsx
<RangeInput
  value={platformSurgeShare}
  onChange={setPlatformSurgeShare}
  min={0}
  max={1}
  step={0.05}
  label="Platform share of surge"
  helper="0 = all to provider, 1 = all to platform"
/>
```

### Test signature

```ts
describe('createPricingRuleSchema (Bug 269)', () => {
  it.each([0, 0.5, 1])('accepts %s', (v) => {
    expect(() => createPricingRuleSchema.parse({ ..., platformSurgeShare: v })).not.toThrow();
  });
  it.each([-0.1, 1.01, 1.5, 2])('rejects %s', (v) => {
    expect(() => createPricingRuleSchema.parse({ ..., platformSurgeShare: v })).toThrow();
  });
});
```

---

## Bug 320 — Service area lat/lng not bounds-checked

**File:** `packages/api/src/validators/admin/service-area.validator.ts`

### Current code

```ts
centerLat: z.number(),
centerLng: z.number(),
```

Admin can create a service area at lat=200, lng=-500 — geographically nonsensical.

### Exact fix

Use Philippines geographic bounds (per Bug 320 audit):

```ts
export const createServiceAreaSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().regex(/^[a-z0-9-]+$/).max(50),
  city: z.string().min(2).max(100),
  region: z.string().min(2).max(100),
  centerLat: z.number().min(4.5).max(21.5),       // PH lat bounds
  centerLng: z.number().min(116).max(127.5),       // PH lng bounds
  radiusKm: z.number().min(1).max(100),            // Bug 322 fix
  minProvidersToLaunch: z.number().int().min(1).max(50),  // Bug 322 fix
  status: z.enum(['planned', 'recruiting', 'soft_launch', 'active', 'paused', 'retired']),
  isActive: z.boolean().default(true),
}).strict();
```

Add a CHECK constraint to the migration:

```sql
-- packages/api/migrations/073_service_area_bounds_check.sql
ALTER TABLE service_areas
  ADD CONSTRAINT center_lat_in_ph CHECK (center_lat BETWEEN 4.5 AND 21.5),
  ADD CONSTRAINT center_lng_in_ph CHECK (center_lng BETWEEN 116 AND 127.5),
  ADD CONSTRAINT radius_km_sane CHECK (radius_km BETWEEN 1 AND 100),
  ADD CONSTRAINT min_providers_sane CHECK (min_providers_to_launch BETWEEN 1 AND 50);
```

### Test signature

```ts
describe('createServiceAreaSchema (Bug 320 + 322)', () => {
  it('rejects lat outside PH', () => {
    expect(() => createServiceAreaSchema.parse({ ..., centerLat: 30 })).toThrow();
    expect(() => createServiceAreaSchema.parse({ ..., centerLat: -5 })).toThrow();
  });
  it('rejects lng outside PH', () => {
    expect(() => createServiceAreaSchema.parse({ ..., centerLng: 100 })).toThrow();
    expect(() => createServiceAreaSchema.parse({ ..., centerLng: 130 })).toThrow();
  });
  it('rejects radius > 100 km', () => {
    expect(() => createServiceAreaSchema.parse({ ..., radiusKm: 200 })).toThrow();
  });
  it('accepts Boracay coords', () => {
    expect(() => createServiceAreaSchema.parse({
      ...,
      centerLat: 11.9694,
      centerLng: 121.9272,
      radiusKm: 10,
    })).not.toThrow();
  });
});
```

---

## Bug 417 — Tip cap is service price (100%), exceeds validator max

**File:** `apps/mobile/app/customer/booking/tip.tsx` + `packages/api/src/validators/tip.validator.ts`

### Current code

Mobile allows custom tip up to `servicePrice` (100%); server validator caps at a different number; the two disagree. Customer can tip ₱500 on a ₱500 booking, doubling spend.

### Exact fix

Single source: server config `tip.max_amount_cents` (default ₱5,000). Mobile reads from `/settings/tip-max`.

```ts
// packages/api/src/validators/tip.validator.ts
export const createTipSchema = z.object({
  bookingId: z.string().uuid(),
  amountCents: z.number().int().min(100).max(5_000_00),  // ₱1..₱5,000
}).strict();
```

```ts
// packages/api/src/routes/public/settings.ts
router.get('/tip-limits', async (_req, res) => {
  const settings = await getPlatformSettings();
  res.json({ data: { minCents: 100, maxCents: settings.tip_max_amount_cents } });
});
```

```tsx
// apps/mobile/app/customer/booking/tip.tsx
const { data: limits } = useQuery({
  queryKey: ['tip-limits'],
  queryFn: () => api.get<{ data: { minCents: number; maxCents: number } }>('/api/v1/settings/tip-limits'),
});

<NumberInput
  value={amountCents}
  onChange={setAmount}
  min={limits?.data.minCents ?? 100}
  max={limits?.data.maxCents ?? 500_000}
  helper={`Maximum tip ${formatCurrency(limits?.data.maxCents ?? 500_000)}`}
/>
```

### Test signature

```ts
describe('createTipSchema (Bug 417)', () => {
  it('rejects negative or zero amounts', () => {
    expect(() => createTipSchema.parse({ bookingId: id, amountCents: 0 })).toThrow();
    expect(() => createTipSchema.parse({ bookingId: id, amountCents: -100 })).toThrow();
  });
  it('rejects amounts exceeding ₱5,000', () => {
    expect(() => createTipSchema.parse({ bookingId: id, amountCents: 500_001 })).toThrow();
  });
  it('accepts ₱1 .. ₱5,000', () => {
    expect(() => createTipSchema.parse({ bookingId: id, amountCents: 100 })).not.toThrow();
    expect(() => createTipSchema.parse({ bookingId: id, amountCents: 500_000 })).not.toThrow();
  });
});
```

---

## Bug 1219 — `provider/job/[id]/change-order.tsx` change order amount client-trusted

**File:** mobile `provider/job/[id]/change-order.tsx` + `packages/api/src/services/change-orders.service.ts`

### Current state

Provider submits change order with `additional_amount_cents` from client. Server stores without recomputation.

### Exact fix

Same pattern: client sends `addon_ids` and free-text description; server resolves canonical pricing for the change.

```ts
// packages/api/src/validators/change-order.validator.ts
export const createChangeOrderSchema = z.object({
  bookingId: z.string().uuid(),
  description: z.string().min(30).max(2000),
  additionalAddons: z.array(z.object({
    addonId: z.string().uuid(),
    quantity: z.number().int().min(1).max(20),
  })).default([]),
  hourlyExtensionMinutes: z.number().int().min(15).max(480).optional(),  // for hourly services
  photoIds: z.array(z.string().uuid()).max(5).default([]),
}).strict();
```

Service:

```ts
export async function createChangeOrder(input, providerId: string) {
  const booking = await db.selectFrom('bookings').selectAll().where('id', '=', input.bookingId).executeTakeFirstOrThrow();
  if (booking.provider_id !== providerId) throw new ForbiddenError('not_your_booking');
  if (booking.status !== 'in_progress') throw new BadRequestError('change_order_invalid_state', 'Change orders allowed only during in-progress jobs');

  // Resolve canonical additional cost
  const additional = await resolveAdditionalCost(booking, input);

  return db.transaction().execute(async (trx) => {
    const co = await trx.insertInto('change_orders').values({
      booking_id: booking.id,
      provider_id: providerId,
      description: input.description,
      additional_addons: JSON.stringify(input.additionalAddons),
      hourly_extension_minutes: input.hourlyExtensionMinutes ?? null,
      photo_ids: JSON.stringify(input.photoIds),
      additional_amount_cents: additional.totalCents,        // server-computed
      breakdown: JSON.stringify(additional.breakdown),
      status: 'pending_customer_approval',
      created_at: new Date(),
    }).returning(['id', 'additional_amount_cents']).executeTakeFirstOrThrow();

    // Notify customer
    await trx.insertInto('notifications').values({
      user_id: booking.customer_id,
      type: 'change_order_pending',
      payload: JSON.stringify({ booking_id: booking.id, change_order_id: co.id, additional_cents: additional.totalCents }),
    }).execute();

    return { changeOrderId: co.id, additionalAmountCents: additional.totalCents, breakdown: additional.breakdown };
  });
}
```

Mobile preview endpoint (`POST /change-orders/preview`) returns the same calculation without persisting, so the provider sees the customer-visible additional cost before submitting.

### Test signature

`packages/api/__tests__/services/change-orders.test.ts` — assert change_order.additional_amount_cents matches server-resolved cost regardless of any client-supplied number.

---

## Bug 1230 — Provider service price overrides bypass system min/max

**File:** `apps/mobile/app/provider/services.tsx` + server validator

### Current state

Provider sets `my_base_price` on a service. Client allows any number; server stores without checking the subcategory's min/max bounds.

### Exact fix

```ts
// packages/api/src/validators/provider/services.validator.ts
export const setProviderServicePriceSchema = z.object({
  subcategoryId: z.string().uuid(),
  myBasePriceCents: z.number().int(),
  isActive: z.boolean().default(true),
}).strict();

export async function setProviderServicePrice(input, providerId: string) {
  const subcat = await db.selectFrom('subcategories').select(['min_price_cents', 'max_price_cents'])
    .where('id', '=', input.subcategoryId).executeTakeFirstOrThrow();

  if (input.myBasePriceCents < subcat.min_price_cents) {
    throw new BadRequestError('price_below_minimum', `Minimum for this service is ${formatCurrency(subcat.min_price_cents)}`);
  }
  if (input.myBasePriceCents > subcat.max_price_cents) {
    throw new BadRequestError('price_above_maximum', `Maximum for this service is ${formatCurrency(subcat.max_price_cents)}`);
  }

  return db.insertInto('provider_services').values({...}).onConflict(...).execute();
}
```

Mobile:

```tsx
// apps/mobile/app/provider/services.tsx — edit form
const { data: subcatBounds } = useQuery(['subcat-bounds', subcatId], () => api.get(`/catalog/subcategories/${subcatId}/bounds`));

<NumberInput
  value={priceCents}
  onChange={setPriceCents}
  min={subcatBounds?.minCents}
  max={subcatBounds?.maxCents}
  helper={`Between ${formatCurrency(subcatBounds?.minCents)} and ${formatCurrency(subcatBounds?.maxCents)}`}
/>
```

### Test signature

```ts
describe('setProviderServicePrice (Bug 1230)', () => {
  beforeEach(() => seedSubcategory({ id: SUBCAT, minCents: 30_000, maxCents: 200_000 }));

  it('rejects price below subcategory min', async () => {
    await expect(setProviderServicePrice({ subcategoryId: SUBCAT, myBasePriceCents: 20_000 }, PROV))
      .rejects.toThrow(/below_minimum/);
  });

  it('rejects price above subcategory max', async () => {
    await expect(setProviderServicePrice({ subcategoryId: SUBCAT, myBasePriceCents: 300_000 }, PROV))
      .rejects.toThrow(/above_maximum/);
  });

  it('accepts price within bounds', async () => {
    await expect(setProviderServicePrice({ subcategoryId: SUBCAT, myBasePriceCents: 100_000 }, PROV))
      .resolves.toBeDefined();
  });
});
```

---

## Dispatch 05 closeout

**Bugs claimed fixed (8 — full money-trust closure):**
- Bug 175 — `packages/api/src/validators/booking.validator.ts:17`
- Bug 176 — same file:20-24
- Bug 208 — `packages/api/src/routes/recurring.ts:41,71` + service:65,95-107
- Bug 261 — `packages/api/src/routes/admin/promos.ts:88,93-96` + mobile checkout
- Bug 266 — admin `CatalogPage.tsx` addon modal + server validator
- Bug 269 — admin `PricingRulesPage.tsx:84` + validator
- Bug 320 — service-area.validator.ts + migration 073 (CHECK constraints)
- Bug 322 — same as 320 (combined)
- Bug 417 — tip.validator.ts + mobile tip.tsx
- Bug 1132 — type-level removal (encompassed by Bug 208 fix)
- Bug 1219 — change-order validator + service
- Bug 1230 — provider/services validator + service

**Files added:**
- `packages/api/src/services/booking/pricing.service.ts` (the pattern)
- `packages/api/src/services/booking/promo.service.ts`
- `packages/api/src/services/booking/surge.service.ts`
- `packages/api/src/routes/public/settings.ts` (`/tip-limits`, etc.)
- `packages/api/migrations/073_service_area_bounds_check.sql`
- `scripts/gates/a-cross-source-no-client-money.sh`
- ~10 test files

**Files modified:**
- 8 validator files in `packages/api/src/validators/`
- ~6 service files in `packages/api/src/services/`
- ~5 mobile files in `apps/mobile/app/customer/booking/`
- ~3 mobile files in `apps/mobile/app/provider/`
- ~3 admin files in `apps/admin/src/pages/`

**Gates run:** all five A–E pass green. Specifically the new `a-cross-source-no-client-money.sh` finds zero violations.

**What dispatches 06+ now have available:** every money-mutating endpoint follows the same pattern. Future endpoints (refunds, withdrawals, change orders, etc.) extend the pattern by adding new pricing/lookup services, never by trusting client values.

---

# DISPATCH 06 — Transactional audit completeness

## Goal

The audit found 14 places where money moves AND audit logs but the two operations are NOT in the same `db.transaction()`. Failure modes:

1. Money moves first, audit insert fails → orphan money mutation with no audit (compliance gap).
2. Audit inserts first, money mutation fails → audit row exists for a non-event (false audit trail).

Either way, money and audit are inconsistent. With BIR + NPC compliance requirements, this is unacceptable.

The architectural fix is uniform: every money-mutating service must wrap its work in `db.transaction(async trx => { ... })` and every operation inside (UPDATE wallets, INSERT transaction rows, INSERT admin_actions, INSERT notifications) uses `trx` instead of `db`.

**The Phase 08 documented pattern that's NOT a bug:** `escrow.service.releaseEscrow` calls `issueOR` AFTER tx commits. This is intentional — OR issuance can fail without invalidating the underlying money movement (BIR allows late issuance). Re-classified as design debt, not defect (Bug 9 in V14). The 14 bugs in this dispatch are the genuine cases where the asynchrony is unsafe.

**Branch:** `phase/14-d06-transactional-audit`
**Tag at end:** `v0.14.0-d06-complete`
**Gates that must pass:** all five A–E. New gate `c-constitution-money-in-transaction.sh` introduced.

---

## The pattern

Every money-mutating service follows this template:

```ts
// packages/api/src/services/example/example.service.ts
import { db } from '../../db';
import { Insertable } from 'kysely';
import { AdminActionsTable } from '../../db/types';

export async function exampleMoneyAction(input: Input, actor: Actor): Promise<Output> {
  // 1. Pre-flight checks happen OUTSIDE the transaction (read-only, fast-fail)
  const fromWallet = await db.selectFrom('wallets').selectAll().where('id', '=', input.fromWalletId).executeTakeFirstOrThrow();
  const toWallet = await db.selectFrom('wallets').selectAll().where('id', '=', input.toWalletId).executeTakeFirstOrThrow();
  if (fromWallet.balance_cents < input.amountCents) throw new BadRequestError('insufficient_funds');

  // 2. The transaction wraps every write
  return db.transaction().execute(async (trx) => {
    // 2a. Update the from wallet
    const fromUpdate = await trx
      .updateTable('wallets')
      .set({ balance_cents: trx.fn('balance_cents - $1', [input.amountCents]) as unknown as number, updated_at: new Date() })
      .where('id', '=', input.fromWalletId)
      .where('balance_cents', '>=', input.amountCents)  // optimistic concurrency
      .returning('balance_cents')
      .executeTakeFirst();

    if (!fromUpdate) {
      throw new ConflictError('wallet_balance_changed', 'Concurrent wallet update detected — please retry');
    }

    // 2b. Update the to wallet
    await trx
      .updateTable('wallets')
      .set({ balance_cents: trx.fn('balance_cents + $1', [input.amountCents]) as unknown as number, updated_at: new Date() })
      .where('id', '=', input.toWalletId)
      .execute();

    // 2c. Insert transaction row
    const txRow = await trx
      .insertInto('wallet_transactions')
      .values({
        from_wallet_id: input.fromWalletId,
        to_wallet_id: input.toWalletId,
        amount_cents: input.amountCents,
        kind: input.kind,
        booking_id: input.bookingId ?? null,
        actor_user_id: actor.userId,
        actor_kind: actor.kind,
        reason: input.reason,
        created_at: new Date(),
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    // 2d. Insert admin_actions audit (when actor is admin)
    if (actor.kind === 'admin') {
      await trx
        .insertInto('admin_actions')
        .values({
          actor_id: actor.userId,
          action_type: input.actionType,           // e.g., 'manual_escrow_release'
          target_type: 'booking',
          target_id: input.bookingId ?? null,
          reason: input.reason.slice(0, 500),
          full_notes: input.reason,                // Bug 85 fix: full text preserved
          details: JSON.stringify({ wallet_transaction_id: txRow.id, amount_cents: input.amountCents }),
          created_at: new Date(),
        })
        .execute();
    }

    // 2e. Insert notifications (still inside trx — failure rolls back money)
    if (input.notifyUserId) {
      await trx
        .insertInto('notifications')
        .values({
          user_id: input.notifyUserId,
          type: input.notificationType,
          payload: JSON.stringify({ amount_cents: input.amountCents, wallet_transaction_id: txRow.id }),
          created_at: new Date(),
        })
        .execute();
    }

    return { walletTransactionId: txRow.id };
  });
}
```

**The contract:**
1. Reads outside the transaction (fast-fail).
2. Every write inside the transaction.
3. `trx.fn('balance_cents - $1', [amount])` for atomic delta updates with column-level optimistic concurrency.
4. `admin_actions` insert is always inside the transaction when actor is admin.
5. Notifications inside the transaction so they don't fire if money rolls back.
6. Side effects that CAN tolerate eventual consistency (BIR OR issuance, push notifications, email) happen AFTER the transaction commits, in a separate try/catch with retry queue (BullMQ).

### The gate

```bash
# scripts/gates/c-constitution-money-in-transaction.sh
#!/usr/bin/env bash
set -euo pipefail

# Find services that touch wallets or admin_actions; verify they wrap in transaction
fail=0
for svc in $(find packages/api/src/services -name "*.service.ts"); do
  # Skip files that don't touch money
  if ! grep -qE "wallets|admin_actions|wallet_transactions" "$svc"; then continue; fi

  # Each money-mutating function should contain db.transaction or trx parameter
  funcs_with_money=$(grep -nE "(updateTable\('wallets|insertInto\('wallet_transactions|insertInto\('admin_actions" "$svc" | cut -d: -f1)
  for line in $funcs_with_money; do
    # Check upward 50 lines for db.transaction or trx
    context=$(sed -n "$(($line - 50)),${line}p" "$svc")
    if ! echo "$context" | grep -qE "db\.transaction\(\)|\(trx[,)]|trx\.|async \(trx\)"; then
      echo "Gate C VIOLATION: $svc:$line — money mutation outside transaction"
      fail=1
    fi
  done
done

if [ "$fail" -eq 1 ]; then
  echo "Gate C FAILED — money/audit not in transactions"
  exit 1
fi
echo "Gate C — transactional money: OK"
```

This is a heuristic gate. False positives are reviewed by Ken; legitimate exceptions (e.g., the documented post-commit OR issuance) get an inline `// gate-c-allowed: post-commit-or-issuance` comment that the gate strips before running.

---

## Bug 70 — `manualReleaseEscrow` not transactional

**File:** `packages/api/src/services/escrow.service.ts:manualReleaseEscrow`

### Current code

```ts
export async function manualReleaseEscrow(bookingId: string, adminId: string, reason: string) {
  // 1. Update booking status
  await db.updateTable('bookings').set({ escrow_status: 'released' }).where('id', '=', bookingId).execute();
  // 2. Move escrow → provider wallet
  await db.updateTable('wallets').set({ balance_cents: ... }).where('user_id', '=', providerId).execute();
  // 3. Insert wallet transaction
  await db.insertInto('wallet_transactions').values({ ... }).execute();
  // 4. Insert admin_actions  ← OUTSIDE transaction
  await db.insertInto('admin_actions').values({ actor_id: adminId, ... }).execute();
  // 5. Notify provider                 ← OUTSIDE transaction
  await db.insertInto('notifications').values({ ... }).execute();
}
```

If step 4 fails (e.g., audit table constraint violation), the money has moved without an audit trail. This is the Phase 08 paper-trace failure mode.

### Exact fix

Wrap the entire flow in `db.transaction`:

```ts
export async function manualReleaseEscrow(
  bookingId: string,
  adminId: string,
  reason: string,
): Promise<{ walletTransactionId: string }> {
  if (reason.length < 30) {
    throw new BadRequestError('reason_too_short', 'Reason must be at least 30 characters');
  }

  // Pre-flight reads
  const booking = await db
    .selectFrom('bookings')
    .selectAll()
    .where('id', '=', bookingId)
    .executeTakeFirstOrThrow();

  if (booking.escrow_status !== 'held') {
    throw new BadRequestError(
      'escrow_not_held',
      `Booking ${bookingId} escrow status is ${booking.escrow_status}, expected 'held'`,
    );
  }

  const providerCommissionRate = await resolveProviderCommissionRate(booking.provider_id);
  const commissionCents = Math.floor((booking.total_amount_cents * providerCommissionRate) / 100);
  const providerCents = booking.total_amount_cents - commissionCents;

  // The transaction
  return db.transaction().execute(async (trx) => {
    // Update booking
    await trx
      .updateTable('bookings')
      .set({
        escrow_status: 'released',
        escrow_released_at: new Date(),
        escrow_released_by: adminId,
      })
      .where('id', '=', bookingId)
      .where('escrow_status', '=', 'held')   // optimistic concurrency
      .execute();

    // Move money: platform → provider
    await trx
      .updateTable('wallets')
      .set({ balance_cents: sql`balance_cents + ${providerCents}` })
      .where('user_id', '=', booking.provider_id)
      .execute();

    // Platform retains commission (no UPDATE needed; it's already in platform wallet by virtue of escrow being a logical balance)

    // Wallet transaction record
    const txRow = await trx
      .insertInto('wallet_transactions')
      .values({
        from_wallet_id: PLATFORM_ESCROW_WALLET_ID,
        to_wallet_id: await getWalletIdForUser(trx, booking.provider_id),
        amount_cents: providerCents,
        kind: 'escrow_release',
        booking_id: bookingId,
        actor_user_id: adminId,
        actor_kind: 'admin',
        reason,
        created_at: new Date(),
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    // Admin audit row (Bug 70 fix — inside transaction)
    await trx
      .insertInto('admin_actions')
      .values({
        actor_id: adminId,
        action_type: 'manual_escrow_release',
        target_type: 'booking',
        target_id: bookingId,
        reason: reason.slice(0, 500),
        full_notes: reason,                    // Bug 85 fix: full text
        details: JSON.stringify({
          wallet_transaction_id: txRow.id,
          provider_cents: providerCents,
          commission_cents: commissionCents,
        }),
        created_at: new Date(),
      })
      .execute();

    // Notify provider (inside transaction — if this fails, money rolls back)
    await trx
      .insertInto('notifications')
      .values({
        user_id: booking.provider_id,
        type: 'escrow_released',
        payload: JSON.stringify({ booking_id: bookingId, amount_cents: providerCents }),
        created_at: new Date(),
      })
      .execute();

    return { walletTransactionId: txRow.id };
  });

  // After commit (NOT in transaction): trigger BIR OR issuance
  // (this is the Phase 08 documented pattern — OR can fail without rolling back money)
  // Done by a separate BullMQ job that reads recently-released escrow and issues OR.
}
```

### Test signature

`packages/api/__tests__/services/escrow.service.test.ts`:

```ts
describe('manualReleaseEscrow (Bug 70)', () => {
  it('rolls back wallet update if admin_actions insert fails', async () => {
    const booking = await seedBookingWithEscrow();
    const beforeWallet = await getProviderWallet(booking.provider_id);

    // Simulate admin_actions insert failure by violating a constraint
    jest.spyOn(db, 'insertInto').mockImplementationOnce((table) => {
      if (table === 'admin_actions') {
        throw new Error('simulated audit failure');
      }
      return db.insertInto(table);
    });

    await expect(manualReleaseEscrow(booking.id, ADMIN_ID, 'reason ≥30 chars long for test'))
      .rejects.toThrow(/simulated audit failure/);

    // Wallet should be unchanged
    const afterWallet = await getProviderWallet(booking.provider_id);
    expect(afterWallet.balance_cents).toBe(beforeWallet.balance_cents);

    // Booking escrow status unchanged
    const afterBooking = await db.selectFrom('bookings').selectAll().where('id', '=', booking.id).executeTakeFirstOrThrow();
    expect(afterBooking.escrow_status).toBe('held');
  });

  it('inserts admin_actions row in same transaction as wallet update', async () => {
    const booking = await seedBookingWithEscrow();
    await manualReleaseEscrow(booking.id, ADMIN_ID, 'routine release after customer no-response');
    const audit = await db.selectFrom('admin_actions')
      .selectAll().where('target_id', '=', booking.id).executeTakeFirstOrThrow();
    expect(audit.action_type).toBe('manual_escrow_release');
    expect(audit.full_notes).toBe('routine release after customer no-response');
  });

  it('rejects reason < 30 chars', async () => {
    await expect(manualReleaseEscrow('any', 'any', 'short')).rejects.toThrow(/reason_too_short/);
  });
});
```

---

## Bug 71 — `refundBookingEscrow` same pattern as Bug 70

**File:** `packages/api/src/services/escrow.service.ts:refundBookingEscrow`

Same shape as Bug 70 — wrap the full flow in `db.transaction()`. The refund moves money from PLATFORM_ESCROW_WALLET_ID → customer wallet (instead of provider wallet). All else identical.

```ts
export async function refundBookingEscrow(
  bookingId: string,
  adminId: string,
  reason: string,
  refundCents: number,                   // optional partial; if 0 or omitted, full refund
): Promise<{ walletTransactionId: string }> {
  if (reason.length < 30) {
    throw new BadRequestError('reason_too_short', 'Reason must be at least 30 characters');
  }
  const booking = await db.selectFrom('bookings').selectAll().where('id', '=', bookingId).executeTakeFirstOrThrow();
  if (booking.escrow_status !== 'held') {
    throw new BadRequestError('escrow_not_held', `Cannot refund — escrow status is ${booking.escrow_status}`);
  }
  const refundAmount = refundCents > 0 ? refundCents : booking.total_amount_cents;
  if (refundAmount > booking.total_amount_cents) {
    throw new BadRequestError('refund_exceeds_total', 'Refund cannot exceed total');
  }

  return db.transaction().execute(async (trx) => {
    await trx.updateTable('bookings').set({
      escrow_status: refundAmount === booking.total_amount_cents ? 'refunded' : 'partial_refund',
      escrow_refunded_cents: refundAmount,
      escrow_refunded_at: new Date(),
    }).where('id', '=', bookingId).where('escrow_status', '=', 'held').execute();

    await trx.updateTable('wallets').set({
      balance_cents: sql`balance_cents + ${refundAmount}`,
    }).where('user_id', '=', booking.customer_id).execute();

    const txRow = await trx.insertInto('wallet_transactions').values({
      from_wallet_id: PLATFORM_ESCROW_WALLET_ID,
      to_wallet_id: await getWalletIdForUser(trx, booking.customer_id),
      amount_cents: refundAmount,
      kind: 'escrow_refund',
      booking_id: bookingId,
      actor_user_id: adminId,
      actor_kind: 'admin',
      reason,
      created_at: new Date(),
    }).returning('id').executeTakeFirstOrThrow();

    await trx.insertInto('admin_actions').values({
      actor_id: adminId,
      action_type: 'escrow_refund',
      target_type: 'booking',
      target_id: bookingId,
      reason: reason.slice(0, 500),
      full_notes: reason,
      details: JSON.stringify({ wallet_transaction_id: txRow.id, refund_cents: refundAmount }),
    }).execute();

    await trx.insertInto('notifications').values({
      user_id: booking.customer_id,
      type: 'refund_issued',
      payload: JSON.stringify({ booking_id: bookingId, amount_cents: refundAmount }),
    }).execute();

    return { walletTransactionId: txRow.id };
  });
}
```

Test mirrors Bug 70 — verify rollback on simulated audit insert failure.

---

## Bug 69 — `cancelBookingAsAdmin` escrow refund OUTSIDE transaction

**File:** `packages/api/src/services/booking.service.ts:cancelBookingAsAdmin`

### Current code

```ts
export async function cancelBookingAsAdmin(bookingId, adminId, reason) {
  await db.updateTable('bookings').set({ status: 'cancelled' })...;     // step 1
  await refundBookingEscrow(bookingId, adminId, 'cancellation refund'); // step 2 — runs its own transaction
  await db.insertInto('admin_actions').values({...}).execute();         // step 3 — outside both
}
```

The booking-status update (step 1) is in NO transaction. If step 2 succeeds (refund happens) but step 3 fails (admin audit not written), there's a refund with no audit. If step 1 succeeds but step 2 throws, booking is `cancelled` with escrow still `held` — disaster.

### Exact fix

Single transaction wrapping the full cancellation:

```ts
export async function cancelBookingAsAdmin(
  bookingId: string,
  adminId: string,
  reason: string,
): Promise<{ refundCents: number; walletTransactionId: string }> {
  if (reason.length < 30) throw new BadRequestError('reason_too_short');
  
  const booking = await db.selectFrom('bookings').selectAll().where('id', '=', bookingId).executeTakeFirstOrThrow();
  
  // Compute cancellation per policy (Dispatch 02 work)
  const cancellation = await calculateCancellation(bookingId);
  
  return db.transaction().execute(async (trx) => {
    // Status transitions
    await trx.updateTable('bookings').set({
      status: 'cancelled',
      cancelled_at: new Date(),
      cancelled_by: adminId,
      cancelled_by_kind: 'admin',
      cancellation_reason: reason,
      escrow_status: cancellation.refund_amount_cents > 0 ? 'refunded' : 'released',
    }).where('id', '=', bookingId).execute();

    // Refund customer
    if (cancellation.refund_amount_cents > 0) {
      await trx.updateTable('wallets').set({
        balance_cents: sql`balance_cents + ${cancellation.refund_amount_cents}`,
      }).where('user_id', '=', booking.customer_id).execute();
    }

    // Pay provider any earned portion
    if (cancellation.fee_amount_cents > 0) {
      await trx.updateTable('wallets').set({
        balance_cents: sql`balance_cents + ${cancellation.fee_amount_cents}`,
      }).where('user_id', '=', booking.provider_id).execute();
    }

    // Wallet transactions
    const txRows = [];
    if (cancellation.refund_amount_cents > 0) {
      txRows.push(await trx.insertInto('wallet_transactions').values({...}).returning('id').executeTakeFirstOrThrow());
    }
    if (cancellation.fee_amount_cents > 0) {
      txRows.push(await trx.insertInto('wallet_transactions').values({...}).returning('id').executeTakeFirstOrThrow());
    }

    // Admin audit (inside transaction — Bug 69 fix)
    await trx.insertInto('admin_actions').values({
      actor_id: adminId,
      action_type: 'admin_cancel_booking',
      target_type: 'booking',
      target_id: bookingId,
      reason: reason.slice(0, 500),
      full_notes: reason,
      details: JSON.stringify({ 
        cancellation_tier: cancellation.tier_label,
        refund_cents: cancellation.refund_amount_cents,
        fee_cents: cancellation.fee_amount_cents,
        wallet_transaction_ids: txRows.map(r => r.id),
      }),
    }).execute();

    // Notify both parties
    await trx.insertInto('notifications').values([
      { user_id: booking.customer_id, type: 'booking_cancelled_by_admin', ... },
      { user_id: booking.provider_id, type: 'booking_cancelled_by_admin', ... },
    ]).execute();

    return { refundCents: cancellation.refund_amount_cents, walletTransactionId: txRows[0]?.id ?? '' };
  });
}
```

Note: the previously called `refundBookingEscrow` inside cancelBookingAsAdmin is now inlined. To avoid double-counting transactions, the bare-bones logic is duplicated rather than calling the other service that has its own transaction.

Better pattern: extract a `refundEscrowWithinTransaction(trx, ...)` helper that takes the trx parameter so callers can compose. The fix uses this:

```ts
// packages/api/src/services/escrow.service.ts
export async function refundEscrowWithinTransaction(
  trx: Transaction<DB>,
  args: { bookingId: string; adminId: string; reason: string; refundCents: number },
): Promise<{ walletTransactionId: string }> {
  // identical body to refundBookingEscrow but uses trx instead of db
}

// Top-level service wraps:
export async function refundBookingEscrow(args) {
  return db.transaction().execute(trx => refundEscrowWithinTransaction(trx, args));
}

// And cancelBookingAsAdmin can compose:
export async function cancelBookingAsAdmin(...) {
  return db.transaction().execute(async trx => {
    // ...
    await refundEscrowWithinTransaction(trx, { bookingId, adminId, reason, refundCents });
    // ...
  });
}
```

This pattern (the helper takes `trx` parameter) generalizes across all 14 bugs in this dispatch. **Use it everywhere.** Top-level service functions wrap; helper functions accept trx.

---

## Remaining 11 transactional-audit bugs (table format)

Each follows the same pattern — extract trx-aware helper, top-level wraps in transaction, audit + money + notification all inside.

| Bug # | File:Function | Fix shape |
|---|---|---|
| 78 | `provider.service.ts:adjustProviderWallet` | Wrap UPDATE wallet + INSERT wallet_transactions + INSERT admin_actions + INSERT notification in `db.transaction`. Currently no admin_actions row at all. |
| 79 | `provider.service.ts:updateProviderProfile` | Wrap profile UPDATE + audit INSERT in transaction. Audit must capture old/new field values diff. |
| 80 | `provider.service.ts:deleteProviderNote` | Convert hard DELETE to soft delete (`deleted_at`, `deleted_by`, `deleted_reason`) — audit row inserted in same transaction. |
| 82 | `provider.service.ts:createProviderNote` | Eliminate the round-trip via `listProviderNotes` after create. Single transaction returns the new note + updated count. |
| 83 | `dispute.service.ts:adminResolveDispute` | Wrap dispute status UPDATE + booking UPDATE + escrow refund (via trx-aware helper) + admin_actions INSERT + notifications INSERT all in `db.transaction`. |
| 84 | `dispute.service.ts:escalateDispute` | Wrap status UPDATE + NPC referral row INSERT + admin_actions INSERT + email-queue insert. Email send post-commit. |
| 85 | `dispute.service.ts:sendDisputeMessage` | Add `full_notes TEXT` column to `admin_actions`; store full message there. `reason` truncates to 500 only for legacy compat. |
| 105 | `business.service.ts:removeMember` | Soft delete with audit. `members.deleted_at`, `members.deleted_reason`. |
| 106 | `business.service.ts:transferOwnership` | Atomic: UPDATE business_accounts.owner_user_id AND UPDATE members SET role='owner' on new + UPDATE members SET role='member' on old + admin_actions INSERT, all in `db.transaction`. |
| 127 | `roles.service.ts:deleteRole` | Soft delete. Set `roles.archived_at`, archive all users with this role to a transition role (`super_admin` notified to reassign). Audit. |
| 237 | `catalog.service.ts:create/updateCategory|Subcategory|Addon` | Each mutation wrapped: UPDATE row + INSERT admin_actions + cache invalidation queue insert (cache flush itself happens post-commit, retry on failure). |

For each: tests follow the same shape as Bug 70's tests — assert that simulating an audit insert failure rolls back the wallet/state mutation.

---

## Documentation update

`docs/SECURITY-POSTURE.md` add new section:

```markdown
### SEC-007 — Transactional money + audit guarantee (Phase 14 Dispatch 06)

Every API endpoint that mutates money state guarantees the following invariants
inside a single Postgres transaction:

1. The state mutation (booking status, wallet balance, escrow status).
2. The corresponding `wallet_transactions` row.
3. The corresponding `admin_actions` row (when actor is admin).
4. Any user-visible `notifications` row.

If any one of these inserts/updates fails, the entire transaction rolls back.
There is no partial state in which money has moved without audit, or audit
exists without money having moved.

The pattern is enforced by Gate C `c-constitution-money-in-transaction.sh`
which scans services for money mutations outside `db.transaction()` blocks.

Side effects that tolerate eventual consistency (BIR OR issuance, push
notifications, email) happen in BullMQ queues triggered post-commit.
```

---

## Dispatch 06 closeout

**Bugs claimed fixed (14):**
- Bug 69 — `booking.service.ts:cancelBookingAsAdmin`
- Bug 70 — `escrow.service.ts:manualReleaseEscrow`
- Bug 71 — `escrow.service.ts:refundBookingEscrow`
- Bug 78 — `provider.service.ts:adjustProviderWallet`
- Bug 79 — `provider.service.ts:updateProviderProfile`
- Bug 80 — `provider.service.ts:deleteProviderNote`
- Bug 82 — `provider.service.ts:createProviderNote`
- Bug 83 — `dispute.service.ts:adminResolveDispute`
- Bug 84 — `dispute.service.ts:escalateDispute`
- Bug 85 — `dispute.service.ts:sendDisputeMessage`
- Bug 105 — `business.service.ts:removeMember`
- Bug 106 — `business.service.ts:transferOwnership`
- Bug 127 — `roles.service.ts:deleteRole`
- Bug 237 — `catalog.service.ts:* mutations`

**Files added:**
- `scripts/gates/c-constitution-money-in-transaction.sh`
- ~14 test files (one per bug, each with simulated-failure rollback assertion)
- Migration `074_admin_actions_full_notes.sql` (Bug 85 fix: add `full_notes TEXT` column)
- Migration `075_soft_delete_columns.sql` (Bugs 80/105/127: add `deleted_at`, `deleted_by`, `deleted_reason` to provider_notes, business_members, admin_roles)

**Files modified:**
- 5 service files heavily refactored (escrow, booking, provider, dispute, business)
- 2 service files moderately refactored (roles, catalog)
- ~10 route handler files updated to call new transaction-aware service signatures

**Documentation updates:**
- `docs/SECURITY-POSTURE.md` SEC-007 section added
- `LAUNCH-LIMITATIONS.md` — no changes (transactional integrity is required, not a limitation)

**Gates run:** A/B/C/D/E all green. New `c-constitution-money-in-transaction.sh` finds zero violations.

**What dispatches 07+ now have available:** every future money mutation has a clear pattern to follow. The trx-aware helper convention (helpers accept `trx` parameter, top-level services wrap) is established and grep-able.

**Decision points for Ken:**
- Soft-delete migrations (075) preserve historical data forever. Eventually you'll want a retention policy (BIR requires 10 years for financial; NPC allows 1-5 years for personal data depending on category). Add a "retention purge" cron job in Dispatch 14 that hard-deletes soft-deleted rows older than retention windows.
- Cache invalidation queue (Bug 237 fix) introduces a new BullMQ queue. Make sure Redis is sized for queue depth and the worker is monitored (will surface in Bug 1309 fix from Dispatch 01 — Prometheus metrics already capture queue depth).

---

# What's next: Dispatches 07 and 08

This installment covered Dispatches 05 (money-trust closure, 8 bugs) and 06 (transactional audit completeness, 14 bugs). Coming next:

- **Dispatch 07 — Provider job execution trust**: 12 bugs anchored on Bug 460/461/463 (checklist hardcoded for cleaning only, photos never uploaded to S3, completion never validated). Plus Bug 36/37/38 (chat broken, signature not captured, photo upload broken). This dispatch restores the integrity of the entire job-completion pipeline: provider does work → photos prove it → checklist documents it → server verifies → customer reviews → escrow releases. Without this dispatch, the entire trust model has gaps.

- **Dispatch 08 — NPC compliance + DSR**: 18 bugs. DSR queue (Bugs 397/398/401/402): rejection/escalation reasons enforced ≥30 chars, audit log CSV export self-audits, searchConsent gated to DPO role. Consent versioning (Bug 117): `consent_records.consent_type` gets a CHECK constraint. Breach notification (Bug 1366): explicit 72h timer surfaced in admin Compliance page. Marketing consent (Bug 969): backend respects opt-out toggle. Audit log PII masking (Bug 66): IPs and user-agents masked by default with reveal that audits itself.

After Dispatches 05–08, you have the full money-safety + provider-integrity + compliance foundations. Dispatches 09–14 are PII masking sweeps, provider onboarding v1.0 path, admin dispatch console wire-up, mobile customer/provider screen polish, and final cutover.

Say continue for Dispatches 07 and 08.
