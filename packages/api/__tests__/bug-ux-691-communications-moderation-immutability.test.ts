const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    transaction: async (callback: (client: { query: typeof queryMock }) => unknown) => callback({ query: queryMock }),
  },
}));

import { redactMessage, reviewFlag } from '../src/services/messaging-admin.service';

it('Bug UX-691 — moderation rejects repeated or inapplicable decisions without rewriting evidence or appending a false audit event', async () => {
  queryMock.mockResolvedValueOnce({ rows: [{
    booking_id: '11111111-1111-4111-8111-111111111111',
    already: new Date('2026-08-01T00:00:00.000Z'),
  }] });
  await expect(redactMessage(
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    'Second and conflicting reason',
  )).rejects.toMatchObject({ statusCode: 409 });
  expect(queryMock).toHaveBeenCalledTimes(1);

  queryMock.mockReset();
  queryMock.mockResolvedValueOnce({ rows: [{
    booking_id: '11111111-1111-4111-8111-111111111111',
    is_flagged: false,
    reported_at: null,
    flag_reviewed_at: null,
  }] });
  await expect(reviewFlag(
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    'No moderation signal exists.',
  )).rejects.toMatchObject({ statusCode: 409 });
  expect(queryMock).toHaveBeenCalledTimes(1);

  queryMock.mockReset();
  queryMock.mockResolvedValueOnce({ rows: [{
    booking_id: '11111111-1111-4111-8111-111111111111',
    is_flagged: true,
    reported_at: null,
    flag_reviewed_at: new Date('2026-08-01T00:00:00.000Z'),
  }] });
  await expect(reviewFlag(
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    'Attempted duplicate review.',
  )).rejects.toMatchObject({ statusCode: 409 });
  expect(queryMock).toHaveBeenCalledTimes(1);
});
