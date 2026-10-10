// File-publication core. There is deliberately no default production adapter or
// command that activates services. See docs/runbooks/paired-web-api-release.md.
import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { hostname } from 'node:os';

const { structuredClone } = globalThis;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const mutable = {
  admin: ['build-audit.json', 'index.html'],
  web: ['build-audit.json', 'metadata.json', 'favicon.ico', 'index.html'],
};
const origins = { admin: 'https://admin.onservice.ph', web: 'https://app.onservice.ph' };
const surfaces = ['admin', 'web'];
const shaPattern = /^[a-f0-9]{40}$/;
const imagePattern = /^sha256:[a-f0-9]{64}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const fail = message => { throw new Error(message); };

function relativeName(name) {
  if (typeof name !== 'string' || !name || name.length > 512 ||
      name.split('/').some(part => !/^[A-Za-z0-9_@][A-Za-z0-9_.@+-]*$/.test(part)) ||
      name.includes('\\') || path.posix.normalize(name) !== name) fail('Unsafe release-relative path');
  return name;
}

async function safeDirectory(directory) {
  const resolved = path.resolve(directory);
  let current = path.parse(resolved).root;
  for (const part of resolved.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = await fs.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('Release directory is not a real directory');
  }
  const real = await fs.realpath(resolved);
  if (real.toLowerCase() !== resolved.toLowerCase()) fail('Release directory resolves elsewhere');
  const stat = await fs.stat(resolved, { bigint: true });
  return { path: resolved, dev: String(stat.dev), ino: String(stat.ino) };
}

async function checkRoot(root) {
  const now = await safeDirectory(root.path);
  if (now.dev !== root.dev || now.ino !== root.ino) fail('Release root directory was replaced');
}

async function bytesAt(root, name) {
  relativeName(name);
  await checkRoot(root);
  const target = path.join(root.path, ...name.split('/'));
  await safeDirectory(path.dirname(target));
  const before = await fs.lstat(target, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.size > 64n * 1024n * 1024n) {
    fail('Expected a bounded regular release file');
  }
  const handle = await fs.open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat({ bigint: true });
    if (before.dev !== opened.dev || before.ino !== opened.ino || before.size !== opened.size) {
      fail('Release file changed while opening');
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    const named = await fs.lstat(target, { bigint: true });
    if (after.size !== before.size || after.mtimeNs !== before.mtimeNs ||
        named.dev !== before.dev || named.ino !== before.ino || named.isSymbolicLink()) {
      fail('Release file changed while reading');
    }
    await checkRoot(root);
    return bytes;
  } finally { await handle.close(); }
}

