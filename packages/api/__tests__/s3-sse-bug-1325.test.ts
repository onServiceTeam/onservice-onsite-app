// Bug 1325 fix verified.
// Phase 14 Dispatch 01.
//
// Asserts that every PutObject the upload service issues to S3 carries an
// SSE header (KMS when configured, AES256 otherwise) and that the
// Terraform bucket policy denies unencrypted writes at the bucket level.

import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../');
const TF_FILE = path.join(REPO_ROOT, 'infra/terraform/s3-customer-uploads.tf');

// Capture the params the mocked S3 client is asked to put.
const putCalls: Record<string, unknown>[] = [];

class MockPutObjectCommand {
  public params: Record<string, unknown>;
  constructor(params: Record<string, unknown>) {
    this.params = params;
    putCalls.push(params);
  }
}

class MockDeleteObjectCommand {
  constructor(public params: Record<string, unknown>) {}
}

class MockS3Client {
  async send(_cmd: unknown): Promise<unknown> {
    return {};
  }
}

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: MockS3Client,
  PutObjectCommand: MockPutObjectCommand,
  DeleteObjectCommand: MockDeleteObjectCommand,
}));

beforeEach(() => {
  putCalls.length = 0;
  process.env.S3_BUCKET = 'test-bucket';
  process.env.S3_REGION = 'ap-southeast-1';
  jest.resetModules();
});

afterEach(() => {
  delete process.env.S3_BUCKET;
  delete process.env.S3_KMS_KEY_ID;
});

describe('Bug 1325 fix verified — upload service forces server-side encryption', () => {
  it('uses SSE-KMS when S3_KMS_KEY_ID is set', async () => {
    process.env.S3_KMS_KEY_ID = 'alias/onservice-uploads-test';
    const { saveUploadedFile } = await import('../src/services/upload.service');

    await saveUploadedFile(
      Buffer.from('test'),
      'photo.jpg',
      'image/jpeg',
      '11111111-1111-1111-1111-111111111111',
      'avatar',
    );

    expect(putCalls).toHaveLength(1);
    const params = putCalls[0]!;
    expect(params.ServerSideEncryption).toBe('aws:kms');
    expect(params.SSEKMSKeyId).toBe('alias/onservice-uploads-test');
    expect(params.Bucket).toBe('test-bucket');
  });

  it('falls back to SSE-S3 (AES256) when no KMS key id is provided', async () => {
    delete process.env.S3_KMS_KEY_ID;
    const { saveUploadedFile } = await import('../src/services/upload.service');

    await saveUploadedFile(
      Buffer.from('test2'),
      'photo.jpg',
      'image/jpeg',
      '22222222-2222-2222-2222-222222222222',
      'avatar',
    );

    expect(putCalls).toHaveLength(1);
    const params = putCalls[0]!;
    expect(params.ServerSideEncryption).toBe('AES256');
    expect(params.SSEKMSKeyId).toBeUndefined();
  });
});

describe('Bug 1325 fix verified — Terraform bucket policy denies unencrypted writes', () => {
  it('declares public-access block, KMS bucket-level SSE, and deny-on-no-SSE policy', () => {
    const tf = fs.readFileSync(TF_FILE, 'utf8');
    expect(tf).toMatch(/aws_s3_bucket_public_access_block/);
    expect(tf).toMatch(/block_public_acls\s*=\s*true/);
    expect(tf).toMatch(/aws_s3_bucket_server_side_encryption_configuration/);
    expect(tf).toMatch(/sse_algorithm\s*=\s*"aws:kms"/);
    expect(tf).toMatch(/DenyUnencryptedPut/);
    expect(tf).toMatch(/DenyInsecureTransport/);
    expect(tf).toMatch(/aws:SecureTransport/);
    // Deny-rule must check the SSE header.
    expect(tf).toMatch(/x-amz-server-side-encryption/);
    // Versioning enabled (rollback safety).
    expect(tf).toMatch(/aws_s3_bucket_versioning/);
    expect(tf).toMatch(/status\s*=\s*"Enabled"/);
    // Key rotation on the KMS key.
    expect(tf).toMatch(/enable_key_rotation\s*=\s*true/);
  });
});
