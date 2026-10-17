// Proves that the early refusals of the two tester-release scripts are really
// tested:
//   scripts/release/deploy-tester-release.sh: every `|| fail "..."` in the
//     preflight stage (cases in deploy-tester-release.test.mjs);
//   scripts/release/publish-web-builds.sh: every `|| fail "..."` and
//     `|| usage_error "..."` from the start of main() up to the checksum stage,
//     except the ones listed in `skip` that no run can reach (cases in
//     publish-web-builds.test.mjs).
//
// 1. For each script it runs every one of those cases against the real script.
//    All must pass, or a "caught" result below would mean nothing.
// 2. For each of those refusals it writes a copy of that script with only that
//    refusal switched off (`|| fail "..."` becomes `|| true`) into a new
//    temporary folder outside the repository. It runs that refusal's own case
//    against the copy (RELEASE_DEPLOY_SCRIPT or RELEASE_PUBLISH_SCRIPT) and
//    expects the case to FAIL. A case that still passes with its check
//    switched off proves nothing, so the check then exits 1.
//
// The real scripts are never written to. They are hashed before and after the
// run (also after an error or Ctrl-C), and the check exits 3 if a byte changed.
// This is not a *.test.mjs file, so `node --test` does not pick it up. The CI
// job release-scripts-check (.github/workflows/ci.yml) is set up to run it as
// its own step; that job had not run on GitHub yet on 2026-10-17.
// Run it by hand like this (MUTATION_JOBS runs that many cases at once,
// default 4):
//
//   node scripts/release/__tests__/preflight-mutation-check.mjs
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TIMEOUT_MARKER, repo } from './release-harness.mjs';

// `refusal` finds the refusals between `from` and `to`; `skip` names the ones
// no run can reach (the publish test file keeps the same list as UNREACHABLE);
// `prefix` starts the name of each refusal's own case.
const TARGETS = [
  { script: path.join(repo, 'scripts/release/deploy-tester-release.sh'),
    tests: path.join(repo, 'scripts/release/__tests__/deploy-tester-release.test.mjs'),
    env: 'RELEASE_DEPLOY_SCRIPT', from: 'STAGE=preflight', to: 'STAGE=fetch',
    refusal: /\|\| fail "([^"]*)"/g, skip: [], prefix: 'preflight refuses' },
  { script: path.join(repo, 'scripts/release/publish-web-builds.sh'),
    tests: path.join(repo, 'scripts/release/__tests__/publish-web-builds.test.mjs'),
    env: 'RELEASE_PUBLISH_SCRIPT', from: 'main() {', to: 'STAGE=checksums',
    refusal: /\|\| (?:fail|usage_error) "([^"]*)"/g, skip: ['log $PREFIX.log already exists'], prefix: 'publish refuses' },
];
const JOBS = Math.max(1, Number(process.env.MUTATION_JOBS) || 4);
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hashOf = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const short = file => path.relative(repo, file).replaceAll('\\', '/');

const before = new Map(TARGETS.map(target => [target.script, hashOf(target.script)]));
const folders = [];
let finished = false;

// Removes this run's mutant copies (single files and their empty folders,
// never a recursive delete) and checks that the real scripts are unchanged.
function cleanUpAndVerify() {
  if (finished) return true;
  finished = true;
  for (const { folder, files } of folders) {
    try {
      for (const file of files) if (existsSync(file)) unlinkSync(file);
      rmdirSync(folder);
    } catch (error) { console.error(`could not remove ${folder}: ${error.code}`); }
  }
  let same = true;
  for (const [file, hash] of before) {
    const now = hashOf(file);
    if (now !== hash) { same = false; console.error(`CHANGED: ${short(file)} sha256 ${hash} became ${now}`); }
  }
  if (same) console.log(`real scripts unchanged (sha256 checked byte for byte): ${[...before.keys()].map(short).join(', ')}`);
  return same;
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { const same = cleanUpAndVerify(); process.exit(same ? 130 : 3); });
}

