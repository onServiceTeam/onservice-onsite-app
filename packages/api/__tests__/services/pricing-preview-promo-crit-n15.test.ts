// CRIT-N15 fix verified — booking/pricing.service.resolvePricing now
// actually applies promo discounts. Pre-fix: stub returned 0 always.

const dbQueryMock = jest.fn();
jest.mock('../../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

const settingsMock = {
  getSettingNumber: jest.fn(),
  getSettingPercent: jest.fn(),
};
jest.mock('../../src/services/settings.service', () => settingsMock);

jest.mock('../../src/services/pricing.service', () => ({
  calculatePricing: jest.fn().mockResolvedValue({
    surgeMultiplier: 1,
    surgeAmount: 0,
    appliedRule: null,
    platformSurgeShare: 0,
    providerSurgeShare: 0,
    finalPrice: 50000,
    basePrice: 50000,
  }),
}));

const resolvePromoMock = jest.fn();
jest.mock('../../src/services/booking/promo.service', () => ({
  resolvePromo: (...args: unknown[]) => resolvePromoMock(...args),
  PROMO_ERRORS: {
    promoInvalid: 'promo_invalid',
    promoMinOrderNotMet: 'promo_min_order_not_met',
    promoExhausted: 'promo_exhausted',
  },
}));

import { resolvePricing } from '../../src/services/booking/pricing.service';

beforeEach(() => {
  dbQueryMock.mockReset();
  settingsMock.getSettingNumber.mockImplementation(async (key: string) => {
    if (key === 'service_fee_rate') return 10;
    if (key === 'service_fee_min') return 2500;
    if (key === 'service_fee_max') return 50000;
    return 0;
  });
  resolvePromoMock.mockReset();
});

function setupSubcategory(basePrice: number) {
  // service_subcategories SELECT
  dbQueryMock.mockResolvedValueOnce({
    rows: [{
      id: 'sub-1',
      pricing_type: 'fixed',
      base_price: String(basePrice),
      is_active: true,
    }],
    rowCount: 1,
  });
}

describe('CRIT-N15 — pricing-preview applies promo discount', () => {
  it('CRIT-N15 — no promoCode → discount is 0 (legacy behavior)', async () => {
    setupSubcategory(50000);

    const result = await resolvePricing({
      userId: 'user-1',
      serviceCategoryId: 'cat-1',
      subcategoryId: 'sub-1',
      addons: [],
      scheduledAt: '2026-04-15T08:00:00Z',
    });

    expect(result.promoDiscountCents).toBe(0);
    expect(resolvePromoMock).not.toHaveBeenCalled();
  });

  it('CRIT-N15 — with promoCode → discount applied to total', async () => {
    setupSubcategory(50000);
    resolvePromoMock.mockResolvedValueOnce(5000); // P50 off

    const result = await resolvePricing({
      userId: 'user-1',
      serviceCategoryId: 'cat-1',
      subcategoryId: 'sub-1',
      addons: [],
      scheduledAt: '2026-04-15T08:00:00Z',
      promoCode: 'WELCOME10',
    });

    expect(resolvePromoMock).toHaveBeenCalledTimes(1);
    expect(resolvePromoMock).toHaveBeenCalledWith({
      code: 'WELCOME10',
      subtotalCents: 50000, // base + addons + surge
      userId: 'user-1',
    });
    expect(result.promoDiscountCents).toBe(5000);
    // service fee computed on (subtotal − promo) = 45000 × 10% = 4500
    expect(result.serviceFeeCents).toBe(4500);
    // total = 50000 + 0 + 0 - 5000 + 4500 = 49500
    expect(result.totalAmountCents).toBe(49500);
    // breakdown includes the promo discount line
    expect(result.breakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Promo discount', amountCents: -5000 }),
      ]),
    );
  });

  it('CRIT-N15 — promo error propagates as-is (does not silently zero)', async () => {
    setupSubcategory(50000);
    // Simulate a promo_min_order_not_met error from the resolver.
    const minOrderError = Object.assign(new Error('promo_min_order_not_met'), {
      statusCode: 400,
    });
    resolvePromoMock.mockRejectedValueOnce(minOrderError);

    await expect(
      resolvePricing({
        userId: 'user-1',
        serviceCategoryId: 'cat-1',
        subcategoryId: 'sub-1',
        addons: [],
        scheduledAt: '2026-04-15T08:00:00Z',
        promoCode: 'BIG_DISCOUNT',
      }),
    ).rejects.toThrow(/promo_min_order_not_met/);
  });

  it('CRIT-N15 — promo subtotal includes addons + surge (matches createBooking convention)', async () => {
    setupSubcategory(50000);

    // 1 addon at 5000.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'addon-1',
        subcategory_id: 'sub-1',
        price: '5000',
        is_active: true,
        name: 'Premium',
      }],
      rowCount: 1,
    });

    resolvePromoMock.mockResolvedValueOnce(0); // promo doesn't qualify

    await resolvePricing({
      userId: 'user-1',
      serviceCategoryId: 'cat-1',
      subcategoryId: 'sub-1',
      addons: [{ addonId: 'addon-1', quantity: 1 }],
      scheduledAt: '2026-04-15T08:00:00Z',
      promoCode: 'WELCOME10',
    });

    // The promo subtotal arg = 50000 (base) + 5000 (addon) + 0 (surge) = 55000.
    expect(resolvePromoMock).toHaveBeenCalledWith({
      code: 'WELCOME10',
      subtotalCents: 55000,
      userId: 'user-1',
    });
  });
});
