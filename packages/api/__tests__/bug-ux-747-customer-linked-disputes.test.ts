const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => queryMock(...args) } }));
jest.mock('../src/services/settings.service', () => ({
  getSettingInteger: async (key: string) => key === 'fraud_pattern_window_days' ? 30 : 5,
  getSetting: async () => '0.80',
}));

import { getCustomerDisputes } from '../src/services/customer-admin.service';

it('Bug UX-747 — Customer 360 lists provider-filed cases on the customer booking while fraud scoring remains customer-filer-only', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  queryMock.mockImplementation(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/COUNT\(\*\)::text AS count/.test(sql)) return { rows: [{ count: '1' }], rowCount: 1 };
    if (/filer\.role AS filed_by_role/.test(sql)) {
      return { rows: [{
        id: 'dispute-1', booking_id: 'booking-1', provider_id: 'provider-1',
        business_name: 'Cebu Cleaners', type: 'scope', status: 'under_review',
        resolution_type: null, refund_amount: 0, filed_by: 'provider-user-1',
        filed_by_role: 'provider', filed_by_name: 'Cebu Cleaners',
        created_at: new Date('2026-08-30T00:00:00.000Z'),
      }], rowCount: 1 };
    }
    return { rows: [{ disputes_in_window: '0', resolved_in_window: '0', no_refund_in_window: '0' }], rowCount: 1 };
  });

  const result = await getCustomerDisputes('customer-1', 1, 20);

  expect(result.total).toBe(1);
  expect(result.rows[0]).toMatchObject({ filedByRole: 'provider', filedByName: 'Cebu Cleaners' });
  expect(result.fraudPattern.disputesInWindow).toBe(0);
  expect(calls[1]?.sql).toMatch(/WHERE b\.customer_id = \$1/);
  expect(calls[2]?.sql).toMatch(/WHERE d\.filed_by = \$1/);
});
