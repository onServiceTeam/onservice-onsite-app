const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: queryMock },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { updateCampaign } from '../src/services/marketing-admin.service';

it('Bug OPS-373 — every service caller is blocked from replacing campaign attribution without an adjustment ledger', async () => {
  await expect(updateCampaign('campaign-1', {
    attributedSignups: 20,
    attributedFirstBookings: 8,
    attributedRevenueCentavos: 250_000,
  }, 'super-admin-1')).rejects.toMatchObject({
    statusCode: 400,
    message: expect.stringMatching(/cannot be overwritten.*evidence-backed adjustment/i),
  });

  expect(queryMock).not.toHaveBeenCalled();
});
