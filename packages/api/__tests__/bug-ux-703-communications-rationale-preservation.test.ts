const queryMock = jest.fn();
const transactionMock = jest.fn(async (callback: (client: { query: typeof queryMock }) => unknown) => (
  callback({ query: queryMock })
));

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: (...args: unknown[]) => transactionMock(...args as [(client: { query: typeof queryMock }) => unknown]) },
}));

import { reviewFlag } from '../src/services/messaging-admin.service';

it('Bug UX-703 — a valid moderation rationale is preserved in full in the immutable admin audit record', async () => {
  const rationale = `Evidence review: ${'x'.repeat(1480)}`;
  queryMock
    .mockResolvedValueOnce({ rows: [{
      booking_id: 'booking-1', is_flagged: true, reported_at: null, flag_reviewed_at: null,
    }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] });

  await reviewFlag('message-1', 'admin-1', rationale);

  const auditDetails = JSON.parse(queryMock.mock.calls[2]?.[1]?.[3] as string) as { reviewNote: string };
  expect(auditDetails.reviewNote).toBe(rationale);
});
