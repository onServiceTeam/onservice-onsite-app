const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { createBreach } from '../src/services/breach-log.service';

it('Bug UX-571 — breach intake rejects impossible affected-user counts before persistence', async () => {
  const base = {
    type: 'data_exposure' as const,
    scope: 'Customer contact records may have been exposed.',
    occurredAt: '2026-08-30T01:00:00.000Z',
    discoveredAt: '2026-08-30T02:00:00.000Z',
    reportedBy: '10000000-0000-4000-8000-000000000571',
  };

  for (const affectedUserCount of [-1, 1.5, Number.NaN, 2_147_483_648]) {
    await expect(createBreach({ ...base, affectedUserCount }))
      .rejects.toMatchObject({ statusCode: 400 });
  }

  expect(transactionMock).not.toHaveBeenCalled();
});
