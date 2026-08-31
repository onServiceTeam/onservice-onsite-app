const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    transaction: async (callback: (client: { query: typeof queryMock }) => unknown) => callback({ query: queryMock }),
  },
}));

import { getConversationThreadForAdmin } from '../src/services/messaging-admin.service';

it('Bug UX-690 — an admin conversation resolves the provider profile ID separately from the participant user ID', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{
      id: '11111111-1111-4111-8111-111111111111',
      booking_id: '22222222-2222-4222-8222-222222222222',
      customer_id: '33333333-3333-4333-8333-333333333333',
      provider_id: '44444444-4444-4444-8444-444444444444',
      provider_profile_id: '55555555-5555-4555-8555-555555555555',
      is_active: true,
      created_at: new Date('2026-08-01T00:00:00.000Z'),
      updated_at: new Date('2026-08-02T00:00:00.000Z'),
      customer_first: 'Maria',
      customer_last: 'Santos',
      provider_first: 'Roberto',
      provider_last: 'Villanueva',
    }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] });

  const thread = await getConversationThreadForAdmin(
    '11111111-1111-4111-8111-111111111111',
    '66666666-6666-4666-8666-666666666666',
  );

  expect(thread).toMatchObject({
    providerId: '44444444-4444-4444-8444-444444444444',
    providerProfileId: '55555555-5555-4555-8555-555555555555',
  });
  expect(queryMock.mock.calls[0]?.[0]).toMatch(/LEFT JOIN providers p ON p\.user_id = c\.provider_id/);
});
