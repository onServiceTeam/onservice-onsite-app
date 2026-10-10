import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const script = path.resolve(__dirname, '../../../scripts/server/package-api-candidate.sh').replaceAll('\\', '/');
const harness = String.raw`
set -euo pipefail
docker() {
  printf '%s\n' "docker $*" >> "$TEST_LOG"
  if [[ "$1 $2" == 'image inspect' ]]; then
    [[ "$TEST_SCENARIO" != missing_image ]] || return 41
    if [[ "$4" == '{{.Id}}' ]]; then printf '%s\n' "$TEST_IMAGE_ID"
    elif [[ "$4" == '{{.Os}}/{{.Architecture}}' ]]; then
      if [[ "$TEST_SCENARIO" == wrong_platform ]]; then printf 'linux/arm64\n'; else printf 'linux/amd64\n'; fi
    elif [[ "$TEST_SCENARIO" == wrong_revision ]]; then printf '%040d\n' 0
    else printf '%s\n' "$ONSERVICE_RELEASE_SHA"; fi
  elif [[ "$1" == save ]]; then
    [[ "$TEST_SCENARIO" != save_failure ]] || return 42
    if [[ "$TEST_SCENARIO" == corrupt_archive ]]; then printf 'not an image archive'; else
      command tar -cf - -C "$TEST_ARCHIVE_SOURCE" manifest.json "$TEST_CONFIG_NAME"
    fi
  else return 43; fi
}
git() {
  if [[ "$1 $2" == 'bundle create' && "$TEST_SCENARIO" == bundle_failure ]]; then return 44; fi
  command git "$@"
}
export -f docker git
bash "$TEST_SCRIPT"
`;

it('Bug OPS-477 — candidate packages preserve exact image/source identity and never certify missing, changed or partially saved artifacts', () => {
  const scenarios = ['success', 'wrong_sha', 'dirty_checkout', 'missing_image', 'wrong_revision',
    'wrong_platform', 'save_failure', 'corrupt_archive', 'wrong_archive_tag', 'changed_image',
    'wrong_saved_revision', 'bundle_failure', 'existing_output'];
  for (const scenario of scenarios) {
    const fixture = mkdtempSync(path.join(tmpdir(), 'onservice candidate-'));
    try {
      writeFileSync(path.join(fixture, 'README.md'), 'candidate fixture\n');
      const initialized = spawnSync(bash, ['-c',
        'git init -q && git -c core.autocrlf=false add README.md && git -c user.name=CandidateTest -c user.email=candidate@example.invalid -c commit.gpgsign=false commit -qm fixture && git rev-parse HEAD',
      ], { cwd: fixture, encoding: 'utf8' });
      expect({ scenario, status: initialized.status, stderr: initialized.stderr })
        .toEqual({ scenario, status: 0, stderr: '' });
      const sha = initialized.stdout.trim();
      const source = path.join(fixture, 'image-source');
      mkdirSync(source);
      const config = Buffer.from(JSON.stringify({ os: 'linux', architecture: 'amd64',
        config: { Labels: { 'org.opencontainers.image.revision': scenario === 'wrong_saved_revision' ? '0'.repeat(40) : sha } },
      }));
      const imageHash = createHash('sha256').update(config).digest('hex');
      writeFileSync(path.join(source, `${imageHash}.json`), config);
      writeFileSync(path.join(source, 'manifest.json'), JSON.stringify([{
        Config: `${imageHash}.json`, RepoTags: [`onservice-api:${scenario === 'wrong_archive_tag' ? 'other' : sha}`], Layers: [],
      }]));
      const output = path.join(fixture, 'candidate-output');
      if (scenario === 'existing_output') {
        mkdirSync(output);
        writeFileSync(path.join(output, 'older-candidate.txt'), 'keep the earlier candidate');
      }
      if (scenario === 'dirty_checkout') writeFileSync(path.join(fixture, 'README.md'), 'uncommitted change');
      const log = path.join(fixture, 'calls.log');
      writeFileSync(log, '');
      const result = spawnSync(bash, ['-c', harness], {
        cwd: fixture, encoding: 'utf8', timeout: 30_000,
        env: { ...process.env,
          DOCKER_BIN: 'docker', ONSERVICE_RELEASE_SHA: scenario === 'wrong_sha' ? '0'.repeat(40) : sha,
          ONSERVICE_ARTIFACT_DIR: output.replaceAll('\\', '/'), TEST_SCRIPT: script, TEST_SCENARIO: scenario,
          TEST_IMAGE_ID: `sha256:${scenario === 'changed_image' ? 'f'.repeat(64) : imageHash}`,
          TEST_ARCHIVE_SOURCE: source.replaceAll('\\', '/'), TEST_CONFIG_NAME: `${imageHash}.json`,
          TEST_LOG: log.replaceAll('\\', '/'),
        },
      });
      expect({ scenario, succeeded: result.status === 0, error: result.error?.message })
        .toEqual({ scenario, succeeded: scenario === 'success', error: undefined });
      const calls = readFileSync(log, 'utf8');
      expect(calls).not.toMatch(/docker (?:run|load|pull|push|rm|compose)\b/);
      if (scenario === 'success') {
        expect(result.stdout).toContain(`API candidate packaged: ${sha}; not deployed`);
        expect(readdirSync(output).sort()).toEqual(['SHA256SUMS', 'api-candidate.json', 'api-image.tar.gz', 'onservice-source.bundle']);
        const meta = JSON.parse(readFileSync(path.join(output, 'api-candidate.json'), 'utf8'));
        expect(meta).toMatchObject({ schemaVersion: 1, sourceRevision: sha, imageId: `sha256:${imageHash}`,
          imageTag: `onservice-api:${sha}`, platform: 'linux/amd64', deploymentEligible: false });
        const sums = readFileSync(path.join(output, 'SHA256SUMS'), 'utf8').trim().split('\n');
        expect(sums).toHaveLength(3);
        for (const line of sums) {
          const [hash, file] = line.trim().split(/\s+/);
          const bytes = readFileSync(path.join(output, file!.replace(/^\*/, '')));
          expect(createHash('sha256').update(bytes).digest('hex')).toBe(hash);
        }
        const bundled = spawnSync(bash, ['-c', 'git bundle list-heads candidate-output/onservice-source.bundle'],
          { cwd: fixture, encoding: 'utf8' });
        expect(bundled.status).toBe(0);
        expect(bundled.stdout.trim()).toBe(`${sha} HEAD`);
      } else {
        expect(result.stdout).not.toContain('API candidate packaged');
        const candidateFiles = readdirSync(fixture).includes('candidate-output') ? readdirSync(output) : [];
        expect(candidateFiles).not.toContain('SHA256SUMS');
        if (scenario === 'existing_output') {
          expect(readFileSync(path.join(output, 'older-candidate.txt'), 'utf8')).toBe('keep the earlier candidate');
        }
      }
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }
}, 180_000);
