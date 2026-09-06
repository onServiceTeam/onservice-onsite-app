import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { setInterval, clearInterval } from 'node:timers';
import { readServedWebFile, createObservedWebVerifier } from '../served-web-files.mjs';
import { createMarketplaceReleaseObservers, validateMarketplaceContainer } from '../marketplace-release-observers.mjs';
import { preparePairedRelease, stagePairedRelease, publishPairedRelease, rollbackPairedRelease,
  inspectReleaseDirectory } from '../paired-web-release.mjs';

const { structuredClone } = globalThis;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const body = Buffer.from('const release = "verified";');
const file = { name: 'assets/index-ABCDEFGH.js', size: body.length, sha256: sha(body) };
const cid = 'a'.repeat(64), image = `sha256:${'b'.repeat(64)}`;
let directory, certificate, key, wrongCertificate, wrongKey;

before(async () => {
  directory = await fs.mkdtemp(path.join(tmpdir(), 'onservice-observer-tests-'));
  const openssl = process.platform === 'win32' ? 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe' : 'openssl';
  for (const [name, san] of [['valid', 'DNS:admin.onservice.ph,DNS:app.onservice.ph'], ['wrong', 'DNS:fixture.invalid']]) {
    execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-days', '1',
      '-subj', '/CN=release-fixture', '-addext', `subjectAltName=${san}`,
      '-keyout', path.join(directory, `${name}.key`), '-out', path.join(directory, `${name}.pem`)],
    { timeout: 15000, stdio: 'pipe' });
  }
  certificate = await fs.readFile(path.join(directory, 'valid.pem'));
  key = await fs.readFile(path.join(directory, 'valid.key'));
  wrongCertificate = await fs.readFile(path.join(directory, 'wrong.pem'));
  wrongKey = await fs.readFile(path.join(directory, 'wrong.key'));
});

async function removeFixture(root) {
  assert.equal(await fs.realpath(root), root);
  assert.equal(path.dirname(root), await fs.realpath(tmpdir()));
  assert.match(path.basename(root), /^onservice-observer-/);
  await fs.rm(root, { recursive: true, force: true });
}
after(async () => { if (directory) await removeFixture(directory); });

async function tlsFixture(handler, run, wrong = false) {
  const requests = [], sockets = new Set();
  const server = https.createServer({ key: wrong ? wrongKey : key, cert: wrong ? wrongCertificate : certificate }, (request, response) => {
    requests.push({ path: request.url, headers: request.headers, servername: request.socket.servername });
    Promise.resolve(handler(request, response)).catch(error => response.destroy(error));
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const target = { hostname: 'admin.onservice.ph', address: '127.0.0.1', port: server.address().port,
    ca: wrong ? wrongCertificate : certificate };
  try { await run(target, requests); }
  finally {
    const closed = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    for (const socket of sockets) socket.destroy();
    await closed;
  }
}
const serve = (_request, response) => { response.writeHead(200, { 'Content-Type': 'application/javascript', 'Content-Length': body.length }); response.end(body); };

test('HTTPS observes actual streamed bytes with host/SNI and no credentials', () => tlsFixture(serve, async (target, requests) => {
  assert.deepEqual(await readServedWebFile(target, file), file);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].headers.host, 'admin.onservice.ph');
  assert.equal(requests[0].servername, 'admin.onservice.ph');
  assert.equal(requests[0].headers.cookie, undefined);
  assert.equal(requests[0].headers.authorization, undefined);
  assert.equal(requests[0].headers['accept-encoding'], 'identity');
}));

test('HTTPS accepts a correctly hashed complete chunked response', () => tlsFixture((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
  res.write(body.subarray(0, 8)); res.end(body.subarray(8));
}, async target => { assert.deepEqual(await readServedWebFile(target, file), file); }));

for (const status of [302, 401, 404]) test(`HTTPS rejects status ${status} without following another location`, () => tlsFixture((_req, res) => {
  res.writeHead(status, { Location: '/redirected', 'Content-Type': 'application/javascript' }); res.end(body);
}, async (target, requests) => {
  await assert.rejects(readServedWebFile(target, file), new RegExp(`status ${status}`));
  assert.equal(requests.length, 1);
}));

test('HTTPS refuses a 200 SPA fallback even if its bytes match the supplied digest', () => tlsFixture((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(body);
}, async target => { await assert.rejects(readServedWebFile(target, file), /MIME type/); }));

test('HTTPS refuses same-size stale bytes under the correct MIME type', () => tlsFixture((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/javascript' }); res.end(Buffer.alloc(body.length, 120));
}, async target => { await assert.rejects(readServedWebFile(target, file), /checksum/); }));

