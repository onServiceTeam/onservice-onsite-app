import { spawnSync } from 'node:child_process';
import path from 'node:path';

it('marketplace observers execute real TLS, filesystem and container-contract fixtures', () => {
  // The HTTPS tests use ephemeral loopback listeners and one-day fixture
  // certificates, never production credentials or globally installed trust.
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap',
    path.resolve(__dirname, '../../../scripts/server/__tests__/marketplace-release-observers.test.mjs'),
  ], { encoding: 'utf8', timeout: 120_000, maxBuffer: 2 * 1024 * 1024 });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  expect({ status: result.status, error: result.error?.message, output: result.stdout + result.stderr })
    .toEqual({ status: 0, error: undefined, output: expect.stringContaining('# fail 0') });
  expect(result.stdout).toMatch(/^# tests 41$/m);
  expect(result.stdout).toMatch(/^# pass 41$/m);
  expect(result.stdout).toMatch(/^# skipped 0$/m);
  expect(result.stdout).toMatch(/^# todo 0$/m);
}, 130_000);
