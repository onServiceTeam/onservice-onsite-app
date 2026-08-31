// Phase 14 Dispatch 05 — promo.service.ts tests (Bug 261).
//
// Verifies that `resolvePromo` reads the canonical discount from the
// `promo_codes` table and never trusts a client-supplied discount value.
// Per standing instruction §1, the function under test is NEVER mocked —
// only `db.query` is mocked to return seeded promo rows.

jest.mock('../../../src/models/db', () => ({
  db: { query: jest.fn() },
}));

const getSettingBooleanMock = jest.fn().mockResolvedValue(true);
jest.mock('../../../src/services/settings.service', () => ({
  getSettingBoolean: (...args: unknown[]) => getSettingBooleanMock(...args),
}));

import { db } from '../../../src/models/db';
import { resolvePromo } from '../../../src/services/booking/promo.service';

const mockedQuery = db.query as jest.MockedFunction<typeof db.query>;

function setRow(row: object | null) {
  mockedQuery.mockImplementation((async () => ({
    rows: row ? [row] : [],
    rowCount: row ? 1 : 0,
    command: '',
    oid: 0,
    fields: [],
  })) as never);
}

const SAVE10 = {
  id: 'promo-1',
  code: 'SAVE10',
  discount_type: 'percentage',
  discount_value: 10,
  max_discount_centavos: null,
  minimum_order_centavos: '0',
  usage_limit_total: null,
  usage_limit_per_customer: 1,
  times_used: 0,
  valid_from: new Date(Date.now() - 86400_000).toISOString(),
  valid_until: new Date(Date.now() + 86400_000).toISOString(),
  active: true,
};

const baseInput = {
  code: 'SAVE10',
  subtotalCents: 100000,
  userId: 'user-1',
};

beforeEach(() => {
  mockedQuery.mockReset();
  getSettingBooleanMock.mockReset();
  getSettingBooleanMock.mockResolvedValue(true);
});

describe('Bug 261 — promo.service resolvePromo (server-canonical discount)', () => {
  it('bug-261-server-resolves-promo: percentage discount computed from DB', async () => {
    setRow(SAVE10);
    const discount = await resolvePromo(baseInput);
    expect(discount).toBe(10000); // 10% of 100000
  });

  it('rejects unknown code', async () => {
    setRow(null);
    await expect(resolvePromo({ ...baseInput, code: 'NOSUCH' })).rejects.toThrow(/promo_invalid/);
  });

  it('rejects deactivated promo', async () => {
    setRow({ ...SAVE10, active: false });
    await expect(resolvePromo(baseInput)).rejects.toThrow(/promo_invalid/);
  });

  it('rejects expired promo', async () => {
    setRow({ ...SAVE10, valid_until: new Date(Date.now() - 1000).toISOString() });
    await expect(resolvePromo(baseInput)).rejects.toThrow(/promo_invalid/);
  });

  it('rejects not-yet-active promo', async () => {
    setRow({ ...SAVE10, valid_from: new Date(Date.now() + 86400_000).toISOString() });
    await expect(resolvePromo(baseInput)).rejects.toThrow(/promo_invalid/);
  });

  it('enforces minimum_order_centavos', async () => {
    setRow({ ...SAVE10, minimum_order_centavos: '50000' });
    await expect(
      resolvePromo({ ...baseInput, subtotalCents: 30000 }),
    ).rejects.toThrow(/promo_min_order_not_met/);
  });

  it('honors-global-usage-limit: rejects when times_used >= usage_limit_total', async () => {
    setRow({ ...SAVE10, usage_limit_total: 5, times_used: 5 });
    await expect(resolvePromo(baseInput)).rejects.toThrow(/promo_exhausted/);
  });

  it('caps-percent-at-max-discount-centavos', async () => {
    setRow({
      ...SAVE10,
      discount_type: 'percentage',
      discount_value: 50,
      max_discount_centavos: '10000', // ₱100 cap
    });
    const discount = await resolvePromo({ ...baseInput, subtotalCents: 100000 });
    // 50% of 100000 = 50000; capped at 10000
    expect(discount).toBe(10000);
  });

  it('caps-fixed-discount-at-subtotal', async () => {
    setRow({
      ...SAVE10,
      discount_type: 'fixed_centavos',
      discount_value: 20000,
      max_discount_centavos: null,
    });
    const discount = await resolvePromo({ ...baseInput, subtotalCents: 10000 });
    // fixed 20000, but subtotal is only 10000 → discount capped at subtotal
    expect(discount).toBe(10000);
  });

  it('fixed_centavos returns the fixed amount when below subtotal', async () => {
    setRow({
      ...SAVE10,
      discount_type: 'fixed_centavos',
      discount_value: 5000,
      max_discount_centavos: null,
    });
    const discount = await resolvePromo({ ...baseInput, subtotalCents: 100000 });
    expect(discount).toBe(5000);
  });
});

describe('promo.service resolvePromo — code normalization + edge cases', () => {
  it('normalizes lowercase code to uppercase before lookup', async () => {
    setRow(SAVE10);
    const discount = await resolvePromo({ ...baseInput, code: 'save10' });
    expect(discount).toBe(10000);
    const calledWith = (mockedQuery.mock.calls[0]?.[1] as unknown[])[0];
    expect(calledWith).toBe('SAVE10');
  });

  it('trims whitespace from code', async () => {
    setRow(SAVE10);
    await resolvePromo({ ...baseInput, code: '  SAVE10  ' });
    const calledWith = (mockedQuery.mock.calls[0]?.[1] as unknown[])[0];
    expect(calledWith).toBe('SAVE10');
  });

  it('rejects empty code', async () => {
    setRow(null);
    await expect(resolvePromo({ ...baseInput, code: '' })).rejects.toThrow(/promo_invalid/);
  });

  it('rejects code longer than 40 chars', async () => {
    setRow(null);
    await expect(
      resolvePromo({ ...baseInput, code: 'A'.repeat(50) }),
    ).rejects.toThrow(/promo_invalid/);
  });

  it('rejects negative subtotalCents', async () => {
    setRow(null);
    await expect(
      resolvePromo({ ...baseInput, subtotalCents: -100 }),
    ).rejects.toThrow(/promo_invalid/);
  });

  it('rejects NaN subtotalCents', async () => {
    setRow(null);
    await expect(
      resolvePromo({ ...baseInput, subtotalCents: Number.NaN }),
    ).rejects.toThrow(/promo_invalid/);
  });

  it('rejects Infinity subtotalCents', async () => {
    setRow(null);
    await expect(
      resolvePromo({ ...baseInput, subtotalCents: Number.POSITIVE_INFINITY }),
    ).rejects.toThrow(/promo_invalid/);
  });
});
