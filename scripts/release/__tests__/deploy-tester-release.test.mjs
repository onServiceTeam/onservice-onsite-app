// Behaviour tests for scripts/release/deploy-tester-release.sh.
//
// The script runs for real against throwaway git repositories: a bare origin,
// a "live" checkout and a "build" checkout. The real helpers
// scripts/server/{release-api-common,run-production-migrations,activate-api-release}.sh
// are committed into the fixture and run too. Only sudo, docker and the
// migration runner inside the fake API container are fakes (see
// release-harness.mjs and fixtures/); the fake docker records every call and keeps the
// database migration counts in files, so each test checks what actually
// happened, not what the script printed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  CONTAINER_ID, NEW_IMAGE_HEX, OLD_IMAGE_ID, copyFromRepo, git, makeRoot, posix, readLines, repo, runScript, sh, writeFakes,
} from './release-harness.mjs';

// The script under test is the repository script. preflight-mutation-check.mjs
// sets RELEASE_DEPLOY_SCRIPT to a changed copy kept in a temporary folder
// outside the repository, so a mutation run never writes to the real script.
// Normal runs and CI leave it unset.
const UNDER_TEST = process.env.RELEASE_DEPLOY_SCRIPT
  ? path.resolve(process.env.RELEASE_DEPLOY_SCRIPT)
  : path.join(repo, 'scripts/release/deploy-tester-release.sh');
const NEW_IMAGE_ID = `sha256:${NEW_IMAGE_HEX}`;
// The fake direct database URL carries this marker as its password. No
// release file, log or command line may ever contain it.
const DIRECT_URL_SECRET = 'Direct-Url-Marker-7c41e9';
const DIRECT_URL = `postgresql://fixture:${DIRECT_URL_SECRET}@postgres:5432/onservice`;
// A server-only, git-ignored file in the live checkout.
const LIVE_ONLY = 'LIVE-SERVER-ONLY\n';
let root;
let origin;
let c; // fixture commits

before(() => {
  root = makeRoot('onservice-deploy-');
  const seed = path.join(root, 'seed');
  mkdirSync(seed);
  for (const file of ['docker-compose.prod.yml', 'docker-compose.release.yml', 'scripts/server/release-api-common.sh',
    'scripts/server/run-production-migrations.sh', 'scripts/server/activate-api-release.sh']) copyFromRepo(seed, file);
  mkdirSync(path.join(seed, 'packages/api/migrations'), { recursive: true });
  mkdirSync(path.join(seed, 'nginx'));
  writeFileSync(path.join(seed, 'packages/api/Dockerfile'), 'FROM scratch\n');
  writeFileSync(path.join(seed, 'nginx/nginx.conf'), '# fixture nginx\n');
  writeFileSync(path.join(seed, 'README.md'), 'release fixture\n');
  // As on the server: TLS material, a cache and .env files are git-ignored.
  writeFileSync(path.join(seed, '.gitignore'), '/certbot/\n/server-cache\n.env\n');
  for (const name of ['001_a', '002_b', '003_c', '004_d', '005_e']) {
    writeFileSync(path.join(seed, `packages/api/migrations/${name}.sql`), `-- ${name}\n`);
  }
  const prev = sh(`${git} init -q -b master && ${git} add . && ${git} commit -qm previous && git rev-parse HEAD`, seed);
  const side = sh(`git checkout -q -b side && echo side > side.txt && ${git} add . && ${git} commit -qm side && git rev-parse HEAD`, seed);
  sh('git checkout -q master', seed);
  writeFileSync(path.join(seed, 'packages/api/migrations/006_f.sql'), '-- 006_f\n');
  writeFileSync(path.join(seed, 'packages/api/migrations/007_g.sql'), '-- 007_g\n');
  writeFileSync(path.join(seed, 'README.md'), 'release fixture, new version\n');
  // A new folder in the release, like legal/ (bind-mounted into nginx) or a
  // new script folder: the checkout must create it readable for everyone.
  mkdirSync(path.join(seed, 'legal'));
  writeFileSync(path.join(seed, 'legal/terms.html'), '<p>fixture terms</p>\n');
  const sha = sh(`${git} add . && ${git} commit -qm release && git rev-parse HEAD`, seed);
  writeFileSync(path.join(seed, 'nginx/nginx.conf'), '# fixture nginx, changed\n');
  const shaNginx = sh(`${git} add . && ${git} commit -qm nginx && git rev-parse HEAD`, seed);
  // A release that starts tracking paths that are git-ignored on the server
  // (force-added): a file under certbot/, and a file inside a server-cache
  // folder.
  mkdirSync(path.join(seed, 'certbot/conf'), { recursive: true });
  writeFileSync(path.join(seed, 'certbot/conf/server-only.txt'), 'FROM-THE-COMMIT\n');
  mkdirSync(path.join(seed, 'server-cache'));
  writeFileSync(path.join(seed, 'server-cache/inner.txt'), 'FROM-THE-COMMIT\n');
  const shaClobber = sh(`${git} add -f certbot/conf/server-only.txt server-cache/inner.txt && ${git} commit -qm clobber && git rev-parse HEAD`, seed);
  origin = path.join(root, 'origin.git');
  sh(`git init -q --bare "${posix(origin)}" && git push -q "${posix(origin)}" master side`, seed);
  c = { prev, side, sha, shaNginx, shaClobber };
});

after(() => { if (root) rmSync(root, { recursive: true, force: true }); });

