// Behaviour tests for scripts/release/publish-web-builds.sh.
//
// The script runs for real with real bash, tar, cmp, find and sha256sum
// against a throwaway "live" checkout whose apps/admin/dist and
// apps/mobile/dist-web folders hold an older build. Only sudo and docker are
// fakes (see release-harness.mjs). The fake docker answers "is this file
// visible in nginx" by looking in those same folders, the way the real bind
// mounts do. Each test compares the live folders before and after.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildTarGz, git, makeRoot, posix, readLines, repo, runScript, sh, writeFakes } from './release-harness.mjs';

// The script under test is the repository script. preflight-mutation-check.mjs
// sets RELEASE_PUBLISH_SCRIPT to a changed copy kept in a temporary folder
// outside the repository, so a mutation run never writes to the real script.
// Normal runs and CI leave it unset.
const UNDER_TEST = process.env.RELEASE_PUBLISH_SCRIPT
  ? path.resolve(process.env.RELEASE_PUBLISH_SCRIPT)
  : path.join(repo, 'scripts/release/publish-web-builds.sh');
const IMAGE_ID = `sha256:${'b'.repeat(64)}`;
let root;
let origin;
let sha;
let other;

const OLD = {
  admin: {
    'index.html': '<!doctype html><script type="module" crossorigin src="/assets/index-OLD1.js"></script>\n',
    'favicon.ico': 'OLDICON\n',
    'assets/index-OLD1.js': 'export const admin = "old";\n',
    'assets/shared.css': 'body { margin: 0; }\n',
  },
  app: {
    'index.html': '<!doctype html><script src="/_expo/static/js/web/entry-OLD2.js" defer></script>\n',
    'metadata.json': '{"version":1}\n',
    '_expo/static/js/web/entry-OLD2.js': 'export const app = "old";\n',
  },
};
const NEW = {
  admin: {
    'index.html': '<!doctype html><script type="module" crossorigin src="/assets/index-NEW1.js"></script>\n',
    'favicon.ico': 'NEWICON\n',
    'assets/index-NEW1.js': 'export const admin = "new";\n',
    'assets/shared.css': 'body { margin: 0; }\n',
  },
  app: {
    'index.html': '<!doctype html><script src="/_expo/static/js/web/entry-NEW2.js" defer></script>\n',
    'metadata.json': '{"version":2}\n',
    '_expo/static/js/web/entry-NEW2.js': 'export const app = "new";\n',
    // New folders, as real Expo and Vite builds add: the publish must create them.
    'assets/fonts/Inter.ttf': 'FONT\n',
  },
};
const LIVE_DIRS = { admin: 'apps/admin/dist', app: 'apps/mobile/dist-web' };
const ARCHIVES = { admin: name => `admin-dist-${name}.tar.gz`, app: name => `mobile-dist-web-${name}.tar.gz` };

function writeTree(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), content);
  }
}

function snapshot(dir) {
  const out = {};
  const walk = sub => {
    for (const name of readdirSync(path.join(dir, sub))) {
      const rel = sub ? `${sub}/${name}` : name;
      if (statSync(path.join(dir, rel)).isDirectory()) walk(rel);
      else out[rel] = readFileSync(path.join(dir, rel), 'utf8');
    }
  };
  walk('');
  return out;
}

const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');

before(() => {
  root = makeRoot('onservice-web-');
  const seed = path.join(root, 'seed');
  mkdirSync(seed);
  writeFileSync(path.join(seed, '.gitignore'), 'apps/admin/dist/\napps/mobile/dist-web/\n');
  writeFileSync(path.join(seed, 'README.md'), 'web fixture\n');
  sha = sh(`${git} init -q -b master && ${git} add . && ${git} commit -qm release && git rev-parse HEAD`, seed);
  writeFileSync(path.join(seed, 'README.md'), 'web fixture, later\n');
  other = sh(`${git} add . && ${git} commit -qm later && git rev-parse HEAD`, seed);
  origin = path.join(root, 'origin.git');
  sh(`git init -q --bare "${posix(origin)}" && git push -q "${posix(origin)}" master`, seed);
  for (const name of ['admin', 'app']) writeTree(path.join(root, 'build', name), NEW[name]);
});

