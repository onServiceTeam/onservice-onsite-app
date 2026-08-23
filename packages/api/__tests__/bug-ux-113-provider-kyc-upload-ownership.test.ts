const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { createProviderApplication } from '../src/services/provider.service';

it('BUG-UX-113 — an application rejects private KYC uploads owned by another account', async () => {
  const userId = '22222222-2222-4222-8222-222222222222';
  dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

  await expect(createProviderApplication(userId, {
    businessName: 'Cebu Home Care',
    categoryIds: ['33333333-3333-4333-8333-333333333333'],
    serviceRadiusKm: 10,
    latitude: 10.3157,
    longitude: 123.8854,
    city: 'Cebu City',
    province: 'Cebu',
    governmentIdFrontUrl: 'https://cdn.example/onboarding/another-user/front.jpg',
    governmentIdBackUrl: `https://cdn.example/onboarding/${userId}/back.jpg`,
    nbiClearanceUrl: `https://cdn.example/onboarding/${userId}/nbi.jpg`,
    selfieUrl: `https://cdn.example/onboarding/${userId}/selfie.jpg`,
  })).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/owned by this account/i) });

  expect(dbTransactionMock).not.toHaveBeenCalled();
});
