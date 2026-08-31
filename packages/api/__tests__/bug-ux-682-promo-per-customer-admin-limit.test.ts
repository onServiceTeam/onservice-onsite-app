const queryMock = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => queryMock(...args) } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/settings.service', () => ({ getSetting: jest.fn() }));

import { updatePromoCode } from '../src/services/marketing-admin.service';

it('Bug UX-682 — promo administration persists the supported per-customer usage limit', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{
      id: 'promo-1', code: 'WELCOME10', description: null, discount_type: 'percentage',
      discount_value: 10, max_discount_centavos: null, minimum_order_centavos: '0',
      usage_limit_total: 100, usage_limit_per_customer: 3, times_used: 0,
      valid_from: new Date('2026-08-01T00:00:00.000Z'), valid_until: null,
      active: true, created_at: new Date('2026-08-01T00:00:00.000Z'),
    }] })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 });

  const updated = await updatePromoCode('promo-1', { usageLimitPerCustomer: 3 }, 'admin-1');

  expect(String(queryMock.mock.calls[0]?.[0])).toContain('usage_limit_per_customer = $1');
  expect(queryMock.mock.calls[0]?.[1]).toEqual([3, 'promo-1']);
  expect(updated.usageLimitPerCustomer).toBe(3);
});
