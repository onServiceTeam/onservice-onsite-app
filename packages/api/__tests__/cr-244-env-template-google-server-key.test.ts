// CR-244 (D24 Option A, 2026-10-18): the tracked production environment
// template documents GOOGLE_MAPS_SERVER_KEY and leaves it empty. The
// template contract script (scripts/verify-env-contract.mjs, run by
// Bug OPS-204) refuses a template that drops the line or carries any value,
// so a real key can never be committed there by accident.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../..');
const verifier = path.join(repoRoot, 'scripts/verify-env-contract.mjs');
const productionTemplate = path.join(repoRoot, '.env.production.example');
const mobileTemplate = path.join(repoRoot, 'apps/mobile/.env.example');

function verify(templateText: string): { ok: boolean; output: string } {
  const temp = mkdtempSync(path.join(tmpdir(), 'onservice-cr-244-'));
  try {
    const file = path.join(temp, '.env.production.example');
    writeFileSync(file, templateText);
    try {
      const output = execFileSync(process.execPath, [verifier, '--production', file, '--mobile', mobileTemplate], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { ok: true, output };
    } catch (error) {
      return { ok: false, output: String((error as { stderr?: string }).stderr ?? '') };
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

it('Bug CR-244 — the production template carries GOOGLE_MAPS_SERVER_KEY empty, and the contract refuses a missing or filled-in key', () => {
  const template = readFileSync(productionTemplate, 'utf8');
  expect(template).toMatch(/^GOOGLE_MAPS_SERVER_KEY=\r?$/m);
  expect(verify(template).ok).toBe(true);

  const filled = verify(template.replace(/^GOOGLE_MAPS_SERVER_KEY=\r?$/m, 'GOOGLE_MAPS_SERVER_KEY=TESTONLY_fake_google_maps_server_key_0000'));
  expect(filled.ok).toBe(false);
  expect(filled.output).toContain('must leave GOOGLE_MAPS_SERVER_KEY empty');

  const missing = verify(template.replace(/^GOOGLE_MAPS_SERVER_KEY=\r?\n/m, ''));
  expect(missing.ok).toBe(false);
  expect(missing.output).toContain('missing GOOGLE_MAPS_SERVER_KEY');
});
