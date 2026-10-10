const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
    transaction: (callback: (client: { query: typeof queryMock }) => unknown) => callback({ query: queryMock }),
  },
}));

import { previewCommissionSchedule } from '../src/services/commission-control.service';

it('Bug OPS-252 — commission preview fails closed when the database clock is unavailable', async () => {
  queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

  await expect(previewCommissionSchedule({
    scopeType: 'tier',
    tier: 'new',
    rateBasisPoints: 1250,
    effectiveFrom: '2026-09-02T00:00:00.000Z',
    reason: 'Approved prospective rate for the new provider tier.',
  })).rejects.toMatchObject({
    statusCode: 500,
    message: expect.stringContaining('Database clock'),
  });
  expect(String(queryMock.mock.calls[0]?.[0])).toContain('clock_timestamp');
});
