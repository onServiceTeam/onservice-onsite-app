const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    transaction: async (callback: (client: { query: typeof queryMock }) => unknown) => callback({ query: queryMock }),
  },
}));

import { updatePromotion } from '../src/services/promotion.service';

it('Bug UX-689 — promotion editing can clear optional copy, destination, and end date without retaining stale customer-facing values', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{
      id: 'promotion-1',
      title: 'Existing banner',
      subtitle: 'Old subtitle',
      image_url: 'https://cdn.example/old.jpg',
      badge: 'OLD',
      cta_text: 'Old action',
      cta_link: '/customer/old',
      target_audience: 'all',
      start_date: new Date('2026-09-01T00:00:00.000Z'),
      end_date: new Date('2026-09-30T00:00:00.000Z'),
      is_active: false,
      display_order: 0,
      created_by: 'admin-1',
      created_at: new Date('2026-08-01T00:00:00.000Z'),
      updated_at: new Date('2026-08-01T00:00:00.000Z'),
    }] })
    .mockResolvedValueOnce({ rows: [{ id: 'promotion-1', title: 'Existing banner' }] })
    .mockResolvedValueOnce({ rows: [] });

  await updatePromotion('promotion-1', {
    subtitle: null,
    imageUrl: null,
    badge: null,
    ctaText: null,
    ctaLink: null,
    endDate: null,
    updatedByAdminId: 'super-admin-1',
  });

  const updateCall = queryMock.mock.calls.find(([sql]) => /UPDATE promotions SET/.test(sql as string));
  expect(updateCall).toBeDefined();
  expect(updateCall?.[1]).toEqual([
    'promotion-1',
    'Existing banner',
    null,
    null,
    null,
    null,
    null,
    'all',
    new Date('2026-09-01T00:00:00.000Z'),
    null,
    false,
    0,
  ]);
});
