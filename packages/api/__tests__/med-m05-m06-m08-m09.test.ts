// MED-M05 / M06 / M08 / M09 — validation middleware multi-schema +
// PH coords + monetary upper bounds + addon price live cap.

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: (...a: unknown[]) => dbQueryMock(...a),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/settings.service', () => ({
  getSettingNumber: jest.fn(),
}));

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
});

describe('MED-M05 — validation middleware accepts {body, query, params} schemas', () => {
  it('MED-M05 — original single-schema form still validates body', async () => {
    const { validationMiddleware } = await import('../src/middleware/validation.middleware');
    const schema = z.object({ name: z.string() });
    const middleware = validationMiddleware(schema);

    const req: { body: unknown } = { body: { name: 'Ken' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    middleware(req as never, res as never, next as never);
    expect(next).toHaveBeenCalled();
    expect(req.body).toEqual({ name: 'Ken' });
  });

  it('MED-M05 — multi-schema form validates query', async () => {
    const { validationMiddleware } = await import('../src/middleware/validation.middleware');
    const middleware = validationMiddleware({
      query: z.object({ page: z.string().regex(/^\d+$/) }),
    });

    const req = { body: undefined, query: { page: '5' }, params: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    middleware(req as never, res as never, next as never);
    expect(next).toHaveBeenCalled();
  });

  it('MED-M05 — multi-schema form rejects bad params with 400', async () => {
    const { validationMiddleware } = await import('../src/middleware/validation.middleware');
    const middleware = validationMiddleware({
      params: z.object({ id: z.string().uuid() }),
    });

    const req = { body: undefined, query: {}, params: { id: 'not-a-uuid' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    middleware(req as never, res as never, next as never);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('MED-M05 — multi-schema form validates body+query+params together', async () => {
    const { validationMiddleware } = await import('../src/middleware/validation.middleware');
    const middleware = validationMiddleware({
      body: z.object({ amount: z.number() }),
      query: z.object({ status: z.enum(['open', 'closed']) }),
      params: z.object({ id: z.string().uuid() }),
    });

    const req = {
      body: { amount: 100 },
      query: { status: 'open' },
      params: { id: '11111111-1111-4111-8111-111111111111' },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    middleware(req as never, res as never, next as never);
    expect(next).toHaveBeenCalled();
  });
});

describe('MED-M06 — PH coords are unified to tight (4.5..21.5 / 116..127.5)', () => {
  const PH_COORDS = readFileSync(
    resolve(__dirname, '../src/validators/ph-coords.ts'),
    'utf8',
  );
  const ADDRESS_VAL = readFileSync(
    resolve(__dirname, '../src/validators/address.validators.ts'),
    'utf8',
  );
  const PROVIDER_VAL = readFileSync(
    resolve(__dirname, '../src/validators/provider.validators.ts'),
    'utf8',
  );

  it('MED-M06 — phLatitude is min(4.5).max(21.5)', () => {
    expect(PH_COORDS).toMatch(/\.min\(4\.5/);
    expect(PH_COORDS).toMatch(/\.max\(21\.5/);
  });
  it('MED-M06 — phLongitude is min(116).max(127.5)', () => {
    expect(PH_COORDS).toMatch(/\.min\(116/);
    expect(PH_COORDS).toMatch(/\.max\(127\.5/);
  });
  it('MED-M06 — address.validators imports phLatitude/phLongitude (no more loose 4..22)', () => {
    expect(ADDRESS_VAL).toMatch(/import \{ phLatitude, phLongitude \} from '\.\/ph-coords'/);
    expect(ADDRESS_VAL).not.toMatch(/z\.number\(\)\.min\(4\)\.max\(22\)/);
  });
  it('MED-M06 — provider.validators uses phLatitude/phLongitude in BOTH application + update schemas', () => {
    expect(PROVIDER_VAL).toMatch(/import \{ phLatitude, phLongitude \} from '\.\/ph-coords'/);
    expect(PROVIDER_VAL).not.toMatch(/z\.number\(\)\.min\(4\)\.max\(22\)/);
    expect(PROVIDER_VAL).not.toMatch(/z\.number\(\)\.min\(116\)\.max\(128\)/);
  });

  it('MED-M06 — phLatitude rejects 4.0 (loose-band lower bound)', async () => {
    const { phLatitude } = await import('../src/validators/ph-coords');
    expect(() => phLatitude.parse(4.0)).toThrow();
  });
  it('MED-M06 — phLatitude rejects 22.0 (loose-band upper bound)', async () => {
    const { phLatitude } = await import('../src/validators/ph-coords');
    expect(() => phLatitude.parse(22.0)).toThrow();
  });
  it('MED-M06 — phLatitude accepts mainland Manila ~14.6', async () => {
    const { phLatitude } = await import('../src/validators/ph-coords');
    expect(phLatitude.parse(14.6)).toBe(14.6);
  });
});

describe('MED-M08 — monetary validators have sane upper bounds', () => {
  it('MED-M08 — payment.processRefundSchema rejects amount > 500M centavos', async () => {
    const { processRefundSchema } = await import('../src/validators/payment.validators');
    expect(() => processRefundSchema.parse({
      bookingId: '11111111-1111-4111-8111-111111111111',
      amount: 999_999_999_999, // ~₱9.9B
      reason: 'too big',
    })).toThrow();
  });
  it('MED-M08 — payment.processRefundSchema accepts realistic ₱5,000 refund', async () => {
    const { processRefundSchema } = await import('../src/validators/payment.validators');
    const result = processRefundSchema.parse({
      bookingId: '11111111-1111-4111-8111-111111111111',
      amount: 500_000,
      reason: 'partial',
    });
    expect(result.amount).toBe(500_000);
  });
  it('MED-M08 — payout.requestPayoutSchema rejects amount > 1B centavos', async () => {
    const { requestPayoutSchema } = await import('../src/validators/payout.validators');
    expect(() => requestPayoutSchema.parse({
      amount: 999_999_999_999,
      method: 'gcash',
      destinationAccount: '12345',
    })).toThrow();
  });
  it('MED-M08 — wallet.withdrawalSchema rejects amount > 1B centavos', async () => {
    const { withdrawalSchema } = await import('../src/validators/wallet.validators');
    expect(() => withdrawalSchema.parse({
      amount: 999_999_999_999,
      method: 'gcash',
      destinationAccount: '12345',
    })).toThrow();
  });
  it('MED-M08 — promo.createPromoCodeSchema rejects discountValue=200% for percentage', async () => {
    const { createPromoCodeSchema } = await import('../src/validators/promo.validators');
    expect(() => createPromoCodeSchema.parse({
      code: 'BIG',
      discountType: 'percentage',
      discountValue: 200,
    })).toThrow();
  });
  it('MED-M08 — promo.createPromoCodeSchema rejects fixed_centavos > 50M', async () => {
    const { createPromoCodeSchema } = await import('../src/validators/promo.validators');
    expect(() => createPromoCodeSchema.parse({
      code: 'BIG',
      discountType: 'fixed_centavos',
      discountValue: 999_999_999_999,
    })).toThrow();
  });
  it('MED-M08 — promo.createPromoCodeSchema accepts valid 50% percentage', async () => {
    const { createPromoCodeSchema } = await import('../src/validators/promo.validators');
    const out = createPromoCodeSchema.parse({
      code: 'HALF',
      discountType: 'percentage',
      discountValue: 50,
    });
    expect(out.discountValue).toBe(50);
  });
});

describe('MED-M09 — addon price live cap from platform_settings', () => {
  it('MED-M09 — getAddonPriceMaxCentsLive uses settings.getSettingNumber', async () => {
    const settingsModule = await import('../src/services/settings.service');
    (settingsModule.getSettingNumber as jest.Mock).mockResolvedValueOnce(7_500_000);
    const { getAddonPriceMaxCentsLive } = await import('../src/validators/admin-catalog.validators');
    const max = await getAddonPriceMaxCentsLive();
    expect(max).toBe(7_500_000);
  });

  it('MED-M09 — getAddonPriceMaxCentsLive falls back to hard backstop when settings unavailable', async () => {
    const settingsModule = await import('../src/services/settings.service');
    (settingsModule.getSettingNumber as jest.Mock).mockRejectedValueOnce(new Error('redis down'));
    const { getAddonPriceMaxCentsLive, ADDON_PRICE_MAX_CENTS_EXPORT } = await import('../src/validators/admin-catalog.validators');
    const max = await getAddonPriceMaxCentsLive();
    expect(max).toBe(ADDON_PRICE_MAX_CENTS_EXPORT);
  });

  it('MED-M09 — hard backstop is 10M centavos (raised from old 5M)', async () => {
    const { ADDON_PRICE_MAX_CENTS_EXPORT } = await import('../src/validators/admin-catalog.validators');
    expect(ADDON_PRICE_MAX_CENTS_EXPORT).toBe(10_000_000);
  });

  it('MED-M09 — catalog.service.createAddon rejects price above tuned cap', async () => {
    const settingsModule = await import('../src/services/settings.service');
    (settingsModule.getSettingNumber as jest.Mock).mockResolvedValueOnce(2_500_000);
    const { createAddon } = await import('../src/services/catalog.service');
    await expect(createAddon(
      {
        subcategoryId: '11111111-1111-4111-8111-111111111111',
        name: 'Big addon',
        price: 5_000_000,
      },
      'admin-1',
    )).rejects.toThrow(/exceeds the configured maximum/);
  });
});
