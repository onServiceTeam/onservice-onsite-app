const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: queryMock },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { updateCampaign } from '../src/services/marketing-admin.service';

it('Bug OPS-374 — campaign editing rejects an end date before the stored start date', async () => {
  queryMock.mockResolvedValueOnce({ rows: [{ valid: false }], rowCount: 1 });

  await expect(updateCampaign('campaign-1', {
    endedAt: '2026-07-31',
  }, 'super-admin-1')).rejects.toMatchObject({
    statusCode: 400,
    message: expect.stringMatching(/on or after.*startedAt/i),
  });

  expect(queryMock).toHaveBeenCalledWith(
    expect.stringMatching(/\$2::date >= started_at/),
    ['campaign-1', '2026-07-31'],
  );
  expect(queryMock).toHaveBeenCalledTimes(1);
});
