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
  listAllowedMarketingChannels,
  listCampaigns,
} from '../src/services/marketing-admin.service';

it('MED-N29 - changing marketing_channels changes new campaign choices without hiding historical filters', async () => {
  mockDbQuery
    .mockResolvedValueOnce({ rows: [{ cnt: '1' }], rowCount: 1 })
    .mockResolvedValueOnce({
      rows: [{
        id: 'campaign-med-n29',
        name: 'TikTok Cebu launch',
        channel: 'tiktok_ads',
        started_at: new Date('2026-09-01T00:00:00.000Z'),
        ended_at: null,
        spend_centavos: '500000',
        attributed_signups: 10,
        attributed_first_bookings: 4,
        attributed_revenue_centavos: '700000',
        notes: null,
        created_at: new Date('2026-09-01T00:00:00.000Z'),
      }],
      rowCount: 1,
    });

  const customChannelResult = await listCampaigns({ channel: 'tiktok_ads' });

  expect(customChannelResult.rows[0]?.channel).toBe('tiktok_ads');
  expect(mockGetSetting).not.toHaveBeenCalled();
  expect(mockDbQuery).toHaveBeenNthCalledWith(
    1,
    expect.stringMatching(/FROM marketing_campaigns WHERE channel = \$1/),
    ['tiktok_ads'],
  );
  expect(mockDbQuery).toHaveBeenNthCalledWith(
    2,
    expect.stringMatching(/FROM marketing_campaigns[\s\S]*WHERE channel = \$1/),
    ['tiktok_ads'],
  );

  mockGetSetting.mockResolvedValueOnce('not valid JSON');
  await expect(listAllowedMarketingChannels()).resolves.toEqual([
    'facebook_ads',
    'google_ads',
    'billboard',
    'kiosk',
    'influencer',
    'sms',
    'email',
    'referral',
    'other',
  ]);
  expect(mockGetSetting).toHaveBeenCalledWith('marketing_channels');
});
