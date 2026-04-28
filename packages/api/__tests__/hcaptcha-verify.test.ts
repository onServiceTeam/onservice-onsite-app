import { verifyHCaptchaToken } from '../src/utils/hcaptcha';

const ORIGINAL_SECRET = process.env.HCAPTCHA_SECRET;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  jest.restoreAllMocks();
  if (ORIGINAL_SECRET === undefined) delete process.env.HCAPTCHA_SECRET;
  else process.env.HCAPTCHA_SECRET = ORIGINAL_SECRET;
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

function mockFetchOnce(body: unknown, ok = true): jest.SpyInstance {
  const fakeResponse = { ok, json: async (): Promise<unknown> => body } as Response;
  return jest.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse);
}

function mockFetchReject(err: Error): jest.SpyInstance {
  return jest.spyOn(globalThis, 'fetch').mockRejectedValue(err);
}

describe('verifyHCaptchaToken', () => {
  it('returns failure with missing-token when token empty (secret set)', async () => {
    process.env.HCAPTCHA_SECRET = 'test-secret';
    const r = await verifyHCaptchaToken('');
    expect(r.success).toBe(false);
    expect(r.errorCodes).toEqual(['missing-token']);
  });

  it('returns success when hCaptcha responds success:true', async () => {
    process.env.HCAPTCHA_SECRET = 'test-secret';
    mockFetchOnce({ success: true });
    const r = await verifyHCaptchaToken('valid-token');
    expect(r.success).toBe(true);
  });

  it('returns failure with codes when hCaptcha responds success:false', async () => {
    process.env.HCAPTCHA_SECRET = 'test-secret';
    mockFetchOnce({ success: false, 'error-codes': ['invalid-input-response'] });
    const r = await verifyHCaptchaToken('bad-token');
    expect(r.success).toBe(false);
    expect(r.errorCodes).toEqual(['invalid-input-response']);
  });

  it('returns failure with network-error when fetch throws', async () => {
    process.env.HCAPTCHA_SECRET = 'test-secret';
    mockFetchReject(new Error('network down'));
    const r = await verifyHCaptchaToken('any-token');
    expect(r.success).toBe(false);
    expect(r.errorCodes).toEqual(['network-error']);
  });

  it('bypasses (success:true) when secret missing in non-production', async () => {
    delete process.env.HCAPTCHA_SECRET;
    process.env.NODE_ENV = 'test';
    const r = await verifyHCaptchaToken('any-token');
    expect(r.success).toBe(true);
  });

  it('fails closed when secret missing in production', async () => {
    delete process.env.HCAPTCHA_SECRET;
    process.env.NODE_ENV = 'production';
    const r = await verifyHCaptchaToken('any-token');
    expect(r.success).toBe(false);
    expect(r.errorCodes).toEqual(['missing-secret']);
  });
});
