// Phase K MED-K07 — backend providerApplicationSchema + service accept
// optional nbiExpiryDate + governmentIdNumber. The 42703 fallback in
// createProviderApplication keeps the route working on deployments
// where mig 115 hasn't been applied yet.

const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: (c: unknown) => unknown) =>
      cb({ query: (...a: unknown[]) => dbQueryMock(...a) }),
  },
}));

import { providerApplicationSchema } from '../src/validators/provider.validators';
import * as svc from '../src/services/provider.service';

beforeEach(() => {
  dbQueryMock.mockReset();
});

const VALID_BASE = {
  businessName: 'Cleaning Co',
  categoryIds: ['11111111-1111-4111-8111-111111111111'],
  serviceRadiusKm: 10,
  latitude: 11.9685,
  longitude: 121.9162,
  city: 'Boracay',
  province: 'Aklan',
  governmentIdFrontUrl: 'https://x/front.jpg',
  governmentIdBackUrl: 'https://x/back.jpg',
  nbiClearanceUrl: 'https://x/nbi.jpg',
  selfieUrl: 'https://x/selfie.jpg',
  icAgreementAccepted: true as const,
};

describe('Phase K MED-K07 — providerApplicationSchema accepts optional fields', () => {
  it('K07 — base shape (no new fields) still validates', () => {
    const r = providerApplicationSchema.safeParse(VALID_BASE);
    if (!r.success) {
      // Surface the issues for diagnosis if this ever regresses.
      throw new Error('VALID_BASE failed: ' + JSON.stringify(r.error.issues));
    }
    expect(r.success).toBe(true);
  });
  it('K07 — accepts nbiExpiryDate in YYYY-MM-DD format', () => {
    const r = providerApplicationSchema.safeParse({ ...VALID_BASE, nbiExpiryDate: '2027-01-15' });
    expect(r.success).toBe(true);
  });
  it('K07 — rejects nbiExpiryDate in wrong format', () => {
    const r = providerApplicationSchema.safeParse({ ...VALID_BASE, nbiExpiryDate: '15/01/2027' });
    expect(r.success).toBe(false);
  });
  it('K07 — accepts governmentIdNumber as a non-empty string', () => {
    const r = providerApplicationSchema.safeParse({ ...VALID_BASE, governmentIdNumber: 'AB-12345-678' });
    expect(r.success).toBe(true);
  });
  it('K07 — rejects empty governmentIdNumber', () => {
    const r = providerApplicationSchema.safeParse({ ...VALID_BASE, governmentIdNumber: '' });
    expect(r.success).toBe(false);
  });
  it('K07 — rejects governmentIdNumber over 64 chars', () => {
    const r = providerApplicationSchema.safeParse({ ...VALID_BASE, governmentIdNumber: 'A'.repeat(65) });
    expect(r.success).toBe(false);
  });
});

describe('Phase K MED-K07 — createProviderApplication persists optional fields', () => {
  const USER_ID = '22222222-2222-2222-2222-222222222222';
  const PROVIDER_ID = '11111111-1111-1111-1111-111111111111';
  const BASE_INPUT = {
    businessName: 'Cleaning Co',
    categoryIds: ['33333333-3333-3333-3333-333333333333'],
    serviceRadiusKm: 10,
    latitude: 11.9685,
    longitude: 121.9162,
    city: 'Boracay',
    province: 'Aklan',
    governmentIdFrontUrl: 'https://x/front.jpg',
    governmentIdBackUrl: 'https://x/back.jpg',
    nbiClearanceUrl: 'https://x/nbi.jpg',
    selfieUrl: 'https://x/selfie.jpg',
  };

  it('K07 — INSERT carries nbi_expiry_date + government_id_number when provided', async () => {
    // existence check returns empty (no prior application)
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // role flip
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // INSERT returns provider row
    dbQueryMock.mockResolvedValueOnce({ rows: [{ id: PROVIDER_ID }], rowCount: 1 });
    // provider_services insert
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await svc.createProviderApplication(USER_ID, {
      ...BASE_INPUT,
      nbiExpiryDate: '2027-01-15',
      governmentIdNumber: 'AB-12345-678',
    });

    // The 3rd call is the providers INSERT (after existence + role flip).
    const insertCall = dbQueryMock.mock.calls[2]!;
    const sql = insertCall[0] as string;
    const params = insertCall[1] as unknown[];
    expect(sql).toMatch(/nbi_expiry_date/);
    expect(sql).toMatch(/government_id_number/);
    expect(params).toContain('2027-01-15');
    expect(params).toContain('AB-12345-678');
  });

  it('K07 — INSERT passes null for missing optional fields', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    dbQueryMock.mockResolvedValueOnce({ rows: [{ id: PROVIDER_ID }], rowCount: 1 });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await svc.createProviderApplication(USER_ID, BASE_INPUT);

    const insertCall = dbQueryMock.mock.calls[2]!;
    const params = insertCall[1] as unknown[];
    // nbi_expiry_date + government_id_number params are at positions 11 + 12.
    expect(params[11]).toBeNull();
    expect(params[12]).toBeNull();
  });

  it('K07 — falls back to legacy 11-column INSERT on 42703 (column missing)', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // First INSERT throws 42703
    const err = new Error('column "nbi_expiry_date" does not exist') as Error & { code: string };
    err.code = '42703';
    dbQueryMock.mockRejectedValueOnce(err);
    // Retry succeeds
    dbQueryMock.mockResolvedValueOnce({ rows: [{ id: PROVIDER_ID }], rowCount: 1 });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await svc.createProviderApplication(USER_ID, {
      ...BASE_INPUT,
      nbiExpiryDate: '2027-01-15',
      governmentIdNumber: 'X',
    });

    // Verify a retry happened (4 inserts total: existence, role, INSERT-fail,
    // INSERT-legacy, provider_services).
    expect(dbQueryMock.mock.calls.length).toBeGreaterThanOrEqual(4);
    const retryCall = dbQueryMock.mock.calls[3]!;
    const retrySql = retryCall[0] as string;
    expect(retrySql).not.toMatch(/nbi_expiry_date/);
    expect(retrySql).not.toMatch(/government_id_number/);
  });
});
