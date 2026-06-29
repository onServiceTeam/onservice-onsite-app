// Phase 14 Dispatch 05 — pricing.service.ts tests.
// Bug 175 + Bug 176 + Bug d05-hourly-deferred (LAUNCH-LIMITATIONS §24).
//
// Test approach (matches existing booking-price-lookup.test.ts pattern):
// mock the data-access layer (db.query, settings.service, surge resolver)
// to return canonical seeded rows; the resolvePricing computation runs for
// real and we assert on its output. Per standing instruction §1: the
// function under test (resolvePricing) is NEVER mocked — only the data
// sources it reads from.

const SETTINGS: Record<string, string> = {
  service_fee_rate: '10',
  service_fee_min: '2500',
  service_fee_max: '50000',
};

jest.mock('../../../src/services/settings.service', () => ({
  getSettingNumber: jest.fn(async (k: string) => Number(SETTINGS[k] ?? '0')),
}));

jest.mock('../../../src/services/pricing.service', () => ({
  calculatePricing: jest.fn(async (basePrice: number) => ({
    basePrice,
    surgeMultiplier: 1.0,
    surgeAmount: 0,
    finalPrice: basePrice,
    appliedRule: null,
    platformSurgeShare: 0,
    providerSurgeShare: 0,
  })),
}));

jest.mock('../../../src/models/db', () => ({
  db: { query: jest.fn() },
}));

import { db } from '../../../src/models/db';
import { calculatePricing as mockedSurge } from '../../../src/services/pricing.service';
import { resolvePricing } from '../../../src/services/booking/pricing.service';

const SUBCAT_FIXED_ID = '11111111-1111-1111-1111-111111111111';
const SUBCAT_QUOTE_ID = '22222222-2222-2222-2222-222222222222';
const SUBCAT_HOURLY_ID = '33333333-3333-3333-3333-333333333333';
const SUBCAT_OTHER_ID = '44444444-4444-4444-4444-444444444444';
const ADDON_A_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ADDON_INACTIVE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ADDON_OTHER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const SUBCAT_FIXED = {
  id: SUBCAT_FIXED_ID,
  pricing_type: 'fixed' as const,
  base_price: 50000,
  is_active: true,
};
const SUBCAT_FIXED_INACTIVE = { ...SUBCAT_FIXED, is_active: false };
const SUBCAT_QUOTE = {
  id: SUBCAT_QUOTE_ID,
  pricing_type: 'quote' as const,
  base_price: null,
  is_active: true,
};
const SUBCAT_HOURLY = {
  id: SUBCAT_HOURLY_ID,
  pricing_type: 'hourly' as const,
  base_price: null,
  is_active: true,
  // D27 Phase 4b — hourly config: ₱250/hr, 60-min min, 30-min increments.
  hourly_rate: 25000,
  min_billable_minutes: 60,
  billing_increment_minutes: 30,
  max_estimated_hours: 8,
};

const ADDON_A = {
  id: ADDON_A_ID,
  subcategory_id: SUBCAT_FIXED_ID,
  price: 50000,
  is_active: true,
  name: 'Extra Bathroom',
};
const ADDON_INACTIVE = { ...ADDON_A, id: ADDON_INACTIVE_ID, is_active: false };
const ADDON_OTHER = {
  id: ADDON_OTHER_ID,
  subcategory_id: SUBCAT_OTHER_ID,
  price: 10000,
  is_active: true,
  name: 'Other Subcat Addon',
};

const mockedQuery = db.query as jest.MockedFunction<typeof db.query>;

interface QueryStub {
  match: RegExp;
  rows: unknown[];
}

function setupQueries(...stubs: QueryStub[]) {
  mockedQuery.mockImplementation((async (text: string) => {
    for (const stub of stubs) {
      if (stub.match.test(text)) {
        return {
          rows: stub.rows,
          rowCount: stub.rows.length,
          command: '',
          oid: 0,
          fields: [],
        };
      }
    }
    throw new Error(`pricing.service.test: unexpected query: ${text}`);
  }) as never);
}

const baseInput = {
  userId: 'user-1',
  serviceCategoryId: 'cat-1',
  subcategoryId: SUBCAT_FIXED_ID,
  addons: [],
  scheduledAt: new Date('2026-05-01T12:00:00Z').toISOString(),
};

beforeEach(() => {
  mockedQuery.mockReset();
  (mockedSurge as jest.Mock).mockClear();
  // Reset settings to defaults for tests that mutate them
  SETTINGS.service_fee_rate = '10';
  SETTINGS.service_fee_min = '2500';
  SETTINGS.service_fee_max = '50000';
});