after(() => { if (root) rmSync(root, { recursive: true, force: true }); });

let serial = 0;
function setup({ runningRev = () => sha, liveAt = () => sha } = {}) {
  serial += 1;
  const dir = path.join(root, `case${serial}`);
  mkdirSync(dir);
  sh(`git clone -q "${posix(origin)}" live && git -C live checkout -q --detach ${liveAt()}`, dir);
  const live = path.join(dir, 'live');
  for (const name of ['admin', 'app']) writeTree(path.join(live, LIVE_DIRS[name]), OLD[name]);
  const release = path.join(dir, 'release');
  const state = path.join(dir, 'state');
  mkdirSync(release);
  mkdirSync(state);
  writeFileSync(path.join(state, 'images.txt'), `onservice-api:${runningRev()} ${IMAGE_ID} ${runningRev()}\n`);
  writeFileSync(path.join(state, 'running_image'), `${IMAGE_ID}\n`);
  const calls = path.join(dir, 'calls.log');
  writeFileSync(calls, '');
  const { bin } = writeFakes(dir);
  return { dir, live, release, state, calls, bin };
}

// Archives made by the real tar from a build folder, plus their checksum file.
function uploadBuilds(fx, name = sha) {
  for (const surface of ['admin', 'app']) {
    sh(`tar -czf "${posix(path.join(fx.release, ARCHIVES[surface](name)))}" -C "${posix(path.join(root, 'build', surface))}" .`, root);
  }
  sh(`sha256sum ${ARCHIVES.admin(name)} ${ARCHIVES.app(name)} > web-builds-${name}.sha256`, fx.release);
}

// Hand-made archives (for entries the local tar cannot make), plus checksums.
function uploadCustom(fx, admin, app) {
  const files = { admin: ARCHIVES.admin(sha), app: ARCHIVES.app(sha) };
  writeFileSync(path.join(fx.release, files.admin), admin);
  writeFileSync(path.join(fx.release, files.app), app);
  writeFileSync(path.join(fx.release, `web-builds-${sha}.sha256`),
    `${sha256(admin)}  ${files.admin}\n${sha256(app)}  ${files.app}\n`);
}
const entriesOf = files => [{ name: './', type: 'dir' }, ...Object.entries(files).map(([rel, content]) => ({ name: `./${rel}`, type: 'file', content }))];
const tarOf = files => buildTarGz(entriesOf(files));

function publish(fx, args = [sha], env = {}) {
  return runScript(UNDER_TEST, args, {
    cwd: fx.dir, bin: fx.bin, absolute: true,
    env: {
      ONSERVICE_RELEASE_DIR: posix(fx.release), ONSERVICE_PROJECT_DIR: posix(fx.live),
      FAKE_STATE: posix(fx.state), FAKE_LOG: posix(fx.calls), FAKE_PROJECT: posix(fx.live), FAKE_SCENARIO: 'success', ...env,
    },
  });
}

