jest.mock('../src/models/db', () => ({ db: { query: jest.fn(), transaction: jest.fn() } }));

import { formatDateKey, formatCertification } from '../src/services/provider.service';

it('Bug UX-092 — certification responses serialize database dates as stable YYYY-MM-DD values without exposing the private storage URL', () => {
  expect(formatDateKey(new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-01-01');
  expect(formatDateKey('2027-03-15T00:00:00.000Z')).toBe('2027-03-15');

  const formatted = formatCertification({
    id: 'cert-1', provider_id: 'provider-1', name: 'NC II', issuing_body: 'TESDA',
    certificate_number: '42', certificate_url: 'https://private.example/onboarding/u/cert.jpg',
    issued_date: new Date('2026-01-01T00:00:00.000Z'), expiry_date: '2027-03-15T00:00:00.000Z',
    is_verified: false, verified_at: null, is_active: true,
    created_at: new Date('2026-01-01T00:00:00.000Z'), updated_at: new Date('2026-01-01T00:00:00.000Z'),
  });
  expect(formatted).toMatchObject({
    issuedDate: '2026-01-01',
    expiryDate: '2027-03-15',
    hasDocument: true,
    documentUrl: '/api/v1/providers/me/certifications/cert-1/document',
  });
  expect(formatted).not.toHaveProperty('certificateUrl');
});
