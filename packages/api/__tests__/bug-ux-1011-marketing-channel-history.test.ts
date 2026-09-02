const mockDbQuery = jest.fn();
const mockGetSetting = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => mockDbQuery(...args),
    transaction: jest.fn(),
  },
}));
jest.mock('../src/services/settings.service', () => ({
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  createCampaign,
  listCampaigns,
  listRecordedMarketingChannels,
} from '../src/services/marketing-admin.service';

it('Bug UX-1011 — retiring a marketing channel preserves exact historical review while preventing new records', async () => {
  mockDbQuery
    .mockResolvedValueOnce({
      rows: [{ channel: 'facebook_ads' }, { channel: 'tiktok_ads' }],
      rowCount: 2,
    })
    .mockResolvedValueOnce({ rows: [{ cnt: '1' }], rowCount: 1 })
    .mockResolvedValueOnce({
      rows: [{
        id: 'campaign-history-1',
        name: 'Retired Facebook campaign',
        channel: 'facebook_ads',
        started_at: new Date('2026-08-01T00:00:00.000Z'),
        ended_at: null,
        spend_centavos: '500000',
        attributed_signups: 10,
        attributed_first_bookings: 4,
        attributed_revenue_centavos: '700000',
        notes: null,
        created_at: new Date('2026-08-01T00:00:00.000Z'),
      }],
      rowCount: 1,
    });

  await expect(listRecordedMarketingChannels()).resolves.toEqual([
    'facebook_ads',
    'tiktok_ads',
  ]);
  await expect(listCampaigns({ channel: 'facebook_ads' })).resolves.toMatchObject({
    total: 1,
    rows: [{ channel: 'facebook_ads' }],
  });
  expect(mockGetSetting).not.toHaveBeenCalled();

  mockGetSetting.mockResolvedValueOnce(JSON.stringify(['tiktok_ads']));
  await expect(createCampaign({
    name: 'Should not reuse retired channel',
    channel: 'facebook_ads',
    startedAt: '2026-09-02',
  }, 'admin-1')).rejects.toMatchObject({
    statusCode: 400,
    message: expect.stringMatching(/tiktok_ads/i),
  });
  expect(mockDbQuery).toHaveBeenCalledTimes(3);
});
