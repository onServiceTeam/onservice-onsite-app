const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: jest.fn(),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/escrow.service', () => ({}));
jest.mock('../src/services/notification.service', () => ({}));
jest.mock('../src/services/or.service', () => ({}));
jest.mock('../src/services/payment.service', () => ({}));
jest.mock('../src/services/gateway-retry.service', () => ({}));

import { getBookingEvidence } from '../src/services/booking-admin.service';

it('Bug UX-306 — Booking 360 identifies admin-uploaded evidence as admin evidence', async () => {
  dbQueryMock
    .mockResolvedValueOnce({
      rows: [{ id: 'booking-1', customer_id: 'customer-1', provider_user_id: 'provider-user-1' }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({
      rows: [{
        id: 'photo-1',
        photo_url: 'https://example.test/admin-evidence.jpg',
        photo_type: 'issue',
        uploaded_by: 'admin-user-1',
        uploaded_by_role: 'admin',
        created_at: new Date('2026-08-25T10:00:00.000Z'),
      }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({ rows: [{ cnt: '0' }], rowCount: 1 });

  const evidence = await getBookingEvidence('booking-1');

  expect(evidence.photos[0]).toMatchObject({
    id: 'photo-1',
    uploadedBy: 'admin',
    caption: 'issue',
  });
});