async function inventory(root) {
  const files = [];
  let total = 0;
  async function walk(prefix = '') {
    await checkRoot(root);
    const dir = path.join(root.path, ...prefix.split('/').filter(Boolean));
    await safeDirectory(dir);
    for (const entry of (await fs.readdir(dir)).sort()) {
      const name = relativeName(prefix ? `${prefix}/${entry}` : entry);
      const stat = await fs.lstat(path.join(root.path, ...name.split('/')));
      if (stat.isSymbolicLink()) fail('Symbolic links are not release files');
      if (stat.isDirectory()) await walk(name);
      else {
        const bytes = await bytesAt(root, name);
        total += bytes.length;
        if (files.length >= 25000 || total > 1024 * 1024 * 1024) fail('Release inventory exceeds its bound');
        files.push({ name, sha256: hash(bytes), size: bytes.length });
      }
    }
  }
  await walk();
  return files.sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

function validateManifest(files) {
  if (!Array.isArray(files) || files.length > 25000) fail('Invalid release inventory');
  const names = new Set();
  for (const file of files) {
    relativeName(file.name);
    if (names.has(file.name) || !digestPattern.test(file.sha256) ||
        !Number.isSafeInteger(file.size) || file.size < 0 || file.size > 64 * 1024 * 1024) {
      fail('Invalid release inventory entry');
    }
    names.add(file.name);
  }
}

function validateCandidateFiles(kind, files) {
  validateManifest(files);
  for (const required of ['index.html', 'build-audit.json']) {
    if (!files.some(file => file.name === required && file.size > 0)) fail('Candidate is missing a required entry file');
  }
  for (const file of files) {
    if (mutable[kind].includes(file.name)) continue;
    const asset = kind === 'admin'
      ? /^assets\/.+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/.test(file.name)
      : /^assets\/.+\.[a-f0-9]{32}(?:@[1-9]x)?\.[A-Za-z0-9]+$/.test(file.name) ||
        /^_expo\/static\/js\/web\/.+-[a-f0-9]{32}\.js$/.test(file.name);
    if (!asset) fail('Unreviewed mutable or unhashed candidate file');
  }
}

async function verifyFiles(root, files) {
  for (const file of files) {
    const bytes = await bytesAt(root, file.name);
    if (bytes.length !== file.size || hash(bytes) !== file.sha256) fail('Release file checksum mismatch');
  }
}

async function ensureParents(root, name) {
  relativeName(name);
  await checkRoot(root);
  let current = root.path;
  for (const part of name.split('/').slice(0, -1)) {
    current = path.join(current, part);
    try { await fs.mkdir(current, { mode: 0o755 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    await safeDirectory(current);
  }
}

async function syncDirectory(directory) {
  // POSIX durability. Windows fixture runs exercise replacement behavior but
  // do not certify crash durability of directory metadata on that platform.
  if (process.platform === 'win32') return;
  const handle = await fs.open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function exclusiveFile(target, bytes, mode = 0o600) {
  const handle = await fs.open(target, 'wx', mode);
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
}

async function withLock(controlDirectory, operation) {
  const control = await safeDirectory(controlDirectory);
  const permissions = await fs.stat(control.path);
  if (process.platform !== 'win32' && ((permissions.mode & 0o077) !== 0 || permissions.uid !== process.getuid())) {
    fail('Release control directory must be private and owned by this operator');
  }
  const lock = path.join(control.path, 'active.lock');
  const owner = { nonce: randomUUID(), pid: process.pid, host: hostname() };
  // One fixed coordination directory is required by the future host adapter.
  // Never infer a stale lock from elapsed time or automatically break one.
  await fs.mkdir(lock, { mode: 0o700 });
  try {
    await exclusiveFile(path.join(lock, 'owner.json'), JSON.stringify(owner));
    return await operation(control);
  } finally {
    const actual = JSON.parse(await fs.readFile(path.join(lock, 'owner.json'), 'utf8'));
    if (actual.nonce !== owner.nonce) fail('Release lock ownership changed; lock retained');
    await fs.unlink(path.join(lock, 'owner.json'));
    await fs.rmdir(lock);
  }
}

async function save(journalDirectory, journal) {
  if (!Array.isArray(journal.history) || journal.history.length >= 200000) fail('Invalid or exhausted release history');
  journal.history.push({ at: new Date().toISOString(), phase: journal.phase, intent: journal.intent ?? null });
  const temporary = path.join(journalDirectory, `journal-${randomUUID()}.tmp`);
  await exclusiveFile(temporary, `${JSON.stringify(journal, null, 2)}\n`);
  await fs.rename(temporary, path.join(journalDirectory, 'journal.json'));
  await syncDirectory(journalDirectory);
}

async function load(control, releaseId) {
  if (!/^release-[a-f0-9-]{36}$/.test(releaseId)) fail('Invalid release journal identifier');
  const directory = path.join(control.path, releaseId);
  const root = await safeDirectory(directory);
  const journal = JSON.parse((await bytesAt(root, 'journal.json')).toString('utf8'));
  if (journal.version !== 1 || journal.id !== releaseId || !shaPattern.test(journal.sourceRevision) ||
      !imagePattern.test(journal.apiImageId) || !imagePattern.test(journal.previousApiImageId) ||
      !['prepared', 'staged', 'api-activating', 'api-active', 'publishing-admin', 'publishing-web',
        'published', 'rolling-back', 'rolled-back'].includes(journal.phase)) fail('Invalid release journal');
  for (const kind of surfaces) {
    const item = journal[kind];
    await checkRoot(item.source);
    await checkRoot(item.destination);
    validateManifest(item.before);
    validateCandidateFiles(kind, item.after);
  }
  disjoint([control, ...surfaces.flatMap(kind => [journal[kind].source, journal[kind].destination])]);
  if (!Array.isArray(journal.history) || journal.history.length > 200000) fail('Invalid release history');
  return { directory, journal };
}

function disjoint(roots) {
  for (let i = 0; i < roots.length; i++) for (let j = i + 1; j < roots.length; j++) {
    const a = roots[i].path.toLowerCase();
    const b = roots[j].path.toLowerCase();
    if (a === b || a.startsWith(`${b}${path.sep}`) || b.startsWith(`${a}${path.sep}`)) {
      fail('Release source, destination and control roots must not overlap');
    }
  }
}

async function snapshot(source, files, directory) {
  await fs.mkdir(directory, { mode: 0o700 });
  const destination = await safeDirectory(directory);
  for (const file of files) {
    const bytes = await bytesAt(source, file.name);
    if (hash(bytes) !== file.sha256) fail('Source changed before snapshot');
    await ensureParents(destination, file.name);
    await exclusiveFile(path.join(directory, ...file.name.split('/')), bytes);
  }
  await verifyFiles(destination, files);
}

export async function preparePairedRelease(options) {
  if (!shaPattern.test(options.sourceRevision) || !imagePattern.test(options.apiImageId) ||
      !imagePattern.test(options.previousApiImageId)) fail('Exact release revision and image identities are required');
  return withLock(options.controlDirectory, async control => {
    const journal = {
      version: 1, id: `release-${randomUUID()}`, phase: 'prepared',
      sourceRevision: options.sourceRevision, apiImageId: options.apiImageId,
      previousApiImageId: options.previousApiImageId, createdAt: new Date().toISOString(), history: [],
    };
    for (const kind of surfaces) {
      const source = await safeDirectory(options[kind].source);
      const destination = await safeDirectory(options[kind].destination);
      const after = await inventory(source);
      const before = await inventory(destination);
      validateCandidateFiles(kind, after);
      if (!before.some(file => file.name === 'index.html' && file.size > 0)) fail('Existing web entrypoint is required');
      const metadata = JSON.parse((await bytesAt(source, 'build-audit.json')).toString('utf8'));
      if (metadata.sourceRevision !== options.sourceRevision || metadata.apiOrigin !== origins[kind] ||
          metadata.demoMode !== false || typeof metadata.deploymentEligible !== 'boolean') fail('Candidate metadata mismatch');
      for (const next of after.filter(file => !mutable[kind].includes(file.name))) {
        const old = before.find(file => file.name === next.name);
        if (old && old.sha256 !== next.sha256) fail('An existing immutable asset has different bytes');
      }
      journal[kind] = { source, destination, before, after, deploymentEligible: metadata.deploymentEligible };
    }
    disjoint([control, ...surfaces.flatMap(kind => [journal[kind].source, journal[kind].destination])]);
    const directory = path.join(control.path, journal.id);
    await fs.mkdir(directory, { mode: 0o700 });
    // Preserve complete old and new trees privately before touching web files.
    for (const kind of surfaces) {
      await snapshot(journal[kind].destination, journal[kind].before, path.join(directory, `${kind}-before`));
      await snapshot(journal[kind].source, journal[kind].after, path.join(directory, `${kind}-after`));
    }
    await save(directory, journal);
    return journal.id;
  });
}

async function currentHash(root, name) {
  try { return hash(await bytesAt(root, name)); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function writeFile(directory, journal, kind, file, snapshotSuffix, replace, adapters) {
  const root = journal[kind].destination;
  await checkRoot(root);
  await ensureParents(root, file.name);
  const snapshotRoot = await safeDirectory(path.join(directory, `${kind}-${snapshotSuffix}`));
  const bytes = await bytesAt(snapshotRoot, file.name);
  if (hash(bytes) !== file.sha256) fail('Retained release snapshot was modified');
  const final = path.join(root.path, ...file.name.split('/'));
  const temporary = path.join(path.dirname(final), `onservice-stage-${randomUUID()}.tmp`);
  journal.intent = { kind, name: file.name, sha256: file.sha256, temporary, replace, snapshotSuffix };
  await save(directory, journal);
  await exclusiveFile(temporary, bytes);
  await fs.chmod(temporary, 0o644);
  await adapters.checkpoint?.('file-written', structuredClone(journal));
  await checkRoot(root);
  await safeDirectory(path.dirname(final));
  // Recheck at the last publication boundary, not just before the two-site
  // loop. API failure while writing a temporary file must leave it unexposed.
  if (replace && snapshotSuffix === 'after') await verifyApi(journal, adapters, journal.apiImageId);
  if (replace) await fs.rename(temporary, final);
  else {
    try { await fs.link(temporary, final); }
    catch (error) {
      if (error.code !== 'EEXIST' || await currentHash(root, file.name) !== file.sha256) throw error;
    }
    await fs.unlink(temporary);
  }
  await syncDirectory(path.dirname(final));
  await adapters.checkpoint?.('file-published', structuredClone(journal));
  if (await currentHash(root, file.name) !== file.sha256) fail('Published bytes do not match the release');
  delete journal.intent;
  await save(directory, journal);
}

async function verifySources(journal) {
  for (const kind of surfaces) {
    if (JSON.stringify(await inventory(journal[kind].source)) !== JSON.stringify(journal[kind].after)) {
      fail('Candidate source inventory changed');
    }
  }
}

async function verifyCurrent(journal, allowNew) {
  for (const kind of surfaces) {
    const item = journal[kind];
    for (const old of item.before) {
      const actual = await currentHash(item.destination, old.name);
      const next = item.after.find(file => file.name === old.name);
      if (actual !== old.sha256 && !(allowNew && mutable[kind].includes(old.name) && actual === next?.sha256)) {
        fail('Existing web files changed outside the release');
      }
    }
    for (const next of item.after.filter(file => mutable[kind].includes(file.name))) {
      if (item.before.some(file => file.name === next.name)) continue;
      const actual = await currentHash(item.destination, next.name);
      if (actual !== null && !(allowNew && actual === next.sha256)) fail('Unexpected new mutable web file');
    }
  }
}

function requireAdapters(adapters, names) {
  for (const name of names) if (typeof adapters?.[name] !== 'function') fail(`Required release adapter: ${name}`);
}

async function verifySnapshots(directory, journal, suffix) {
  for (const kind of surfaces) {
    const root = await safeDirectory(path.join(directory, `${kind}-${suffix}`));
    await verifyFiles(root, journal[kind][suffix]);
  }
}

async function reconcileIntent(directory, journal) {
  const intent = journal.intent;
  if (!intent) return;
  if (!surfaces.includes(intent.kind) || !['before', 'after'].includes(intent.snapshotSuffix)) fail('Invalid interrupted file intent');
  relativeName(intent.name);
  const record = journal[intent.kind][intent.snapshotSuffix].find(file => file.name === intent.name);
  if (!record || record.sha256 !== intent.sha256) fail('Interrupted file does not belong to this release');
  if (intent.temporary) {
    const root = journal[intent.kind].destination;
    const targetDirectory = path.dirname(path.join(root.path, ...intent.name.split('/')));
    if (path.dirname(intent.temporary) !== targetDirectory ||
        !/^onservice-stage-[a-f0-9-]{36}\.tmp$/.test(path.basename(intent.temporary))) fail('Unsafe interrupted temporary file');
    const tempName = relativeName(path.relative(root.path, intent.temporary).split(path.sep).join('/'));
    let partial;
    try { partial = await bytesAt(root, tempName); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (partial) {
      const retained = await safeDirectory(path.join(directory, `${intent.kind}-${intent.snapshotSuffix}`));
      const expected = await bytesAt(retained, intent.name);
      if (hash(expected) !== intent.sha256 || partial.length > expected.length ||
          !partial.equals(expected.subarray(0, partial.length))) fail('Interrupted temporary file has unrelated bytes; retained');
      await checkRoot(root);
      await safeDirectory(targetDirectory);
      await fs.unlink(intent.temporary);
      await syncDirectory(targetDirectory);
    }
  } else if (intent.remove !== true) fail('Incomplete interrupted file intent');
  delete journal.intent;
  await save(directory, journal);
}

async function verifyServed(kind, files, journal, adapters) {
  const observed = await adapters.verifyServedFiles(kind, structuredClone(files), structuredClone(journal));
  if (!Array.isArray(observed) || observed.length !== files.length) fail('Served file inventory is incomplete');
  validateManifest(observed);
  for (const expected of files) {
    const actual = observed.find(file => file.name === expected.name);
    if (!actual || actual.sha256 !== expected.sha256 || actual.size !== expected.size) fail('Served file checksum mismatch');
  }
}

export async function stagePairedRelease(controlDirectory, releaseId, adapters = {}) {
  return withLock(controlDirectory, async control => {
    const { directory, journal } = await load(control, releaseId);
    if (!['prepared', 'staged'].includes(journal.phase)) fail('Release cannot stage in its current phase');
    await verifySources(journal);
    await verifyCurrent(journal, false);
    await verifySnapshots(directory, journal, 'after');
    // Full two-surface collision preflight before publishing the first asset.
    for (const kind of surfaces) for (const file of journal[kind].after) {
      if (mutable[kind].includes(file.name)) continue;
      const actual = await currentHash(journal[kind].destination, file.name);
      if (actual !== null && actual !== file.sha256) fail('Immutable asset collision during staging');
    }
    await reconcileIntent(directory, journal);
    for (const kind of surfaces) for (const file of journal[kind].after) {
      if (mutable[kind].includes(file.name)) continue;
      const actual = await currentHash(journal[kind].destination, file.name);
      if (actual !== null && actual !== file.sha256) fail('Immutable asset collision during staging');
      if (actual === null) await writeFile(directory, journal, kind, file, 'after', false, adapters);
    }
    await verifyCurrent(journal, false);
    for (const kind of surfaces) await verifyFiles(journal[kind].destination,
      journal[kind].after.filter(file => !mutable[kind].includes(file.name)));
    journal.phase = 'staged';
    await save(directory, journal);
    return structuredClone(journal);
  });
}

async function verifyApi(journal, adapters, expected) {
  const state = await adapters.inspectApi(structuredClone(journal));
  if (!state || state.imageId !== expected || state.ready !== true) fail('API image/readiness verification failed');
}

export async function publishPairedRelease(controlDirectory, releaseId, adapters) {
  requireAdapters(adapters, ['assertReleaseAcceptance', 'verifyServedFiles', 'inspectApi', 'activateApi']);
  return withLock(controlDirectory, async control => {
    const { directory, journal } = await load(control, releaseId);
    if (!['staged', 'api-activating', 'api-active', 'publishing-admin', 'publishing-web', 'published'].includes(journal.phase)) {
      fail('Release must finish staging before publication');
    }
    // This adapter must prove reviewed source/master/CI/backups/compatibility
    // and artifact promotion. Candidate flags alone are never acceptance.
    if (await adapters.assertReleaseAcceptance(structuredClone(journal)) !== true) fail('Release acceptance was not affirmed');
    await verifySources(journal);
    await verifyCurrent(journal, true);
    await verifySnapshots(directory, journal, 'after');
    await reconcileIntent(directory, journal);
    for (const kind of surfaces) {
      const assets = journal[kind].after.filter(file => !mutable[kind].includes(file.name));
      await verifyFiles(journal[kind].destination, assets);
      await verifyServed(kind, assets, journal, adapters);
      // Verify old lazy assets and the actual currently exposed entrypoints,
      // including a partial release being resumed, before touching the API.
      const current = [];
      for (const old of journal[kind].before) {
        const digest = await currentHash(journal[kind].destination, old.name);
        current.push(digest === old.sha256 ? old : journal[kind].after.find(file => file.name === old.name));
      }
      await verifyServed(kind, current, journal, adapters);
    }
    const currentApi = await adapters.inspectApi(structuredClone(journal));
    if (currentApi?.imageId === journal.previousApiImageId && journal.phase !== 'published') {
      journal.phase = 'api-activating';
      await save(directory, journal);
      await adapters.activateApi(journal.apiImageId, structuredClone(journal));
      await adapters.checkpoint?.('api-activated', structuredClone(journal));
    } else if (currentApi?.imageId !== journal.apiImageId) fail('Unexpected running API image');
    await verifyApi(journal, adapters, journal.apiImageId);
    journal.phase = 'api-active';
    await save(directory, journal);
    for (const kind of surfaces) {
      journal.phase = `publishing-${kind}`;
      await save(directory, journal);
      // Explicit mutable order; each entrypoint is always last.
      for (const name of mutable[kind]) {
        const file = journal[kind].after.find(item => item.name === name);
        if (!file) continue;
        await verifyApi(journal, adapters, journal.apiImageId);
        await verifyCurrent(journal, true);
        if (await currentHash(journal[kind].destination, name) !== file.sha256) {
          await writeFile(directory, journal, kind, file, 'after', true, adapters);
        }
      }
      await verifyFiles(journal[kind].destination, journal[kind].after);
      await verifyServed(kind, journal[kind].after, journal, adapters);
    }
    await verifyApi(journal, adapters, journal.apiImageId);
    journal.phase = 'published';
    await save(directory, journal);
    return structuredClone(journal);
  });
}

export async function rollbackPairedRelease(controlDirectory, releaseId, adapters) {
  requireAdapters(adapters, ['assertRollbackAcceptance', 'verifyServedFiles', 'inspectApi', 'activateApi']);
  return withLock(controlDirectory, async control => {
    const { directory, journal } = await load(control, releaseId);
    if (await adapters.assertRollbackAcceptance(structuredClone(journal)) !== true) fail('Rollback acceptance was not affirmed');
    await verifyCurrent(journal, true);
    for (const kind of surfaces) {
      const retained = await safeDirectory(path.join(directory, `${kind}-before`));
      await verifyFiles(retained, journal[kind].before);
    }
    await reconcileIntent(directory, journal);
    const currentApi = await adapters.inspectApi(structuredClone(journal));
    if (![journal.apiImageId, journal.previousApiImageId].includes(currentApi?.imageId)) fail('Unexpected API before rollback');
    journal.phase = 'rolling-back';
    await save(directory, journal);
    for (const kind of ['web', 'admin']) {
      for (const name of mutable[kind]) {
        const old = journal[kind].before.find(file => file.name === name);
        const next = journal[kind].after.find(file => file.name === name);
        await verifyCurrent(journal, true);
        if (old && await currentHash(journal[kind].destination, name) !== old.sha256) {
          await writeFile(directory, journal, kind, old, 'before', true, adapters);
        } else if (!old && next && await currentHash(journal[kind].destination, name) !== null) {
          // Only this named release-added mutable file; its verified new copy
          // is retained in the journal. Old/new hashed assets are never pruned.
          if (await currentHash(journal[kind].destination, name) !== next.sha256) fail('Rollback delete target changed');
          const retained = await safeDirectory(path.join(directory, `${kind}-after`));
          await verifyFiles(retained, [next]);
          journal.intent = { kind, name, sha256: next.sha256, snapshotSuffix: 'after', remove: true };
          await save(directory, journal);
          await fs.unlink(path.join(journal[kind].destination.path, ...name.split('/')));
          await syncDirectory(journal[kind].destination.path);
          await adapters.checkpoint?.('file-removed', structuredClone(journal));
          delete journal.intent;
          await save(directory, journal);
        }
      }
      await verifyFiles(journal[kind].destination, journal[kind].before);
      await verifyServed(kind, journal[kind].before, journal, adapters);
    }
    if (currentApi.imageId !== journal.previousApiImageId) {
      await adapters.activateApi(journal.previousApiImageId, structuredClone(journal));
    }
    await verifyApi(journal, adapters, journal.previousApiImageId);
    journal.phase = 'rolled-back';
    await save(directory, journal);
    return structuredClone(journal);
  });
}

export async function inspectPairedRelease(controlDirectory, releaseId) {
  return withLock(controlDirectory, async control => structuredClone((await load(control, releaseId)).journal));
}

// Shared with the read-only host observers; one path/inventory contract.
export { safeDirectory as inspectReleaseDirectory, validateManifest as validateReleaseFileList };
