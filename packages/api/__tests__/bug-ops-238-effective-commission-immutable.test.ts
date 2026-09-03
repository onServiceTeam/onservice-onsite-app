const queryMock = jest.fn();
const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
    transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

import {
  cancelScheduledCommissionRate,
  CANCELLATION_CONFIRMATION,
} from '../src/services/commission-control.service';

it('Bug OPS-238 — an effective commission version cannot be cancelled or rewritten', async () => {
  const rateId = '00000000-0000-4000-8000-000000000238';
  queryMock
    .mockResolvedValueOnce({ rows: [{ now: new Date('2026-09-01T10:00:00.000Z') }], rowCount: 1 })
    .mockResolvedValueOnce({
      rows: [{
        id: rateId,
        effective_from: new Date('2026-09-01T09:00:00.000Z'),
        cancellation_id: null,
      }],
      rowCount: 1,
    });
  transactionMock.mockImplementation(async (callback: (client: unknown) => unknown) => callback({
    query: queryMock,
  }));

  await expect(cancelScheduledCommissionRate(rateId, {
    reason: 'This schedule should be replaced prospectively instead.',
    confirmation: CANCELLATION_CONFIRMATION,
  }, '00000000-0000-4000-8000-000000000001')).rejects.toMatchObject({ statusCode: 409 });

  expect(queryMock).toHaveBeenCalledTimes(2);
  expect(queryMock.mock.calls.some((call) => String(call[0]).includes(
    'commission_rate_version_cancellations',
  ))).toBe(true);
  expect(queryMock.mock.calls.some((call) => String(call[0]).includes(
    'INSERT INTO commission_rate_version_cancellations',
  ))).toBe(false);
});
