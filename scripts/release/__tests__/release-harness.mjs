// Shared fixtures for the tester-release script tests. Not a test file itself.
//
// The release scripts run for real, with real bash, git, tar, cmp and
// sha256sum, against throwaway git repositories and folders. Only `sudo` and
// `docker` are replaced, by small fake programs placed first on PATH. The fake
// docker keeps its state (images, the running API image, database migration
// counts) in files and logs every call, so a test can check exactly what the
// script asked Docker and Postgres to do. No real daemon, database or server
// is touched.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
export const CONTAINER_ID = 'c'.repeat(64);
export const NEW_IMAGE_HEX = 'b'.repeat(64);
export const OLD_IMAGE_ID = `sha256:${'a'.repeat(64)}`;

// Git Bash wants /c/Users/... rather than C:\Users\... (tar reads "C:" as a host).
export function posix(p) {
  if (process.platform !== 'win32') return p;
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(p);
  return m ? `/${m[1].toLowerCase()}/${m[2].replaceAll('\\', '/')}` : p.replaceAll('\\', '/');
}

export function sh(command, cwd) {
  const result = spawnSync(bash, ['-c', command], { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`fixture command failed (${result.status}): ${command}\n${result.stderr}`);
  return result.stdout.trim();
}

const git = 'git -c core.autocrlf=false -c user.name=ReleaseTest -c user.email=release@example.invalid -c commit.gpgsign=false';
export { git };

// The fake programs live in ./fixtures as plain shell files (test doubles).
const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
function installExecutable(source, target) {
  writeFileSync(target, readFileSync(path.join(fixtures, source), 'utf8').replace(/\r\n/g, '\n'));
  chmodSync(target, 0o755);
}

export function writeFakes(dir) {
  const bin = path.join(dir, 'bin');
  const cbin = path.join(dir, 'cbin');
  mkdirSync(bin, { recursive: true });
  mkdirSync(cbin, { recursive: true });
  installExecutable('fake-sudo.sh', path.join(bin, 'sudo'));
  installExecutable('fake-docker.sh', path.join(bin, 'docker'));
  installExecutable('fake-node.sh', path.join(cbin, 'node'));
  return { bin, cbin };
}

// A hung script is stopped after 2 minutes. On a heavily loaded Windows PC a
// single run can take longer than that, so RELEASE_TEST_TIMEOUT_MS may raise it
// for a local run. A stopped run throws an error that starts with
// TIMEOUT_MARKER, so its test fails (it never passes) and the failure says
// plainly that it was a timeout, not a result.
const RUN_TIMEOUT_MS = Number(process.env.RELEASE_TEST_TIMEOUT_MS) > 0 ? Number(process.env.RELEASE_TEST_TIMEOUT_MS) : 120_000;
export const TIMEOUT_MARKER = 'RELEASE_SCRIPT_TIMEOUT';

// Runs a repository script with the fakes first on PATH. Git Bash's launcher
// puts its own folders first, so PATH is set inside bash, not by Node.
// `script` is relative to the repository unless `absolute` is set.
export function runScript(script, args, { cwd, bin, env, absolute = false }) {
  const wrapper = 'export PATH="$FAKE_BIN:$PATH"; exec bash "$@"';
  const file = absolute ? script : path.join(repo, script);
  const result = spawnSync(bash, ['-c', wrapper, 'wrapper', posix(file), ...args], {
    cwd,
    encoding: 'utf8',
    timeout: RUN_TIMEOUT_MS,
    env: { ...process.env, ...env, FAKE_BIN: posix(bin) },
  });
  if (result.error && result.error.code !== 'ETIMEDOUT') throw new Error(`could not run ${bash}: ${result.error.code}`);
  if (result.status === null) {
    const why = result.error ? `was stopped after ${RUN_TIMEOUT_MS} ms` : `was ended by signal ${result.signal}`;
    throw new Error(`${TIMEOUT_MARKER}: ${path.basename(file)} ${why}; this is not a test result. Raise RELEASE_TEST_TIMEOUT_MS and run again.`);
  }
  return result;
}

export function makeRoot(prefix) {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

export function readLines(file) {
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
}

// Builds a gzipped ustar archive by hand, so tests can create entries that the
// local tar or filesystem refuses to make (symbolic links on Windows, '..').
export function buildTarGz(entries) {
  const blocks = [];
  for (const entry of entries) {
    const content = Buffer.from(entry.content ?? '');
    const header = Buffer.alloc(512, 0);
    const put = (text, offset, length) => header.write(text.slice(0, length), offset, length, 'latin1');
    put(entry.name, 0, 100);
    put(entry.type === 'dir' ? '0000755\0' : '0000644\0', 100, 8);
    put('0000000\0', 108, 8);
    put('0000000\0', 116, 8);
    put(`${(entry.type === 'file' ? content.length : 0).toString(8).padStart(11, '0')}\0`, 124, 12);
    put('00000000000\0', 136, 12);
    header.fill(0x20, 148, 156);
    put({ file: '0', dir: '5', symlink: '2' }[entry.type], 156, 1);
    put(entry.linkname ?? '', 157, 100);
    put('ustar\0', 257, 6);
    put('00', 263, 2);
    let sum = 0;
    for (const byte of header) sum += byte;
    put(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8);
    blocks.push(header);
    if (entry.type === 'file' && content.length) {
      blocks.push(content, Buffer.alloc((512 - (content.length % 512)) % 512, 0));
    }
  }
  blocks.push(Buffer.alloc(1024, 0));
  return gzipSync(Buffer.concat(blocks));
}

export function copyFromRepo(fixture, relative) {
  mkdirSync(path.dirname(path.join(fixture, relative)), { recursive: true });
  copyFileSync(path.join(repo, relative), path.join(fixture, relative));
}