describe('Bug 176 — pricing.service resolvePricing (server-canonical addon prices)', () => {
  it('bug-176-server-canonical-addons: addon prices come from DB regardless of client input', async () => {
    setupQueries(
      { match: /service_subcategories/i, rows: [SUBCAT_FIXED] },
      { match: /service_addons/i, rows: [ADDON_A] },
    );
    const result = await resolvePricing({
      ...baseInput,
      addons: [{ addonId: ADDON_A_ID, quantity: 1 }],
    });
    expect(result.servicePriceCents).toBe(50000);
    expect(result.addonsCents).toBe(50000);
    // service fee = max(2500, min(50000, round(100000*0.10))) = 10000
    expect(result.serviceFeeCents).toBe(10000);
    expect(result.totalAmountCents).toBe(110000);
  });

  it('bug-176-rejects-unknown-addonId', async () => {
    setupQueries(
      { match: /service_subcategories/i, rows: [SUBCAT_FIXED] },
      { match: /service_addons/i, rows: [] },
    );
    await expect(
      resolvePricing({
        ...baseInput,
        addons: [{ addonId: ADDON_A_ID, quantity: 1 }],
      }),
    ).rejects.toThrow(/addon_not_found/);
  });

  it('bug-176-rejects-cross-subcat-addon', async () => {
    setupQueries(
      { match: /service_subcategories/i, rows: [SUBCAT_FIXED] },
      { match: /service_addons/i, rows: [ADDON_OTHER] },
    );
    await expect(
      resolvePricing({
        ...baseInput,
        addons: [{ addonId: ADDON_OTHER_ID, quantity: 1 }],
      }),
    ).rejects.toThrow(/addon_subcategory_mismatch/);
  });

  it('bug-176-rejects-inactive-addon', async () => {
    setupQueries(
      { match: /service_subcategories/i, rows: [SUBCAT_FIXED] },
      { match: /service_addons/i, rows: [ADDON_INACTIVE] },
    );
    await expect(
      resolvePricing({
        ...baseInput,
        addons: [{ addonId: ADDON_INACTIVE_ID, quantity: 1 }],
      }),
    ).rejects.toThrow(/addon_inactive/);
  });

  it('bug-176-multiplies-quantity', async () => {
    setupQueries(
      { match: /service_subcategories/i, rows: [SUBCAT_FIXED] },
      { match: /service_addons/i, rows: [ADDON_A] },
    );
    const result = await resolvePricing({
      ...baseInput,
      addons: [{ addonId: ADDON_A_ID, quantity: 3 }],
    });
    expect(result.addonsCents).toBe(150000);
  });

  it('rejects invalid quantity (zero)', async () => {
    setupQueries({ match: /service_subcategories/i, rows: [SUBCAT_FIXED] });
    await expect(
      resolvePricing({ ...baseInput, addons: [{ addonId: ADDON_A_ID, quantity: 0 }] }),
    ).rejects.toThrow(/addon_quantity_invalid/);
  });

  it('rejects invalid quantity (negative)', async () => {
    setupQueries({ match: /service_subcategories/i, rows: [SUBCAT_FIXED] });
    await expect(
      resolvePricing({ ...baseInput, addons: [{ addonId: ADDON_A_ID, quantity: -1 }] }),
    ).rejects.toThrow(/addon_quantity_invalid/);
  });

  it('rejects invalid quantity (NaN)', async () => {
    setupQueries({ match: /service_subcategories/i, rows: [SUBCAT_FIXED] });
    await expect(
      resolvePricing({ ...baseInput, addons: [{ addonId: ADDON_A_ID, quantity: Number.NaN }] }),
    ).rejects.toThrow(/addon_quantity_invalid/);
  });

  it('rejects invalid quantity (Infinity)', async () => {
    setupQueries({ match: /service_subcategories/i, rows: [SUBCAT_FIXED] });
    await expect(
      resolvePricing({ ...baseInput, addons: [{ addonId: ADDON_A_ID, quantity: Number.POSITIVE_INFINITY }] }),
    ).rejects.toThrow(/addon_quantity_invalid/);
  });

  it('rejects invalid quantity (non-integer)', async () => {
    setupQueries({ match: /service_subcategories/i, rows: [SUBCAT_FIXED] });
    await expect(
      resolvePricing({ ...baseInput, addons: [{ addonId: ADDON_A_ID, quantity: 1.5 }] }),
    ).rejects.toThrow(/addon_quantity_invalid/);
  });

  it('rejects invalid quantity (>100)', async () => {
    setupQueries({ match: /service_subcategories/i, rows: [SUBCAT_FIXED] });
    await expect(
      resolvePricing({ ...baseInput, addons: [{ addonId: ADDON_A_ID, quantity: 101 }] }),
    ).rejects.toThrow(/addon_quantity_invalid/);
  });
});

describe('Bug 175 — pricing.service resolvePricing (quote-based subcat must use from-quote flow)', () => {
  it('bug-175-uses-quote-amount: rejects fixed-price flow for quote subcat', async () => {
    setupQueries({ match: /service_subcategories/i, rows: [SUBCAT_QUOTE] });
    await expect(
      resolvePricing({ ...baseInput, subcategoryId: SUBCAT_QUOTE_ID }),
    ).rejects.toThrow(/subcategory_quote_required/);
  });
});

