import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function bashExecutable(): string {
  return process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash';
}

it('Bug OPS-209 — deployment lists demo users, bookings, and reviews only when test fixtures are explicitly enabled', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'onservice-seed-guard-'));
  const envFile = path.join(temp, '.env');
  const script = path.resolve(__dirname, '../../../scripts/server/list-enabled-seeds.sh');

  try {
    writeFileSync(envFile, 'NODE_ENV=production\nENABLE_TEST_FIXTURES=0\n');
    const productionOutput = execFileSync(bashExecutable(), [script, envFile], {
      cwd: path.resolve(__dirname, '../../..'),
      encoding: 'utf8',
    });
    expect(productionOutput).toBe('');

    writeFileSync(envFile, 'NODE_ENV=development\nENABLE_TEST_FIXTURES=1\n');
    const developmentOutput = execFileSync(bashExecutable(), [script, envFile], {
      cwd: path.resolve(__dirname, '../../..'),
      encoding: 'utf8',
    });
    expect(developmentOutput).toContain('002_test_users.sql');
    expect(developmentOutput).toContain('003_test_bookings.sql');
    expect(developmentOutput).toContain('003_demo_history.sql');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
