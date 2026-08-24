import { spawnSync } from 'child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

function findBash(): string {
  if (process.platform !== 'win32') return 'bash';
  return 'C:\\Program Files\\Git\\bin\\bash.exe';
}

describe('production uploads-volume ownership', () => {
  it('Bug UX202 — Compose uses the stable external volume while established installs fail closed', () => {
    const repositoryRoot = resolve(__dirname, '../../..');
    const composeFile = join(repositoryRoot, 'docker-compose.prod.yml');
    const resolved = spawnSync(
      'docker',
      ['compose', '-f', composeFile, 'config', '--format', 'json', '--no-interpolate'],
      { encoding: 'utf8' },
    );
    expect(resolved.status).toBe(0);

    const config = JSON.parse(resolved.stdout) as {
      volumes: Record<string, { external?: boolean; name?: string }>;
      services: Record<string, {
        volumes: Array<{ source: string; target: string; read_only?: boolean }>;
      }>;
    };
    expect(config.volumes.uploads_data).toEqual(expect.objectContaining({
      external: true,
      name: 'onservice_uploads_data',
    }));
    expect(config.services.api.volumes).toContainEqual(expect.objectContaining({
      source: 'uploads_data',
      target: '/app/uploads',
    }));
    expect(config.services.nginx.volumes).toContainEqual(expect.objectContaining({
      source: 'uploads_data',
      target: '/usr/share/nginx/uploads',
      read_only: true,
    }));

    const tempRoot = mkdtempSync(join(tmpdir(), 'onservice-volume-test-'));
    try {
      const fakeDocker = join(tempRoot, 'docker');
      const commandLog = join(tempRoot, 'commands.log');
      writeFileSync(fakeDocker, `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"
if [ "$1 $2" = "volume inspect" ]; then exit "${'${FAKE_INSPECT_EXIT:-1}'}"; fi
if [ "$1 $2" = "volume create" ]; then exit 0; fi
exit 2
`, { encoding: 'utf8' });
      chmodSync(fakeDocker, 0o755);

      const helper = join(repositoryRoot, 'scripts', 'server', 'ensure-uploads-volume.sh');
      const baseEnvironment = {
        ...process.env,
        DOCKER_BIN: fakeDocker,
        FAKE_DOCKER_LOG: commandLog,
        ONSERVICE_UPLOADS_VOLUME_NAME: 'onservice_uploads_data_test',
      };
      const firstInstall = spawnSync(findBash(), [helper], {
        encoding: 'utf8',
        env: {
          ...baseEnvironment,
          FAKE_INSPECT_EXIT: '1',
          ALLOW_CREATE_UPLOADS_VOLUME: '1',
        },
      });
      expect(firstInstall.status).toBe(0);
      expect(readFileSync(commandLog, 'utf8').trim().split(/\r?\n/)).toEqual([
        'volume inspect onservice_uploads_data_test',
        'volume create onservice_uploads_data_test',
      ]);

      writeFileSync(commandLog, '', { encoding: 'utf8' });
      const existingInstall = spawnSync(findBash(), [helper], {
        encoding: 'utf8',
        env: { ...baseEnvironment, FAKE_INSPECT_EXIT: '0' },
      });
      expect(existingInstall.status).toBe(0);
      expect(readFileSync(commandLog, 'utf8').trim()).toBe(
        'volume inspect onservice_uploads_data_test',
      );

      writeFileSync(commandLog, '', { encoding: 'utf8' });
      const missingEstablishedInstall = spawnSync(findBash(), [helper], {
        encoding: 'utf8',
        env: { ...baseEnvironment, FAKE_INSPECT_EXIT: '1' },
      });
      expect(missingEstablishedInstall.status).toBe(1);
      expect(missingEstablishedInstall.stderr).toContain('possible data loss');
      expect(readFileSync(commandLog, 'utf8').trim()).toBe(
        'volume inspect onservice_uploads_data_test',
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