test('HTTPS refuses an unexpected declared length', () => tlsFixture((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/javascript', 'Content-Length': body.length + 1 }); res.end(body);
}, async target => { await assert.rejects(readServedWebFile(target, file), /declared byte length/); }));

test('HTTPS bounds chunked bytes before an oversized body can complete', () => tlsFixture((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/javascript' }); res.write(body); res.end('extra');
}, async target => { await assert.rejects(readServedWebFile(target, file), /exceeds/); }));

test('HTTPS refuses a prematurely closed response', () => tlsFixture((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/javascript', 'Content-Length': body.length });
  res.flushHeaders(); res.write(body.subarray(0, 4)); res.destroy();
}, async target => { await assert.rejects(readServedWebFile(target, file), /interrupted|request failed|response failed|checksum/); }));

test('HTTPS refuses unsolicited compression rather than hashing compressed bytes as the asset', () => tlsFixture((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/javascript', 'Content-Encoding': 'gzip' }); res.end(body);
}, async target => { await assert.rejects(readServedWebFile(target, file), /content encoding/); }));

test('HTTPS enforces a total deadline despite a trickling response', () => tlsFixture((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/javascript' }); res.flushHeaders();
  const timer = setInterval(() => res.write('x'), 20);
  res.on('close', () => clearInterval(timer));
}, async target => {
  await assert.rejects(readServedWebFile({ ...target, timeoutMs: 150 }, { ...file, size: 1000 }), /deadline exceeded/);
}));

test('HTTPS rejects an untrusted certificate before any HTTP request', () => tlsFixture(serve, async (target, requests) => {
  const untrusted = { ...target }; delete untrusted.ca;
  await assert.rejects(readServedWebFile(untrusted, file), /HTTPS request failed/);
  assert.equal(requests.length, 0);
}));

test('HTTPS validates the intended hostname even when connecting to loopback with a trusted fixture certificate', () => tlsFixture(serve, async (target, requests) => {
  await assert.rejects(readServedWebFile(target, file), /ERR_TLS_CERT_ALTNAME_INVALID/);
  assert.equal(requests.length, 0);
}, true));

for (const [label, mutateTarget, mutateFile] of [
  ['TLS bypass', target => ({ ...target, rejectUnauthorized: false }), item => item],
  ['other business hostname', target => ({ ...target, hostname: 'other.example.invalid' }), item => item],
  ['non-loopback address override', target => ({ ...target, address: '192.0.2.1' }), item => item],
  ['path traversal', target => target, item => ({ ...item, name: '../secret.js' })],
  ['API route', target => target, item => ({ ...item, name: 'api/v1/users.json' })],
  ['unsupported file type', target => target, item => ({ ...item, name: 'assets/private.key' })],
]) test(`HTTPS rejects ${label} before network access`, () => tlsFixture(serve, async (target, requests) => {
  await assert.rejects(readServedWebFile(mutateTarget(target), mutateFile(file)));
  assert.equal(requests.length, 0);
}));

function containerRecord(service = 'nginx') {
  return { id: cid, imageId: image, name: `/onservice-${service}-1`, running: true, restarting: false,
    startedAt: '2026-09-01T00:00:00.000Z', labels: { 'com.docker.compose.project': 'onservice', 'com.docker.compose.service': service },
    ports: { '443/tcp': [{ HostIp: '127.0.0.1', HostPort: '8443' }] }, mounts: [
      { Type: 'bind', Source: '/opt/onservice/apps/admin/dist', Destination: '/usr/share/nginx/admin', RW: false },
      { Type: 'bind', Source: '/opt/onservice/apps/mobile/dist-web', Destination: '/usr/share/nginx/app', RW: false },
      { Type: 'bind', Source: '/opt/onservice/nginx/nginx.conf', Destination: '/etc/nginx/nginx.conf', RW: false },
      { Type: 'bind', Source: '/opt/other-project/public', Destination: '/other-project', RW: false },
    ] };
}
const inspectionLines = record => [record.id, record.name, record.imageId, record.running, record.restarting,
  record.startedAt, record.labels, record.mounts, record.ports].map(value => JSON.stringify(value)).join('\n');

for (const [label, mutate] of [
  ['wrong project', record => { record.labels['com.docker.compose.project'] = 'other'; }],
  ['wrong service', record => { record.labels['com.docker.compose.service'] = 'api'; }],
  ['wrong name', record => { record.name = '/other-nginx-1'; }],
  ['stopped container', record => { record.running = false; }],
  ['restarting container', record => { record.restarting = true; }],
  ['public binding', record => { record.ports['443/tcp'][0].HostIp = '0.0.0.0'; }],
  ['different port', record => { record.ports['443/tcp'][0].HostPort = '443'; }],
  ['wrong web source', record => { record.mounts[1].Source = '/opt/other-project/public'; }],
  ['writable web mount', record => { record.mounts[0].RW = true; }],
  ['shadowing nested mount', record => { record.mounts.push({ Type: 'bind', Source: '/other', Destination: '/usr/share/nginx/admin/assets', RW: false }); }],
  ['wrong configuration mount', record => { record.mounts[2].Source = '/other/nginx.conf'; }],
]) test(`container contract refuses ${label}`, () => {
  const record = containerRecord();
  validateMarketplaceContainer(record, 'nginx');
  mutate(record);
  assert.throws(() => validateMarketplaceContainer(record, 'nginx'));
});

