const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getCurrentBusinessTermsForMember } from '../src/services/business-control.service';

it('Bug OPS-343 — current commercial terms enforce the member invoice-view permission before reading terms', async () => {
  queryMock.mockResolvedValueOnce({
    rows: [{ role: 'member', can_view_invoices: false }],
    rowCount: 1,
  });

  await expect(getCurrentBusinessTermsForMember('business-343', 'member-343'))
    .rejects.toMatchObject({ statusCode: 403 });
  expect(queryMock).toHaveBeenCalledTimes(1);
});
