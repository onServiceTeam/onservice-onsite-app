import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const repo = path.resolve(__dirname, '../../..');
const imageId = `sha256:${'a'.repeat(64)}`;
const containerId = 'c'.repeat(64);

// The real helpers, Git checkout checks and Compose merge are exercised.
// Only container side effects are substituted; no production daemon is used.
const harness = String.raw`
set -euo pipefail
docker() {
  printf '%s\n' "docker $*" >> "$TEST_LOG"
  if [[ "$1 $2" == 'image inspect' ]]; then
    [[ "$TEST_SCENARIO" != missing_image ]] || return 41
    if [[ "$4" == '{{.Id}}' ]]; then
      printf '%s\n' "$TEST_IMAGE_ID"
    elif [[ "$TEST_SCENARIO" == wrong_label ]]; then
      printf '%040d\n' 0
    else
      printf '%s\n' "$ONSERVICE_RELEASE_SHA"
    fi
  elif [[ "$1" == compose ]]; then
    [[ "$2 $3 $4 $5" == '-f docker-compose.prod.yml -f docker-compose.release.yml' ]] || return 42
    shift 5
    if [[ "$1" == up ]]; then
      [[ "$TEST_SCENARIO" != up_failed ]] || return 43
    elif [[ "$1" == ps ]]; then
      [[ "$TEST_SCENARIO" != missing_container ]] || return 0
      if [[ "$TEST_SCENARIO" == replaced_container && -f "$TEST_READY_FILE" ]]; then
        printf '%064d\n' 0
      else
        printf '%s\n' "$TEST_CONTAINER_ID"
      fi
    elif [[ "$1" == run ]]; then
      if [[ "$*" == *--dry-run* ]]; then
        [[ "$TEST_SCENARIO" != migration_dry_failed ]] || return 44
      else
        [[ "$TEST_SCENARIO" != migration_apply_failed ]] || return 45
      fi
    else
      return 46
    fi
  elif [[ "$1" == inspect ]]; then
    [[ "$4" == "$TEST_CONTAINER_ID" ]] || return 47
    if [[ "$TEST_SCENARIO" == wrong_running_image ]]; then
      printf 'sha256:%064d\n' 0
    else
      printf '%s\n' "$TEST_IMAGE_ID"
    fi
  elif [[ "$1" == exec ]]; then
    [[ "$2" == "$TEST_CONTAINER_ID" ]] || return 48
    [[ "$TEST_SCENARIO" != not_ready ]] || return 49
    touch "$TEST_READY_FILE"
  else
    return 50
  fi
}
sleep() { :; }
export -f docker sleep
bash "$TEST_ENTRY"
`;

