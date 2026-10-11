import { spawnSync } from 'node:child_process';
import path from 'node:path';

it('Android artifact policy executes all identity, packaging, downgrade and real process-failure contracts', () => {
  // SDK output fixtures test policy parsing, NOT APK signatures or device behavior.
  // Actual aapt/apksigner checks against retained APKs are separate local receipts.
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap',
    path.resolve(__dirname, '../../../scripts/release/__tests__/inspect-android-apk.test.mjs')],
  { encoding: 'utf8', timeout: 45000, maxBuffer: 1024 * 1024 });
  process.stdout.write(result.stdout); process.stderr.write(result.stderr);
  expect({ status: result.status, error: result.error?.message }).toEqual({ status: 0, error: undefined });
  expect(result.stdout).toMatch(/^# tests 11$/m);
  expect(result.stdout).toMatch(/^# pass 11$/m);
  expect(result.stdout).toMatch(/^# fail 0$/m);
  expect(result.stdout).toMatch(/^# skipped 0$/m);
  expect(result.stdout).toMatch(/^# todo 0$/m);
}, 50000);
