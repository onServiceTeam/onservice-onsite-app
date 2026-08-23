const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn(async (callback: (client: { query: typeof dbQueryMock }) => unknown) =>
  callback({ query: dbQueryMock }),
);
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (...args: unknown[]) => dbTransactionMock(...args as [(client: { query: typeof dbQueryMock }) => unknown]),
  },
}));

import { updateCertification } from '../src/services/provider.service';

const current = {
  id: 'cert-1', provider_id: 'provider-1', name: 'NC II', issuing_body: 'TESDA',
  certificate_number: '42', certificate_url: 'https://private.example/onboarding/u/cert.jpg',
  issued_date: '2025-01-01', expiry_date: '2030-01-01', is_verified: true,
  verified_at: new Date('2026-01-01T00:00:00Z'), is_active: true,
  created_at: new Date('2025-01-01T00:00:00Z'), updated_at: new Date('2026-01-01T00:00:00Z'),
};

it('Bug UX-093 — editing a credential validates dates against stored values and always returns changed evidence to pending review', async () => {
  dbQueryMock.mockResolvedValueOnce({ rows: [current], rowCount: 1 });
  await expect(updateCertification('provider-1', 'cert-1', { issuedDate: '2031-01-01' }))
    .rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/expiry date/i) });
  expect(dbQueryMock).toHaveBeenCalledTimes(1);
  expect(dbQueryMock.mock.calls[0]?.[0]).toMatch(/FOR UPDATE/);

  dbQueryMock.mockReset();
  dbQueryMock
    .mockResolvedValueOnce({ rows: [current], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ ...current, name: 'Updated NC II', is_verified: false, verified_at: null }], rowCount: 1 });

  const updated = await updateCertification('provider-1', 'cert-1', { name: 'Updated NC II' });
  expect(updated.is_verified).toBe(false);
  const updateSql = dbQueryMock.mock.calls[1]?.[0] as string;
  expect(updateSql).toMatch(/is_verified = FALSE/);
  expect(updateSql).toMatch(/verified_at = NULL/);
  expect(updateSql).toMatch(/verified_by = NULL/);
});
