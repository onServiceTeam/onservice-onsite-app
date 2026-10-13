// HA-M2-111 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 36): the repo's nginx.conf, run in a real nginx container
// (like Bug UX-860), returns 404 for a stored job-media file requested by its
// storage path on both the app and the API host, so private request media is
// reachable only through the signed API route. The app document is sent with
// Permissions-Policy microphone=(self) (camera and location still off) and a
// CSP that allows media-src 'self' blob:, so web voice notes and previews
// work. This is the repo file only: the live box reloads nginx through the
// separate ops step in design-media.md section 10. Needs Docker.
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
      hostname: '127.0.0.1', port, path: requestPath, servername: host, headers: { Host: host }, rejectUnauthorized: false,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString() }));
    });
    request.setTimeout(10_000, () => request.destroy(new Error('Nginx test request timed out.')));
    request.on('error', reject);
  });
}

async function waitForNginx(port: number, host: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await httpsGet(port, host, '/');
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  const detail = lastError instanceof Error ? lastError.message : 'unknown transport error';
  throw new Error(`Nginx did not become ready for TLS requests: ${detail}`);
}

it('HA-M2-111: job-media storage paths are 404 on both hosts and the app document allows the microphone and blob: media', async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'onservice-job-media-nginx-'));
  const containerName = `onservice-job-media-nginx-${process.pid}-${Date.now()}`;
  const owner = '11100000-0000-4000-8000-000000000001';
  const media = '11100000-0000-4000-8000-000000000002';
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
    const appRoot = path.join(tempRoot, 'app');
    mkdirSync(emptyVhosts);
    mkdirSync(path.join(uploads, 'private-artifacts', 'job-media', owner), { recursive: true });
    writeFileSync(path.join(uploads, 'private-artifacts', 'job-media', owner, `${media}.jpg`), 'private request photo');
    mkdirSync(path.join(uploads, 'private-artifacts', 'job-media-tmp'), { recursive: true });
    writeFileSync(path.join(uploads, 'private-artifacts', 'job-media-tmp', `${media}.part`), 'chunk in progress');
    mkdirSync(appRoot);
    writeFileSync(path.join(appRoot, 'index.html'), '<!doctype html><title>onService</title>');

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
      '--mount', `type=bind,source=${appRoot},target=/usr/share/nginx/app,readonly`,
      'nginx:1.27-alpine',
    ], { encoding: 'utf8', timeout: 30_000 });
    if (started.status !== 0) {
      const detail = started.error instanceof Error
        ? started.error.message
        : started.stderr || started.stdout || 'Docker returned no diagnostic output.';
      throw new Error(`nginx container failed to start: ${detail}`);
    }

    const portResult = spawnSync('docker', ['port', containerName, '443/tcp'], { encoding: 'utf8', timeout: 10_000 });
    expect(portResult.status).toBe(0);
    const port = Number(portResult.stdout.trim().match(/:(\d+)$/)?.[1]);
    expect(Number.isInteger(port)).toBe(true);
    await waitForNginx(port, 'app.onservice.ph');

    for (const host of ['app.onservice.ph', 'api.onservice.ph']) {
      for (const stored of [
        `/uploads/private-artifacts/job-media/${owner}/${media}.jpg`,
        `/uploads/private-artifacts/job-media-tmp/${media}.part`,
      ]) {
        const blocked = await httpsGet(port, host, stored);
        expect(blocked.status).toBe(404);
        expect(blocked.body).not.toContain('private request photo');
        expect(blocked.body).not.toContain('chunk in progress');
      }
    }

    const document = await httpsGet(port, 'app.onservice.ph', '/');
    expect(document.status).toBe(200);
    expect(document.headers['permissions-policy']).toBe('camera=(), microphone=(self), geolocation=()');
    expect(String(document.headers['content-security-policy'])).toContain("media-src 'self' blob:;");
    expect(String(document.headers['content-security-policy'])).toContain("default-src 'self';");
  } finally {
    spawnSync('docker', ['rm', '-f', containerName], { encoding: 'utf8', timeout: 10_000 });
    rmSync(tempRoot, { recursive: true, force: true });
  }
}, 60_000);
