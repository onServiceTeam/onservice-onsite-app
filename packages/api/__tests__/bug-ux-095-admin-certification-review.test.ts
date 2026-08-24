const transactionMock = jest.fn();
const notificationMock = jest.fn().mockResolvedValue({ id: 'notification-1' });

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: (...args: unknown[]) => transactionMock(...args) },
}));
jest.mock('../src/services/notification.service', () => ({
  createPushNotification: (...args: unknown[]) => notificationMock(...args),
}));

import { reviewProviderCertification } from '../src/services/provider-admin.service';

it('Bug UX-095 — admin certification review locks the provider-scoped record, requires evidence, and notifies the provider after verification', async () => {
  transactionMock.mockImplementationOnce(async (callback: (client: { query: () => Promise<unknown> }) => Promise<unknown>) => callback({
    query: async () => ({ rows: [{
      id: 'cert-no-document', provider_id: 'provider-1', owner_user_id: 'user-1',
      name: 'NC II', issuing_body: 'TESDA', certificate_number: null, certificate_url: null,
      issued_date: '2025-01-01', expiry_date: '2030-01-01', is_verified: false,
      verified_at: null, created_at: new Date('2025-01-01T00:00:00Z'),
    }], rowCount: 1 }),
  }));
  await expect(reviewProviderCertification({
    providerId: 'provider-1', certId: 'cert-no-document', adminId: 'admin-1', isVerified: true,
  })).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/document is required/i) });
  expect(notificationMock).not.toHaveBeenCalled();

  const calls: Array<{ sql: string; params: unknown[] }> = [];
  transactionMock.mockImplementation(async (callback: (client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) => Promise<unknown>) => {
    const query = async (sql: string, params: unknown[] = []): Promise<unknown> => {
      calls.push({ sql, params });
      if (sql.includes('FOR UPDATE')) {
        return { rows: [{
          id: 'cert-1', provider_id: 'provider-1', owner_user_id: 'user-1',
          name: 'NC II', issuing_body: 'TESDA', certificate_number: '42',
          certificate_url: 'https://private.example/onboarding/u/cert.jpg',
          issued_date: '2025-01-01', expiry_date: '2030-01-01', is_verified: false,
          verified_at: null, created_at: new Date('2025-01-01T00:00:00Z'),
        }], rowCount: 1 };
      }
      return { rows: [{
        id: 'cert-1', provider_id: 'provider-1', name: 'NC II', issuing_body: 'TESDA',
        certificate_number: '42', certificate_url: 'https://private.example/onboarding/u/cert.jpg',
        issued_date: '2025-01-01', expiry_date: '2030-01-01', is_verified: true,
        verified_at: new Date('2026-08-24T00:00:00Z'), created_at: new Date('2025-01-01T00:00:00Z'),
      }], rowCount: 1 };
    };
    return callback({ query });
  });

  const result = await reviewProviderCertification({
    providerId: 'provider-1', certId: 'cert-1', adminId: 'admin-1', isVerified: true,
  });
  expect(result).toMatchObject({ id: 'cert-1', isVerified: true, hasDocument: true });
  expect(calls[0]?.sql).toMatch(/provider_id = \$2/);
  expect(calls[0]?.sql).toMatch(/FOR UPDATE/);
  expect(calls[1]?.sql).toMatch(/verified_by = CASE WHEN \$1 THEN \$2/);
  expect(notificationMock).toHaveBeenCalledWith(expect.objectContaining({
    userId: 'user-1',
    type: 'provider_certification_verified',
  }));
});
