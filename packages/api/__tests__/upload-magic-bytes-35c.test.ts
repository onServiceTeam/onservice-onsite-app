// §35c — content-sniffing (magic-byte) validation. MIME type and extension
// are client-supplied and spoofable, so saveUploadedFile inspects the actual
// leading bytes and refuses anything that isn't a genuine JPEG/PNG/WebP.

const putCalls: Record<string, unknown>[] = [];
class MockPutObjectCommand {
  constructor(public params: Record<string, unknown>) { putCalls.push(params); }
}
class MockDeleteObjectCommand { constructor(public params: Record<string, unknown>) {} }
class MockS3Client { async send(): Promise<unknown> { return {}; } }
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: MockS3Client,
  PutObjectCommand: MockPutObjectCommand,
  DeleteObjectCommand: MockDeleteObjectCommand,
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { assertImageMagicBytes } from '../src/services/upload.service';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const WEBP = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
// A script payload renamed to .jpg with a spoofed image/jpeg MIME.
const HTML = Buffer.from('<html><script>alert(1)</script></html>');

beforeEach(() => {
  putCalls.length = 0;
  process.env.S3_BUCKET = 'test-bucket';
  process.env.S3_REGION = 'ap-southeast-1';
  jest.resetModules(); // re-evaluate USE_S3 against the env set above
});
afterEach(() => { delete process.env.S3_BUCKET; });

describe('§35c — upload content sniffing', () => {
  it('accepts a genuine JPEG', () => {
    expect(() => assertImageMagicBytes(JPEG, 'image/jpeg')).not.toThrow();
  });

  it('accepts a genuine PNG', () => {
    expect(() => assertImageMagicBytes(PNG, 'image/png')).not.toThrow();
  });

  it('accepts a genuine WebP', () => {
    expect(() => assertImageMagicBytes(WEBP, 'image/webp')).not.toThrow();
  });

  it('rejects an HTML/script payload declared as image/jpeg', () => {
    expect(() => assertImageMagicBytes(HTML, 'image/jpeg')).toThrow(/not a valid image/);
  });

  it('rejects a real PNG that lies about being a JPEG (declared MIME mismatch)', () => {
    expect(() => assertImageMagicBytes(PNG, 'image/jpeg')).toThrow(/does not match its declared type/);
  });

  it('saveUploadedFile refuses a spoofed file before any S3 PutObject', async () => {
    const { saveUploadedFile } = await import('../src/services/upload.service');
    await expect(
      saveUploadedFile(HTML, 'evil.jpg', 'image/jpeg', '11111111-1111-1111-1111-111111111111', 'chat'),
    ).rejects.toThrow(/not a valid image/);
    // Critically: nothing was written to storage.
    expect(putCalls).toHaveLength(0);
  });

  it('saveUploadedFile stores a genuine image', async () => {
    const { saveUploadedFile } = await import('../src/services/upload.service');
    const result = await saveUploadedFile(PNG, 'ok.png', 'image/png', '22222222-2222-2222-2222-222222222222', 'chat');
    expect(result.mimeType).toBe('image/png');
    expect(putCalls).toHaveLength(1);
  });
});
