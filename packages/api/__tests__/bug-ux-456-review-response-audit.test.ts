const queryMock = jest.fn();
const transactionMock = jest.fn(async (callback: (client: { query: typeof queryMock }) => unknown) => callback({ query: queryMock }));
jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: (callback: unknown) => transactionMock(callback) },
}));
jest.mock('../src/services/settings.service', () => ({ getMaxProviderServiceRadiusKm: jest.fn() }));

import { setReviewAdminResponse } from '../src/services/provider-admin.service';

it('Bug UX-456 — a public review response stores public text separately from the private audit rationale', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{ admin_response: null }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ id: 'audit-1' }], rowCount: 1 });

  await setReviewAdminResponse(
    'provider-1', 'review-1', 'Support contacted both parties.',
    'Case OS-991 evidence was reviewed.', 'admin-1',
  );

  expect(queryMock.mock.calls[1][1]).toEqual([
    'Support contacted both parties.', 'review-1', 'provider-1',
  ]);
  expect(queryMock.mock.calls[2][0]).toContain("'review_response_updated', 'review'");
  const auditDetails = JSON.parse(queryMock.mock.calls[2][1][2] as string) as Record<string, unknown>;
  expect(auditDetails.publicResponse).toBe('Support contacted both parties.');
  expect(queryMock.mock.calls[2][1][3]).toBe('Case OS-991 evidence was reviewed.');
});