// The checked refusals of one script, each with its place in the text.
function refusalsOf(target) {
  target.text = readFileSync(target.script, 'utf8');
  const start = target.text.indexOf(target.from);
  const end = target.text.indexOf(target.to);
  if (!(start > 0 && end > start)) throw new Error(`could not find ${target.from} ... ${target.to} in ${short(target.script)}`);
  const all = [...target.text.slice(start, end).matchAll(target.refusal)]
    .map(match => ({ target, at: start + match.index, length: match[0].length, check: match[1] }));
  for (const check of target.skip) {
    if (!all.some(item => item.check === check)) throw new Error(`${short(target.script)} no longer has the skipped refusal "${check}"; update skip`);
  }
  const found = all.filter(item => !target.skip.includes(item.check));
  if (found.length === 0) throw new Error(`${short(target.script)} has no refusals between ${target.from} and ${target.to}`);
  return found;
}

// A script run stopped by the harness timeout also fails a case, which would
// look like a caught mutant. Give each run a long timeout, and report a case
// that failed that way as inconclusive.
const childEnv = { ...process.env, RELEASE_TEST_TIMEOUT_MS: process.env.RELEASE_TEST_TIMEOUT_MS || '900000' };

function runTests(target, pattern, mutant) {
  return new Promise(resolve => {
    const env = { ...childEnv };
    for (const other of TARGETS) delete env[other.env];
    if (mutant) env[target.env] = mutant;
    const child = spawn(process.execPath, ['--test', '--test-reporter=tap', `--test-name-pattern=${pattern}`, target.tests],
      { cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', () => {});
    child.on('close', status => resolve({
      status, output,
      passed: Number(/^# pass (\d+)$/m.exec(output)?.[1] ?? 0),
      failed: Number(/^# fail (\d+)$/m.exec(output)?.[1] ?? 0),
    }));
  });
}

function verdictOf(run) {
  if (run.output.includes(TIMEOUT_MARKER)) return 'INCONCLUSIVE (a script run was stopped by the timeout)';
  if (run.status !== 0 && run.failed === 1 && run.passed === 0) return 'caught';
  return `MISSED (exit ${run.status}, ${run.passed} passed, ${run.failed} failed)`;
}

let exitCode = 0;
try {
  const refusals = TARGETS.flatMap(refusalsOf);
  let ready = true;
  for (const target of TARGETS) {
    const expected = refusals.filter(item => item.target === target).length;
    const real = await runTests(target, `^${escapeRegExp(target.prefix)} \\(`);
    if (real.status !== 0 || real.passed !== expected || real.failed !== 0) {
      const why = real.output.includes(TIMEOUT_MARKER) ? ' (a script run was stopped by the timeout)' : '';
      console.error(`${short(target.script)}: against the real script, ${real.passed} refusal cases passed and ${real.failed} failed; expected ${expected} and 0${why}. Fix that first.`);
      ready = false;
    } else {
      console.log(`${short(target.script)}: against the real script, all ${real.passed} refusal cases passed`);
    }
  }
  if (!ready) {
    exitCode = 1;
  } else {
    const notCaught = [];
    let next = 0;
    const worker = async () => {
      const folder = mkdtempSync(path.join(tmpdir(), 'onservice-preflight-mutants-'));
      const files = new Set();
      folders.push({ folder, files });
      while (next < refusals.length) {
        const item = refusals[next];
        next += 1;
        const { target } = item;
        const mutant = path.join(folder, path.basename(target.script));
        const relative = path.relative(repo, mutant);
        if (!relative.startsWith('..') && !path.isAbsolute(relative)) throw new Error(`the mutant copy ${mutant} would be inside the repository`);
        files.add(mutant);
        writeFileSync(mutant, target.text.slice(0, item.at) + '|| true' + target.text.slice(item.at + item.length));
        const pattern = `^${escapeRegExp(target.prefix)} \\(${escapeRegExp(item.check)}\\) when `;
        const verdict = verdictOf(await runTests(target, pattern, mutant));
        console.log(`${verdict}: ${path.basename(target.script)}: ${item.check}`);
        if (verdict !== 'caught') notCaught.push(item);
      }
    };
    await Promise.all(Array.from({ length: Math.min(JOBS, refusals.length) }, worker));
    for (const target of TARGETS) {
      const mine = refusals.filter(item => item.target === target);
      const missed = mine.filter(item => notCaught.includes(item)).length;
      console.log(`${short(target.script)}: ${mine.length - missed} of ${mine.length} switched-off refusals made their own case fail.`);
    }
    if (notCaught.length) exitCode = 1;
  }
} catch (error) {
  console.error(`mutation check stopped: ${error.message}`);
  exitCode = 2;
} finally {
  if (!cleanUpAndVerify()) exitCode = 3;
}
process.exit(exitCode);