const liveTree = (fx, surface) => snapshot(path.join(fx.live, LIVE_DIRS[surface]));
const liveTreeOrNull = (fx, surface) => (existsSync(path.join(fx.live, LIVE_DIRS[surface])) ? liveTree(fx, surface) : null);
const calls = fx => readLines(fx.calls);
const mainLog = fx => {
  const names = readdirSync(fx.release).filter(file => /^web-[0-9a-f]{12}-\d{8}T\d{6}Z-\d+\.log$/.test(file));
  assert.ok(names.length <= 1, 'one run writes one main log');
  return names.length ? readFileSync(path.join(fx.release, names[0]), 'utf8') : '';
};
const record = fx => {
  const name = readdirSync(fx.release).find(file => file.endsWith('-record.txt'));
  if (!name) return null;
  return Object.fromEntries(readFileSync(path.join(fx.release, name), 'utf8').trim().split('\n')
    .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
};

function assertNothingDangerous(fx) {
  for (const line of calls(fx)) {
    assert.doesNotMatch(line, /^sudo .*((?<![-\w])rm\s|rsync|-delete\b|\bln\s)/, line);
    assert.doesNotMatch(line, /^docker (compose|restart|stop|kill|rm|run)\b/, line);
    assert.doesNotMatch(line, /nginx -s|--force-recreate/, line);
  }
  for (const surface of ['admin', 'app']) {
    assert.deepEqual(Object.keys(liveTree(fx, surface)).filter(rel => rel.includes('tmp-publish')), [], 'no temporary file may be left live');
  }
  assert.equal(readdirSync(fx.release).includes('.web-publish-lock'), false, 'the lock folder must be released');
}

function assertUnchanged(fx) {
  for (const surface of ['admin', 'app']) assert.deepEqual(liveTree(fx, surface), OLD[surface], `${surface} must be untouched`);
  assert.equal(calls(fx).some(line => line.startsWith('sudo -n cp') || line.startsWith('sudo -n mv') || line.startsWith('sudo -n mkdir')), false,
    'nothing may be written to the live folders');
  assertNothingDangerous(fx);
}

test('a clean publish adds new files beside the old ones, checks nginx, then switches index.html last', () => {
  const fx = setup();
  uploadBuilds(fx);
  const result = publish(fx);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /web publish done/);

  assert.deepEqual(liveTree(fx, 'admin'), { ...OLD.admin, ...NEW.admin }, 'old assets stay; new assets and entry files are live');
  assert.deepEqual(liveTree(fx, 'app'), { ...OLD.app, ...NEW.app });

  const log = calls(fx);
  const lastNginxCheck = log.map(line => line.startsWith('docker exec onservice-nginx-1 test -f')).lastIndexOf(true);
  const firstSwitch = log.findIndex(line => line.startsWith('sudo -n mv -f'));
  assert.ok(lastNginxCheck > 0 && firstSwitch > lastNginxCheck, 'every file is checked in nginx before any entry file is switched');
  assert.deepEqual(log.filter(line => line.startsWith('docker exec onservice-nginx-1 test -f')).map(line => line.split(' ').at(-1)).sort(), [
    '/usr/share/nginx/admin/assets/index-NEW1.js', '/usr/share/nginx/admin/assets/shared.css',
    '/usr/share/nginx/app/_expo/static/js/web/entry-NEW2.js', '/usr/share/nginx/app/assets/fonts/Inter.ttf',
  ]);
  // The new folders are made by root with mode 755, parents first, before any file goes in.
  const mkdirs = log.filter(line => line.startsWith('sudo -n mkdir -m 755 '));
  assert.deepEqual(mkdirs.map(line => line.slice(line.indexOf('/apps/'))), ['/apps/mobile/dist-web/assets', '/apps/mobile/dist-web/assets/fonts']);
  const fontsMkdir = log.findIndex(line => line.startsWith('sudo -n mkdir') && line.endsWith('/apps/mobile/dist-web/assets/fonts'));
  const fontCopy = log.findIndex(line => line.startsWith('sudo -n cp') && line.includes('/assets/fonts/Inter.ttf'));
  assert.ok(fontsMkdir >= 0 && fontCopy > fontsMkdir, 'a new folder is made before a file goes into it');
  for (const folder of ['apps/mobile/dist-web/assets', 'apps/mobile/dist-web/assets/fonts']) {
    assert.ok(statSync(path.join(fx.live, folder)).isDirectory(), folder);
    if (process.platform !== 'win32') assert.equal(statSync(path.join(fx.live, folder)).mode & 0o777, 0o755, `${folder}: nginx workers must be able to open new folders`);
  }
  const switches = log.filter(line => line.startsWith('sudo -n mv -f')).map(line => line.split('/').at(-1));
  assert.deepEqual(switches, ['favicon.ico', 'index.html', 'metadata.json', 'index.html'], 'index.html is switched last for each build');
  assert.ok(log.includes('docker exec onservice-nginx-1 cat /usr/share/nginx/admin/index.html'));
  assert.ok(log.includes('docker exec onservice-nginx-1 cat /usr/share/nginx/app/index.html'));
  assertNothingDangerous(fx);

  const previous = readdirSync(fx.release).find(file => file.endsWith('-previous'));
  assert.equal(readFileSync(path.join(fx.release, previous, 'admin/index.html'), 'utf8'), OLD.admin['index.html'], 'the old entry file is kept for rollback');
  assert.equal(readFileSync(path.join(fx.release, previous, 'app/index.html'), 'utf8'), OLD.app['index.html']);

  const rec = record(fx);
  assert.equal(rec.commit, sha);
  assert.equal(rec.admin_entry_scripts.trim(), '/assets/index-NEW1.js');
  assert.equal(rec.app_entry_scripts.trim(), '/_expo/static/js/web/entry-NEW2.js');
  assert.equal(rec.admin_files_added, '1');
  assert.equal(rec.admin_files_already_identical, '1');
  assert.equal(rec.app_files_added, '2');
  assert.equal(rec.admin_index_sha256, sha256(NEW.admin['index.html']));
  assert.equal(rec.admin_previous_index_sha256, sha256(OLD.admin['index.html']));
  if (process.platform !== 'win32') {
    assert.equal(statSync(path.join(fx.live, 'apps/admin/dist/assets/index-NEW1.js')).mode & 0o777, 0o644, 'nginx workers must be able to read new files');
  }
});

