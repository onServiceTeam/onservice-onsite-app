/**
 * Phase 13 — Shared S3 upload helper for BIR/regulatory PDF artifacts
 * (held BIR-2307 workpapers, legacy OR-labelled artifacts, and internal monthly
 * VAT reconciliation). E22 blocks deployed document writes.
 *
 * Uses @aws-sdk/client-s3 with `ServerSideEncryption: 'AES256'` per
 * platform security baseline. Bucket-level hardening (versioning,
 * Object Lock, lifecycle policies for retention) is configured outside
 * this module via infra (see EVIDENCE-MANIFEST — deferred-to-infra).
 *
 * Returns null when S3 is not configured (AWS_S3_BUCKET / AWS_REGION
 * missing) so the calling service can degrade gracefully (and so tests
 * don't need network access). Tests mock @aws-sdk/client-s3 directly.
 *
 * On any upload failure the error is logged via the shared logger and
 * re-thrown so the caller can decide its own fallback behavior.
 */

import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { logger } from './logger';

let cachedClient: S3Client | null = null;

function getClient(region: string): S3Client {
  if (cachedClient === null) {
    cachedClient = new S3Client({ region });
  }
  return cachedClient;
}

/** Test-only hook to reset the cached client between mocked test runs. */
export function _resetS3ClientForTests(): void {
  cachedClient = null;
}

export interface UploadBirDocumentResult {
  bucket: string;
  region: string;
  key: string;
  url: string;
}

/**
 * Uploads a regulatory PDF document to the configured S3 bucket with
 * server-side encryption. The S3 key uniquely identifies the artifact;
 * idempotent: repeated uploads with the same key overwrite.
 *
 * @returns the S3 location, or null when S3 is not configured.
 */
export async function uploadBirDocument(
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<UploadBirDocumentResult | null> {
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION;
  if (!bucket || !region) {
    logger.warn('S3 upload skipped — AWS_S3_BUCKET / AWS_REGION not set', {
      key,
      bytes: buffer.length,
    });
    return null;
  }

  const client = getClient(region);
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
      }),
    );
  } catch (err) {
    logger.error('S3 upload failed for BIR document', {
      bucket,
      region,
      key,
      bytes: buffer.length,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err instanceof Error ? err : new Error(String(err));
  }

  const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  logger.info('BIR document uploaded to S3', {
    bucket,
    region,
    key,
    bytes: buffer.length,
  });
  return { bucket, region, key, url };
}