describe('D27 Phase 4b — hourly resolvePricing (capped pre-authorization)', () => {
  it('requires an estimate for an hourly subcategory', async () => {
    setupQueries({ match: /service_subcategories/i, rows: [SUBCAT_HOURLY] });
    await expect(
      resolvePricing({ ...baseInput, subcategoryId: SUBCAT_HOURLY_ID }),
    ).rejects.toThrow(/hourly_estimate_required/);
  });

  it('resolves the service price to the capped estimate x rate (₱250/hr x 3h = ₱750)', async () => {
    setupQueries({ match: /service_subcategories/i, rows: [SUBCAT_HOURLY] });
    const out = await resolvePricing({ ...baseInput, subcategoryId: SUBCAT_HOURLY_ID, estimatedHours: 3 });
    expect(out.servicePriceCents).toBe(75000);
  });

  it('rejects an estimate over the subcategory max', async () => {
    setupQueries({ match: /service_subcategories/i, rows: [SUBCAT_HOURLY] });
    await expect(
      resolvePricing({ ...baseInput, subcategoryId: SUBCAT_HOURLY_ID, estimatedHours: 99 }),
    ).rejects.toThrow(/hourly_estimate_exceeds_max/);
  });
});

describe('D27 Phase 4 — per_unit subcat routes to the quote flow', () => {
  it('throws subcategory_quote_required for a per_unit subcategory', async () => {
    setupQueries({
      match: /service_subcategories/i,
      rows: [{ id: SUBCAT_QUOTE_ID, pricing_type: 'per_unit', base_price: null, is_active: true }],
    });
    await expect(
      resolvePricing({ ...baseInput, subcategoryId: SUBCAT_QUOTE_ID }),
    ).rejects.toThrow(/subcategory_quote_required/);
  });
});

describe('pricing.service resolvePricing — subcategory edge cases', () => {
  it('rejects unknown subcategoryId', async () => {
    setupQueries({ match: /service_subcategories/i, rows: [] });
    await expect(resolvePricing(baseInput)).rejects.toThrow(/subcategory_not_found/);
  });

  it('rejects inactive subcategory', async () => {
    setupQueries({ match: /service_subcategories/i, rows: [SUBCAT_FIXED_INACTIVE] });
    await expect(resolvePricing(baseInput)).rejects.toThrow(/subcategory_inactive/);
  });

  it('rejects subcategory with null base_price', async () => {
    setupQueries({
      match: /service_subcategories/i,
      rows: [{ ...SUBCAT_FIXED, base_price: null }],
    });
    await expect(resolvePricing(baseInput)).rejects.toThrow(/subcategory_no_base_price/);
  });
});

describe('pricing.service resolvePricing — fee resolution from settings', () => {
  it('service-fee-from-settings: respects service_fee_rate', async () => {
    SETTINGS.service_fee_rate = '20'; // 20% instead of 10%
    setupQueries({ match: /service_subcategories/i, rows: [SUBCAT_FIXED] });
    const result = await resolvePricing(baseInput);
    // base 50000, no addons. fee = max(2500, min(50000, round(50000*0.20))) = 10000
    expect(result.serviceFeeCents).toBe(10000);
    expect(result.totalAmountCents).toBe(60000);
  });

  it('enforces minimum service fee', async () => {
    setupQueries({
      match: /service_subcategories/i,
      rows: [{ ...SUBCAT_FIXED, base_price: 10000 }],
    });
    const result = await resolvePricing(baseInput);
    // base 10000, fee = max(2500, min(50000, 1000)) = 2500
    expect(result.serviceFeeCents).toBe(2500);
  });

  it('enforces maximum service fee', async () => {
    setupQueries({
      match: /service_subcategories/i,
      rows: [{ ...SUBCAT_FIXED, base_price: 10000000 }],
    });
    const result = await resolvePricing(baseInput);
    // base 10_000_000, fee = max(2500, min(50000, 1_000_000)) = 50000
    expect(result.serviceFeeCents).toBe(50000);
  });
});

describe('pricing.service resolvePricing — total integrity', () => {
  it('total equals sum of components', async () => {
    setupQueries(
      { match: /service_subcategories/i, rows: [SUBCAT_FIXED] },
      { match: /service_addons/i, rows: [ADDON_A] },
    );
    const result = await resolvePricing({
      ...baseInput,
      addons: [{ addonId: ADDON_A_ID, quantity: 2 }],
    });
    const components =
      result.servicePriceCents +
      result.addonsCents +
      result.surgeAmountCents -
      result.promoDiscountCents +
      result.serviceFeeCents;
    expect(result.totalAmountCents).toBe(components);
  });

  it('produces a breakdown that includes service price and fee', async () => {
    setupQueries({ match: /service_subcategories/i, rows: [SUBCAT_FIXED] });
    const result = await resolvePricing(baseInput);
    expect(result.breakdown.find((b) => b.label === 'Service price')?.amountCents).toBe(50000);
    expect(result.breakdown.find((b) => b.label === 'Service fee')?.amountCents).toBe(
      result.serviceFeeCents,
    );
  });
});
