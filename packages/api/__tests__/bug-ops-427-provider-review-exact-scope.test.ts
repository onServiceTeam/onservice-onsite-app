const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: jest.fn(),
  },
}));
jest.mock('../src/services/settings.service', () => ({
  getMaxProviderServiceRadiusKm: jest.fn().mockResolvedValue(50),
}));

import { getProviderReviews } from '../src/services/provider-admin.service';

it('Bug OPS-427 - exact review lookup scopes both count and evidence queries to the owning provider', async () => {
  const providerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const reviewId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{
      id: reviewId,
      booking_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      reviewer_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      reviewer_name: 'Ana Reyes',
      rating: 4,
      comment: 'Work completed carefully.',
      is_visible: true,
      is_flagged: false,
      private_note: null,
      admin_response: null,
      image_urls: [],
      created_at: new Date('2026-09-01T00:00:00.000Z'),
    }], rowCount: 1 });

  const result = await getProviderReviews(providerId, 99, 200, reviewId);

  expect(result).toMatchObject({ total: 1, page: 1, pageSize: 1 });
  expect(result.rows).toEqual([expect.objectContaining({ id: reviewId, reviewerName: 'Ana Reyes' })]);
  for (const call of dbQueryMock.mock.calls) {
    expect(String(call[0])).toContain('r.provider_id = $1 AND r.id = $2');
    expect(call[1]).toEqual(expect.arrayContaining([providerId, reviewId]));
  }
  expect(dbQueryMock.mock.calls[1]?.[1]).toEqual([providerId, reviewId, 1, 0]);
});
