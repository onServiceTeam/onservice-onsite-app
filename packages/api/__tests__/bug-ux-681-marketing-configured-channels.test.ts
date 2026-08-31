jest.mock('../src/models/db', () => ({ db: { query: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/settings.service', () => ({
  getSetting: jest.fn().mockResolvedValue('["tiktok_ads","community_partnership"]'),
}));

import { listAllowedMarketingChannels } from '../src/services/marketing-admin.service';

it('Bug UX-681 — marketing administration exposes the live configured campaign channels', async () => {
  await expect(listAllowedMarketingChannels()).resolves.toEqual([
    'tiktok_ads',
    'community_partnership',
  ]);
});