test('API observer checks exact container before and after its scoped readiness command', async () => {
  const calls = [], record = containerRecord('api');
  const observer = createMarketplaceReleaseObservers({ runDocker: async args => {
    calls.push(args);
    return args[0] === 'inspect' ? inspectionLines(record) : JSON.stringify({ status: 'ready', checks: { postgres: 'ok', redis: 'ok' } });
  } });
  assert.deepEqual(await observer.inspectApi(), { containerId: cid, imageId: image, ready: true });
  assert.equal(calls.filter(args => args[0] === 'inspect').length, 2);
  assert.deepEqual(calls.find(args => args[0] === 'exec'), ['exec', cid, 'curl', '--disable', '--noproxy', '*', '--fail', '--silent', '--show-error', '--max-time', '10', 'http://127.0.0.1:7381/health/ready']);
  await assert.rejects(publishPairedRelease('/not-a-release', 'invalid', observer), /Required release adapter: assertReleaseAcceptance/);
});

test('API observer does not promote malformed or unhealthy readiness to success', async () => {
  for (const payload of ['not JSON', '{"status":"ready","checks":{"postgres":"ok","redis":"error"}}']) {
    const observer = createMarketplaceReleaseObservers({ runDocker: async args => args[0] === 'inspect' ? inspectionLines(containerRecord('api')) : payload });
    assert.equal((await observer.inspectApi()).ready, false);
  }
});

test('API observer rejects container replacement during readiness', async () => {
  let inspections = 0;
  const observer = createMarketplaceReleaseObservers({ runDocker: async args => {
    if (args[0] !== 'inspect') return '{"status":"ready","checks":{"postgres":"ok","redis":"ok"}}';
    const record = containerRecord('api');
    if (++inspections === 2) record.id = 'c'.repeat(64);
    return inspectionLines(record);
  } });
  await assert.rejects(observer.inspectApi(), /container changed/);
});

test('container observation accepts reordered mount and label inventories without hiding identity', async () => {
  let inspections = 0;
  const observer = createMarketplaceReleaseObservers({ runDocker: async args => {
    if (args[0] !== 'inspect') return '{"status":"ready","checks":{"postgres":"ok","redis":"ok"}}';
    const record = containerRecord('api');
    if (++inspections === 2) {
      record.mounts.reverse();
      record.labels = Object.fromEntries(Object.entries(record.labels).reverse());
    }
    return inspectionLines(record);
  } });
  assert.deepEqual(await observer.inspectApi(), { containerId: cid, imageId: image, ready: true });
});

test('container observation still rejects changed mount contents after an inventory reorder', async () => {
  let inspections = 0;
  const observer = createMarketplaceReleaseObservers({ runDocker: async args => {
    if (args[0] !== 'inspect') return '{"status":"ready","checks":{"postgres":"ok","redis":"ok"}}';
    const record = containerRecord('api');
    if (++inspections === 2) {
      record.mounts.reverse();
      record.mounts[0].Source = '/unexpected-replacement';
    }
    return inspectionLines(record);
  } });
  await assert.rejects(observer.inspectApi(), /container changed/);
});

async function observedFixture(run) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'onservice-observer-web-'));
  const journal = {}, snapshot = { containerId: cid, imageId: image, configurationSha256: 'd'.repeat(64), localPort: 8443, roots: {} };
  for (const kind of ['admin', 'web']) {
    const destination = path.join(root, kind);
    await fs.mkdir(destination);
    await fs.mkdir(path.join(destination, 'assets'));
    await fs.writeFile(path.join(destination, file.name), body);
    const actual = await inspectReleaseDirectory(destination);
    journal[kind] = { destination: actual };
    snapshot.roots[kind] = actual;
  }
  const events = [];
  const operations = { inspectNginx: async () => structuredClone(snapshot),
    hashMountedFile: async (_snapshot, kind, item) => sha(await fs.readFile(path.join(root, kind, item.name))),
    readFile: async (_snapshot, kind, item) => { events.push(kind); return { ...item }; } };
  try { await run({ root, journal, snapshot, operations, events }); }
  finally { await removeFixture(root); }
}

