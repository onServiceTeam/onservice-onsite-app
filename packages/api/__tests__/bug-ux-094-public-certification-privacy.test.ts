const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));

import { formatPublicCertification, getPublicCertifications } from '../src/services/provider.service';

it('Bug UX-094 — customer certification discovery selects only current verified records and never returns document or certificate-number data', async () => {
  const row = {
    id: 'cert-1', provider_id: 'provider-1', name: 'NC II', issuing_body: 'TESDA',
    certificate_number: 'PRIVATE-42', certificate_url: 'https://private.example/onboarding/u/cert.jpg',
    issued_date: '2025-01-01', expiry_date: '2030-01-01', is_verified: true,
    verified_at: new Date('2026-01-01T00:00:00Z'), is_active: true,
    created_at: new Date('2025-01-01T00:00:00Z'), updated_at: new Date('2026-01-01T00:00:00Z'),
  };
  dbQueryMock.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

  const records = await getPublicCertifications('provider-1');
  const sql = dbQueryMock.mock.calls[0]?.[0] as string;
  expect(sql).toMatch(/is_verified = TRUE/);
  expect(sql).toMatch(/expiry_date IS NULL OR expiry_date >=/);

  const output = formatPublicCertification(records[0]!);
  expect(output).toMatchObject({ name: 'NC II', issuingBody: 'TESDA', isVerified: true });
  expect(output).not.toHaveProperty('certificateNumber');
  expect(output).not.toHaveProperty('certificateUrl');
  expect(output).not.toHaveProperty('documentUrl');
});
