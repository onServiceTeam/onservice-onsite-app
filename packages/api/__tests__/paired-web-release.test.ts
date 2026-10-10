import { spawnSync } from 'node:child_process';
import path from 'node:path';

it('paired web publication executes real filesystem interruption, identity and rollback fixtures', () => {
  // Actual exported core and real temporary filesystem operations. Only the
  // API/nginx/acceptance adapters are substituted; this is not live rollout.
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap',
    path.resolve(__dirname, '../../../scripts/server/__tests__/paired-web-release.test.mjs'),
  ], { encoding: 'utf8', timeout: 120_000, maxBuffer: 2 * 1024 * 1024 });
  // Retain the individual real fixture outcomes in CI, not just this wrapper's
  // one-test summary. Reject accidental empty/entirely skipped child suites.
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  expect({ status: result.status, error: result.error?.message, output: result.stdout + result.stderr })
    .toEqual({ status: 0, error: undefined, output: expect.stringContaining('# fail 0') });
  expect(result.stdout).toMatch(/^# tests 31$/m);
  expect(result.stdout).toMatch(/^# pass 31$/m);
  expect(result.stdout).toMatch(/^# skipped 0$/m);
  expect(result.stdout).toMatch(/^# todo 0$/m);
}, 130_000);