test('observed verifier rejects the whole unsafe file list before inspection or HTTPS', () => observedFixture(async f => {
  let inspected = false;
  f.operations.inspectNginx = async () => { inspected = true; return f.snapshot; };
  const verify = createObservedWebVerifier(f.operations);
  await assert.rejects(verify('admin', [file, { ...file, name: 'api/private.json' }], f.journal), /static web observer scope/);
  assert.equal(inspected, false); assert.deepEqual(f.events, []);
}));

test('observed verifier rejects a mismatched journal destination before serving checks', () => observedFixture(async f => {
  f.journal.admin.destination = f.journal.web.destination;
  await assert.rejects(createObservedWebVerifier(f.operations)('admin', [file], f.journal), /root does not match/);
  assert.deepEqual(f.events, []);
}));

test('observed verifier refuses mounted bytes that differ from the artifact', () => observedFixture(async f => {
  await fs.writeFile(path.join(f.root, 'admin', file.name), 'stale mounted bytes');
  await assert.rejects(createObservedWebVerifier(f.operations)('admin', [file], f.journal), /Mounted nginx file checksum/);
  assert.deepEqual(f.events, []);
}));

test('observed verifier detects configuration drift after real HTTPS reads', () => observedFixture(f => tlsFixture(serve, async target => {
  f.operations.readFile = async (_snapshot, _kind, item) => {
    const result = await readServedWebFile(target, item);
    f.snapshot.configurationSha256 = 'e'.repeat(64);
    return result;
  };
  await assert.rejects(createObservedWebVerifier(f.operations)('admin', [file], f.journal), /nginx changed during/);
})));

test('paired publication and rollback use observed real filesystem and TLS bytes', () => observedFixture(async f => {
  const revision = 'f'.repeat(40), nextImage = `sha256:${'e'.repeat(64)}`;
  const options = { sourceRevision: revision, apiImageId: nextImage, previousApiImageId: image, controlDirectory: path.join(f.root, 'control') };
  await fs.mkdir(options.controlDirectory, { mode: 0o700 });
  for (const kind of ['admin', 'web']) {
    const source = path.join(f.root, `${kind}-source`);
    await fs.mkdir(source);
    const destination = path.join(f.root, kind);
    options[kind] = { source, destination };
    await fs.writeFile(path.join(destination, 'index.html'), `old ${kind}`);
    await fs.writeFile(path.join(source, 'index.html'), `new ${kind}`);
    await fs.writeFile(path.join(source, 'build-audit.json'), JSON.stringify({ sourceRevision: revision,
      apiOrigin: `https://${kind === 'admin' ? 'admin' : 'app'}.onservice.ph`, demoMode: false, deploymentEligible: false }));
  }
  await tlsFixture(async (request, response) => {
    const kind = request.headers.host === 'admin.onservice.ph' ? 'admin' : 'web';
    const name = request.url.slice(1);
    const bytes = await fs.readFile(path.join(f.root, kind, name));
    const type = name.endsWith('.js') ? 'application/javascript' : name.endsWith('.json') ? 'application/json' : 'text/html';
    response.writeHead(200, { 'Content-Type': type, 'Content-Length': bytes.length }); response.end(bytes);
  }, async (target, requests) => {
    f.operations.readFile = (_snapshot, kind, item) => readServedWebFile({ ...target, hostname: kind === 'admin' ? 'admin.onservice.ph' : 'app.onservice.ph' }, item);
    const verifyServedFiles = createObservedWebVerifier(f.operations);
    let runningImage = image;
    const adapters = { verifyServedFiles, assertReleaseAcceptance: async () => true, assertRollbackAcceptance: async () => true,
      inspectApi: async () => ({ imageId: runningImage, ready: true }), activateApi: async id => { runningImage = id; } };
    const id = await preparePairedRelease(options);
    await stagePairedRelease(options.controlDirectory, id);
    await publishPairedRelease(options.controlDirectory, id, adapters);
    assert.equal(await fs.readFile(path.join(f.root, 'admin/index.html'), 'utf8'), 'new admin');
    assert.equal(await fs.readFile(path.join(f.root, 'web/index.html'), 'utf8'), 'new web');
    assert.equal(runningImage, nextImage);
    await rollbackPairedRelease(options.controlDirectory, id, adapters);
    assert.equal(await fs.readFile(path.join(f.root, 'admin/index.html'), 'utf8'), 'old admin');
    assert.equal(await fs.readFile(path.join(f.root, 'web/index.html'), 'utf8'), 'old web');
    assert.equal(runningImage, image);
    assert.ok(requests.some(request => request.headers.host === 'admin.onservice.ph'));
    assert.ok(requests.some(request => request.headers.host === 'app.onservice.ph'));
  });
}));
