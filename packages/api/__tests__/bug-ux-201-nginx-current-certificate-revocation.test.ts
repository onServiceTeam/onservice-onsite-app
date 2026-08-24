import { spawnSync } from 'child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

function findOpenSsl(): string {
  if (process.platform !== 'win32') return 'openssl';
  return 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe';
}

describe('production nginx certificate-revocation configuration', () => {
  it('Bug UX201 — nginx validates without obsolete OCSP-stapling warnings for current certificates', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'onservice-nginx-test-'));
    try {
      const certificate = join(tempRoot, 'certificate.pem');
      const privateKey = join(tempRoot, 'private-key.pem');
      const generated = spawnSync(
        findOpenSsl(),
        [
          'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes',
          '-keyout', privateKey,
          '-out', certificate,
          '-days', '1',
          '-subj', '/CN=localhost',
        ],
        { encoding: 'utf8' },
      );
      expect(generated.status).toBe(0);

      const letsEncryptRoot = join(tempRoot, 'letsencrypt');
      for (const certificateName of ['api.onservice.ph', 'app.onservice.com.ph']) {
        const liveDirectory = join(letsEncryptRoot, 'live', certificateName);
        mkdirSync(liveDirectory, { recursive: true });
        copyFileSync(certificate, join(liveDirectory, 'fullchain.pem'));
        copyFileSync(privateKey, join(liveDirectory, 'privkey.pem'));
      }

      const emptyVhosts = join(tempRoot, 'empty-vhosts');
      mkdirSync(emptyVhosts);
      const nginxConfig = resolve(__dirname, '../../..', 'nginx', 'nginx.conf');
      const result = spawnSync(
        'docker',
        [
          'run', '--rm',
          '--add-host', 'onservice-api-backend:127.0.0.1',
          '--mount', `type=bind,source=${nginxConfig},target=/etc/nginx/nginx.conf,readonly`,
          '--mount', `type=bind,source=${letsEncryptRoot},target=/etc/letsencrypt,readonly`,
          '--mount', `type=bind,source=${emptyVhosts},target=/etc/nginx/vhosts.d,readonly`,
          '--mount', `type=bind,source=${emptyVhosts},target=/etc/nginx/vhosts.d-cochiloco,readonly`,
          'nginx:1.27-alpine',
          'nginx', '-t', '-c', '/etc/nginx/nginx.conf',
        ],
        { encoding: 'utf8' },
      );
      const output = `${result.stdout}\n${result.stderr}`;

      if (result.status !== 0) {
        throw new Error(`nginx container validation failed (status ${String(result.status)}):\n${output}`);
      }
      expect(output).toContain('test is successful');
      expect(output).not.toMatch(/ssl_stapling.*ignored/i);
      expect(output).not.toMatch(/no OCSP responder URL/i);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