test('publishing the same builds again changes nothing and is accepted (same bytes are not a conflict)', () => {
  const fx = setup();
  uploadBuilds(fx);
  assert.equal(publish(fx).status, 0);
  const afterFirst = { admin: liveTree(fx, 'admin'), app: liveTree(fx, 'app') };
  for (const file of readdirSync(fx.release).filter(name => /^web-.*(\.log|-record\.txt)$/.test(name))) {
    // Keep the first run's files apart so this test reads the second run's log.
    mkdirSync(path.join(fx.release, 'first'), { recursive: true });
    writeFileSync(path.join(fx.release, 'first', file), readFileSync(path.join(fx.release, file)));
    rmSync(path.join(fx.release, file));
  }
  const again = publish(fx);
  assert.equal(again.status, 0, again.stdout);
  assert.deepEqual({ admin: liveTree(fx, 'admin'), app: liveTree(fx, 'app') }, afterFirst);
  assert.equal(record(fx).admin_files_added, '0');
  assert.equal(record(fx).admin_files_already_identical, '2');
});

test('one asset with different bytes stops both builds before anything is written', () => {
  const fx = setup();
  writeFileSync(path.join(fx.live, 'apps/admin/dist/assets/index-NEW1.js'), 'export const admin = "something else";\n');
  const before = { admin: liveTree(fx, 'admin'), app: liveTree(fx, 'app') };
  uploadBuilds(fx);
  const result = publish(fx);
  assert.equal(result.status, 1);
  assert.match(mainLog(fx), /CONFLICT \(admin\): assets\/index-NEW1.js exists live with different bytes/);
  assert.match(mainLog(fx), /1 conflicts; nothing was written for either build/);
  assert.deepEqual({ admin: liveTree(fx, 'admin'), app: liveTree(fx, 'app') }, before, 'neither build may change, not even the app');
  assert.equal(calls(fx).some(line => /^sudo -n (cp|mv|mkdir|chmod)\b/.test(line)), false, 'no write was even attempted');
  assertNothingDangerous(fx);
});

