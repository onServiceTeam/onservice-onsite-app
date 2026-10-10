import { chmodSync, copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

describe('production migration runner', () => {
  it('Bug OPS-001 — dry-runs the reviewed boundary before applying it through the direct production helper', () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), 'onservice-migration-runner-'));
    const dockerStub = path.join(fixtureDir, 'docker-stub.sh');
    const callLog = path.join(fixtureDir, 'docker-calls.log');
    const runnerSource = path.resolve(__dirname, '../../../scripts/server/run-production-migrations.sh');
    const runnerFixture = path.join(fixtureDir, 'run-production-migrations.sh');

    copyFileSync(runnerSource, runnerFixture);
    writeFileSync(
      dockerStub,
      '#!/usr/bin/env bash\nset -euo pipefail\nprintf \'%s\\n\' "$*" >> "$MIGRATION_TEST_LOG"\n',
      'utf8',
    );
    chmodSync(dockerStub, 0o755);
    chmodSync(runnerFixture, 0o755);

    const result = spawnSync('bash', ['run-production-migrations.sh'], {
      cwd: fixtureDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        DOCKER_BIN: './docker-stub.sh',
        MIGRATION_TEST_LOG: 'docker-calls.log',
        MIGRATION_TARGET: '148_provider_portfolio_consent',
        ONSERVICE_PROJECT_DIR: '.',
        WSLENV: [
          process.env.WSLENV,
          'DOCKER_BIN',
          'MIGRATION_TEST_LOG',
          'MIGRATION_TARGET',
          'ONSERVICE_PROJECT_DIR',
        ].filter(Boolean).join(':'),
      },
    });

    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    const calls = readFileSync(callLog, 'utf8').trim().split(/\r?\n/);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('node scripts/run-reviewed-migrations.mjs --target 148_provider_portfolio_consent');
    expect(calls[0]).toContain('--migrations-dir migrations --dry-run');
    expect(calls[1]).toContain('node scripts/run-reviewed-migrations.mjs --target 148_provider_portfolio_consent');
    expect(calls[1]).toContain('--migrations-dir migrations');
    expect(calls[1]).not.toContain('--dry-run');
    expect(calls.join('\n')).not.toContain('npx node-pg-migrate');
  });
});
