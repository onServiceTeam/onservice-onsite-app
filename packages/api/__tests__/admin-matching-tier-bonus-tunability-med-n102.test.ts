const mockDbQuery = jest.fn();
const mockGetSetting = jest.fn();
const mockGetSettingNumber = jest.fn();
const mockGetSettingInteger = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => mockDbQuery(...args),
    transaction: jest.fn(),
  },
}));
jest.mock('../src/services/settings.service', () => ({
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
  getSettingNumber: (...args: unknown[]) => mockGetSettingNumber(...args),
  getSettingInteger: (...args: unknown[]) => mockGetSettingInteger(...args),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  findMatchingProviders,
  findMatchingProvidersSimple,
} from '../src/services/matching.service';

const candidates = [
  {
    provider_id: 'founding-provider-med-n102',
    user_id: 'founding-user-med-n102',
    business_name: 'Founding Provider',
    tier: 'founding',
    rating: 4.5,
    total_jobs: 20,
    total_reviews: 10,
    service_radius_km: 20,
    latitude: '10.3157',
    longitude: '123.8854',
    distance_km: 5,
  },
  {
    provider_id: 'new-provider-med-n102',
    user_id: 'new-user-med-n102',
    business_name: 'New Provider',
    tier: 'new',
    rating: 4.5,
    total_jobs: 20,
    total_reviews: 10,
    service_radius_km: 20,
    latitude: '10.3157',
    longitude: '123.8854',
    distance_km: 5,
  },
];

it('MED-N102 - operator tier bonuses change both matching paths and unreadable settings use canonical defaults', async () => {
  mockDbQuery.mockImplementation(async (sql: string) => {
    if (/FROM providers p/.test(sql)) return { rows: candidates, rowCount: candidates.length };
    if (/FROM booking_offers/.test(sql)) return { rows: [], rowCount: 0 };
    throw new Error(`Unexpected matching query: ${sql}`);
  });
  mockGetSettingNumber.mockResolvedValue(2.5);
  mockGetSettingInteger.mockResolvedValue(5);
  const operatorWeights = JSON.stringify({
    founding: -5,
    new: 5,
    verified: 0,
    pro: 0,
    elite: 0,
  });
  mockGetSetting
    .mockResolvedValueOnce(operatorWeights)
    .mockResolvedValueOnce(operatorWeights)
    .mockResolvedValueOnce('not valid JSON');
  const scheduledAt = new Date('2026-09-02T02:00:00.000Z');

  const fullRanked = await findMatchingProviders(
    'category-med-n102',
    null,
    10.3157,
    123.8854,
    scheduledAt,
  );
  const simpleRanked = await findMatchingProvidersSimple(
    'category-med-n102',
    10.3157,
    123.8854,
    scheduledAt,
  );

  expect(fullRanked.map(({ providerId }) => providerId)).toEqual([
    'new-provider-med-n102',
    'founding-provider-med-n102',
  ]);
  expect(simpleRanked.map(({ providerId }) => providerId)).toEqual([
    'new-provider-med-n102',
    'founding-provider-med-n102',
  ]);
  expect(mockGetSetting).toHaveBeenNthCalledWith(1, 'matching_tier_bonus');
  expect(mockGetSetting).toHaveBeenNthCalledWith(2, 'matching_tier_bonus');

  const fallbackRanked = await findMatchingProvidersSimple(
    'category-med-n102',
    10.3157,
    123.8854,
    scheduledAt,
  );
  expect(fallbackRanked.map(({ providerId }) => providerId)).toEqual([
    'founding-provider-med-n102',
    'new-provider-med-n102',
  ]);
});
