const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));

import { reviewFlag } from '../src/services/messaging-admin.service';

const MESSAGE_ID = '22222222-2222-2222-2222-222222222222';
const ADMIN_ID = '33333333-3333-3333-3333-333333333333';
const BOOKING_ID = '44444444-4444-4444-4444-444444444444';

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  dbTransactionMock.mockImplementation(
    (cb: (client: { query: (...args: unknown[]) => unknown }) => unknown) =>
      cb({ query: (...args: unknown[]) => dbQueryMock(...args) }),
  );
});

it('Bug UX-036 — reviewing a message requires and atomically audits the support rationale', async () => {
  await expect(reviewFlag(MESSAGE_ID, ADMIN_ID, '  ')).rejects.toMatchObject({ statusCode: 400 });
  expect(dbTransactionMock).not.toHaveBeenCalled();

  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ booking_id: BOOKING_ID }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 });

  await expect(
    reviewFlag(MESSAGE_ID, ADMIN_ID, '  Context confirms no policy violation.  '),
  ).resolves.toEqual({ reviewed: true });

  expect(dbTransactionMock).toHaveBeenCalledTimes(1);
  expect(dbQueryMock.mock.calls[1]?.[0]).toMatch(/UPDATE messages/);
  expect(dbQueryMock.mock.calls[2]?.[0]).toMatch(/INSERT INTO admin_actions/);
  expect(dbQueryMock.mock.calls[2]?.[1]).toEqual([
    ADMIN_ID,
    'message_flag_reviewed',
    BOOKING_ID,
    JSON.stringify({
      messageId: MESSAGE_ID,
      reviewNote: 'Context confirms no policy violation.',
    }),
  ]);
});
