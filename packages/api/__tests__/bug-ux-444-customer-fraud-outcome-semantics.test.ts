const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: queryMock, transaction: jest.fn() },
}));

jest.mock('../src/services/settings.service', () => ({
  getSettingInteger: jest.fn(async (key: string) => key === 'fraud_pattern_window_days' ? 7 : 5),
  getSetting: jest.fn(async () => '0.80'),
}));

import { getCustomerDisputes } from '../src/services/customer-admin.service';

it('Bug UX-444 — provider-warning and provider-suspension refunds do not count as provider-favoring fraud signals', async () => {
  const now = Date.parse('2026-08-30T12:00:00.000Z');
  jest.spyOn(Date, 'now').mockReturnValue(now);
  const outcomes = [
    'no_refund',
    'no_refund',
    'no_refund',
    'refund_with_warning',
    'refund_with_suspension',
  ];
  queryMock.mockResolvedValueOnce({
    rows: outcomes.map((resolutionType, index) => ({
      id: `dispute-${index}`,
      booking_id: `booking-${index}`,
      provider_id: 'provider-1',
      business_name: 'Cebu Home Care',
      type: 'quality',
      status: 'resolved',
      resolution_type: resolutionType,
      refund_amount: resolutionType === 'no_refund' ? 0 : 5000,
      created_at: new Date(now - (index + 1) * 24 * 60 * 60 * 1000),
    })),
    rowCount: outcomes.length,
  });

  const result = await getCustomerDisputes('customer-1');

  expect(result.fraudPattern).toMatchObject({
    disputesInWindow: 5,
    windowDays: 7,
    favorProviderRate: 0.6,
    flagged: false,
    reason: null,
  });
});
