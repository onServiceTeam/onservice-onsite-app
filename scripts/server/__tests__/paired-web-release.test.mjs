import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import {
  preparePairedRelease, stagePairedRelease, publishPairedRelease,
  rollbackPairedRelease, inspectPairedRelease,
} from '../paired-web-release.mjs';

const revision = 'a'.repeat(40);
const imageId = `sha256:${'b'.repeat(64)}`;
const oldImage = `sha256:${'c'.repeat(64)}`;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const newAssets = { admin: 'assets/index-ABCDEFGH.js', web: `_expo/static/js/web/entry-${'d'.repeat(32)}.js` };
const oldAssets = { admin: 'assets/old-12345678.js', web: `_expo/static/js/web/entry-${'e'.repeat(32)}.js` };

async function put(root, name, value) {
  const target = path.join(root, ...name.split('/'));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, value);
}

async function fixture(run) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'onservice-paired-release-'));
  const options = { sourceRevision: revision, apiImageId: imageId, previousApiImageId: oldImage,
    controlDirectory: path.join(root, 'control') };
  await fs.mkdir(options.controlDirectory, { mode: 0o700 });
  const events = [];
  const api = { imageId: oldImage, ready: true };
  for (const kind of ['admin', 'web']) {
    options[kind] = { source: path.join(root, `${kind}-source`), destination: path.join(root, `${kind}-live`) };
    for (const directory of Object.values(options[kind])) await fs.mkdir(directory);
    await put(options[kind].source, 'index.html', `<html>new ${kind}<script src="/${newAssets[kind]}"></script></html>`);
    await put(options[kind].source, 'build-audit.json', JSON.stringify({ sourceRevision: revision,
      apiOrigin: `https://${kind === 'admin' ? 'admin' : 'app'}.onservice.ph`,
      demoMode: false, deploymentEligible: false }));
    await put(options[kind].source, newAssets[kind], `new ${kind} script`);
    await put(options[kind].destination, 'index.html', `old ${kind} entrypoint`);
    await put(options[kind].destination, oldAssets[kind], `old ${kind} script`);
  }
  await put(options.web.source, 'metadata.json', '{"version":0}');
  await put(options.web.source, 'favicon.ico', Buffer.from([1, 2, 3, 4]));
  const adapters = {
    assertReleaseAcceptance: async () => true,
    assertRollbackAcceptance: async () => true,
    inspectApi: async () => ({ ...api }),
    activateApi: async requested => { events.push(`api:${requested}`); api.imageId = requested; api.ready = true; },
    verifyServedFiles: async (kind, files) => Promise.all(files.map(async file => {
      const bytes = await fs.readFile(path.join(options[kind].destination, ...file.name.split('/')));
      return { name: file.name, sha256: digest(bytes), size: bytes.length };
    })),
    checkpoint: async (event, journal) => { events.push(`${event}:${journal.intent?.kind}:${journal.intent?.name}`); },
  };
  const f = { root, options, api, adapters, events,
    prepare: () => preparePairedRelease(options),
    stage: id => stagePairedRelease(options.controlDirectory, id, adapters),
    publish: id => publishPairedRelease(options.controlDirectory, id, adapters),
    rollback: id => rollbackPairedRelease(options.controlDirectory, id, adapters),
    inspect: id => inspectPairedRelease(options.controlDirectory, id),
    read: (kind, name = 'index.html') => fs.readFile(path.join(options[kind].destination, ...name.split('/')), 'utf8'),
    journalFile: id => path.join(options.controlDirectory, id, 'journal.json'),
  };
  try { await run(f); }
  finally {
    // Exact test-created root only. Never a workspace, home or live web root.
    const resolved = await fs.realpath(root);
    assert.equal(resolved, root);
    assert.equal(path.dirname(root), await fs.realpath(tmpdir()));
    assert.match(path.basename(root), /^onservice-paired-release-/);
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function oldEntries(f) {
  assert.equal(await f.read('admin'), 'old admin entrypoint');
  assert.equal(await f.read('web'), 'old web entrypoint');
}

test('publishes both exact trees after API verification, retaining old assets and mounted roots', () => fixture(async f => {
  const roots = await Promise.all(['admin', 'web'].map(kind => fs.stat(f.options[kind].destination)));
  const id = await f.prepare();
  await oldEntries(f);
  await f.stage(id);
  await oldEntries(f);
  assert.equal(f.events.some(event => event.startsWith('api:')), false);
  const result = await f.publish(id);
  assert.equal(result.phase, 'published');
  assert.equal(result.admin.deploymentEligible, false); // Never flips rehearsal metadata.
  for (const [index, kind] of ['admin', 'web'].entries()) {
    assert.match(await f.read(kind), new RegExp(`new ${kind}`));
    assert.equal(await f.read(kind, oldAssets[kind]), `old ${kind} script`);
    assert.equal((await fs.stat(f.options[kind].destination)).ino, roots[index].ino);
    const sequence = f.events.filter(event => event.startsWith(`file-published:${kind}:`));
    assert.equal(sequence.at(-1), `file-published:${kind}:index.html`);
    assert.ok(f.events.indexOf(`api:${imageId}`) < f.events.indexOf(`file-published:${kind}:index.html`));
  }
  await f.publish(id);
  assert.equal(f.events.filter(event => event.startsWith('api:')).length, 1);
}));

for (const [name, mutate] of [
  ['different revision', metadata => { metadata.sourceRevision = 'f'.repeat(40); }],
  ['wrong API origin', metadata => { metadata.apiOrigin = 'https://academy.example.invalid'; }],
  ['demo mode', metadata => { metadata.demoMode = true; }],
  ['missing eligibility flag', metadata => { delete metadata.deploymentEligible; }],
]) test(`preflights both candidates before changing either live tree: ${name}`, () => fixture(async f => {
  const file = path.join(f.options.web.source, 'build-audit.json');
  const metadata = JSON.parse(await fs.readFile(file, 'utf8'));
  mutate(metadata);
  await fs.writeFile(file, JSON.stringify(metadata));
  await assert.rejects(f.prepare(), /metadata mismatch/);
  await oldEntries(f);
  await assert.rejects(fs.stat(path.join(f.options.admin.destination, newAssets.admin)), { code: 'ENOENT' });
}));

test('rejects missing entrypoints and unknown mutable files', () => fixture(async f => {
  await fs.unlink(path.join(f.options.web.source, 'index.html'));
  await assert.rejects(f.prepare(), /missing a required/);
  await put(f.options.web.source, 'index.html', 'restored fixture entry');
  await put(f.options.web.source, 'unhashed.js', 'unreviewed file');
  await assert.rejects(f.prepare(), /Unreviewed mutable/);
  await oldEntries(f);
}));

test('rejects different bytes at an existing hashed asset pathname', () => fixture(async f => {
  await put(f.options.web.destination, newAssets.web, 'different existing bytes');
  await assert.rejects(f.prepare(), /immutable asset has different bytes/);
  await oldEntries(f);
}));

test('rejects overlapping source/destination/control roots', () => fixture(async f => {
  f.options.web.destination = f.options.web.source;
  await assert.rejects(f.prepare(), /must not overlap/);
}));

test('rejects a symlink or junction in a candidate root', () => fixture(async f => {
  const linked = path.join(f.root, 'linked-source');
  await fs.symlink(f.options.web.source, linked, process.platform === 'win32' ? 'junction' : 'dir');
  f.options.web.source = linked;
  await assert.rejects(f.prepare(), /real directory/);
  await oldEntries(f);
}));

test('refuses changed sources before staging any live files', () => fixture(async f => {
  const id = await f.prepare();
  await put(f.options.web.source, newAssets.web, 'changed after prepare');
  await assert.rejects(f.stage(id), /source inventory changed/);
  await oldEntries(f);
  await assert.rejects(fs.stat(path.join(f.options.admin.destination, newAssets.admin)), { code: 'ENOENT' });
}));

test('preflights both retained snapshots before staging either surface', () => fixture(async f => {
  const id = await f.prepare();
  await put(path.join(f.options.controlDirectory, id, 'web-after'), newAssets.web, 'tampered snapshot');
  await assert.rejects(f.stage(id), /checksum mismatch|snapshot was modified/);
  await oldEntries(f);
  await assert.rejects(fs.stat(path.join(f.options.admin.destination, newAssets.admin)), { code: 'ENOENT' });
}));

test('rejects newly introduced asset collisions before staging either surface', () => fixture(async f => {
  const id = await f.prepare();
  await put(f.options.web.destination, newAssets.web, 'collision after prepare');
  await assert.rejects(f.stage(id), /collision/);
  await assert.rejects(fs.stat(path.join(f.options.admin.destination, newAssets.admin)), { code: 'ENOENT' });
  await oldEntries(f);
}));

test('rejects journal traversal without touching external files', () => fixture(async f => {
  const id = await f.prepare();
  const journal = JSON.parse(await fs.readFile(f.journalFile(id), 'utf8'));
  journal.web.after[0].name = '../../external.html';
  await fs.writeFile(f.journalFile(id), JSON.stringify(journal));
  await assert.rejects(f.stage(id), /Unsafe release-relative path/);
  await oldEntries(f);
}));

test('detects replacement of a mounted root even when its old files are copied back', () => fixture(async f => {
  const id = await f.prepare();
  const old = `${f.options.web.destination}-retained`;
  await fs.rename(f.options.web.destination, old);
  await fs.cp(old, f.options.web.destination, { recursive: true });
  await assert.rejects(f.stage(id), /root directory was replaced/);
  await oldEntries(f);
}));

for (const boundary of ['file-written', 'file-published']) {
  test(`resumes staging after an interruption at ${boundary}`, () => fixture(async f => {
    const id = await f.prepare();
    let interrupted = false;
    f.adapters.checkpoint = async event => {
      if (event === boundary && !interrupted) { interrupted = true; throw new Error('injected interruption'); }
    };
    await assert.rejects(f.stage(id), /injected interruption/);
    await oldEntries(f);
    await f.stage(id);
    await f.publish(id);
    assert.match(await f.read('admin'), /new admin/);
    assert.match(await f.read('web'), /new web/);
    for (const kind of ['admin', 'web']) {
      assert.deepEqual((await fs.readdir(f.options[kind].destination, { recursive: true })).filter(name => name.endsWith('.tmp')), []);
    }
    const journal = await f.inspect(id);
    assert.ok(journal.history.some(event => event.intent?.temporary));
    assert.equal(journal.intent, undefined);
  }));
}

test('resumes after the admin entry switch without reactivating the API', () => fixture(async f => {
  const id = await f.prepare();
  await f.stage(id);
  let interrupted = false;
  f.adapters.checkpoint = async (event, journal) => {
    if (!interrupted && event === 'file-published' && journal.intent.kind === 'admin' && journal.intent.name === 'index.html') {
      interrupted = true;
      throw new Error('entrypoint interruption');
    }
  };
  await assert.rejects(f.publish(id), /entrypoint interruption/);
  assert.match(await f.read('admin'), /new admin/);
  assert.equal(await f.read('web'), 'old web entrypoint');
  await f.publish(id);
  assert.equal(f.events.filter(event => event.startsWith('api:')).length, 1);
  assert.match(await f.read('web'), /new web/);
}));

test('reconciles actual API identity after an uncertain activation response', () => fixture(async f => {
  const id = await f.prepare();
  await f.stage(id);
  let activations = 0;
  f.adapters.activateApi = async requested => {
    activations++;
    f.api.imageId = requested;
    throw new Error('response interrupted after activation');
  };
  await assert.rejects(f.publish(id), /response interrupted/);
  await oldEntries(f);
  await f.publish(id);
  assert.equal(activations, 1);
  assert.match(await f.read('web'), /new web/);
}));

for (const decision of [false, undefined]) test(`refuses non-affirmative release acceptance: ${String(decision)}`, () => fixture(async f => {
  const id = await f.prepare();
  await f.stage(id);
  f.adapters.assertReleaseAcceptance = async () => decision;
  await assert.rejects(f.publish(id), /acceptance/);
  await oldEntries(f);
  assert.equal(f.api.imageId, oldImage);
}));

test('requires actual served-byte evidence before API activation', () => fixture(async f => {
  const id = await f.prepare();
  await f.stage(id);
  f.adapters.verifyServedFiles = async () => [];
  await assert.rejects(f.publish(id), /Served file/);
  await oldEntries(f);
  assert.equal(f.api.imageId, oldImage);
}));

test('does not switch entrypoints when the new API fails readiness', () => fixture(async f => {
  const id = await f.prepare();
  await f.stage(id);
  f.adapters.activateApi = async requested => { f.api.imageId = requested; f.api.ready = false; };
  await assert.rejects(f.publish(id), /API image\/readiness/);
  await oldEntries(f);
}));

test('does not switch the admin entrypoint when API readiness is lost after metadata publication', () => fixture(async f => {
  const id = await f.prepare();
  await f.stage(id);
  f.adapters.checkpoint = async (event, journal) => {
    if (event === 'file-published' && journal.intent.kind === 'admin' && journal.intent.name === 'build-audit.json') {
      f.api.ready = false;
    }
  };
  await assert.rejects(f.publish(id), /API image\/readiness/);
  await oldEntries(f);
  assert.equal((await f.inspect(id)).phase, 'publishing-admin');
  f.api.ready = true;
  await f.publish(id);
  assert.match(await f.read('admin'), /new admin/);
  assert.match(await f.read('web'), /new web/);
  assert.equal(f.events.filter(event => event.startsWith('api:')).length, 1);
}));

test('does not switch the web entrypoint when an unrelated API replaces the accepted image after the admin switch', () => fixture(async f => {
  const id = await f.prepare();
  await f.stage(id);
  const unrelated = `sha256:${'f'.repeat(64)}`;
  f.adapters.checkpoint = async (event, journal) => {
    if (event === 'file-published' && journal.intent.kind === 'admin' && journal.intent.name === 'index.html') {
      f.api.imageId = unrelated;
    }
  };
  await assert.rejects(f.publish(id), /API image\/readiness/);
  assert.match(await f.read('admin'), /new admin/);
  assert.equal(await f.read('web'), 'old web entrypoint');
  await assert.rejects(fs.stat(path.join(f.options.web.destination, 'build-audit.json')), { code: 'ENOENT' });
  assert.equal(f.api.imageId, unrelated);
}));

test('retains the old web entrypoint if the API becomes unhealthy while the new entrypoint temporary file is written', () => fixture(async f => {
  const id = await f.prepare();
  await f.stage(id);
  let interrupted = false;
  f.adapters.checkpoint = async (event, journal) => {
    if (!interrupted && event === 'file-written' && journal.intent.kind === 'web' && journal.intent.name === 'index.html') {
      interrupted = true;
      f.api.ready = false;
    }
  };
  await assert.rejects(f.publish(id), /API image\/readiness/);
  assert.match(await f.read('admin'), /new admin/);
  assert.equal(await f.read('web'), 'old web entrypoint');
  const interruptedJournal = await f.inspect(id);
  assert.equal(interruptedJournal.intent.name, 'index.html');
  assert.match(await fs.readFile(interruptedJournal.intent.temporary, 'utf8'), /new web/);
  f.api.ready = true;
  await f.publish(id);
  assert.match(await f.read('web'), /new web/);
  await assert.rejects(fs.stat(interruptedJournal.intent.temporary), { code: 'ENOENT' });
  assert.equal(f.events.filter(event => event.startsWith('api:')).length, 1);
}));

test('rolls back both entrypoints and API while retaining new and old hashed assets', () => fixture(async f => {
  const id = await f.prepare();
  await f.stage(id);
  await f.publish(id);
  assert.equal((await f.rollback(id)).phase, 'rolled-back');
  await oldEntries(f);
  assert.equal(f.api.imageId, oldImage);
  for (const kind of ['admin', 'web']) {
    assert.equal(await f.read(kind, oldAssets[kind]), `old ${kind} script`);
    assert.equal(await f.read(kind, newAssets[kind]), `new ${kind} script`);
    await assert.rejects(fs.stat(path.join(f.options[kind].destination, 'build-audit.json')), { code: 'ENOENT' });
    assert.ok((await fs.readFile(path.join(f.options.controlDirectory, id, `${kind}-after`, 'build-audit.json'))).length > 0);
  }
  assert.equal((await f.rollback(id)).phase, 'rolled-back');
}));

test('denied rollback does not rewrite entrypoints or activate an older API', () => fixture(async f => {
  const id = await f.prepare(); await f.stage(id); await f.publish(id);
  f.adapters.assertRollbackAcceptance = async () => false;
  await assert.rejects(f.rollback(id), /acceptance/);
  assert.match(await f.read('admin'), /new admin/);
  assert.equal(f.api.imageId, imageId);
}));

test('rollback refuses corrupted old snapshots before changing either live tree', () => fixture(async f => {
  const id = await f.prepare(); await f.stage(id); await f.publish(id);
  await put(path.join(f.options.controlDirectory, id, 'admin-before'), 'index.html', 'tampered old entry');
  await assert.rejects(f.rollback(id), /checksum mismatch/);
  assert.match(await f.read('web'), /new web/);
  assert.equal(f.api.imageId, imageId);
}));

test('refuses an unrelated operator file change instead of overwriting it on rollback', () => fixture(async f => {
  const id = await f.prepare(); await f.stage(id); await f.publish(id);
  await put(f.options.web.destination, 'index.html', 'unrelated newer deployment');
  await assert.rejects(f.rollback(id), /changed outside the release/);
  assert.equal(await f.read('web'), 'unrelated newer deployment');
  assert.equal(f.api.imageId, imageId);
}));

test('retains an occupied release lock and never infers it is stale', () => fixture(async f => {
  const lock = path.join(f.options.controlDirectory, 'active.lock');
  await fs.mkdir(lock);
  await fs.writeFile(path.join(lock, 'owner.json'), '{"nonce":"another-operation","pid":1}');
  await assert.rejects(f.prepare(), { code: 'EEXIST' });
  assert.match(await fs.readFile(path.join(lock, 'owner.json'), 'utf8'), /another-operation/);
  await oldEntries(f);
}));

test('a concurrent stage call cannot pass the release lock', () => fixture(async f => {
  const id = await f.prepare();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  f.adapters.checkpoint = async event => { if (event === 'file-written') { entered(); await gate; } };
  const first = f.stage(id);
  await ready;
  try { await assert.rejects(f.stage(id), { code: 'EEXIST' }); }
  finally { release(); }
  assert.equal((await first).phase, 'staged');
}));
