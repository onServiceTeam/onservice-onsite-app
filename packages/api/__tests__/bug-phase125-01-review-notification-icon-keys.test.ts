const dbQueryMock = jest.fn();
const clientQueryMock = jest.fn();
const transactionMock = jest.fn();
const createPushNotificationMock = jest.fn();
const mockEventOrder: string[] = [];

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

jest.mock('../src/services/notification.service', () => ({
  createPushNotification: (...args: unknown[]) => createPushNotificationMock(...args),
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { createReview } from '../src/services/review.service';

it('BUG-PHASE125-01 — a committed review sends the provider a linked rating push without rolling back when delivery fails', async () => {
  const review = {
    id: 'review-1',
    booking_id: 'booking-1',
    reviewer_id: 'customer-1',
    provider_id: 'provider-1',
    rating: 5,
    quality_rating: null,
    punctuality_rating: null,
    professionalism_rating: null,
    communication_rating: null,
    value_rating: null,
    comment: 'Excellent work',
    tags: [],
    private_note: null,
    provider_response: null,
    provider_response_at: null,
    is_visible: true,
    is_flagged: false,
    admin_response: null,
    created_at: new Date('2026-08-24T00:00:00.000Z'),
    updated_at: new Date('2026-08-24T00:00:00.000Z'),
  };

  dbQueryMock
    .mockResolvedValueOnce({
      rows: [{
        id: 'booking-1', customer_id: 'customer-1', provider_id: 'provider-1',
        status: 'confirmed', performer_staff_id: null,
      }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ user_id: 'provider-user-1' }], rowCount: 1 });

  clientQueryMock
    .mockResolvedValueOnce({ rows: [review], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ avg_rating: '5.00' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 });

  transactionMock.mockImplementation(async (callback: (client: { query: typeof clientQueryMock }) => Promise<unknown>) => {
    mockEventOrder.push('transaction-start');
    const result = await callback({ query: clientQueryMock });
    mockEventOrder.push('transaction-commit');
    return result;
  });
  createPushNotificationMock.mockImplementation(async () => {
    mockEventOrder.push('push-attempt');
    throw new Error('push transport unavailable');
  });

  const result = await createReview('booking-1', 'customer-1', {
    rating: 5,
    comment: 'Excellent work',
  });

  expect(result.id).toBe('review-1');
  expect(createPushNotificationMock).toHaveBeenCalledWith(expect.objectContaining({
    userId: 'provider-user-1',
    type: 'rating_received',
    data: { reviewId: 'review-1', bookingId: 'booking-1', rating: 5 },
  }));
  expect(mockEventOrder).toEqual(['transaction-start', 'transaction-commit', 'push-attempt']);
});
