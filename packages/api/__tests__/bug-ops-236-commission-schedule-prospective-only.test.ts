const queryMock = jest.fn();
const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
    transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

import { previewCommissionSchedule } from '../src/services/commission-control.service';

it('Bug OPS-236 — a commission schedule cannot start inside the 15-minute safety window', async () => {
  const now = new Date('2026-09-01T10:00:00.000Z');
  transactionMock.mockImplementation(async (callback: (client: unknown) => unknown) => callback({
    query: queryMock,
  }));
  queryMock.mockResolvedValueOnce({ rows: [{ now }], rowCount: 1 });

  await expect(previewCommissionSchedule({
    scopeType: 'tier',
    tier: 'new',
    rateBasisPoints: 1400,
    effectiveFrom: '2026-09-01T10:10:00.000Z',
    reason: 'Reviewing a prospective rate for new providers.',
  })).rejects.toMatchObject({ statusCode: 409 });

  expect(queryMock).toHaveBeenCalledTimes(1);
  expect(String(queryMock.mock.calls[0]?.[0])).toContain('clock_timestamp');
});
