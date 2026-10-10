import { spawnSync } from 'node:child_process';
import {
  mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const script = path.resolve(__dirname, '../../../scripts/server/backup-db.sh');

// Execute the actual backup program. Only the unavailable external services
// (Docker/off-site storage) and explicit fault injection are substituted.
// gzip, tar, git bundles, checksum validation, moves and retention run for real.
const harness = String.raw`
set -euo pipefail
docker() {
  printf '%s\n' "docker $*" >> "$TEST_LOG"
  if [[ "$1 $2" == 'volume inspect' ]]; then
    [[ "$TEST_SCENARIO" != missing_volume ]]
  elif [[ "$1" == compose ]]; then
    # Docker Compose forwards stdin unless closed. A streamed backup must not
    # hand the remainder of its own shell program to the dump container.
    [[ "$TEST_SCENARIO" != success_streamed ]] || cat >/dev/null
    [[ "$TEST_SCENARIO" != db_failure ]] || return 41
    [[ "$TEST_SCENARIO" != db_empty ]] || return 0
    printf '%s\n' '-- SQL fixture' 'CREATE TABLE backup_probe (id integer);'
  elif [[ "$1" == run ]]; then
    [[ "$TEST_SCENARIO" != uploads_failure ]] || return 42
    local mount='' output='' arg
    for arg in "$@"; do
      [[ "$arg" != *:/backup ]] || mount="$(printf '%s' "$arg" | sed 's|:/backup$||')"
      [[ "$arg" != /backup/* ]] || output="$(basename "$arg")"
    done
    [[ -n "$mount" && -n "$output" ]] || return 43
    if [[ "$TEST_SCENARIO" == uploads_corrupt ]]; then
      printf 'not a tar archive' > "$mount/$output"
    else
      command tar czf "$mount/$output" -C "$ONSERVICE_PROJECT_DIR/uploads-fixture" .
    fi
  else
    return 44
  fi
}
tar() {
  if [[ "$1" == czf && "$2" == */config-* ]]; then
    [[ "$TEST_SCENARIO" != config_failure ]] || return 45
    if [[ "$TEST_SCENARIO" == config_corrupt ]]; then
      printf 'not a tar archive' > "$2"
      return 0
    fi
  fi
  command tar "$@"
}
git() {
  if [[ "$1 $2" == 'bundle create' ]]; then
    [[ "$TEST_SCENARIO" != git_failure ]] || return 46
    if [[ "$TEST_SCENARIO" == git_corrupt ]]; then
      printf 'not a git bundle' > "$3"
      return 0
    fi
  fi
  command git "$@"
}
rclone() {
  printf '%s\n' "rclone $*" >> "$TEST_LOG"
  [[ "$TEST_SCENARIO" != offsite_failure ]] || return 47
  if [[ "$TEST_SCENARIO" == offsite_manifest_failure && "$2" == *.complete ]]; then return 48; fi
  # A local directory represents the configured remote; copied bytes are
  # inspected below, including the manifest-last completion contract.
  cp "$2" "$3/"
}
find() {
  printf '%s\n' 'retention invoked' >> "$TEST_LOG"
  command find "$@"
}
export -f docker tar git rclone find
if [[ "$TEST_SCENARIO" == success_streamed ]]; then
  bash -s < "$TEST_SCRIPT"
else
  bash "$TEST_SCRIPT"
fi
`;

it('Bug OPS-475 — backup success and pruning require verified database, uploads, configuration, git and configured off-site copies', () => {
  const scenarios = [
    'db_failure', 'db_empty', 'missing_volume', 'uploads_failure', 'uploads_corrupt',
    'config_missing', 'config_failure', 'config_corrupt', 'git_failure', 'git_corrupt',
    'offsite_missing', 'offsite_failure', 'offsite_manifest_failure', 'locked', 'success', 'success_offsite',
    'success_skip_retention', 'success_empty_uploads', 'success_streamed',
  ];
  for (const scenario of scenarios) {
    const fixture = mkdtempSync(path.join(tmpdir(), 'onservice backup-'));
    try {
      for (const dir of ['backups', 'nginx', 'certbot/conf', 'uploads-fixture', 'remote']) {
        mkdirSync(path.join(fixture, dir), { recursive: true });
      }
      writeFileSync(path.join(fixture, '.env'), 'TEST_SECRET=fixture-only\n');
      writeFileSync(path.join(fixture, 'docker-compose.prod.yml'), 'services: {}\n');
      writeFileSync(path.join(fixture, 'nginx/nginx.conf'), '# fixture nginx\n');
      writeFileSync(path.join(fixture, 'nginx/.htpasswd'), 'fixture-only\n');
      if (scenario !== 'success_empty_uploads') {
        writeFileSync(path.join(fixture, 'uploads-fixture/proof.txt'), 'booking evidence fixture\n');
      }
      writeFileSync(path.join(fixture, 'README.md'), 'backup fixture\n');
      const initialize = spawnSync(bash, ['-c',
        'git init -q && git -c core.autocrlf=false add README.md && git -c user.name=BackupTest -c user.email=backup@example.invalid -c commit.gpgsign=false commit -qm fixture',
      ], { cwd: fixture, encoding: 'utf8' });
      expect({ scenario, status: initialize.status, stderr: initialize.stderr })
        .toEqual({ scenario, status: 0, stderr: '' });

      const oldBackup = path.join(fixture, 'backups/onservice-20000101-000000.sql.gz');
      writeFileSync(oldBackup, 'older known recovery copy');
      utimesSync(oldBackup, new Date('2000-01-01'), new Date('2000-01-01'));
      const unrelated = path.join(fixture, 'backups/keep-me.txt');
      writeFileSync(unrelated, 'unrelated backup notes');
      utimesSync(unrelated, new Date('2000-01-01'), new Date('2000-01-01'));
      const nested = path.join(fixture, 'backups/.incomplete-old');
      mkdirSync(nested);
      writeFileSync(path.join(nested, 'uploads-20000101.tgz'), 'private failed-run evidence');
      if (scenario === 'config_missing') rmSync(path.join(fixture, 'nginx/nginx.conf'));
      if (scenario === 'locked') mkdirSync(path.join(fixture, 'backups/.backup-lock'));

      const commandLog = path.join(fixture, 'commands.log');
      writeFileSync(commandLog, '');
      const remoteConfigured = scenario.startsWith('offsite_') || scenario === 'success_offsite';
      const result = spawnSync(bash, ['-c', harness], {
        cwd: fixture,
        encoding: 'utf8',
        timeout: 30_000,
        env: {
          ...process.env,
          TEST_SCRIPT: script.replaceAll('\\', '/'),
          TEST_SCENARIO: scenario,
          TEST_LOG: commandLog.replaceAll('\\', '/'),
          ONSERVICE_PROJECT_DIR: fixture.replaceAll('\\', '/'),
          DOCKER_BIN: 'docker',
          RCLONE_BIN: scenario === 'offsite_missing' ? 'nonexistent-onservice-rclone' : 'rclone',
          BACKUP_RCLONE_REMOTE: remoteConfigured ? path.join(fixture, 'remote').replaceAll('\\', '/') : '',
          BACKUP_SKIP_RETENTION: scenario === 'success_skip_retention' ? '1' : '0',
        },
      });
      const names = readdirSync(path.join(fixture, 'backups'));
      const calls = readFileSync(commandLog, 'utf8');
      const successes = names.filter(name => name.endsWith('.complete'));
      expect(result.stdout).not.toContain('TEST_SECRET');
      expect(result.stderr).not.toContain('TEST_SECRET');
      expect(readFileSync(unrelated, 'utf8')).toBe('unrelated backup notes');
      expect(readFileSync(path.join(nested, 'uploads-20000101.tgz'), 'utf8'))
        .toBe('private failed-run evidence');

      if (!scenario.startsWith('success')) {
        expect({ scenario, passed: result.status === 0, error: result.error?.message })
          .toEqual({ scenario, passed: false, error: undefined });
        expect(result.stdout).not.toContain('backup OK');
        expect(successes).toEqual([]);
        expect(calls).not.toContain('retention invoked');
        expect(readFileSync(oldBackup, 'utf8')).toBe('older known recovery copy');
        expect(names.includes('.backup-lock')).toBe(scenario === 'locked');
        if (scenario === 'missing_volume') expect(calls).not.toContain('docker run');
        if (scenario === 'offsite_failure') expect(calls).not.toContain('.complete');
        continue;
      }

      expect({ scenario, status: result.status, error: result.error?.message })
        .toEqual({ scenario, status: 0, error: undefined });
      expect(result.stdout).toContain('backup OK: verified local set');
      expect(result.stdout).toContain('restore_test=not_run');
      expect(result.stdout).toContain(`offsite_configured=${remoteConfigured ? 'yes' : 'no'}`);
      expect(successes).toHaveLength(1);
      expect(names.includes('.backup-lock')).toBe(false);
      const manifestName = successes[0]!;
      if (process.platform !== 'win32') {
        expect(statSync(path.join(fixture, 'backups', manifestName)).mode & 0o777).toBe(0o600);
      }
      const manifest = readFileSync(path.join(fixture, 'backups', manifestName), 'utf8');
      const entries = manifest.trim().split('\n').map(line => {
        const [hash, name] = line.trim().split(/\s+/);
        // GNU sha256sum marks binary mode with '*' on Windows.
        return [hash!, name!.replace(/^\*/, '')];
      });
      expect(entries).toHaveLength(4);
      for (const [expectedHash, name] of entries) {
        const bytes = readFileSync(path.join(fixture, 'backups', name!));
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(expectedHash);
        if (process.platform !== 'win32') {
          expect(statSync(path.join(fixture, 'backups', name!)).mode & 0o777).toBe(0o600);
        }
        if (remoteConfigured) expect(readFileSync(path.join(fixture, 'remote', name!))).toEqual(bytes);
      }
      const configName = entries.find(([, name]) => name?.startsWith('config-'))![1]!;
      const configListing = spawnSync(bash, ['-c', 'tar tzf "$1"', '--',
        configName,
      ], { cwd: path.join(fixture, 'backups'), encoding: 'utf8' });
      expect(configListing.status).toBe(0);
      expect(configListing.stdout).toContain('.env');
      expect(configListing.stdout).toContain('nginx/.htpasswd');
      expect(configListing.stdout).toContain('certbot/conf');
      if (remoteConfigured) {
        expect(readFileSync(path.join(fixture, 'remote', manifestName), 'utf8')).toBe(manifest);
        expect(calls.trim().split('\n').filter(line => line.startsWith('rclone ')).at(-1))
          .toContain(manifestName);
      }
      if (scenario === 'success_skip_retention') {
        expect(calls).not.toContain('retention invoked');
        expect(readFileSync(oldBackup, 'utf8')).toBe('older known recovery copy');
      } else {
        expect(calls).toContain('retention invoked');
        expect(names).not.toContain(path.basename(oldBackup));
      }
    } finally {
      // Only the unique test-owned temporary fixture is removed.
      rmSync(fixture, { recursive: true, force: true });
    }
  }
}, 180_000);