test('a top-level file whose live name is a folder is a conflict, so nothing is moved into that folder', () => {
  const fx = setup();
  rmSync(path.join(fx.live, 'apps/admin/dist/favicon.ico'));
  mkdirSync(path.join(fx.live, 'apps/admin/dist/favicon.ico'));
  writeFileSync(path.join(fx.live, 'apps/admin/dist/favicon.ico/keep.txt'), 'inside a folder\n');
  const before = { admin: liveTree(fx, 'admin'), app: liveTree(fx, 'app') };
  uploadBuilds(fx);
  const result = publish(fx);
  assert.equal(result.status, 1);
  assert.match(mainLog(fx), /CONFLICT \(admin\): top-level favicon.ico exists live and is not a plain file/);
  assert.deepEqual({ admin: liveTree(fx, 'admin'), app: liveTree(fx, 'app') }, before);
  assert.equal(calls(fx).some(line => /^sudo -n (cp|mv|mkdir|chmod)\b/.test(line)), false);
  assertNothingDangerous(fx);
});

test('a cut-off or changed upload, a missing checksum file or a checksum file for other files is refused', () => {
  const cases = [
    [fx => appendFileSync(path.join(fx.release, ARCHIVES.app(sha)), 'x'), /does not match its checksum/],
    [fx => rmSync(path.join(fx.release, `web-builds-${sha}.sha256`)), /checksum file .* is missing/],
    [fx => {
      const file = path.join(fx.release, `web-builds-${sha}.sha256`);
      writeFileSync(file, readFileSync(file, 'utf8').split('\n').filter(Boolean).reverse().join('\n') + '\n');
    }, /checksum line 1 names/],
    [fx => writeFileSync(path.join(fx.release, `web-builds-${sha}.sha256`), 'not a checksum\n'), /exactly 2 lines/],
    [fx => writeFileSync(path.join(fx.release, `web-builds-${sha}.sha256`), 'not a checksum\nnot one either\n'), /checksum line 1 is not sha256sum output/],
    [fx => rmSync(path.join(fx.release, ARCHIVES.admin(sha))), /archive admin-dist-.* is missing/],
  ];
  for (const [prepare, message] of cases) {
    const fx = setup();
    uploadBuilds(fx);
    prepare(fx);
    const result = publish(fx);
    assert.equal(result.status, 1, result.stdout);
    assert.match(mainLog(fx), message);
    assertUnchanged(fx);
  }
});

// The folder checks inside check_dir, each with its own message. These run
// before main() reaches its own refusals and are not mutation-checked. '/' is
// refused by the pattern check; the separate filesystem-root check behind it is
// a backstop that no input reaches and no test covers.
test('unsafe or missing folders are refused before anything runs, each for its own reason', () => {
  const fx = setup();
  uploadBuilds(fx);
  const absolute = name => new RegExp(`^ERROR: ${name} must be an absolute path made of`, 'm');
  const parts = name => new RegExp(`^ERROR: ${name} must not contain '\\.\\.', '\\.' or '//' parts`, 'm');
  const notFolder = name => new RegExp(`^ERROR: ${name} is not a folder, or is a symbolic link`, 'm');
  const cases = [
    [{ ONSERVICE_RELEASE_DIR: '' }, /ONSERVICE_RELEASE_DIR: set ONSERVICE_RELEASE_DIR to the release folder that holds the uploaded archives/],
    [{ ONSERVICE_RELEASE_DIR: 'release' }, absolute('ONSERVICE_RELEASE_DIR')],
    [{ ONSERVICE_RELEASE_DIR: '/' }, absolute('ONSERVICE_RELEASE_DIR')],
    [{ ONSERVICE_RELEASE_DIR: `${posix(fx.release)} x` }, absolute('ONSERVICE_RELEASE_DIR')],
    [{ ONSERVICE_RELEASE_DIR: `${posix(fx.release)}/../release` }, parts('ONSERVICE_RELEASE_DIR')],
    [{ ONSERVICE_RELEASE_DIR: `${posix(fx.dir)}/no-such-folder` }, notFolder('ONSERVICE_RELEASE_DIR')],
    [{ ONSERVICE_PROJECT_DIR: 'live' }, absolute('ONSERVICE_PROJECT_DIR')],
    [{ ONSERVICE_PROJECT_DIR: `${posix(fx.dir)}//live` }, parts('ONSERVICE_PROJECT_DIR')],
    [{ ONSERVICE_PROJECT_DIR: `${posix(fx.dir)}/./live` }, parts('ONSERVICE_PROJECT_DIR')],
    [{ ONSERVICE_PROJECT_DIR: `${posix(fx.dir)}/no-such-folder` }, notFolder('ONSERVICE_PROJECT_DIR')],
  ];
  if (process.platform !== 'win32') {
    // Git Bash on Windows cannot make a real symbolic link without extra rights.
    symlinkSync(fx.release, path.join(fx.dir, 'release-link'));
    symlinkSync(fx.live, path.join(fx.dir, 'live-link'));
    cases.push([{ ONSERVICE_RELEASE_DIR: path.join(fx.dir, 'release-link') }, notFolder('ONSERVICE_RELEASE_DIR')]);
    cases.push([{ ONSERVICE_PROJECT_DIR: path.join(fx.dir, 'live-link') }, notFolder('ONSERVICE_PROJECT_DIR')]);
  }
  for (const [env, message] of cases) {
    const result = publish(fx, [sha], env);
    assert.notEqual(result.status, 0, `${JSON.stringify(env)} must be refused`);
    assert.match(result.stderr, message, JSON.stringify(env));
  }
  assert.deepEqual(calls(fx), [], 'no git, docker or sudo call may run for a bad folder');
  assert.deepEqual(readdirSync(fx.release).sort(), [ARCHIVES.admin(sha), ARCHIVES.app(sha), `web-builds-${sha}.sha256`].sort(), 'no lock folder or log may be left');
  assertUnchanged(fx);
});

