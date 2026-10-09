const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { resolveBookingContract } from '../src/services/business.service';

it('Bug OPS-352 — contract eligibility is resolved against the scheduled service date instead of today', async () => {
  queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
  const scheduledAt = '2026-12-15T01:00:00.000Z';

  await resolveBookingContract(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000352',
    '00000000-0000-4000-8000-000000000353',
    null,
    scheduledAt,
  );

  const [sql, values] = queryMock.mock.calls[0]!;
  expect(String(sql)).toContain("bc.start_date <= ($5::timestamptz AT TIME ZONE 'Asia/Manila')::date");
  expect(String(sql)).toContain("bc.end_date >= ($5::timestamptz AT TIME ZONE 'Asia/Manila')::date");
  expect(values).toEqual([
    '00000000-0000-4000-8000-000000000352',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000353',
    null,
    scheduledAt,
  ]);
});
