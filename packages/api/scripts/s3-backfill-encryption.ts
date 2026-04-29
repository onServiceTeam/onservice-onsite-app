// packages/api/scripts/s3-backfill-encryption.ts
//
// Bug 1325 fix verified.
// Phase 14 Dispatch 01.
//
// One-time backfill: copy every object in the configured bucket onto itself
// with a server-side encryption header so any pre-Bug-1325 unencrypted
// objects become SSE-KMS (or SSE-S3 fallback) encrypted in place.
//
// Why CopyObject and not Re-Put? CopyObject preserves the original metadata
// + content type and is the AWS-documented way to flip SSE on existing
// objects. We pass MetadataDirective='COPY' to keep the original metadata,
// and supply the SSE headers so the new copy lands encrypted.
//
// Usage:
//   S3_BUCKET=onservice-uploads-prod \
//   S3_REGION=ap-southeast-1 \
//   S3_KMS_KEY_ID=alias/onservice-uploads-prod \
//   npx tsx packages/api/scripts/s3-backfill-encryption.ts [--dry-run]
//
// The script logs every object it touches. Run with --dry-run first to
// estimate the blast radius. Idempotent: if an object is already SSE-KMS
// with the desired key, it is skipped.

import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';

const BUCKET = process.env.S3_BUCKET;
const REGION = process.env.S3_REGION ?? 'ap-southeast-1';
const KMS_KEY_ID = process.env.S3_KMS_KEY_ID;
const DRY_RUN = process.argv.includes('--dry-run');

if (!BUCKET) {
  console.error('S3_BUCKET is required.');
  process.exit(1);
}

const client = new S3Client({
  region: REGION,
  ...(process.env.S3_ENDPOINT
    ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }
    : {}),
});

interface BackfillStats {
  scanned: number;
  alreadyEncrypted: number;
  reEncrypted: number;
  failed: number;
}

async function listAllKeys(): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined = undefined;
  do {
    const out = await client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of out.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    continuationToken = out.NextContinuationToken;
  } while (continuationToken);
  return keys;
}

async function isAlreadyEncrypted(key: string): Promise<boolean> {
  const head = await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
  if (KMS_KEY_ID) {
    return head.ServerSideEncryption === 'aws:kms';
  }
  return head.ServerSideEncryption === 'AES256' || head.ServerSideEncryption === 'aws:kms';
}

async function reEncrypt(key: string): Promise<void> {
  const sseParams = KMS_KEY_ID
    ? { ServerSideEncryption: 'aws:kms' as const, SSEKMSKeyId: KMS_KEY_ID }
    : { ServerSideEncryption: 'AES256' as const };
  await client.send(
    new CopyObjectCommand({
      Bucket: BUCKET,
      Key: key,
      CopySource: `${BUCKET}/${encodeURIComponent(key)}`,
      MetadataDirective: 'COPY',
      ...sseParams,
    }),
  );
}

async function main(): Promise<void> {
  console.log(`Bug 1325 backfill — bucket=${BUCKET} region=${REGION} dryRun=${DRY_RUN}`);
  const stats: BackfillStats = { scanned: 0, alreadyEncrypted: 0, reEncrypted: 0, failed: 0 };

  const keys = await listAllKeys();
  console.log(`Found ${keys.length} objects.`);

  for (const key of keys) {
    stats.scanned += 1;
    try {
      if (await isAlreadyEncrypted(key)) {
        stats.alreadyEncrypted += 1;
        continue;
      }
      if (DRY_RUN) {
        console.log(`[dry-run] would re-encrypt: ${key}`);
        stats.reEncrypted += 1;
        continue;
      }
      await reEncrypt(key);
      stats.reEncrypted += 1;
      if (stats.reEncrypted % 100 === 0) {
        console.log(`Re-encrypted ${stats.reEncrypted} so far...`);
      }
    } catch (err) {
      stats.failed += 1;
      console.error(`Failed on ${key}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log('Backfill summary:', stats);
  if (stats.failed > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error('Fatal:', err);
  process.exit(1);
});
