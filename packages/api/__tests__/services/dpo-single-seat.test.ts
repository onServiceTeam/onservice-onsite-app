const dbTransactionMock = jest.fn();

jest.mock('../../src/models/db', () => ({
  db: {
    query: jest.fn(),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { promoteToDpo } from '../../src/services/staff.service';

it('Bug UX-347 — DPO assignment serializes the seat and refuses a second active DPO', async () => {
  const query = jest.fn()
    .mockResolvedValueOnce({ rows: [{ id: 'admin-2', role: 'admin', is_active: true }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 'dpo-1' }] });
  dbTransactionMock.mockImplementationOnce(async (cb: (client: { query: typeof query }) => unknown) => cb({ query }));

  await expect(promoteToDpo(
    'admin-2',
    'super-1',
    'Attempted assignment during an existing DPO appointment.',
  )).rejects.toMatchObject({ statusCode: 409 });

  expect(query.mock.calls[1]?.[0]).toMatch(/pg_advisory_xact_lock/);
  expect(query.mock.calls.some(([sql]) => /UPDATE users SET role = 'dpo'/.test(sql as string))).toBe(false);
});
