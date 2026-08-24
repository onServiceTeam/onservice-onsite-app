const mockDbQuery = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => mockDbQuery(...args), transaction: jest.fn() },
}));
jest.mock('../src/services/settings.service', () => ({
  getMaxProviderServiceRadiusKm: jest.fn().mockResolvedValue(50),
}));

import { getProviderReviews } from '../src/services/provider-admin.service';
import { formatReview } from '../src/services/review.service';

it('Bug UX-289 — Provider 360 returns private customer review notes and evidence to admin support without changing public review serialization', async () => {
  mockDbQuery
    .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
    .mockResolvedValueOnce({
      rows: [{
        id: 'review-1', booking_id: 'booking-1', reviewer_name: 'Customer One', rating: 2,
        comment: 'The public review explains the visible issue.', is_visible: true, is_flagged: true,
        private_note: 'Please call me about damage evidence.', admin_response: null,
        image_urls: ['https://cdn.example/review-1.jpg'], created_at: new Date('2026-08-25T00:00:00.000Z'),
      }],
      rowCount: 1,
    });

  const result = await getProviderReviews('provider-1');

  expect(result.rows[0]).toMatchObject({
    isFlagged: true,
    privateNote: 'Please call me about damage evidence.',
    imageUrls: ['https://cdn.example/review-1.jpg'],
  });
  expect(mockDbQuery.mock.calls[1][0]).toMatch(/r\.private_note/);

  const publicReview = formatReview({
    id: 'review-1', booking_id: 'booking-1', reviewer_id: 'customer-1', provider_id: 'provider-1',
    rating: 2, quality_rating: null, punctuality_rating: null, professionalism_rating: null,
    communication_rating: null, value_rating: null, comment: 'Public comment', tags: [],
    private_note: 'Please call me about damage evidence.', provider_response: null,
    provider_response_at: null, is_visible: true, is_flagged: true,
    created_at: new Date('2026-08-25T00:00:00.000Z'), updated_at: new Date('2026-08-25T00:00:00.000Z'),
  } as never);
  expect(publicReview).not.toHaveProperty('privateNote');
  expect(publicReview).not.toHaveProperty('private_note');
});
