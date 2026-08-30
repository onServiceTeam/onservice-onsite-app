const transactionMock = jest.fn();
const notificationMock = jest.fn().mockResolvedValue({ id: 'notification-1' });

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: (...args: unknown[]) => transactionMock(...args) },
}));
jest.mock('../src/services/notification.service', () => ({
  createPushNotification: (...args: unknown[]) => notificationMock(...args),
}));

import { reviewProviderCertification } from '../src/services/provider-admin.service';

it('Bug UX-462 — removing certification verification writes the evidence snapshot and reason in the same transaction', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  transactionMock.mockImplementationOnce(async (callback: (client: {
    query: (sql: string, params?: unknown[]) => Promise<unknown>;
  }) => Promise<unknown>) => callback({
    query: async (sql: string, params: unknown[] = []): Promise<unknown> => {
      calls.push({ sql, params });
      if (sql.includes('FOR UPDATE')) {
        return { rows: [{
          id: 'cert-1', provider_id: 'provider-1', owner_user_id: 'user-1',
          name: 'Electrical Installation NC II', issuing_body: 'TESDA', certificate_number: '42',
          certificate_url: 'private/cert.jpg', issued_date: '2025-01-01', expiry_date: '2030-01-01',
          is_verified: true, verified_at: new Date('2026-08-01T00:00:00.000Z'),
          created_at: new Date('2025-01-01T00:00:00.000Z'),
        }], rowCount: 1 };
      }
      if (sql.startsWith('UPDATE provider_certifications')) {
        return { rows: [{
          id: 'cert-1', provider_id: 'provider-1', name: 'Electrical Installation NC II',
          issuing_body: 'TESDA', certificate_number: '42', certificate_url: 'private/cert.jpg',
          issued_date: '2025-01-01', expiry_date: '2030-01-01', is_verified: false,
          verified_at: null, created_at: new Date('2025-01-01T00:00:00.000Z'),
        }], rowCount: 1 };
      }
      return { rows: [{ id: 'audit-1' }], rowCount: 1 };
    },
  }));

  await reviewProviderCertification({
    providerId: 'provider-1', certId: 'cert-1', adminId: 'admin-1', isVerified: false,
    reason: 'Certificate was revoked by the issuing body.',
  });

  expect(transactionMock).toHaveBeenCalledTimes(1);
  const audit = calls.find((call) => call.sql.includes('INSERT INTO admin_actions'));
  expect(audit?.sql).toContain("'provider_certification'");
  expect(audit?.params).toEqual(expect.arrayContaining([
    'admin-1', 'provider_certification_unverified', 'cert-1',
    'Certificate was revoked by the issuing body.',
  ]));
  expect(notificationMock).toHaveBeenCalledWith(expect.objectContaining({
    userId: 'user-1', type: 'provider_certification_unverified',
  }));
});
