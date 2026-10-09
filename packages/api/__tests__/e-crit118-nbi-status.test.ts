// Phase E CRIT-118 — getProviderNbiStatus service.
//
// Pre-fix the mobile NbiStatusBanner hit /api/v1/provider/nbi-status
// which never existed; banner was effectively dead. Post-fix:
//   - new service function getProviderNbiStatus reads providers row
//   - new route GET /api/v1/providers/me/nbi-status
//   - mobile component updated to canonical URL
//
// These tests cover the service-level classification logic.

const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => (cb as (c: unknown) => unknown)({ query: (...a: unknown[]) => dbQueryMock(...a) }),
  },
}));

jest.mock('../src/services/settings.service', () => ({
  getNbiExpiryWarningDays: jest.fn(async () => 30),
}));

import * as svc from '../src/services/provider.service';

beforeEach(() => {
  dbQueryMock.mockReset();
});

const PROVIDER_ID = '11111111-1111-1111-1111-111111111111';

function rows<T>(data: T[]): { rows: T[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

describe('Phase E CRIT-118 — getProviderNbiStatus', () => {
  it('CRIT-118 — returns missing when no nbi_clearance_url', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([{ nbi_clearance_url: null, nbi_expiry_date: null }]));
    const result = await svc.getProviderNbiStatus(PROVIDER_ID);
    expect(result).toEqual({ status: 'missing', expiresAt: null });
  });

  it('CRIT-118 — returns missing when URL exists but no expiry recorded', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([{ nbi_clearance_url: 'https://x/cert.jpg', nbi_expiry_date: null }]));
    const result = await svc.getProviderNbiStatus(PROVIDER_ID);
    expect(result.status).toBe('missing');
    expect(result.expiresAt).toBeNull();
  });

  it('CRIT-118 — returns expired when expiry_date is in the past', async () => {
    const past = new Date(Date.now() - 86_400_000 * 5).toISOString().split('T')[0];
    dbQueryMock.mockResolvedValueOnce(rows([{ nbi_clearance_url: 'https://x/cert.jpg', nbi_expiry_date: past }]));
    const result = await svc.getProviderNbiStatus(PROVIDER_ID);
    expect(result.status).toBe('expired');
    expect(result.expiresAt).not.toBeNull();
  });

  it('CRIT-118 — returns expiring when within warningDays threshold (default 30)', async () => {
    const soon = new Date(Date.now() + 86_400_000 * 10).toISOString().split('T')[0];
    dbQueryMock.mockResolvedValueOnce(rows([{ nbi_clearance_url: 'https://x/cert.jpg', nbi_expiry_date: soon }]));
    const result = await svc.getProviderNbiStatus(PROVIDER_ID);
    expect(result.status).toBe('expiring');
  });

  it('CRIT-118 — returns valid when expiry well beyond threshold', async () => {
    const far = new Date(Date.now() + 86_400_000 * 365).toISOString().split('T')[0];
    dbQueryMock.mockResolvedValueOnce(rows([{ nbi_clearance_url: 'https://x/cert.jpg', nbi_expiry_date: far }]));
    const result = await svc.getProviderNbiStatus(PROVIDER_ID);
    expect(result.status).toBe('valid');
  });

  it('CRIT-118 — throws 404 when provider row not found', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await expect(svc.getProviderNbiStatus(PROVIDER_ID)).rejects.toMatchObject({
      message: expect.stringMatching(/not found/i),
    });
  });
});