// Every refusal a run can reach from the start of main() to the checksum stage,
// one case each: the argument and folder checks and the lock (earlyCases), and
// the preflight stage (preflightCases).
// - `check` is the refusal's exact message text in the script. The guard test
//   below fails when that part of the script has a refusal that no case names.
// - `message` is what the case expects, written so that no other refusal can
//   satisfy it. preflight-mutation-check.mjs shows that each case fails when
//   its own refusal is switched off.
// UNREACHABLE lists the refusals there that no run can reach: the log name
// holds the run's process number and the current second.
const UNREACHABLE = ['log $PREFIX.log already exists'];
const appLive = fx => path.join(fx.live, LIVE_DIRS.app);
const earlyCases = [
  { check: 'expected exactly 1 argument, got $#', name: 'there is no argument, or more than one',
    inputs: [{ args: () => [] }, { args: () => [sha, 'extra'] }], message: /^ERROR: expected exactly 1 argument, got [02]$/m },
  { check: 'the commit must be a full 40-character lower-case sha', name: 'the commit is not a full lower-case sha',
    inputs: [['abc'], [''], () => [sha.toUpperCase()], () => [sha.slice(0, 12)], () => [`${sha};id`]]
      .map(args => ({ args: typeof args === 'function' ? args : () => args })),
    message: /^ERROR: the commit must be a full 40-character lower-case sha$/m },
  { check: 'the release folder must be outside the live checkout', name: 'the release folder is inside the live checkout, or is the live checkout',
    inputs: [{ env: fx => ({ ONSERVICE_RELEASE_DIR: posix(path.join(fx.live, 'apps')) }) }, { env: fx => ({ ONSERVICE_PROJECT_DIR: posix(fx.release) }) }],
    message: /^ERROR: the release folder must be outside the live checkout$/m },
  { check: 'the live checkout must not be inside the release folder', name: 'the live checkout is inside the release folder',
    inputs: [{ prepare: fx => mkdirSync(path.join(fx.release, 'nested')), env: fx => ({ ONSERVICE_PROJECT_DIR: posix(path.join(fx.release, 'nested')) }) }],
    message: /^ERROR: the live checkout must not be inside the release folder$/m },
  { check: 'live web folder $live is missing or is a symbolic link', name: 'a live web folder is missing (or, on Linux, is a symbolic link)',
    inputs: [
      { prepare: fx => renameSync(appLive(fx), path.join(fx.dir, 'moved-dist-web')) },
      ...(process.platform === 'win32' ? [] : [{ prepare: fx => {
        renameSync(appLive(fx), path.join(fx.dir, 'moved-dist-web'));
        symlinkSync(path.join(fx.dir, 'moved-dist-web'), appLive(fx));
      } }]),
    ],
    message: /^ERROR: live web folder \S+\/apps\/mobile\/dist-web is missing or is a symbolic link$/m },
  { check: 'another web publish is running, or a stale lock folder $RELEASE_DIR/.web-publish-lock needs review', name: 'a lock folder exists',
    inputs: [{ prepare: fx => mkdirSync(path.join(fx.release, '.web-publish-lock')) }],
    message: /^ERROR: another web publish is running, or a stale lock folder \S+\/\.web-publish-lock needs review$/m },
];
for (const item of earlyCases) {
  test(`publish refuses (${item.check}) when ${item.name}, and writes nothing`, () => {
    for (const input of item.inputs) {
      const fx = setup();
      uploadBuilds(fx);
      if (input.prepare) input.prepare(fx);
      const args = input.args ? input.args() : [sha];
      const env = input.env ? input.env(fx) : {};
      const what = JSON.stringify({ args, env });
      const before = { release: readdirSync(fx.release).sort(), admin: liveTreeOrNull(fx, 'admin'), app: liveTreeOrNull(fx, 'app') };
      const result = publish(fx, args, env);
      assert.equal(result.status, 2, `${what}: ${result.stdout}${result.stderr}`);
      assert.match(result.stderr, item.message, what);
      assert.equal(result.stderr.match(/^ERROR: /gm)?.length, 1, `${what}: exactly one refusal`);
      assert.deepEqual(calls(fx), [], `${what}: no git, docker or sudo call may run`);
      assert.deepEqual(readdirSync(fx.release).sort(), before.release, `${what}: no lock folder, log or record may be left, and an existing lock stays`);
      assert.deepEqual({ release: before.release, admin: liveTreeOrNull(fx, 'admin'), app: liveTreeOrNull(fx, 'app') }, before, `${what}: the live folders must be untouched`);
    }
  });
}

