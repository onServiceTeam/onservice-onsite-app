// MED-O03 fix verified — both S3 buckets that hold sensitive data
// (bir-receipts: 10y BIR archive, uploads: customer + provider
// photos) now have aws_s3_bucket_logging configured pointing to a
// dedicated access-log bucket.
//
// Pre-fix: a leaked AWS access key could read the entire BIR
// archive and we'd find out only via the consequence — never via
// a log. CloudTrail captures management events but data events on
// objects must be opted in explicitly, which they were not.
//
// Post-fix: shared infra/terraform/s3-access-log-bucket.tf creates
// onservice-s3-access-logs-<env> with 7-year retention, AES256
// encryption, public-access blocked, TLS-only, and a bucket policy
// granting logging.s3.amazonaws.com permission to write under
// bir-receipts/ and uploads/ prefixes.

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../../..');
const ACCESS_LOG_TF = resolve(REPO_ROOT, 'infra/terraform/s3-access-log-bucket.tf');

describe('MED-O03 — S3 server access logging', () => {
  it('s3-access-log-bucket.tf exists', () => {
    expect(existsSync(ACCESS_LOG_TF)).toBe(true);
  });

  let TF: string;
  beforeAll(() => {
    TF = readFileSync(ACCESS_LOG_TF, 'utf8');
  });

  it('declares the access-logs S3 bucket resource', () => {
    expect(TF).toMatch(/resource "aws_s3_bucket" "access_logs"/);
    // Force-destroy must be FALSE — we never want to accidentally
    // delete log archives.
    expect(TF).toMatch(/force_destroy\s*=\s*false/);
  });

  it('access-logs bucket is versioned (defense-in-depth)', () => {
    expect(TF).toMatch(/aws_s3_bucket_versioning" "access_logs"[\s\S]*?status\s*=\s*"Enabled"/);
  });

  it('access-logs bucket uses AES256 SSE (NOT KMS — would create circular dep with BIR)', () => {
    expect(TF).toMatch(/sse_algorithm\s*=\s*"AES256"/);
  });

  it('access-logs bucket blocks public access', () => {
    expect(TF).toMatch(/aws_s3_bucket_public_access_block" "access_logs"/);
    const pubBlock = TF.match(/aws_s3_bucket_public_access_block" "access_logs"[\s\S]*?\}/);
    expect(pubBlock).not.toBeNull();
    expect(pubBlock![0]).toMatch(/block_public_acls\s*=\s*true/);
    expect(pubBlock![0]).toMatch(/block_public_policy\s*=\s*true/);
    expect(pubBlock![0]).toMatch(/restrict_public_buckets\s*=\s*true/);
  });

  it('access-logs bucket has lifecycle: Glacier transition + 7-year expiration', () => {
    expect(TF).toMatch(/storage_class\s*=\s*"GLACIER"/);
    // 7y = 2555 days (covers BIR audit forensics window).
    expect(TF).toMatch(/days\s*=\s*2555/);
  });

  it('bucket policy denies non-TLS access', () => {
    expect(TF).toMatch(/Sid\s*=\s*"DenyInsecureTransport"/);
    expect(TF).toMatch(/"aws:SecureTransport"\s*=\s*"false"/);
  });

  it('bucket policy grants logging.s3.amazonaws.com permission to PutObject', () => {
    expect(TF).toMatch(/Sid\s*=\s*"AllowS3LogDelivery"/);
    expect(TF).toMatch(/Service\s*=\s*"logging\.s3\.amazonaws\.com"/);
    expect(TF).toMatch(/Action\s*=\s*"s3:PutObject"/);
  });

  it('bucket policy scopes the SourceAccount + SourceArn condition', () => {
    // Without these, any other AWS account with ARN spoofing could
    // try to push logs into our bucket.
    expect(TF).toMatch(/aws:SourceAccount/);
    expect(TF).toMatch(/aws:SourceArn/);
  });

  it('attaches aws_s3_bucket_logging to the BIR receipts bucket', () => {
    expect(TF).toMatch(/aws_s3_bucket_logging" "bir_receipts"/);
    const block = TF.match(/aws_s3_bucket_logging" "bir_receipts"[\s\S]*?\}/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/target_bucket\s*=\s*aws_s3_bucket\.access_logs\.id/);
    expect(block![0]).toMatch(/target_prefix\s*=\s*"bir-receipts\/"/);
  });

  it('attaches aws_s3_bucket_logging to the customer uploads bucket', () => {
    expect(TF).toMatch(/aws_s3_bucket_logging" "uploads"/);
    const block = TF.match(/aws_s3_bucket_logging" "uploads"[\s\S]*?\}/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/target_bucket\s*=\s*aws_s3_bucket\.access_logs\.id/);
    expect(block![0]).toMatch(/target_prefix\s*=\s*"uploads\/"/);
  });

  it('uses BucketOwnerEnforced ownership (modern, ACLs disabled)', () => {
    expect(TF).toMatch(/object_ownership\s*=\s*"BucketOwnerEnforced"/);
  });

  it('exports the access-logs bucket name + arn for cross-stack reference', () => {
    expect(TF).toMatch(/output "access_logs_bucket_name"/);
    expect(TF).toMatch(/output "access_logs_bucket_arn"/);
  });
});
