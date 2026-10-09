const mockDbQuery = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => mockDbQuery(...args),
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

it('MED-N09 - admin evidence merges legacy and current non-deleted booking photos in chronological shape', async () => {
  mockDbQuery
    .mockResolvedValueOnce({
      rows: [{
        id: 'booking-med-n09',
        customer_id: 'customer-med-n09',
        provider_user_id: 'provider-user-med-n09',
      }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({
      rows: [
        {
          id: 'legacy-photo-med-n09',
          photo_url: 'https://example.test/legacy-before.jpg',
          photo_type: 'before',
          uploaded_by: 'customer-med-n09',
          uploaded_by_role: null,
          created_at: new Date('2026-09-01T01:00:00.000Z'),
        },
        {
          id: 'current-photo-med-n09',
          photo_url: 'https://example.test/current-after.jpg',
          photo_type: 'after',
          uploaded_by: 'provider-user-med-n09',
          uploaded_by_role: 'provider',
          created_at: new Date('2026-09-01T02:00:00.000Z'),
        },
      ],
      rowCount: 2,
    })
    .mockResolvedValueOnce({ rows: [{ cnt: '0' }], rowCount: 1 });

  const evidence = await getBookingEvidence('booking-med-n09');

  expect(evidence.photos).toEqual([
    {
      id: 'legacy-photo-med-n09',
      url: 'https://example.test/legacy-before.jpg',
      uploadedBy: 'customer',
      uploadedAt: '2026-09-01T01:00:00.000Z',
      caption: 'before',
    },
    {
      id: 'current-photo-med-n09',
      url: 'https://example.test/current-after.jpg',
      uploadedBy: 'provider',
      uploadedAt: '2026-09-01T02:00:00.000Z',
      caption: 'after',
    },
  ]);
  const [photoSql, photoParams] = mockDbQuery.mock.calls[1]! as [string, unknown[]];
  expect(photoSql).toMatch(/FROM booking_images[\s\S]*UNION ALL[\s\S]*FROM booking_photos/);
  expect(photoSql).toMatch(/uploaded_at AS created_at/);
  expect(photoSql).toMatch(/deleted_at IS NULL[\s\S]*ORDER BY created_at ASC/);
  expect(photoParams).toEqual(['booking-med-n09']);
});