const preflightCases = [
  { check: 'could not read the live checkout', name: 'the live checkout HEAD cannot be read',
    // An unborn branch: `git rev-parse HEAD` fails although .git is there.
    prepare: fx => sh('git symbolic-ref HEAD refs/heads/no-such-branch', fx.live),
    message: /STOP: could not read the live checkout$/m },
  { check: 'the live checkout is at $head, not $SHA. Deploy the API for this commit first.', name: 'the live checkout is at another commit',
    options: { liveAt: () => other },
    message: /STOP: the live checkout is at [0-9a-f]{40}, not [0-9a-f]{40}\. Deploy the API for this commit first\./ },
  { check: 'could not inspect the running API container', name: 'the running API container cannot be inspected',
    prepare: fx => writeFileSync(path.join(fx.state, 'running_image'), 'absent\n'),
    message: /STOP: could not inspect the running API container/ },
  { check: 'could not read the running API image label', name: 'the running API image cannot be inspected',
    // A well-formed image id that Docker does not know.
    prepare: fx => writeFileSync(path.join(fx.state, 'running_image'), `sha256:${'e'.repeat(64)}\n`),
    message: /STOP: could not read the running API image label/ },
  { check: "the running API is labelled '$running_rev', not $SHA. Web and API must be the same commit.", name: 'the running API is another commit',
    options: { runningRev: () => other },
    message: /STOP: the running API is labelled '[0-9a-f]{40}', not [0-9a-f]{40}\. Web and API must be the same commit\./ },
];
for (const item of preflightCases) {
  test(`publish refuses (${item.check}) when ${item.name}, and writes nothing`, () => {
    const fx = setup(item.options);
    uploadBuilds(fx);
    if (item.prepare) item.prepare(fx);
    const result = publish(fx);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const log = mainLog(fx);
    assert.match(log, item.message);
    assert.equal(log.match(/STOP: /g)?.length, 1, 'exactly one refusal');
    assert.match(log, /FAILED during stage 'preflight'/);
    assert.doesNotMatch(log, /live checkout and running API are at/);
    assertUnchanged(fx);
  });
}

