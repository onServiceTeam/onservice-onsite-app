// Phase 14 Dispatch 14 — Cutover harness bridge test.
//
// D14 has no audit-numbered bugs — it ships the verification harness +
// runbook for 12 operational launch blockers. Gate B accepts this via
// the no-bugs marker in the closeout. This test asserts every verifier
// script + runbook section + terraform spec is present and shaped
// correctly so a missing file would fail CI.

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '..', '..', '..');

function source(relPath: string): string {
  return readFileSync(join(REPO_ROOT, relPath), 'utf-8');
}

function exists(relPath: string): boolean {
  return existsSync(join(REPO_ROOT, relPath));
}

const VERIFY_SCRIPTS = [
  'verify-dpo-registered.sh',
  'verify-bir-or-series.sh',
  'verify-hcaptcha.sh',
  'verify-sentry.sh',
  'verify-paymongo.sh',
  'verify-s3-bir.sh',
  'verify-postgres-pitr.sh',
  'verify-tls.sh',
  'verify-bir-pipeline.sh',
  'verify-launch-readiness.sh',
  'run-full-smoke.sh',
];

describe('D14 verification harness', () => {
  it.each(VERIFY_SCRIPTS)('script %s exists at scripts/', (script) => {
    expect(exists(`scripts/${script}`)).toBe(true);
  });

  it('verify-launch-readiness.sh wires every required Item verifier', () => {
    const src = source('scripts/verify-launch-readiness.sh');
    const requiredItems = ['1', '2', '5', '6', '7', '8', '9', '10', '12'];
    for (const item of requiredItems) {
      expect(src).toMatch(new RegExp(`\\[${item}\\]=`));
    }
  });

  it('umbrella verifier exits non-zero on any required-Item failure', () => {
    const src = source('scripts/verify-launch-readiness.sh');
    expect(src).toMatch(/exit 1/);
    expect(src).toMatch(/Failed items:/);
  });

  it('Item 1 (DPO) verifier checks LAUNCH-LIMITATIONS for NPC-PIC- + DPO email', () => {
    const src = source('scripts/verify-dpo-registered.sh');
    expect(src).toMatch(/NPC-PIC-/);
    expect(src).toMatch(/dpo@/);
  });

  it('Item 5 (hCaptcha) verifier rejects the public dev-bypass key', () => {
    const src = source('scripts/verify-hcaptcha.sh');
    expect(src).toMatch(/10000000-ffff-ffff-ffff-000000000001/);
  });

  it('Item 7 (PayMongo) verifier insists on sk_live_ prefix', () => {
    const src = source('scripts/verify-paymongo.sh');
    expect(src).toMatch(/sk_live_/);
    expect(src).toMatch(/live_mode.*true/);
  });

  it('Item 8 (S3 BIR) verifier checks Object Lock COMPLIANCE 10y + KMS', () => {
    const src = source('scripts/verify-s3-bir.sh');
    expect(src).toMatch(/COMPLIANCE/);
    expect(src).toMatch(/aws:kms/);
    expect(src).toMatch(/Versioning/);
  });

  it('Item 10 (TLS) verifier requires Strict-Transport-Security on every site', () => {
    const src = source('scripts/verify-tls.sh');
    expect(src).toMatch(/strict-transport-security/i);
  });
});

describe('D14 cutover runbook', () => {
  it('docs/runbooks/launch-cutover.md exists', () => {
    expect(exists('docs/runbooks/launch-cutover.md')).toBe(true);
  });

  it('runbook documents all 12 items', () => {
    const src = source('docs/runbooks/launch-cutover.md');
    for (let i = 1; i <= 12; i++) {
      expect(src).toMatch(new RegExp(`Item ${i} —`));
    }
  });

  it('runbook describes the launch decision matrix and sign-off list', () => {
    const src = source('docs/runbooks/launch-cutover.md');
    expect(src).toMatch(/decision matrix/i);
    expect(src).toMatch(/Sign-off/);
    expect(src).toMatch(/v1\.0\.0-launch-ready/);
  });

  it('runbook explicitly notes Migration 077 deferred to v1.1', () => {
    const src = source('docs/runbooks/launch-cutover.md');
    expect(src).toMatch(/Migration 077/);
    expect(src).toMatch(/deferred to v1\.1/);
  });
});

describe('D14 BIR bucket Terraform spec', () => {
  it('infra/terraform/s3-bir-receipts.tf exists', () => {
    expect(exists('infra/terraform/s3-bir-receipts.tf')).toBe(true);
  });

  it('terraform spec enables Object Lock COMPLIANCE 10y + KMS + versioning + TLS-only', () => {
    const src = source('infra/terraform/s3-bir-receipts.tf');
    expect(src).toMatch(/object_lock_enabled\s*=\s*true/);
    expect(src).toMatch(/mode\s*=\s*"COMPLIANCE"/);
    expect(src).toMatch(/years\s*=\s*10/);
    expect(src).toMatch(/aws_kms_key/);
    expect(src).toMatch(/aws_s3_bucket_versioning/);
    expect(src).toMatch(/aws:SecureTransport/);
  });

  it('terraform blocks all public access on the BIR bucket', () => {
    const src = source('infra/terraform/s3-bir-receipts.tf');
    expect(src).toMatch(/block_public_acls\s*=\s*true/);
    expect(src).toMatch(/block_public_policy\s*=\s*true/);
    expect(src).toMatch(/ignore_public_acls\s*=\s*true/);
    expect(src).toMatch(/restrict_public_buckets\s*=\s*true/);
  });
});
