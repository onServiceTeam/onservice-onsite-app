// Phase K MED-K07 — backend providerApplicationSchema + service accept
// optional nbiExpiryDate + governmentIdNumber. OPS-483 removed the invalid
// 42703 fallback: real PostgreSQL aborts that transaction, and silently
// dropping evidence is not compatible submission behavior.

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
  const SERVICE_AREA_ID = '44444444-4444-4444-8444-444444444444';
  const APPLICATION_AREA = {
    id: SERVICE_AREA_ID,
    name: 'Boracay',
    city: 'Boracay',
    province: 'Aklan',
    status: 'active',
    center_lat: '11.9685',
    center_lng: '121.9162',
    radius_km: 25,
  };
  const BASE_INPUT = {
    businessName: 'Cleaning Co',
    categoryIds: ['33333333-3333-3333-3333-333333333333'],
    serviceAreaId: SERVICE_AREA_ID,
    serviceRadiusKm: 10,
    latitude: 11.9685,
    longitude: 121.9162,
    city: 'Boracay',
    province: 'Aklan',
    governmentIdFrontUrl: `https://x/onboarding/${USER_ID}/front.jpg`,
    governmentIdBackUrl: `https://x/onboarding/${USER_ID}/back.jpg`,
    nbiClearanceUrl: `https://x/onboarding/${USER_ID}/nbi.jpg`,
    selfieUrl: `https://x/onboarding/${USER_ID}/selfie.jpg`,
  };

  it('K07 — INSERT carries nbi_expiry_date + government_id_number when provided', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [{ role: 'customer', is_active: true, is_flagged_fraud: false }], rowCount: 1 });
    // existence check returns empty (no prior application)
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // selected provider market contains the exact operating location
    dbQueryMock.mockResolvedValueOnce({ rows: [APPLICATION_AREA], rowCount: 1 });
    dbQueryMock.mockResolvedValueOnce({ rows: [{ id: BASE_INPUT.categoryIds[0] }], rowCount: 1 });
    // INSERT returns provider row
    dbQueryMock.mockResolvedValueOnce({ rows: [{ id: PROVIDER_ID }], rowCount: 1 });
    // provider_service_areas insert
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // provider_services insert
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await svc.createProviderApplication(USER_ID, {
      ...BASE_INPUT,
      nbiExpiryDate: '2027-01-15',
      governmentIdNumber: 'AB-12345-678',
    });

    const insertCall = dbQueryMock.mock.calls.find(call => /INSERT INTO providers/.test(String(call[0])))!;
    const sql = insertCall[0] as string;
    const params = insertCall[1] as unknown[];
    expect(sql).toMatch(/nbi_expiry_date/);
    expect(sql).toMatch(/government_id_number/);
    expect(params).toContain('2027-01-15');
    expect(params).toContain('AB-12345-678');
  });

  it('K07 — INSERT passes null for missing optional fields', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [{ role: 'customer', is_active: true, is_flagged_fraud: false }], rowCount: 1 });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    dbQueryMock.mockResolvedValueOnce({ rows: [APPLICATION_AREA], rowCount: 1 });
    dbQueryMock.mockResolvedValueOnce({ rows: [{ id: BASE_INPUT.categoryIds[0] }], rowCount: 1 });
    dbQueryMock.mockResolvedValueOnce({ rows: [{ id: PROVIDER_ID }], rowCount: 1 });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await svc.createProviderApplication(USER_ID, BASE_INPUT);

    const insertCall = dbQueryMock.mock.calls.find(call => /INSERT INTO providers/.test(String(call[0])))!;
    const params = insertCall[1] as unknown[];
    // nbi_expiry_date + government_id_number params are at positions 11 + 12.
    expect(params[11]).toBeNull();
    expect(params[12]).toBeNull();
  });

  it('K07 — reports schema unavailability instead of retrying without optional evidence', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [{ role: 'customer', is_active: true, is_flagged_fraud: false }], rowCount: 1 });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    dbQueryMock.mockResolvedValueOnce({ rows: [APPLICATION_AREA], rowCount: 1 });
    dbQueryMock.mockResolvedValueOnce({ rows: [{ id: BASE_INPUT.categoryIds[0] }], rowCount: 1 });
    // First INSERT throws 42703
    const err = new Error('column "nbi_expiry_date" does not exist') as Error & { code: string };
    err.code = '42703';
    dbQueryMock.mockRejectedValueOnce(err);
    await expect(svc.createProviderApplication(USER_ID, {
      ...BASE_INPUT,
      nbiExpiryDate: '2027-01-15',
      governmentIdNumber: 'X',
    })).rejects.toMatchObject({ statusCode: 503, code: 'provider_application_schema_unavailable' });
    expect(dbQueryMock.mock.calls.filter(call => /INSERT INTO providers/.test(String(call[0])))).toHaveLength(1);
  });
});