// A text check, not a behaviour test: the list of cases keeps up with the
// script. preflight-mutation-check.mjs reads the same part of the script.
test('every reachable refusal from the start of main() to the checksum stage has exactly one case above', () => {
  const text = readFileSync(UNDER_TEST, 'utf8');
  const start = text.indexOf('main() {');
  const end = text.indexOf('STAGE=checksums');
  assert.ok(start > 0 && end > start, 'main() and the checksum stage must be found in the script');
  const refusals = [...text.slice(start, end).matchAll(/\|\| (?:fail|usage_error) "([^"]*)"/g)].map(match => match[1]);
  assert.deepEqual(refusals.filter(check => UNREACHABLE.includes(check)), UNREACHABLE, 'each unreachable refusal must still be in the script');
  assert.deepEqual(refusals.filter(check => !UNREACHABLE.includes(check)).sort(), [...earlyCases, ...preflightCases].map(item => item.check).sort());
});

test('archives with links, absolute or ".." paths, odd top-level names or no index.html are refused before unpacking or writing', () => {
  const cases = [
    [buildTarGz([...entriesOf(NEW.admin), { name: './assets/evil.js', type: 'symlink', linkname: '/etc/passwd' }]), /contains a link or special file/],
    [buildTarGz([...entriesOf(NEW.admin), { name: '../outside.js', type: 'file', content: 'x' }]), /has a '\.\.' path/],
    [buildTarGz([...entriesOf(NEW.admin), { name: './assets/../../outside.js', type: 'file', content: 'x' }]), /has a '\.\.' path/],
    [buildTarGz([...entriesOf(NEW.admin), { name: '/tmp/absolute.js', type: 'file', content: 'x' }]), /has an absolute path/],
    [tarOf({ ...NEW.admin, '.htaccess': 'deny\n' }), /top-level file with an unexpected name/],
    [tarOf({ 'assets/index-NEW1.js': NEW.admin['assets/index-NEW1.js'] }), /has no index.html at the top/],
  ];
  for (const [admin, message] of cases) {
    const fx = setup();
    uploadCustom(fx, admin, tarOf(NEW.app));
    const result = publish(fx);
    assert.equal(result.status, 1, result.stdout);
    assert.match(mainLog(fx), message);
    assertUnchanged(fx);
    assert.equal(readdirSync(fx.dir).includes('outside.js'), false);
  }
});

test('a file that nginx cannot see stops the publish before any entry file is switched', () => {
  const fx = setup();
  uploadBuilds(fx);
  const result = publish(fx, [sha], { FAKE_NGINX_BLIND: 'entry-NEW2.js' });
  assert.equal(result.status, 1);
  assert.match(mainLog(fx), /not visible in nginx \(app\): _expo\/static\/js\/web\/entry-NEW2.js/);
  assert.match(mainLog(fx), /no entry file was switched/);
  assert.equal(liveTree(fx, 'admin')['index.html'], OLD.admin['index.html']);
  assert.equal(liveTree(fx, 'app')['index.html'], OLD.app['index.html']);
  assert.equal(calls(fx).some(line => line.startsWith('sudo -n mv -f')), false);
  assertNothingDangerous(fx);
});

test('if nginx does not serve the new index.html after the switch, the run fails and says which build was being switched', () => {
  const fx = setup();
  uploadBuilds(fx);
  const result = publish(fx, [sha], { FAKE_NGINX_STALE_INDEX: '1' });
  assert.equal(result.status, 1);
  assert.match(mainLog(fx), /admin: nginx does not serve the new index.html/);
  assert.match(mainLog(fx), /entry files were being switched for: +admin/);
  assert.equal(record(fx), null, 'no release record for a failed publish');
  assertNothingDangerous(fx);
});
