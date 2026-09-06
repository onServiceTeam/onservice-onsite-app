// Read-only HTTPS and observed-files adapters. No activation or acceptance.
import https from 'node:https';
import { checkServerIdentity } from 'node:tls';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { setTimeout, clearTimeout } from 'node:timers';
import { inspectReleaseDirectory, validateReleaseFileList } from './paired-web-release.mjs';

const { structuredClone } = globalThis;
const hosts = new Set(['admin.onservice.ph', 'app.onservice.ph']);
const types = {
  '.html': ['text/html'], '.json': ['application/json'], '.map': ['application/json', 'application/octet-stream'],
  '.js': ['application/javascript', 'text/javascript'], '.mjs': ['application/javascript', 'text/javascript'],
  '.css': ['text/css'], '.png': ['image/png'], '.jpg': ['image/jpeg'], '.jpeg': ['image/jpeg'],
  '.gif': ['image/gif'], '.webp': ['image/webp'], '.svg': ['image/svg+xml'],
  '.ico': ['image/x-icon', 'image/vnd.microsoft.icon'], '.txt': ['text/plain'],
  '.woff': ['font/woff', 'application/font-woff'], '.woff2': ['font/woff2'],
  '.ttf': ['font/ttf', 'application/x-font-ttf'], '.eot': ['application/vnd.ms-fontobject'],
};
const fail = message => { throw new Error(message); };

export function validateStaticFileList(files) {
  validateReleaseFileList(files);
  for (const file of files) {
    if (!types[path.posix.extname(file.name).toLowerCase()] ||
        (file.name.includes('/') && !file.name.startsWith('assets/') && !file.name.startsWith('_expo/static/js/web/'))) {
      fail('File is outside the static web observer scope');
    }
  }
}

export async function readServedWebFile(target, file) {
  validateStaticFileList([file]);
  if (!target || Object.keys(target).some(key => !['hostname', 'port', 'address', 'ca', 'timeoutMs'].includes(key)) ||
      !hosts.has(target.hostname) || !Number.isInteger(target.port) || target.port < 1 || target.port > 65535 ||
      (target.address !== undefined && target.address !== '127.0.0.1')) fail('Invalid HTTPS observer target');
  const timeoutMs = target.timeoutMs ?? 15000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 30000) fail('Invalid HTTPS deadline');
  const acceptedTypes = types[path.posix.extname(file.name).toLowerCase()];
  return new Promise((resolve, reject) => {
    let settled = false;
    let response;
    let deadline;
    let request;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (error) {
        response?.destroy();
        request?.destroy();
        reject(error);
      } else resolve(value);
    };
    // No cookies, credentials, redirects or caller-controlled TLS bypass.
    // A CA can be supplied to the low-level helper for isolated TLS fixtures;
    // the marketplace factory never supplies one or exposes target overrides.
    request = https.get({
      hostname: target.address ?? target.hostname, port: target.port,
      servername: target.hostname, method: 'GET', path: `/${file.name}`,
      agent: false, rejectUnauthorized: true, ca: target.ca,
      checkServerIdentity: (_name, certificate) => checkServerIdentity(target.hostname, certificate),
      headers: { Host: target.hostname, 'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache',
        'User-Agent': 'onservice-release-observer/1', Connection: 'close' },
    }, incoming => {
      response = incoming;
      incoming.on('error', () => finish(new Error('HTTPS response failed')));
      incoming.on('aborted', () => finish(new Error('HTTPS response was interrupted')));
      if (incoming.statusCode !== 200) return finish(new Error(`HTTPS status ${incoming.statusCode} is not accepted`));
      const type = String(incoming.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      if (!acceptedTypes.includes(type)) return finish(new Error('HTTPS MIME type does not match the static file'));
      const encoding = incoming.headers['content-encoding'];
      if (encoding && encoding !== 'identity') return finish(new Error('Unexpected HTTPS content encoding'));
      const length = incoming.headers['content-length'];
      if (length !== undefined && (!/^\d+$/.test(length) || Number(length) !== file.size)) {
        return finish(new Error('HTTPS declared byte length mismatch'));
      }
      let size = 0;
      const digest = createHash('sha256');
      incoming.on('data', bytes => {
        if (settled) return;
        size += bytes.length;
        if (size > file.size) return finish(new Error('HTTPS body exceeds its expected byte length'));
        digest.update(bytes);
      });
      incoming.on('end', () => {
        if (settled) return;
        const sha256 = digest.digest('hex');
        if (!incoming.complete || size !== file.size || sha256 !== file.sha256) {
          return finish(new Error('HTTPS served checksum or byte length mismatch'));
        }
        finish(null, { name: file.name, size, sha256 });
      });
    });
    request.on('error', error => finish(new Error(`HTTPS request failed (${error.code ?? 'transport'})`)));
    // Wall-clock deadline, not an idle timeout that a trickling response resets.
    deadline = setTimeout(() => finish(new Error('HTTPS verification deadline exceeded')), timeoutMs);
  });
}

export function createObservedWebVerifier({ inspectNginx, hashMountedFile, readFile }) {
  for (const operation of [inspectNginx, hashMountedFile, readFile]) {
    if (typeof operation !== 'function') fail('Missing read-only observer operation');
  }
  let baselinePromise;
  async function checkedSnapshot(journal) {
    const snapshot = structuredClone(await inspectNginx());
    if (!/^[a-f0-9]{64}$/.test(snapshot.containerId) || !/^sha256:[a-f0-9]{64}$/.test(snapshot.imageId)) {
      fail('Invalid nginx identity');
    }
    for (const kind of ['admin', 'web']) {
      const actual = await inspectReleaseDirectory(snapshot.roots[kind].path);
      const expected = journal?.[kind]?.destination;
      if (!expected || ['path', 'dev', 'ino'].some(key => actual[key] !== expected[key] || actual[key] !== snapshot.roots[kind][key])) {
        fail('Observed web root does not match the release journal');
      }
    }
    return snapshot;
  }
  return async function verifyServedFiles(kind, files, journal) {
    if (!['admin', 'web'].includes(kind)) fail('Unknown marketplace web surface');
    validateStaticFileList(files); // Entire list before Docker or HTTPS reads.
    baselinePromise ??= checkedSnapshot(journal);
    const baseline = await baselinePromise;
    const before = await checkedSnapshot(journal);
    if (JSON.stringify(before) !== JSON.stringify(baseline)) fail('nginx identity, mounts or configuration changed');
    const observed = [];
    // Serial streaming reads bound load on the shared edge server.
    for (const file of files) {
      const mounted = await hashMountedFile(before, kind, file);
      if (mounted !== file.sha256) fail('Mounted nginx file checksum mismatch');
      const served = await readFile(before, kind, file);
      validateReleaseFileList([served]);
      if (served.name !== file.name || served.sha256 !== file.sha256 || served.size !== file.size) fail('Observed served file mismatch');
      observed.push(served);
    }
    const after = await checkedSnapshot(journal);
    if (JSON.stringify(after) !== JSON.stringify(baseline)) fail('nginx changed during served-file verification');
    return observed;
  };
}
