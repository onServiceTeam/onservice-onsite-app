import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const EXPORT_KEY = 'private-feedback-pull-key-0123456789abcdef';

function runPull(script: string, api: string, outDir: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, '--api', api, '--out-dir', outDir], {
      env: { ...process.env, FEEDBACK_EXPORT_KEY: EXPORT_KEY },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`feedback pull exited ${String(code)}: ${stderr}`));
    });
  });
}

it('Bug UX-862 — feedback pull keeps the export key in headers and downloads screenshots through the private route', async () => {
  const outputDirectory = mkdtempSync(path.join(tmpdir(), 'onservice-feedback-pull-'));
  const observed: Array<{ url: string; key: string | undefined }> = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    observed.push({ url: req.url ?? '', key: req.headers['x-feedback-key'] as string | undefined });
    if (req.headers['x-feedback-key'] !== EXPORT_KEY) {
      res.writeHead(401).end('missing key');
      return;
    }
    if (req.url === '/api/v1/feedback/export.md?limit=5000') {
      res.writeHead(200, { 'content-type': 'text/markdown' });
      res.end('Screenshot: /uploads/feedback/evidence.png');
      return;
    }
    if (req.url === '/api/v1/feedback/export.json?limit=5000') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        count: 1,
        submissions: [{ payload: { items: [{ screenshots: ['/uploads/feedback/evidence.png'] }] } }],
      }));
      return;
    }
    if (req.url === '/api/v1/feedback/export-screenshot/evidence.png') {
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end('private screenshot bytes');
      return;
    }
    res.writeHead(404).end('not found');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');
    const script = path.resolve(__dirname, '../../..', 'scripts', 'feedback', 'pull.mjs');
    const result = await runPull(script, `http://127.0.0.1:${address.port}`, outputDirectory);

    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('downloaded 1 screenshot');
    expect(observed.map((request) => request.url)).toEqual(expect.arrayContaining([
      '/api/v1/feedback/export.md?limit=5000',
      '/api/v1/feedback/export.json?limit=5000',
      '/api/v1/feedback/export-screenshot/evidence.png',
    ]));
    expect(observed.every((request) => request.key === EXPORT_KEY)).toBe(true);
    expect(observed.every((request) => !request.url.includes('key='))).toBe(true);
    expect(readFileSync(path.join(outputDirectory, 'feedback-screenshots', 'evidence.png'), 'utf8'))
      .toBe('private screenshot bytes');
    expect(readFileSync(path.join(outputDirectory, 'FEEDBACK-INBOX.md'), 'utf8'))
      .toContain('feedback-screenshots/evidence.png');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    rmSync(outputDirectory, { recursive: true, force: true });
  }
});
