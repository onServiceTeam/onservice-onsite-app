// Safety lint for the two tester-release scripts. This is a text check, so it
// only backs up the behaviour tests in deploy-tester-release.test.mjs and
// publish-web-builds.test.mjs; it does not replace them.
//
// Why: on 2026-06-10 an rm on an empty variable destroyed a staging host
// (.ai-coder/escalations/E08-accidental-rm-on-live-server-2026-06-10.md), and
// this repository is public. So these scripts may contain no rm command at all,
// no server address or URL, no credential words, must guard their required
// folder variables with ${VAR:?}, and every path a root (sudo) command writes
// to must be built from ${name:?} expansions only. Every move of the live
// checkout must refuse to replace git-ignored files (--no-overwrite-ignore):
// git would otherwise overwrite a server-only file such as .env or TLS
// material without any rm. The first test proves the lint really rejects each
// bad pattern, so a passing result means something.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { repo } from './release-harness.mjs';

const SCRIPTS = ['scripts/release/deploy-tester-release.sh', 'scripts/release/publish-web-builds.sh'];

// Names of shell variables expanded without the ${name:?} guard.
function unguardedExpansions(text) {
  const names = [];
  for (const match of text.matchAll(/\$(\{)?([A-Za-z_][A-Za-z0-9_]*)/g)) {
    const guarded = match[1] === '{' && text.startsWith(':?', match.index + match[0].length);
    if (!guarded) names.push(match[2]);
  }
  return names;
}

function findUnsafe(text) {
  const problems = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    if (/^\s*#/.test(raw) || !raw.trim()) return;
    const line = raw;
    const where = `line ${index + 1}: ${raw.trim()}`;
    const rules = [
      [/(?<![-\w.])rm\s/, 'rm command'],
      [/\bfind\b.*\s-delete\b/, 'find -delete'],
      [/\brsync\b/, 'rsync'],
      [/\bcompose\b.*\s(down|restart|stop|kill)\b/, 'compose down/restart/stop'],
      [/--force-recreate|\bprune\b|reset --hard|\bgit\b.*\sclean\b|\bpush\b|\bnginx -s\b/, 'destructive or publishing git/docker/nginx command'],
      [/\b\d{1,3}(\.\d{1,3}){3}\b/, 'IP address'],
      [/https?:\/\//, 'URL'],
      [/password|passwd|secret|token|private key|\.ssh\b|htpasswd|\.env\b/i, 'credential word'],
    ];
    for (const [pattern, label] of rules) if (pattern.test(line)) problems.push(`${label}, ${where}`);
    if (/\brmdir\s/.test(line) && !/rmdir "\$RELEASE_DIR\/\.(deploy|web-publish)-lock"/.test(line)) problems.push(`rmdir on an unexpected path, ${where}`);
    if (/DROP DATABASE/.test(line) && !/"DROP DATABASE \$REHEARSAL_DB"/.test(line)) problems.push(`unexpected DROP DATABASE, ${where}`);
    // git's checkout subcommand right after the live checkout folder.
    if (/PROJECT_DIR\}?"?\s+checkout\b/.test(line) && !/--no-overwrite-ignore/.test(line)) {
      problems.push(`a move of the live checkout without --no-overwrite-ignore, ${where}`);
    }
    // A root write: from `sudo -n cp|mv|mkdir|chmod` up to its `||`. Every
    // variable in it must be ${name:?}, so an empty one stops the run instead
    // of writing near "/". The same holds for the dest= lines that build the
    // targets of those writes.
    const at = line.search(/\bsudo\s+(-n\s+)?(cp|mv|mkdir|chmod|install|tee|ln)\b/);
    if (at >= 0) {
      const tail = line.slice(at);
      const command = tail.includes(' || ') ? tail.slice(0, tail.indexOf(' || ')) : tail;
      const loose = unguardedExpansions(command);
      if (loose.length) problems.push(`unguarded ${loose.join(', ')} in a root write, ${where}`);
    }
    const target = /^\s*(?:local\s+)?dest=(.*)$/.exec(line);
    if (target && unguardedExpansions(target[1]).length) problems.push(`unguarded ${unguardedExpansions(target[1]).join(', ')} in a write target, ${where}`);
  });
  const uses = [...text.matchAll(/\$\{?ONSERVICE_(?:RELEASE|BUILD)_DIR/g)].length;
  const guarded = [...text.matchAll(/\$\{ONSERVICE_(?:RELEASE|BUILD)_DIR:\?/g)].length;
  if (uses !== guarded) problems.push(`${uses - guarded} unguarded expansion(s) of ONSERVICE_RELEASE_DIR or ONSERVICE_BUILD_DIR`);
  if (!/^set -euo pipefail$/m.test(text)) problems.push('missing set -euo pipefail');
  if (text.trimEnd().split(/\r?\n/).at(-1) !== 'main "$@"; exit "$?"') {
    problems.push('the last line must be main "$@"; exit "$?" so bash has read the whole file before it runs');
  }
  return problems;
}

const safeSkeleton = lines => ['#!/usr/bin/env bash', 'set -euo pipefail', ...lines, 'main "$@"; exit "$?"'].join('\n');

test('the safety lint rejects each unsafe pattern it claims to catch, and accepts the safe forms', () => {
  const unsafe = [
    'rm -rf "$APPDIR"/*',
    '  sudo -n rm -f "$dest"',
    'find "$live" -mindepth 1 -delete',
    'rsync -a --delete stage/ "$live"/',
    'docker compose -f docker-compose.prod.yml down',
    'docker compose up -d --force-recreate nginx',
    'docker image prune -f',
    'git push origin HEAD:master',
    'ssh deploy@203.0.113.7 true',
    'curl -fsS https://example.invalid/health',
    'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli ping',
    'cat /home/someone/.ssh/id_ed25519',
    'rmdir "$SOMEWHERE"',
    'psql_db onservice "DROP DATABASE onservice"',
    'cd "$ONSERVICE_BUILD_DIR"',
    // Root writes whose path could expand from an empty variable (E08).
    '      sudo -n mv "$dest.tmp-publish" "$dest" || fail "x"',
    '      sudo -n mv -f "${live:?}/.${top:?}.tmp-publish" "$live/$top" || fail "x"',
    '      sudo -n cp "$f" "${dest:?}.tmp-publish" || fail "x"',
    '      [ -d "$dest" ] || sudo -n mkdir -m 755 "${dest}" || fail "x"',
    '      sudo -n chmod 644 "${live}/index.html"',
    '      dest="$live/$rel"',
    '      local dest="${live:?}/$rel"',
    // A live checkout move that may silently replace an ignored file.
    '  g "$PROJECT_DIR" checkout --quiet --detach "$SHA" || fail "x"',
    '  if g "$PROJECT_DIR" checkout --quiet --detach "$PREV"; then',
  ];
  for (const line of unsafe) {
    assert.notDeepEqual(findUnsafe(safeSkeleton([line])), [], `the lint must reject: ${line}`);
  }
  assert.notDeepEqual(findUnsafe('#!/usr/bin/env bash\nmain "$@"; exit "$?"\n'), [], 'missing set -euo pipefail must be rejected');
  assert.notDeepEqual(findUnsafe('#!/usr/bin/env bash\nset -euo pipefail\nmain "$@"\nexit $?\n'), [], 'a split last line must be rejected');

  const safe = [
    '  release_compose run --rm --no-deps -T api sh -s -- "$1"',
    '  rmdir "$RELEASE_DIR/.deploy-lock" || log "x"',
    '  psql_db "$LIVE_DB" "DROP DATABASE $REHEARSAL_DB" > /dev/null || fail "x"',
    '  local raw="${ONSERVICE_RELEASE_DIR:?set it}"',
    '# rm -rf / is only mentioned in a comment',
    // The fail message after `||` may name plain variables; only the write is checked.
    '      sudo -n mv -f "${live:?}/.${top:?}.tmp-publish" "${live:?}/${top:?}" || fail "could not switch $name/$top"',
    '      [ -d "$dest" ] || sudo -n mkdir -m 755 "${dest:?}" || fail "could not create folder $rel"',
    '      dest="${live:?}/${rel:?}"',
    '  head="$(sudo -n git -c safe.directory="$PROJECT_DIR" -C "$PROJECT_DIR" rev-parse HEAD)" || fail "x"',
    '  g "$PROJECT_DIR" checkout --quiet --no-overwrite-ignore --detach "$SHA" || fail "x"',
    '  if g "$PROJECT_DIR" checkout --quiet --no-overwrite-ignore --detach "$PREV"; then',
    '  g "$BUILD_DIR" checkout --quiet --detach "$SHA" || fail "x"',
  ];
  assert.deepEqual(findUnsafe(safeSkeleton(safe)), []);
});

for (const script of SCRIPTS) {
  test(`${script} passes the safety lint: no rm, no addresses or URLs, no credential words, guarded folders and root writes`, () => {
    assert.deepEqual(findUnsafe(readFileSync(path.join(repo, script), 'utf8')), []);
  });
}

// A password on a command line is not private: command lines can end up in
// logs, and other users can see them while a command runs. So no doc,
// workflow, script or agent note may hand a Redis password to a command as an
// argument, or print it.
//
// The safe form (runbook step 4) pipes the password from the API container's
// own environment into the Redis container, where a shell builtin reads it
// into REDISCLI_AUTH for redis-cli. The command lines hold only variable
// names, with or without sudo, and the value is never printed.
function findRedisPasswordArguments(text) {
  const problems = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const where = `line ${index + 1}: ${line.trim()}`;
    const rules = [
      // The option may follow a space, a quote or a backtick (`-a $PW` in prose).
      [/\bredis-cli\b.*[\s"'`](-a|--pass|--user)(\s|=|$)/, 'redis-cli password option'],
      [/\bredis-cli\b.*\s(-u|--uri)[\s=]+["']?\w+:\/\/[^\s@]*:[^\s@]*@/, 'redis-cli URL with a password'],
      [/\bredis-cli\b.*\sAUTH\s+\S/i, 'redis-cli AUTH with an argument'],
      [/(\s-e\s*|--env[=\s]+)["']?REDISCLI_AUTH=/, 'REDISCLI_AUTH value on a docker command line'],
      [/\bsudo\b.*\bREDISCLI_AUTH=/, 'REDISCLI_AUTH value on a sudo command line'],
      [/\becho\b.*\$\{?(REDISCLI_AUTH|REDIS_PASSWORD|RPW)\b/, 'Redis password echoed'],
    ];
    for (const [pattern, label] of rules) if (pattern.test(line)) problems.push(`${label}, ${where}`);
    // printenv of the password must feed a pipe on the same line, or on the
    // next line after a trailing backslash; anything else prints it.
    const printed = /\bprintenv\s+REDIS_PASSWORD\b(.*)$/.exec(line);
    if (printed) {
      const rest = printed[1].trim();
      const piped = rest.startsWith('|') || (rest === '\\' && (lines[index + 1] ?? '').trim().startsWith('|'));
      if (!piped) problems.push(`Redis password printed (printenv not piped), ${where}`);
    }
  });
  return problems;
}

test('the Redis password check rejects every way of putting the password on a command line or the screen, and accepts the safe form', () => {
  const unsafe = [
    // redis-cli -a under sudo, in a scan and in a delete loop.
    `sudo -n docker exec "$RC" redis-cli -a "$RPW" --no-auth-warning --scan --pattern 'onservice:http:*/api/v1/catalog*' \\`,
    '  | while read -r key; do sudo -n docker exec "$RC" redis-cli -a "$RPW" --no-auth-warning DEL "$key"; done',
    // The same advice written as prose in a note.
    '  `redis-cli` MUST get `-a $REDIS_PASSWORD` or `--scan` silently returns nothing',
    'docker exec "$RC" redis-cli -a "$REDIS_PASSWORD" ping',
    'redis-cli -a secretvalue ping',
    'redis-cli --pass "$PW" ping',
    'redis-cli --user default --pass="$PW" ping',
    'redis-cli -u "redis://default:$PW@redis:6379" ping',
    'docker exec "$RC" redis-cli AUTH "$RPW"',
    'docker exec -e REDISCLI_AUTH="$RPW" "$RC" redis-cli ping',
    'docker exec -eREDISCLI_AUTH="$RPW" "$RC" redis-cli ping',
    'docker exec --env REDISCLI_AUTH="$RPW" "$RC" redis-cli ping',
    'docker exec --env=REDISCLI_AUTH="$RPW" "$RC" redis-cli ping',
    'sudo -n env REDISCLI_AUTH="$RPW" docker exec -e REDISCLI_AUTH "$RC" redis-cli ping',
    'sudo -n REDISCLI_AUTH="$RPW" redis-cli ping',
    'docker exec "$API" printenv REDIS_PASSWORD',
    'docker exec "$API" printenv REDIS_PASSWORD > /tmp/pw',
    'docker exec "$API" printenv REDIS_PASSWORD \\\n  > /tmp/pw',
    'echo "$REDISCLI_AUTH"',
  ];
  for (const line of unsafe) assert.notDeepEqual(findRedisPasswordArguments(line), [], `the check must reject: ${line}`);
  const safe = [
    'API=$(sudo -n docker compose -f docker-compose.prod.yml ps -q api)',
    'RC=$(sudo -n docker compose -f docker-compose.prod.yml ps -q redis)',
    `docker exec "$API" printenv REDIS_PASSWORD | docker exec -i "$RC" sh -c '`,
    '  IFS= read -r REDISCLI_AUTH && [ -n "$REDISCLI_AUTH" ] || { echo "no password received; stop"; exit 9; }',
    '  export REDISCLI_AUTH',
    '  [ "$(redis-cli PING)" = PONG ] || { echo "Redis did not answer PONG; stop"; exit 9; }',
    `  redis-cli --scan --pattern "onservice:http:*/api/v1/catalog*" | while IFS= read -r key; do redis-cli DEL "$key" < /dev/null > /dev/null; done'`,
    'sudo -n docker exec "$API" printenv REDIS_PASSWORD \\',
    '  | sudo -n docker exec -i "$RC" sh -c \'IFS= read -r REDISCLI_AUTH; export REDISCLI_AUTH; redis-cli PING\'',
    // Prose that names the forbidden form is allowed.
    '- Never use `redis-cli -a`; do not fall back to `redis-cli -a`.',
  ];
  assert.deepEqual(findRedisPasswordArguments(safe.join('\n')), []);
});

// Every doc, workflow, script and agent note, except test folders (this file
// quotes the unsafe lines on purpose) and installed packages. Symbolic links
// and junctions are not followed. Read only.
function collect(folder, extensions, out) {
  for (const entry of readdirSync(path.join(repo, folder), { withFileTypes: true })) {
    const rel = `${folder}/${entry.name}`;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== 'node_modules') collect(rel, extensions, out);
    } else if (extensions.some(extension => entry.name.endsWith(extension))) out.push(rel);
  }
  return out;
}

// Lines in older agent notes that still show the forbidden form. They are
// listed here, exactly, so the scan proves it finds them and so that no new
// line anywhere can pass. The notes are out of date: runbook step 4
// (docs/runbooks/tester-server-release.md) is the method, and it says so. When
// a note is corrected, remove its lines here (the test fails until then).
const KNOWN_HISTORICAL = {
  '.ai-coder/handoff/HANDOFF-TO-NEW-AGENT-2026-06-29.md': [
    `docker exec "$RC" redis-cli -a "$RPW" --no-auth-warning --scan --pattern '*catalog*' \\`,
    '| while read k; do docker exec "$RC" redis-cli -a "$RPW" --no-auth-warning DEL "$k"; done',
    '`redis-cli` MUST get `-a $REDIS_PASSWORD` or `--scan` silently returns nothing',
    '- `redis-cli` needs `-a $REDIS_PASSWORD` or it silently no-ops.',
  ],
};

test('the Redis password check finds every listed line of the older agent notes', () => {
  for (const [file, lines] of Object.entries(KNOWN_HISTORICAL)) {
    const text = readFileSync(path.join(repo, file), 'utf8').split(/\r?\n/).map(line => line.trim());
    for (const line of lines) {
      assert.ok(text.includes(line), `${file} no longer has this line; remove it from KNOWN_HISTORICAL: ${line}`);
      assert.notDeepEqual(findRedisPasswordArguments(line), [], `the check must reject: ${line}`);
    }
  }
});

test('no doc, workflow, script or agent note puts a Redis password on a command line or prints it', () => {
  const files = [
    ...collect('docs', ['.md'], []),
    ...collect('scripts', ['.sh', '.mjs', '.cjs', '.js'], []),
    ...collect('.github/workflows', ['.yml', '.yaml'], []),
    ...collect('.ai-coder', ['.md', '.sh', '.mjs', '.cjs', '.js', '.yml', '.yaml'], []),
  ];
  for (const required of ['docs/runbooks/tester-server-release.md', 'scripts/release/deploy-tester-release.sh', 'scripts/release/publish-web-builds.sh',
    '.github/workflows/ci.yml', ...Object.keys(KNOWN_HISTORICAL)]) {
    assert.ok(files.includes(required), `${required} must be among the checked files`);
  }
  const problems = [];
  const known = [];
  for (const file of files) {
    const text = readFileSync(path.join(repo, file), 'utf8');
    const lines = text.split(/\r?\n/);
    for (const problem of findRedisPasswordArguments(text)) {
      const line = lines[Number(/, line (\d+): /.exec(problem)[1]) - 1].trim();
      if ((KNOWN_HISTORICAL[file] ?? []).includes(line)) known.push(`${file}: ${line}`);
      else problems.push(`${file}: ${problem}`);
    }
  }
  assert.deepEqual(problems, []);
  const expected = Object.entries(KNOWN_HISTORICAL).flatMap(([file, lines]) => lines.map(line => `${file}: ${line}`));
  assert.deepEqual([...new Set(known)].sort(), expected.sort(), 'every listed historical line is found, and only those');
});

// The runbook's rollback must not replace server-only files either.
test('every command in the release runbook that moves the live checkout refuses to replace ignored files', () => {
  const lines = readFileSync(path.join(repo, 'docs/runbooks/tester-server-release.md'), 'utf8').split(/\r?\n/);
  const moves = lines.filter(line => /-C \/opt\/onservice checkout\b/.test(line));
  assert.ok(moves.length > 0, 'the rollback command must be found');
  for (const line of moves) assert.match(line, /--no-overwrite-ignore/, line);
});
