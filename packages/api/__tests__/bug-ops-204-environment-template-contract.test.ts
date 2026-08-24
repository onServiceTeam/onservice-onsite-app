import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../..');
const verifier = path.join(repoRoot, 'scripts/verify-env-contract.mjs');
const productionTemplate = path.join(repoRoot, '.env.production.example');
const mobileTemplate = path.join(repoRoot, 'apps/mobile/.env.example');

it('Bug OPS-204 — environment templates expose the complete runtime/build contract with safe production defaults', () => {
  expect(execFileSync(process.execPath, [verifier], { encoding: 'utf8' })).toContain(
    'server/mobile environment templates satisfy',
  );

  const temp = mkdtempSync(path.join(tmpdir(), 'onservice-env-contract-'));
  try {
    const unsafeProduction = path.join(temp, '.env.production.example');
    writeFileSync(
      unsafeProduction,
      readFileSync(productionTemplate, 'utf8').replace('ALLOW_DEV_OTP=0', 'ALLOW_DEV_OTP=1'),
    );
    expect(() => execFileSync(process.execPath, [
      verifier,
      '--production', unsafeProduction,
      '--mobile', mobileTemplate,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })).toThrow();
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
