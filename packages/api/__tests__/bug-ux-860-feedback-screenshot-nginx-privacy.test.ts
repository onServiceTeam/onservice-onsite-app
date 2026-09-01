import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import { tmpdir } from 'node:os';
import path from 'node:path';

function findOpenSsl(): string {
  if (process.platform !== 'win32') return 'openssl';
  return 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe';
}

function httpsGet(port: number, host: string, requestPath: string): Promise<{
  status: number;
  headers: https.IncomingHttpHeaders;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const request = https.get({
      hostname: '127.0.0.1',
      port,
      path: requestPath,
      servername: host,
      headers: { Host: host },
      rejectUnauthorized: false,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode ?? 0,
        headers: response.headers,
        body: Buffer.concat(chunks).toString(),
      }));
    });
    request.setTimeout(10_000, () => request.destroy(new Error('Nginx test request timed out.')));
    request.on('error', reject);
  });
}

it('Bug UX-860 — Nginx blocks direct feedback evidence while retaining ordinary public uploads', async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'onservice-feedback-nginx-'));
  const containerName = `onservice-feedback-nginx-${process.pid}-${Date.now()}`;
  try {
    const certificate = path.join(tempRoot, 'certificate.pem');
    const privateKey = path.join(tempRoot, 'private-key.pem');
    const generated = spawnSync(findOpenSsl(), [
      'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes',
      '-keyout', privateKey, '-out', certificate, '-days', '1', '-subj', '/CN=localhost',
    ], { encoding: 'utf8', timeout: 30_000 });
    expect(generated.status).toBe(0);

    const letsEncryptRoot = path.join(tempRoot, 'letsencrypt');
    for (const certificateName of ['api.onservice.ph', 'app.onservice.com.ph']) {
      const liveDirectory = path.join(letsEncryptRoot, 'live', certificateName);
      mkdirSync(liveDirectory, { recursive: true });
      copyFileSync(certificate, path.join(liveDirectory, 'fullchain.pem'));
      copyFileSync(privateKey, path.join(liveDirectory, 'privkey.pem'));
    }
    const emptyVhosts = path.join(tempRoot, 'empty-vhosts');
    const uploads = path.join(tempRoot, 'uploads');
    mkdirSync(emptyVhosts);
    mkdirSync(path.join(uploads, 'feedback'), { recursive: true });
    writeFileSync(path.join(uploads, 'feedback', 'evidence.png'), 'private evidence');
    writeFileSync(path.join(uploads, 'public.png'), 'public upload');

    const nginxConfig = path.resolve(__dirname, '../../..', 'nginx', 'nginx.conf');
    const started = spawnSync('docker', [
      'run', '-d', '--rm', '--name', containerName,
      '--add-host', 'onservice-api-backend:127.0.0.1',
      '-p', '127.0.0.1::443',
      '--mount', `type=bind,source=${nginxConfig},target=/etc/nginx/nginx.conf,readonly`,
      '--mount', `type=bind,source=${letsEncryptRoot},target=/etc/letsencrypt,readonly`,
      '--mount', `type=bind,source=${emptyVhosts},target=/etc/nginx/vhosts.d,readonly`,
      '--mount', `type=bind,source=${emptyVhosts},target=/etc/nginx/vhosts.d-cochiloco,readonly`,
      '--mount', `type=bind,source=${uploads},target=/usr/share/nginx/uploads,readonly`,
      'nginx:1.27-alpine',
    ], { encoding: 'utf8', timeout: 30_000 });
    if (started.status !== 0) {
      const detail = started.error instanceof Error
        ? started.error.message
        : started.stderr || started.stdout || 'Docker returned no diagnostic output.';
      throw new Error(`nginx container failed to start: ${detail}`);
    }

    const portResult = spawnSync('docker', ['port', containerName, '443/tcp'], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    expect(portResult.status).toBe(0);
    const port = Number(portResult.stdout.trim().match(/:(\d+)$/)?.[1]);
    expect(Number.isInteger(port)).toBe(true);

    for (const host of ['app.onservice.ph', 'api.onservice.ph']) {
      const blocked = await httpsGet(port, host, '/uploads/feedback/evidence.png');
      expect(blocked.status).toBe(404);
      expect(blocked.headers['cache-control']).toBe('private, no-store');

      const publicUpload = await httpsGet(port, host, '/uploads/public.png');
      expect(publicUpload.status).toBe(200);
      expect(publicUpload.body).toBe('public upload');
    }
  } finally {
    spawnSync('docker', ['rm', '-f', containerName], { encoding: 'utf8', timeout: 10_000 });
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