let serial = 0;
// `images` replaces the fake image list (lines of "<tag> <image id> <revision label>");
// `running` replaces the image id the running API container reports.
// `nginxLoaded` is the nginx.conf the running nginx container reads: by
// default the live checkout's own copy at the start; null means it cannot be read.
function setup({ liveAt = c.prev, runningRev = c.prev, liveCount = 5, leftoverCopy = false, images = null, running = OLD_IMAGE_ID, nginxLoaded } = {}) {
  serial += 1;
  const dir = path.join(root, `case${serial}`);
  mkdirSync(dir);
  // Both checkouts start at an older commit, as on the server, so the files the
  // release adds are written by the script's own (root) git checkout.
  sh(`git clone -q "${posix(origin)}" live && git -C live checkout -q --detach ${liveAt} && git clone -q "${posix(origin)}" build && git -C build checkout -q --detach ${c.prev}`, dir);
  const release = path.join(dir, 'release');
  const state = path.join(dir, 'state');
  mkdirSync(release);
  mkdirSync(path.join(state, 'db'), { recursive: true });
  const imageLines = images ?? [`onservice-api:${runningRev} ${OLD_IMAGE_ID} ${runningRev}`];
  writeFileSync(path.join(state, 'images.txt'), `${imageLines.join('\n')}\n`);
  writeFileSync(path.join(state, 'running_image'), `${running}\n`);
  writeFileSync(path.join(state, 'db/onservice.count'), `${liveCount}\n`);
  if (leftoverCopy) writeFileSync(path.join(state, 'db/onservice_rehearsal_0123456789ab.count'), '5\n');
  if (nginxLoaded === undefined) copyFileSync(path.join(dir, 'live/nginx/nginx.conf'), path.join(state, 'nginx.conf'));
  else if (nginxLoaded !== null) writeFileSync(path.join(state, 'nginx.conf'), nginxLoaded);
  const calls = path.join(dir, 'calls.log');
  writeFileSync(calls, '');
  const { bin, cbin } = writeFakes(dir);
  return { dir, live: path.join(dir, 'live'), build: path.join(dir, 'build'), release, state, calls, bin, cbin };
}

function deploy(fx, args = [c.sha, c.prev, '5', '007_g'], { scenario = 'success', env = {}, script = UNDER_TEST } = {}) {
  return runScript(script, args, {
    cwd: fx.dir, bin: fx.bin, absolute: true,
    env: {
      ONSERVICE_RELEASE_DIR: posix(fx.release), ONSERVICE_BUILD_DIR: posix(fx.build), ONSERVICE_PROJECT_DIR: posix(fx.live),
      FAKE_STATE: posix(fx.state), FAKE_LOG: posix(fx.calls), FAKE_SCENARIO: scenario, FAKE_AFTER_COUNT: '7',
      FAKE_CONTAINER_BIN: posix(fx.cbin), FAKE_CONTAINER_ID: CONTAINER_ID, FAKE_NEW_IMAGE_HEX: NEW_IMAGE_HEX,
      FAKE_PROJECT: posix(fx.live), FAKE_DIRECT_URL: DIRECT_URL, ...env,
    },
  });
}