it('Bug OPS-476 — releases migrate and activate only the exact verified image, and never report an old or unhealthy API as deployed', () => {
  const scenarios = [
    'success', 'invalid_sha', 'wrong_head', 'dirty_checkout', 'missing_image', 'wrong_label',
    'up_failed', 'missing_container', 'wrong_running_image', 'not_ready', 'replaced_container',
    'migration_success', 'migration_dry_only', 'migration_missing_target', 'migration_invalid_target',
    'migration_dry_failed', 'migration_apply_failed',
  ];
  for (const scenario of scenarios) {
    const fixture = mkdtempSync(path.join(tmpdir(), 'onservice release-'));
    try {
      mkdirSync(path.join(fixture, 'scripts/server'), { recursive: true });
      for (const file of [
        'docker-compose.prod.yml', 'docker-compose.release.yml',
        'scripts/server/release-api-common.sh', 'scripts/server/activate-api-release.sh',
        'scripts/server/run-production-migrations.sh',
      ]) copyFileSync(path.join(repo, file), path.join(fixture, file));
      writeFileSync(path.join(fixture, 'README.md'), 'isolated release fixture\n');
      const initialized = spawnSync(bash, ['-c',
        'git init -q && git -c core.autocrlf=false add . && git -c user.name=ReleaseTest -c user.email=release@example.invalid -c commit.gpgsign=false commit -qm fixture && git rev-parse HEAD',
      ], { cwd: fixture, encoding: 'utf8' });
      expect({ scenario, status: initialized.status, stderr: initialized.stderr })
        .toEqual({ scenario, status: 0, stderr: '' });
      const sha = initialized.stdout.trim();
      const log = path.join(fixture, 'calls.log');
      writeFileSync(log, '');
      if (scenario === 'dirty_checkout') writeFileSync(path.join(fixture, 'README.md'), 'unreleased change\n');
      const migration = scenario.startsWith('migration_');
      const target = scenario === 'migration_missing_target' ? ''
        : scenario === 'migration_invalid_target' ? '171; unexpected-command'
          : '171_admin_user_lifecycle_audit';
      const result = spawnSync(bash, ['-c', harness], {
        cwd: fixture,
        encoding: 'utf8',
        timeout: 30_000,
        env: {
          ...process.env,
          TEST_ENTRY: `scripts/server/${migration ? 'run-production-migrations' : 'activate-api-release'}.sh`,
          TEST_SCENARIO: scenario,
          TEST_LOG: log.replaceAll('\\', '/'),
          TEST_READY_FILE: path.join(fixture, 'ready').replaceAll('\\', '/'),
          TEST_IMAGE_ID: imageId,
          TEST_CONTAINER_ID: containerId,
          DOCKER_BIN: 'docker',
          ONSERVICE_PROJECT_DIR: fixture.replaceAll('\\', '/'),
          ONSERVICE_RELEASE_SHA: scenario === 'invalid_sha' ? 'master' : scenario === 'wrong_head' ? 'b'.repeat(40) : sha,
          MIGRATION_TARGET: target,
          MIGRATIONS_DRY_RUN_ONLY: scenario === 'migration_dry_only' ? '1' : '0',
        },
      });
      const calls = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean);
      const composeCalls = calls.filter(call => call.startsWith('docker compose'));
      const success = ['success', 'migration_success', 'migration_dry_only'].includes(scenario);
      expect({ scenario, succeeded: result.status === 0, error: result.error?.message })
        .toEqual({ scenario, succeeded: success, error: undefined });
      expect(calls.some(call => /^docker (build|pull|rm|stop)\b/.test(call))).toBe(false);
      for (const call of composeCalls) {
        expect(call).toContain('-f docker-compose.prod.yml -f docker-compose.release.yml');
        expect(call).not.toContain(' down');
      }
      if (!success) expect(result.stdout).not.toContain('API activation verified');

      if (scenario === 'success') {
        expect(composeCalls).toEqual([
          'docker compose -f docker-compose.prod.yml -f docker-compose.release.yml up -d --no-deps --no-build --pull never api',
          'docker compose -f docker-compose.prod.yml -f docker-compose.release.yml ps -q api',
          'docker compose -f docker-compose.prod.yml -f docker-compose.release.yml ps -q api',
        ]);
        expect(calls).toContain(`docker inspect --format {{.Image}} ${containerId}`);
        expect(calls).toContain(`docker exec ${containerId} curl -fsS http://localhost:7381/health/ready`);
        expect(result.stdout).toContain(`API activation verified: revision=${sha} image=${imageId}`);
        expect(result.stdout).toContain('frontend alignment and business acceptance have not been verified');

        // Compose's actual client-side merge needs no running Docker engine.
        // Empty/non-secret env fixtures prevent reading any local live config.
        writeFileSync(path.join(fixture, 'compose.env'), '');
        writeFileSync(path.join(fixture, '.env'), 'NODE_ENV=test\n');
        const config = spawnSync('docker', [
          'compose', '--env-file', 'compose.env', '-f', 'docker-compose.prod.yml',
          '-f', 'docker-compose.release.yml', 'config', '--format', 'json',
        ], {
          cwd: fixture, encoding: 'utf8', timeout: 30_000,
          env: { ...process.env, ONSERVICE_RELEASE_SHA: sha, COMPOSE_DISABLE_ENV_FILE: '1' },
        });
        expect({ status: config.status, error: config.error?.message })
          .toEqual({ status: 0, error: undefined });
        const services = JSON.parse(config.stdout).services;
        expect(services.api.image).toBe(`onservice-api:${sha}`);
        expect(services.api.pull_policy).toBe('never');
        expect(services.postgres.image).toBe('postgis/postgis:17-3.5');
      } else if (migration) {
        const runs = composeCalls.filter(call => call.includes(' run '));
        const invalidTarget = scenario === 'migration_missing_target' || scenario === 'migration_invalid_target';
        const onlyDry = scenario === 'migration_dry_only' || scenario === 'migration_dry_failed';
        expect(runs).toHaveLength(invalidTarget ? 0 : onlyDry ? 1 : 2);
        if (runs.length) {
          expect(runs[0]).toContain(`run --rm --no-deps api sh -lc DATABASE_URL="$DATABASE_DIRECT_URL" node scripts/run-reviewed-migrations.mjs --target ${target}`);
          expect(runs[0]).toContain('--migrations-dir migrations --dry-run');
        }
        if (runs.length === 2) expect(runs[1]).not.toContain('--dry-run');
        expect(composeCalls.some(call => call.includes(' up '))).toBe(false);
      } else if (['invalid_sha', 'wrong_head', 'dirty_checkout', 'missing_image', 'wrong_label'].includes(scenario)) {
        expect(composeCalls).toEqual([]);
      } else if (scenario === 'not_ready') {
        expect(calls.filter(call => call.startsWith('docker exec'))).toHaveLength(30);
        expect(result.stderr).toContain('deployment is not successful');
      } else if (scenario === 'wrong_running_image') {
        expect(calls.some(call => call.startsWith('docker exec'))).toBe(false);
      }
    } finally {
      // Only this test's unique, already-resolved temporary fixture is removed.
      rmSync(fixture, { recursive: true, force: true });
    }
  }
}, 180_000);
