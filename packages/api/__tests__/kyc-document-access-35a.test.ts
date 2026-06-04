// §35a — KYC documents (gov ID, NBI, selfie) are NPC personal data and must be
// reachable only by the owning provider or an admin/super_admin/dpo, served
// server-side (never a bare URL). These tests cover the authorization gate and
// the object-key extraction that lets the proxy read from the private bucket.

const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: (...a: unknown[]) => dbQueryMock(...a) } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const getObjectStreamMock = jest.fn();
const getKycPresignedUrlMock = jest.fn();
jest.mock('../src/services/upload.service', () => {
  // Keep the real extractObjectKey (pure helper under test); stub only the
  // S3/FS read + presign so no network/disk is touched.
  const actual = jest.requireActual('../src/services/upload.service');
  return {
    ...actual,
    getObjectStream: (...a: unknown[]) => getObjectStreamMock(...a),
    getKycPresignedUrl: (...a: unknown[]) => getKycPresignedUrlMock(...a),
  };
});

import {
  getProviderKycDocumentStream,
  getProviderKycPresignedUrl,
  isKycDocType,
  kycProxyPath,
} from '../src/services/kyc-document.service';
import { extractObjectKey } from '../src/services/upload.service';

const PROVIDER_ROW = {
  id: 'prov-1',
  user_id: 'owner-user',
  government_id_front_url: 'https://cdn.example.com/identity/owner-user/abc.jpg',
  government_id_back_url: null,
  nbi_clearance_url: 'https://cdn.example.com/onboarding/owner-user/nbi.jpg',
  selfie_url: null,
};

beforeEach(() => {
  dbQueryMock.mockReset();
  getObjectStreamMock.mockReset();
  getObjectStreamMock.mockResolvedValue({ body: {}, contentType: 'image/jpeg' });
  getKycPresignedUrlMock.mockReset();
});

describe('§35a — KYC document authorization', () => {
  it('lets the owning provider read their own document', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [PROVIDER_ROW] });
    await expect(
      getProviderKycDocumentStream({ providerId: 'prov-1', docType: 'nbi_clearance', requesterUserId: 'owner-user', requesterRole: 'provider' }),
    ).resolves.toBeTruthy();
    expect(getObjectStreamMock).toHaveBeenCalledWith(PROVIDER_ROW.nbi_clearance_url);
  });

  it('lets an admin read any provider document', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [PROVIDER_ROW] });
    await expect(
      getProviderKycDocumentStream({ providerId: 'prov-1', docType: 'government_id_front', requesterUserId: 'some-admin', requesterRole: 'admin' }),
    ).resolves.toBeTruthy();
  });

  it('DENIES a different provider (403) and never reads the object', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [PROVIDER_ROW] });
    await expect(
      getProviderKycDocumentStream({ providerId: 'prov-1', docType: 'nbi_clearance', requesterUserId: 'attacker-user', requesterRole: 'provider' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(getObjectStreamMock).not.toHaveBeenCalled();
  });

  it('DENIES a customer (403)', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [PROVIDER_ROW] });
    await expect(
      getProviderKycDocumentStream({ providerId: 'prov-1', docType: 'nbi_clearance', requesterUserId: 'cust', requesterRole: 'customer' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('returns 404 when the requested document field is empty', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [PROVIDER_ROW] });
    await expect(
      getProviderKycDocumentStream({ providerId: 'prov-1', docType: 'selfie', requesterUserId: 'owner-user', requesterRole: 'provider' }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(getObjectStreamMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the provider does not exist', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [] });
    await expect(
      getProviderKycDocumentStream({ providerId: 'nope', docType: 'nbi_clearance', requesterUserId: 'x', requesterRole: 'admin' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('§35a — presigned-URL option', () => {
  it('enforces the SAME authorization before minting a link (other provider → 403)', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [PROVIDER_ROW] });
    await expect(
      getProviderKycPresignedUrl({ providerId: 'prov-1', docType: 'nbi_clearance', requesterUserId: 'attacker', requesterRole: 'provider' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(getKycPresignedUrlMock).not.toHaveBeenCalled();
  });

  it('returns a signed url + expiry for an authorized requester', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [PROVIDER_ROW] });
    getKycPresignedUrlMock.mockResolvedValueOnce('https://spaces/signed?sig=abc');
    const res = await getProviderKycPresignedUrl({ providerId: 'prov-1', docType: 'nbi_clearance', requesterUserId: 'owner-user', requesterRole: 'provider', expiresInSeconds: 90 });
    expect(res).toEqual({ url: 'https://spaces/signed?sig=abc', expiresInSeconds: 90 });
    expect(getKycPresignedUrlMock).toHaveBeenCalledWith(PROVIDER_ROW.nbi_clearance_url, 90);
  });

  it('returns null when storage cannot presign (dev/local) so caller falls back to streaming', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [PROVIDER_ROW] });
    getKycPresignedUrlMock.mockResolvedValueOnce(null);
    const res = await getProviderKycPresignedUrl({ providerId: 'prov-1', docType: 'nbi_clearance', requesterUserId: 'owner-user', requesterRole: 'admin' });
    expect(res).toBeNull();
  });
});

describe('§35a — docType validation + proxy paths', () => {
  it('accepts the four KYC doc types and rejects others', () => {
    expect(isKycDocType('nbi_clearance')).toBe(true);
    expect(isKycDocType('government_id_front')).toBe(true);
    expect(isKycDocType('government_id_back')).toBe(true);
    expect(isKycDocType('selfie')).toBe(true);
    expect(isKycDocType('passport')).toBe(false);
    expect(isKycDocType('../../etc/passwd')).toBe(false);
  });

  it('builds owner + admin proxy paths', () => {
    expect(kycProxyPath('me', 'nbi_clearance')).toBe('/api/v1/providers/me/kyc/nbi_clearance');
    expect(kycProxyPath('admin', 'selfie', 'prov-9')).toBe('/api/v1/admin/providers/prov-9/kyc/selfie');
  });
});

describe('§35a — extractObjectKey', () => {
  it('strips scheme+host from a full CDN URL', () => {
    expect(extractObjectKey('https://cdn.example.com/identity/u1/abc.jpg')).toBe('identity/u1/abc.jpg');
  });
  it('passes through a bare key', () => {
    expect(extractObjectKey('onboarding/u1/nbi.jpg')).toBe('onboarding/u1/nbi.jpg');
  });
  it('strips the local UPLOAD_BASE_URL path prefix (no stray uploads/ segment)', () => {
    // Local-FS backend: stored URL is <base>/<key>; key must NOT include the
    // /uploads path component or the on-disk lookup would miss.
    expect(extractObjectKey('http://localhost:7381/uploads/onboarding/u1/nbi.jpg'))
      .toBe('onboarding/u1/nbi.jpg');
  });
  it('drops query strings and leading slashes', () => {
    expect(extractObjectKey('/identity/u1/abc.jpg?sig=xyz')).toBe('identity/u1/abc.jpg');
  });
  it('refuses path traversal', () => {
    expect(extractObjectKey('https://cdn.example.com/../../secret')).toBeNull();
  });
  it('returns null for empty input', () => {
    expect(extractObjectKey(null)).toBeNull();
    expect(extractObjectKey('')).toBeNull();
  });
});