const head = fx => sh('git rev-parse HEAD', fx.live);
const liveCount = fx => readFileSync(path.join(fx.state, 'db/onservice.count'), 'utf8').trim();
const runningImage = fx => readFileSync(path.join(fx.state, 'running_image'), 'utf8').trim();
const calls = fx => readLines(fx.calls);
const releaseFiles = fx => readdirSync(fx.release);
const mainLogs = fx => releaseFiles(fx).filter(file => /^api-[0-9a-f]{12}-\d{8}T\d{6}Z-\d+\.log$/.test(file));
const mainLog = fx => {
  const names = mainLogs(fx);
  assert.ok(names.length <= 1, 'one run writes one main log');
  return names.length ? readFileSync(path.join(fx.release, names[0]), 'utf8') : '';
};
const record = fx => {
  const name = releaseFiles(fx).find(file => file.endsWith('-record.txt'));
  if (!name) return null;
  return Object.fromEntries(readFileSync(path.join(fx.release, name), 'utf8').trim().split('\n')
    .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
};
const copies = fx => readdirSync(path.join(fx.state, 'db')).filter(file => file.startsWith('onservice_rehearsal_') && file.endsWith('.count'));
const nodeCalls = fx => calls(fx).filter(line => line.startsWith('node '));
const releaseFilesDeep = fx => readdirSync(fx.release, { recursive: true })
  .map(rel => path.join(fx.release, rel)).filter(file => statSync(file).isFile());
// A move of the live checkout to `sha`, with or without extra flags.
const liveMoveTo = (fx, sha) => line => line.includes(`-C ${posix(fx.live)} checkout `) && line.endsWith(` --detach ${sha}`);

// What no run may ever do, whatever happens.
function assertNothingDangerous(fx) {
  for (const line of calls(fx)) {
    assert.doesNotMatch(line, /^docker (rm|rmi|stop|kill|pull|system|volume|network|restart)\b/, line);
    assert.doesNotMatch(line, /^docker image (rm|prune)\b/, line);
    assert.doesNotMatch(line, /^docker compose .* (down|restart|stop|rm)\b/, line);
    assert.doesNotMatch(line, /--force-recreate|DROPPED-LIVE-DATABASE/, line);
    // "run --rm" (a one-off container) is fine; an rm command is not.
    assert.doesNotMatch(line, /^sudo .*((?<![-\w])rm\s|reset --hard|\sclean\b|\spush\b)/, line);
  }
  assert.equal(existsSync(path.join(fx.release, '.deploy-lock')), false, 'the lock folder must be released');
  // The direct database URL carries the database password. It must never
  // reach a release file (main log, step logs, record, backup) or a command line.
  for (const file of releaseFilesDeep(fx)) {
    assert.equal(readFileSync(file).includes(DIRECT_URL_SECRET), false, `${path.basename(file)} must not contain the direct database URL`);
  }
  assert.equal(readFileSync(fx.calls, 'utf8').includes(DIRECT_URL_SECRET), false, 'no command line may carry the direct database URL');
}
const assertNoDirectUrlOutput = result => assert.equal((result.stdout + result.stderr).includes(DIRECT_URL_SECRET), false,
  'the script output must not contain the direct database URL');

// A refusal before the build: nothing on the server changed at all. A count of
// null means the fake live database was made unreadable on purpose, and it
// must still be unreadable: nothing may have created it.
function assertUntouched(fx, startHead = c.prev, count = '5', running = OLD_IMAGE_ID) {
  assert.equal(head(fx), startHead);
  if (count === null) assert.equal(existsSync(path.join(fx.state, 'db/onservice.count')), false);
  else assert.equal(liveCount(fx), count);
  assert.equal(runningImage(fx), running);
  const log = calls(fx);
  assert.equal(log.some(line => line.startsWith('docker build')), false, 'no image may be built');
  assert.equal(log.some(line => line.includes('pg_dump')), false, 'no backup may be taken');
  assert.equal(log.some(line => line.includes('CREATE DATABASE')), false, 'no rehearsal copy may be created');
  assert.equal(log.some(line => line.includes(`-C ${posix(fx.live)} checkout `)), false, 'the live checkout may not be moved');
  assertNothingDangerous(fx);
}

test('a clean release backs up first, rehearses on a copy, migrates, activates and records the result', () => {
  const fx = setup();
  const result = deploy(fx);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /deploy done/);

  assert.equal(head(fx), c.sha);
  assert.equal(liveCount(fx), '7');
  assert.equal(readFileSync(path.join(fx.state, 'db/onservice.target'), 'utf8').trim(), '007_g');
  assert.equal(runningImage(fx), NEW_IMAGE_ID);
  assert.deepEqual(copies(fx), [], 'the rehearsal copy must be dropped');
  assert.ok(existsSync(path.join(fx.state, 'dropped', `onservice_rehearsal_${c.sha.slice(0, 12)}.count`)));

  const log = calls(fx);
  assert.ok(log.includes(`build-checkout-head ${c.sha}`), 'the image is built from the build checkout at the release commit');
  const backupAt = log.findIndex(line => line.includes('pg_dump'));
  const moveAt = log.findIndex(liveMoveTo(fx, c.sha));
  assert.ok(moveAt >= 0 && log[moveAt].includes(' --no-overwrite-ignore '), 'the live move may never replace an ignored file');
  const buildAt = log.findIndex(line => line.startsWith('docker build'));
  assert.ok(buildAt >= 0 && backupAt > buildAt && moveAt > backupAt, 'build, then backup, then the checkout move');
  const rehearsalDb = `onservice_rehearsal_${c.sha.slice(0, 12)}`;
  assert.deepEqual(nodeCalls(fx).map(line => line.replace(/ args=.*--dry-run.*/, ' dry').replace(/ args=.*/, ' apply')), [
    `node db=${rehearsalDb} dry`, `node db=${rehearsalDb} apply`, `node db=${rehearsalDb} apply`,
    'node db=onservice dry', 'node db=onservice apply',
  ], 'dry run, apply and repeat on the copy, then the live dry run and apply');
  for (const line of nodeCalls(fx)) assert.match(line, /--target 007_g --migrations-dir migrations/);
  const dropAt = log.findIndex(line => line.includes(`DROP DATABASE ${rehearsalDb}`));
  const liveMigrateAt = log.findIndex(line => line.startsWith('node db=onservice '));
  assert.ok(dropAt > 0 && liveMigrateAt > dropAt, 'the copy is dropped before the live migration');
  assert.ok(log.includes('docker compose -f docker-compose.prod.yml -f docker-compose.release.yml up -d --no-deps --no-build --pull never api'));
  assertNothingDangerous(fx);

  const rec = record(fx);
  assert.equal(rec.commit, c.sha);
  assert.equal(rec.previous_commit, c.prev);
  assert.equal(rec.previous_image_id, OLD_IMAGE_ID);
  assert.equal(rec.rollback_image, `onservice-api:${c.prev}`);
  assert.equal(rec.image_id, NEW_IMAGE_ID);
  assert.ok(Number(rec.backup_bytes) > 0);
  assert.match(rec.backup_sha256, /^[0-9a-f]{64}$/);
  assert.equal(rec.migrations_before, '5');
  assert.equal(rec.migrations_after, '7');
  assert.equal(rec.migration_target, '007_g');
  assert.equal(rec.shared_config_changed, 'none');
  assert.equal(rec.nginx_config_drift, 'no');
  assert.match(rec.rehearsal_result, /apply reached 7; repeat found 0 pending; copy dropped/);
  assert.match(rec.activated_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  assert.match(rec.release_state, /^deployed \(API only/);

  const dumpName = releaseFiles(fx).find(file => file.endsWith('.dump'));
  assert.equal(readFileSync(path.join(fx.release, dumpName), 'utf8').trim(), 'FAKEDUMP count=5');
  if (process.platform !== 'win32') {
    assert.equal(statSync(path.join(fx.release, dumpName)).mode & 0o777, 0o600, 'the backup holds tester data and must be private');
  }
  const inner = readFileSync(path.join(fx.release, releaseFiles(fx).find(file => file.endsWith('-rehearse-inner.sh'))), 'utf8');
  assert.match(inner, new RegExp(`/${rehearsalDb}" node scripts/run-reviewed-migrations.mjs --target 007_g`));
  assert.match(mainLog(fx), /rehearsal passed/);
  assert.match(mainLog(fx), /API activation verified at/);
  assert.match(mainLog(fx), /no path this release adds exists in the live checkout yet/);
  assertNoDirectUrlOutput(result);
});

// sudo runs commands with the union of the caller's umask and 0022. A script
// umask of 077 would make root's git write files only root can read into both
// checkouts, so the image build and nginx could not read them. Only the release
// folder's own files (backup, logs, record) may be private.
test('commands run through sudo keep umask 0022, so the checkouts stay readable, while the backup, logs and record are private', () => {
  const fx = setup();
  const result = deploy(fx);
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const umasks = calls(fx).filter(line => line.startsWith('sudo-umask '));
  assert.ok(umasks.some(line => line.endsWith(' git')), 'root git ran through sudo');
  assert.ok(umasks.some(line => line.endsWith(' env')), 'the server helpers ran through sudo');
  assert.deepEqual(umasks.filter(line => !line.startsWith('sudo-umask 0022 ')), [],
    'every command run as root must get umask 0022, or the files it writes are root-only');

  if (process.platform !== 'win32') {
    // Real file modes only exist on Linux and macOS; Git Bash on Windows fakes them.
    for (const checkout of [fx.live, fx.build]) {
      assert.equal(statSync(path.join(checkout, 'legal')).mode & 0o777, 0o755, `${checkout}: a new folder from the checkout`);
      for (const file of ['legal/terms.html', 'README.md', 'packages/api/migrations/007_g.sql']) {
        assert.equal(statSync(path.join(checkout, file)).mode & 0o777, 0o644, `${checkout}: ${file}`);
      }
    }
    const privateFiles = releaseFiles(fx).filter(file => /\.(dump|log|txt|sh)$/.test(file));
    assert.ok(privateFiles.some(file => file.endsWith('.dump')) && privateFiles.some(file => file.endsWith('-record.txt')));
    for (const file of privateFiles) {
      assert.equal(statSync(path.join(fx.release, file)).mode & 0o777, 0o600, `${file} must be readable by the deploy user only`);
    }
  }
});

test('arguments are checked against strict patterns before anything runs', () => {
  const fx = setup();
  const sha = c.sha;
  const prev = c.prev;
  const bad = [
    [], [sha], [sha, prev, '5'], [sha, prev, '5', '007_g', 'extra'],
    ['master', prev, '5', '007_g'], [sha.slice(0, 8), prev, '5', '007_g'], [sha.toUpperCase(), prev, '5', '007_g'],
    [`${sha}0`, prev, '5', '007_g'], [`${sha.slice(0, 39)}g`, prev, '5', '007_g'], [`${sha};id`, prev, '5', '007_g'],
    [sha, 'HEAD', '5', '007_g'], [sha, sha, '5', '007_g'],
    [sha, prev, '0', '007_g'], [sha, prev, '-1', '007_g'], [sha, prev, '5a', '007_g'], [sha, prev, '12345', '007_g'],
    [sha, prev, '5;ls', '007_g'], [sha, prev, ' 5', '007_g'], [sha, prev, '', '007_g'],
    [sha, prev, '5', '7_g'], [sha, prev, '5', '007_G'], [sha, prev, '5', '007_g;ls'], [sha, prev, '5', '../007_g'],
    [sha, prev, '5', '007'], [sha, prev, '5', '007_'], [sha, prev, '5', '007_g h'], [sha, prev, '5', ''],
  ];
  for (const args of bad) {
    const result = deploy(fx, args);
    assert.equal(result.status, 2, `${JSON.stringify(args)} must be refused: ${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /ERROR:/);
  }
  assert.deepEqual(calls(fx), [], 'no git, docker or sudo call may run for a bad argument');
  assert.deepEqual(releaseFiles(fx), []);
  assertUntouched(fx);
});

// Each folder refusal is checked by its own message, so switching off any one
// check makes this test fail (the run then stops later, with another message,
// or not at all). One exception: '/' is refused by the pattern check, so the
// separate filesystem-root check in check_dir is a backstop that no input
// reaches and this test does not cover.
test('missing, unsafe or overlapping folders are refused before anything runs, each for its own reason', () => {
  const fx = setup();
  const inLive = path.join(fx.live, 'release');
  const inBuild = path.join(fx.build, 'nested');
  const inRelease = path.join(fx.release, 'nested');
  const notCheckout = path.join(fx.dir, 'not-a-checkout');
  for (const dir of [inLive, inBuild, inRelease, notCheckout]) mkdirSync(dir);
  const cases = [
    [{ ONSERVICE_RELEASE_DIR: '' }, /ONSERVICE_RELEASE_DIR: set ONSERVICE_RELEASE_DIR to the release folder/],
    [{ ONSERVICE_BUILD_DIR: '' }, /ONSERVICE_BUILD_DIR: set ONSERVICE_BUILD_DIR to the separate checkout/],
    [{ ONSERVICE_RELEASE_DIR: 'release' }, /ERROR: ONSERVICE_RELEASE_DIR must be an absolute path made of/],
    [{ ONSERVICE_RELEASE_DIR: '/' }, /ERROR: ONSERVICE_RELEASE_DIR must be an absolute path made of/],
    [{ ONSERVICE_RELEASE_DIR: `${posix(fx.release)} x` }, /ERROR: ONSERVICE_RELEASE_DIR must be an absolute path made of/],
    [{ ONSERVICE_RELEASE_DIR: `${posix(fx.release)}/../release` }, /ERROR: ONSERVICE_RELEASE_DIR must not contain '\.\.', '\.' or '\/\/' parts/],
    [{ ONSERVICE_BUILD_DIR: `${posix(fx.dir)}//build` }, /ERROR: ONSERVICE_BUILD_DIR must not contain '\.\.', '\.' or '\/\/' parts/],
    [{ ONSERVICE_RELEASE_DIR: `${posix(fx.dir)}/no-such-folder` }, /ERROR: ONSERVICE_RELEASE_DIR is not a folder, or is a symbolic link/],
    [{ ONSERVICE_PROJECT_DIR: `${posix(fx.dir)}/no-such-folder` }, /ERROR: ONSERVICE_PROJECT_DIR is not a folder, or is a symbolic link/],
    [{ ONSERVICE_BUILD_DIR: posix(fx.live) }, /ERROR: the build checkout must not be the live checkout or inside it/],
    [{ ONSERVICE_PROJECT_DIR: posix(inBuild) }, /ERROR: the live checkout must not be inside the build checkout/],
    [{ ONSERVICE_RELEASE_DIR: posix(inLive) }, /ERROR: the release folder must be outside the live checkout/],
    [{ ONSERVICE_PROJECT_DIR: posix(fx.release) }, /ERROR: the release folder must be outside the live checkout/],
    [{ ONSERVICE_RELEASE_DIR: posix(fx.build) }, /ERROR: the release folder must be outside the build checkout/],
    [{ ONSERVICE_PROJECT_DIR: posix(inRelease) }, /ERROR: the live checkout must not be inside the release folder/],
    [{ ONSERVICE_BUILD_DIR: posix(inRelease) }, /ERROR: the build checkout must not be inside the release folder/],
    [{ ONSERVICE_PROJECT_DIR: posix(notCheckout) }, /ERROR: ONSERVICE_PROJECT_DIR is not a git checkout/],
    [{ ONSERVICE_BUILD_DIR: posix(notCheckout) }, /ERROR: ONSERVICE_BUILD_DIR is not a git checkout/],
  ];
  if (process.platform !== 'win32') {
    // Git Bash on Windows cannot make a real symbolic link without extra rights.
    const link = path.join(fx.dir, 'release-link');
    symlinkSync(fx.release, link);
    cases.push([{ ONSERVICE_RELEASE_DIR: link }, /ERROR: ONSERVICE_RELEASE_DIR is not a folder, or is a symbolic link/]);
  }
  for (const [env, message] of cases) {
    const result = deploy(fx, undefined, { env });
    assert.notEqual(result.status, 0, `${JSON.stringify(env)} must be refused`);
    assert.match(result.stderr, message, JSON.stringify(env));
  }
  assert.deepEqual(calls(fx), [], 'no git, docker or sudo call may run for a bad folder');
  assert.deepEqual(releaseFiles(fx), ['nested'], 'no lock folder or log may be left in the release folder');
  assertUntouched(fx);
});

test('the script refuses to run from inside the live checkout or the build checkout it is about to move', () => {
  for (const checkout of ['live', 'build']) {
    const fx = setup();
    const copy = path.join(fx[checkout], 'deploy-tester-release.sh');
    copyFileSync(UNDER_TEST, copy);
    const result = deploy(fx, undefined, { script: copy });
    assert.equal(result.status, 2, `${checkout}: ${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /ERROR: run a copy of this script kept outside the live and build checkouts/, checkout);
    assert.deepEqual(calls(fx), [], `${checkout}: no git, docker or sudo call may run`);
    assert.deepEqual(releaseFiles(fx), [], `${checkout}: no lock folder or log may be left`);
  }
});

test('a second run cannot start while a lock folder exists, and does not remove that lock', () => {
  const fx = setup();
  mkdirSync(path.join(fx.release, '.deploy-lock'));
  const result = deploy(fx);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /another release is running/);
  assert.equal(existsSync(path.join(fx.release, '.deploy-lock')), true);
  assert.deepEqual(calls(fx), []);
});

// Every refusal in the preflight stage, one case each.
// - `check` is the refusal's exact message text in the script. The guard test
//   below fails when the script's preflight stage has a refusal that no case
//   names, so a new check cannot arrive without its own case.
// - `message` is what the case expects in the log, written so that no other
//   refusal can satisfy it: switching off this one check makes this case fail
//   (preflight-mutation-check.mjs proves that for every case).
// - `options` shapes the fixture, `prepare` breaks it, `restore` undoes a break
//   that would stop the after-run checks from reading the fixture, `scenario`
//   asks the fake docker to fail one call, and `count` is the live migration
//   count expected afterwards (null: the fake live database stays unreadable).
const preflightCases = [
  { check: 'could not read the live checkout', name: 'the live checkout HEAD cannot be read',
    // An unborn branch: `git rev-parse HEAD` fails although .git is there.
    prepare: fx => sh('git symbolic-ref HEAD refs/heads/no-such-branch', fx.live),
    restore: fx => sh(`git update-ref --no-deref HEAD ${c.prev}`, fx.live),
    message: /STOP: could not read the live checkout$/m },
  { check: 'live checkout is at $head, not the expected previous commit $PREV', name: 'the live checkout is not at the expected previous commit',
    options: () => ({ liveAt: c.side }), message: /STOP: live checkout is at [0-9a-f]{40}, not the expected previous commit/ },
  { check: 'could not read the live checkout status', name: 'the live checkout status cannot be read',
    // A damaged index: `git rev-parse HEAD` still works, `git status` does not.
    prepare: fx => writeFileSync(path.join(fx.live, '.git/index'), 'not an index\n'),
    message: /STOP: could not read the live checkout status/ },
  { check: 'live checkout has tracked changes', name: 'the live checkout has a tracked edit',
    prepare: fx => writeFileSync(path.join(fx.live, 'README.md'), 'edited on the server\n'), message: /STOP: live checkout has tracked changes/ },
  { check: 'live checkout has no origin remote', name: 'the live checkout has no origin remote',
    prepare: fx => sh('git remote remove origin', fx.live), message: /STOP: live checkout has no origin remote/ },
  { check: 'build checkout has no origin remote', name: 'the build checkout has no origin remote',
    prepare: fx => sh('git remote remove origin', fx.build), message: /STOP: build checkout has no origin remote/ },
  { check: 'the build checkout and the live checkout use different origin remotes', name: 'the build checkout uses a different origin',
    prepare: fx => sh('git remote set-url origin https://example.invalid/other.git', fx.build), message: /STOP: the build checkout and the live checkout use different origin remotes/ },
  { check: 'could not inspect the running API container', name: 'the running API container cannot be inspected',
    options: () => ({ running: 'absent' }), message: /STOP: could not inspect the running API container/ },
  { check: 'unexpected running API image id', name: 'the running API reports an image id that is not a sha256 digest',
    options: () => ({ running: 'sha256:not-a-digest' }), message: /STOP: unexpected running API image id/ },
  { check: 'could not read the running API image label', name: 'the running API image itself cannot be inspected',
    // A well-formed image id that Docker does not know.
    options: () => ({ running: `sha256:${'e'.repeat(64)}` }), message: /STOP: could not read the running API image label/ },
  { check: "the running API image is labelled '$running_rev', not the expected previous commit $PREV", name: 'the running API is not the expected previous release',
    options: () => ({ runningRev: c.side }), message: /STOP: the running API image is labelled '[0-9a-f]{40}', not the expected previous commit/ },
  // The rollback path (runbook section 8) needs onservice-api:<previous> to be
  // the image that runs now. Without it there is nothing to roll back to.
  { check: 'rollback image onservice-api:$PREV is not present', name: 'the rollback image onservice-api:<previous> is missing',
    options: () => ({ images: [`onservice-api:retagged ${OLD_IMAGE_ID} ${c.prev}`] }),
    message: /STOP: rollback image onservice-api:[0-9a-f]{40} is not present/ },
  { check: 'onservice-api:$PREV is not the image the API is running', name: 'the onservice-api:<previous> tag points at a different image than the running API',
    options: () => ({ images: [`onservice-api:retagged ${OLD_IMAGE_ID} ${c.prev}`, `onservice-api:${c.prev} sha256:${'d'.repeat(64)} ${c.prev}`] }),
    message: /STOP: onservice-api:[0-9a-f]{40} is not the image the API is running/ },
  { check: 'could not count live migrations', name: 'the live database cannot be read',
    prepare: fx => rmSync(path.join(fx.state, 'db/onservice.count')), count: null, message: /STOP: could not count live migrations/ },
  { check: 'live database has $live_count applied migrations, not the expected $COUNT', name: 'the live migration count differs from the expected count',
    options: () => ({ liveCount: 4 }), message: /STOP: live database has 4 applied migrations, not the expected 5/ },
  { check: 'could not list databases', name: 'the list of databases cannot be read',
    scenario: 'list_databases_fails', message: /STOP: could not list databases/ },
  { check: 'a rehearsal copy from an earlier run still exists ($leftovers found); read its logs and drop it by hand first', name: 'a rehearsal copy from an earlier run still exists',
    options: () => ({ leftoverCopy: true }), message: /STOP: a rehearsal copy from an earlier run still exists \(1 found\)/ },
];
for (const item of preflightCases) {
  // The name carries the exact refusal text, so preflight-mutation-check.mjs
  // can select this one case with --test-name-pattern.
  test(`preflight refuses (${item.check}) when ${item.name}, and changes nothing`, () => {
    const opts = item.options ? item.options() : {};
    const fx = setup(opts);
    const start = head(fx);
    if (item.prepare) item.prepare(fx);
    const result = deploy(fx, undefined, { scenario: item.scenario ?? 'success' });
    if (item.restore) item.restore(fx);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const log = mainLog(fx);
    assert.match(log, item.message);
    assert.equal(log.match(/STOP: /g)?.length, 1, 'exactly one refusal');
    assert.match(log, /FAILED during stage 'preflight'/);
    assert.doesNotMatch(log, /preflight passed/);
    const count = item.count === undefined ? String(opts.liveCount ?? 5) : item.count;
    assertUntouched(fx, start, count, opts.running ?? OLD_IMAGE_ID);
    if (opts.leftoverCopy) assert.deepEqual(copies(fx), ['onservice_rehearsal_0123456789ab.count'], 'an old copy is never dropped by the script');
  });
}

// A text check, not a behaviour test. The cases above prove each refusal by
// running the script; this only makes sure the list of cases keeps up with the
// script, so "every preflight refusal has a case" stays true.
test('every refusal in the preflight stage has exactly one case above', () => {
  const text = readFileSync(UNDER_TEST, 'utf8');
  const start = text.indexOf('STAGE=preflight');
  const end = text.indexOf('STAGE=fetch');
  assert.ok(start > 0 && end > start, 'the preflight stage must be found in the script');
  const refusals = [...text.slice(start, end).matchAll(/\|\| fail "([^"]*)"/g)].map(match => match[1]);
  assert.ok(refusals.length > 0, 'the preflight stage must have refusals');
  assert.deepEqual([...refusals].sort(), preflightCases.map(item => item.check).sort());
});

test('commit checks run before the build: not on master, wrong target, not a descendant, more live migrations than the commit has', () => {
  const cases = [
    { args: () => [c.side, c.prev, '5', '005_e'], options: {}, message: /is not on origin master/ },
    { args: () => [c.sha, c.prev, '5', '006_f'], options: {}, message: /newest migration in .* is 007_g, not the target 006_f/ },
    { args: () => [c.sha, c.side, '5', '007_g'], options: () => ({ liveAt: c.side, runningRev: c.side }), message: /does not descend from the previous commit/ },
    { args: () => [c.sha, c.prev, '8', '007_g'], options: () => ({ liveCount: 8 }), message: /live has 8 migrations but .* has only 7/ },
  ];
  for (const item of cases) {
    const fx = setup(typeof item.options === 'function' ? item.options() : item.options);
    const start = head(fx);
    const result = deploy(fx, item.args());
    assert.equal(result.status, 1, result.stdout);
    assert.match(mainLog(fx), item.message);
    assert.match(mainLog(fx), /FAILED during stage 'fetch'/);
    assert.equal(head(fx), start);
    assert.equal(calls(fx).some(line => line.startsWith('docker build') || line.includes('pg_dump')), false);
    assertNothingDangerous(fx);
  }
});

test('a failed build, a wrong image label or an unclean build checkout (untracked or ignored files) stops the release before the backup', () => {
  const unclean = /build checkout has changed, untracked or ignored files/;
  for (const [scenario, prepare, message] of [
    ['build_fails', null, /image build failed/],
    ['wrong_label', null, /new image label is '0{40}', not/],
    ['success', fx => writeFileSync(path.join(fx.build, 'packages/api/stray.ts'), 'export {};\n'), unclean],
    // Ignored by .gitignore, so plain `git status --porcelain` does not show
    // it, but the image build would copy it.
    ['success', fx => writeFileSync(path.join(fx.build, 'packages/api/.env'), 'STRAY=1\n'), unclean],
  ]) {
    const fx = setup();
    if (prepare) prepare(fx);
    const result = deploy(fx, undefined, { scenario });
    assert.equal(result.status, 1, `${scenario}: ${result.stdout}`);
    assert.match(mainLog(fx), message);
    assert.match(mainLog(fx), /FAILED during stage 'build'/);
    assert.equal(head(fx), c.prev);
    assert.equal(calls(fx).some(line => line.includes('pg_dump')), false, 'no backup after a failed build');
    if (message === unclean) assert.equal(calls(fx).some(line => line.startsWith('docker build')), false, 'no image is built from an unclean checkout');
    assert.equal(runningImage(fx), OLD_IMAGE_ID);
    assertNothingDangerous(fx);
  }
});

test('an empty backup stops the release before the live checkout moves', () => {
  const fx = setup();
  const result = deploy(fx, undefined, { scenario: 'dump_empty' });
  assert.equal(result.status, 1);
  assert.match(mainLog(fx), /the backup is empty/);
  assert.equal(head(fx), c.prev);
  assert.equal(calls(fx).some(line => line.includes('CREATE DATABASE')), false);
  assertNothingDangerous(fx);
});

test('a failed rehearsal moves the live checkout back, keeps the copy for diagnosis and leaves the live database alone', () => {
  for (const [scenario, env, message] of [
    ['rehearsal_apply_fails', {}, /rehearsal apply failed/],
    ['rehearsal_short', {}, /after rehearsal apply the copy has 6 migrations, expected 7/],
    ['rehearsal_repeat_pending', {}, /the repeat run did not report 0 pending migrations/],
    ['success', { FAKE_DIRECT_URL: `${DIRECT_URL}?sslmode=require` }, /rehearsal dry-run failed/],
  ]) {
    const fx = setup();
    const result = deploy(fx, undefined, { scenario, env });
    assert.equal(result.status, 1, `${scenario}: ${result.stdout}`);
    const log = mainLog(fx);
    assert.match(log, message);
    assert.match(log, /FAILED during stage 'rehearsal'/);
    assert.match(log, /live checkout moved back to/);
    assert.match(log, /kept for diagnosis/);
    assert.equal(head(fx), c.prev, 'the live checkout is moved back');
    assert.equal(liveCount(fx), '5');
    assert.equal(runningImage(fx), OLD_IMAGE_ID);
    assert.deepEqual(copies(fx), [`onservice_rehearsal_${c.sha.slice(0, 12)}.count`]);
    assert.equal(nodeCalls(fx).some(line => line.startsWith('node db=onservice ')), false, 'the live database is never migrated');
    assertNothingDangerous(fx);
    assertNoDirectUrlOutput(result);

    // The kept copy blocks the next attempt: an existing copy is never reused.
    const before = new Set(mainLogs(fx));
    const again = deploy(fx, undefined, { scenario: 'success', env: {} });
    assert.equal(again.status, 1);
    const fresh = mainLogs(fx).filter(name => !before.has(name));
    assert.equal(fresh.length, 1);
    assert.match(readFileSync(path.join(fx.release, fresh[0]), 'utf8'), /rehearsal copy from an earlier run still exists/);
    assert.equal(head(fx), c.prev);
    assert.deepEqual(copies(fx), [`onservice_rehearsal_${c.sha.slice(0, 12)}.count`], 'the kept copy is not dropped by the refused run');
  }
});

test('a failed live migration keeps the checkout at the release commit, leaves the old API running and points to the runbook', () => {
  const fx = setup();
  const result = deploy(fx, undefined, { scenario: 'live_migration_fails' });
  assert.equal(result.status, 1);
  const log = mainLog(fx);
  assert.match(log, /live migration failed/);
  assert.match(log, /FAILED during stage 'migrate'/);
  assert.match(log, /Never restore the database without Ken/);
  assert.doesNotMatch(log, /moved back/);
  assert.equal(head(fx), c.sha);
  assert.equal(runningImage(fx), OLD_IMAGE_ID);
  assert.deepEqual(copies(fx), []);
  assert.equal(record(fx), null, 'no release record for a failed release');
  assertNothingDangerous(fx);
  assertNoDirectUrlOutput(result);
});

test('a failed activation is reported as a failure, never as a deployment', () => {
  const fx = setup();
  const result = deploy(fx, undefined, { scenario: 'activation_fails' });
  assert.equal(result.status, 1);
  assert.match(mainLog(fx), /activation failed/);
  assert.match(mainLog(fx), /FAILED during stage 'activate'/);
  assert.doesNotMatch(result.stdout, /deploy done/);
  assert.equal(liveCount(fx), '7');
  assert.equal(runningImage(fx), OLD_IMAGE_ID);
  assert.equal(record(fx), null);
  assertNothingDangerous(fx);
});

// nginx reads nginx.conf through a single-file bind mount: after git replaces
// the file, the running container keeps the old copy until nginx restarts.
test('a release that changes nginx or Compose files is deployed with recorded warnings, and nginx is only read, never reloaded', () => {
  const fx = setup();
  const result = deploy(fx, [c.shaNginx, c.prev, '5', '007_g']);
  assert.equal(result.status, 0, result.stdout);
  const log = mainLog(fx);
  assert.match(log, /WARNING: this release changes shared configuration files: nginx\/nginx.conf/);
  assert.match(log, /nginx changes stay inactive only until the shared nginx next restarts, which can happen at any time without warning/);
  assert.match(log, /every site it serves is affected when it does/);
  assert.match(log, /WARNING: the shared nginx runs an older nginx.conf than the live checkout/);
  assert.equal(record(fx).shared_config_changed.trim(), 'nginx/nginx.conf');
  assert.equal(record(fx).nginx_config_drift, 'yes', 'the running nginx still reads the previous nginx.conf');
  assert.deepEqual(calls(fx).filter(line => /nginx/.test(line) && line.startsWith('docker ')), ['docker exec onservice-nginx-1 cat /etc/nginx/nginx.conf'],
    'nginx is only read, never reloaded, restarted or recreated');
  assertNothingDangerous(fx);
});

test('nginx drift is recorded even when the release does not change nginx files, and an unreadable nginx copy is recorded as unknown', () => {
  for (const [loaded, expected, warning] of [
    ['# an older nginx.conf, loaded when the container started\n', 'yes', /WARNING: the shared nginx runs an older nginx.conf than the live checkout\. The newer copy loads the next time that nginx restarts/],
    [null, 'unknown', /WARNING: could not compare nginx.conf with the copy the shared nginx container reads/],
  ]) {
    const fx = setup({ nginxLoaded: loaded });
    const result = deploy(fx);
    assert.equal(result.status, 0, `${expected}: ${result.stdout}${result.stderr}`);
    const rec = record(fx);
    assert.equal(rec.shared_config_changed, 'none', 'this release does not change nginx files');
    assert.equal(rec.nginx_config_drift, expected);
    assert.match(mainLog(fx), new RegExp(`nginx_config_drift=${expected} `));
    assert.match(mainLog(fx), warning);
    assert.deepEqual(calls(fx).filter(line => /nginx/.test(line) && line.startsWith('docker ')), ['docker exec onservice-nginx-1 cat /etc/nginx/nginx.conf']);
    assertNothingDangerous(fx);
  }
});

// git checkout silently replaces a git-ignored file at a path the new commit
// tracks, and moving back to the previous commit then deletes it. On the
// server such files are .env, TLS material, web builds and backups.
test('a release that adds a path the live checkout already holds stops before the build, and the server-only file is unchanged', () => {
  for (const [where, prepare, file, shown] of [
    ['the same path', fx => {
      mkdirSync(path.join(fx.live, 'certbot/conf'), { recursive: true });
      writeFileSync(path.join(fx.live, 'certbot/conf/server-only.txt'), LIVE_ONLY);
    }, 'certbot/conf/server-only.txt', /replace them: certbot\/conf\/server-only\.txt \(check them by hand/],
    ['a file where the release adds a folder', fx => writeFileSync(path.join(fx.live, 'server-cache'), LIVE_ONLY),
      'server-cache', /replace them: server-cache \(check them by hand/],
  ]) {
    const fx = setup();
    prepare(fx);
    const result = deploy(fx, [c.shaClobber, c.prev, '5', '007_g']);
    assert.equal(result.status, 1, `${where}: ${result.stdout}${result.stderr}`);
    const log = mainLog(fx);
    assert.match(log, /STOP: the live checkout already holds paths this release adds, and git would replace them: /, where);
    assert.match(log, shown, where);
    assert.equal(log.match(/STOP: /g)?.length, 1, 'exactly one refusal');
    assert.match(log, /FAILED during stage 'fetch'/);
    assert.deepEqual(readFileSync(path.join(fx.live, file)), Buffer.from(LIVE_ONLY), `${where}: the server-only file must be byte-for-byte unchanged`);
    assertUntouched(fx);
  }
});

test('if a server-only file appears at such a path after that check, the live checkout move refuses and replaces nothing', () => {
  const fx = setup();
  const result = deploy(fx, [c.shaClobber, c.prev, '5', '007_g'], { scenario: 'clobber_during_backup' });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const log = mainLog(fx);
  assert.match(log, /no path this release adds exists in the live checkout yet/);
  assert.match(log, /STOP: could not check out [0-9a-f]{40} in the live checkout/);
  assert.match(log, /FAILED during stage 'checkout'/);
  assert.match(log, /live checkout moved back to/);
  assert.deepEqual(readFileSync(path.join(fx.live, 'certbot/conf/server-only.txt')), Buffer.from(LIVE_ONLY), 'the server-only file must be byte-for-byte unchanged');
  assert.equal(head(fx), c.prev);
  assert.equal(liveCount(fx), '5');
  assert.equal(runningImage(fx), OLD_IMAGE_ID);
  assert.equal(calls(fx).some(line => line.includes('CREATE DATABASE')), false, 'no rehearsal after a refused move');
  assert.ok(calls(fx).some(liveMoveTo(fx, c.shaClobber)), 'the live move was attempted');
  assertNothingDangerous(fx);
});
