#!/usr/bin/env bash
# Smoke test: Gate C article no-fake-tests (scripts/gates/c-no-fake-tests.py).
#
# Added 2026-10-14 (D40). Proves the article REJECTS each fake-test shape that
# CLAUDE.md bans, one shape per temporary repo, and names the file, the line
# and the rule. Then proves the allowed shapes PASS, so the article does not
# block real tests. Last, proves the article fails the whole Gate C run when
# wired through c-constitution.sh (BLOCKING), and passes once the fake test is
# replaced by a real one.
#
# 2026-10-17 (D40, review fix): cases I to N added, one line per form an agent
# review found getting past the article (FT1: literal-only filler,
# toBeDefined, values either way round; FT2: .exec, . _ - separators,
# toMatchObject / objectContaining / arrayContaining, assert.notEqual and
# notStrictEqual, indexOf/search 0, a string mistaken for 0; files: a source
# file in __tests__ without .test, and .mts / .cts). The allowed set gained
# the matching absence forms, so the tightening does not block real tests.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ARTICLE="$REPO_ROOT/scripts/gates/c-no-fake-tests.py"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# new_case <case> <relative file>  (file content on stdin). Each case is its
# own git repo so the article uses the same "git ls-files" path it uses in CI.
new_case() {
  local dir="$WORK/$1"
  if [ ! -d "$dir/.git" ]; then
    mkdir -p "$dir"
    git -C "$dir" -c init.defaultBranch=main init -q
  fi
  mkdir -p "$dir/$(dirname "$2")"
  cat > "$dir/$2"
}

# expect_reject <case> <text that must appear in the report>...
expect_reject() {
  local name="$1"
  shift
  local out status
  set +e
  out=$(cd "$WORK/$name" && python3 "$ARTICLE" 2>&1)
  status=$?
  set -e
  if [ "$status" -eq 0 ]; then
    echo "FAIL ($name): the article accepted a banned fake-test shape"
    echo "$out"
    exit 1
  fi
  for wanted in "$@"; do
    if ! grep -qF -- "$wanted" <<<"$out"; then
      echo "FAIL ($name): the report does not contain: $wanted"
      echo "$out"
      exit 1
    fi
  done
  echo "OK ($name): rejected and reported ($*)"
}

# --- Case A: the CLAUDE.md shape, expect(existsSync(...)).toBe(true) alone ---
new_case A packages/api/__tests__/config-exists.test.ts <<'EOF'
import { existsSync } from 'fs';
import { resolve } from 'path';
describe('config', () => {
  it('config file exists', () => {
    expect(existsSync(resolve(__dirname, '../src/config.ts'))).toBe(true);
  });
});
EOF
expect_reject A "packages/api/__tests__/config-exists.test.ts:4 FT1 existence-only test"

# --- Case A2: existence checks wrapped in array helpers (review fix 2026-10-14) ---
new_case A2 packages/api/__tests__/array-helpers.test.ts <<'EOF'
it('every', () => { expect(['a', 'b'].every((f) => existsSync(f))).toBe(true); });
it('some', () => { expect(['a', 'b'].some((f) => existsSync(f))).toBe(true); });
it('find', () => { expect(['a', 'b'].find((f) => existsSync(f))).toBeTruthy(); });
it('filter', () => { expect(['a'].filter((f) => existsSync(f)).length > 0).toBe(true); });
it('includes', () => { expect(existsSync('a') && ['x'].includes('x')).toBe(true); });
EOF
expect_reject A2 \
  "array-helpers.test.ts:1 FT1" "array-helpers.test.ts:2 FT1" "array-helpers.test.ts:3 FT1" \
  "array-helpers.test.ts:4 FT1" "array-helpers.test.ts:5 FT1"

# --- Case B: it.each, fs.existsSync, toBeTruthy, assertion split over lines ---
new_case B apps/mobile/__tests__/scripts-exist.test.tsx <<'EOF'
import fs from 'fs';
it.each(['a.sh', 'b.sh'])('%s exists', (name) => {
  expect(
    fs.existsSync(`${ROOT}/scripts/${name}`)
  ).toBeTruthy();
});
EOF
expect_reject B "apps/mobile/__tests__/scripts-exist.test.tsx:2 FT1"

# --- Case C: a loop of existence checks plus one absence check, nothing else ---
new_case C packages/api/__tests__/moved-files.test.ts <<'EOF'
test('moved files', () => {
  for (const f of ['x.ts', 'y.ts']) {
    expect(existsSync(join(ROOT, f))).toBe(true);
  }
  expect(existsSync(join(ROOT, 'old.ts'))).toBe(false);
});
EOF
expect_reject C "packages/api/__tests__/moved-files.test.ts:1 FT1"

# --- Case D: node:test with assert.ok(existsSync(...)) ---
new_case D scripts/release/__tests__/release-script.test.mjs <<'EOF'
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
test('release script exists', () => {
  assert.ok(existsSync(new URL('../release.sh', import.meta.url)));
});
EOF
expect_reject D "scripts/release/__tests__/release-script.test.mjs:4 FT1"

# --- Case E: the CLAUDE.md shape, expect(closeout.match(/Bug NNNN/)).toBeTruthy() ---
new_case E packages/api/__tests__/closeout.test.ts <<'EOF'
import { readFileSync } from 'fs';
it('Bug 1234 — closed', () => {
  const closeout = readFileSync('.ai-coder/dispatches/D07-closeout.md', 'utf8');
  expect(closeout.match(/Bug 1234/)).toBeTruthy();
});
EOF
expect_reject E "packages/api/__tests__/closeout.test.ts:4 FT2 bug-citation assertion"

# --- Case F: a citation check hidden among real-looking assertions ---
new_case F packages/api/__tests__/source-citation.test.ts <<'EOF'
const SRC = readFileSync(resolve(__dirname, '../src/x.ts'), 'utf8');
it('fix present', () => {
  expect(SRC).toMatch(/Bug\s+36/);
  expect(SRC).toMatch(/realFunction/);
});
EOF
expect_reject F "packages/api/__tests__/source-citation.test.ts:3 FT2"

# --- Case G: every other contains-check form, one per line ---
new_case G apps/admin/src/pages/__tests__/citations.test.tsx <<'EOF'
const text = readFileSync('CLOSEOUT.md', 'utf8');
it('one', () => { expect(text.match(/Bug 41/)).not.toBeNull(); });
it('two', () => { expect(text.includes('Bug UX-018')).toBe(true); });
it('three', () => { expect(text).toContain('Bug #12'); });
it('four', () => { expect(/Bug \d+/.test(text)).toBe(true); });
it('five', () => { assert.match(text, /Bug 77/); });
it('six', () => { expect(text).toEqual(expect.stringContaining('bug 9')); });
it('seven', () => { expect(text.indexOf(`Bug 5`)).toBeGreaterThan(-1); });
EOF
expect_reject G \
  "citations.test.tsx:2 FT2" "citations.test.tsx:3 FT2" "citations.test.tsx:4 FT2" \
  "citations.test.tsx:5 FT2" "citations.test.tsx:6 FT2" "citations.test.tsx:7 FT2" \
  "citations.test.tsx:8 FT2"

# --- Case H: no git repo at all; the folder-walk fallback must still reject ---
mkdir -p "$WORK/H/packages/api/__tests__"
cat > "$WORK/H/packages/api/__tests__/no-git.test.ts" <<'EOF'
it('exists', () => { expect(existsSync('x')).toBe(true); });
EOF
# Point git at a path that is not a repo, so "git ls-files" fails here even
# if the temp folder happens to sit inside one.
set +e
out_h=$(cd "$WORK/H" && GIT_DIR="$WORK/H/not-a-repo" python3 "$ARTICLE" 2>&1)
status_h=$?
set -e
if [ "$status_h" -eq 0 ] || ! grep -qF "packages/api/__tests__/no-git.test.ts:1 FT1" <<<"$out_h"; then
  echo "FAIL (H): the folder-walk fallback did not reject the fake test"
  echo "$out_h"
  exit 1
fi
echo "OK (H): rejected without git (folder-walk fallback)"

# --- Case I (2026-10-17): FT1 forms that used to get through, one per line ---
new_case I packages/api/__tests__/ft1-bypass.test.ts <<'EOF'
it('a', () => { expect(existsSync('a')).toBe(true); expect(true).toBe(true); });
it('b', () => { expect(existsSync('a')).toBeDefined(); });
it('c', () => { expect(existsSync('a')).not.toBeNull(); });
it('d', () => { expect(true).toBe(existsSync('a')); });
it('e', () => { assert.equal(true, existsSync('a')); });
it('f', () => { assert.ok(existsSync('a')); assert.ok(true); expect(1).toBeGreaterThan(0); });
it('g', () => { assert.notEqual(existsSync('a'), false); });
it('h', () => { expect(existsSync('a')).not.toBeUndefined(); });
EOF
expect_reject I \
  "ft1-bypass.test.ts:1 FT1" "ft1-bypass.test.ts:2 FT1" "ft1-bypass.test.ts:3 FT1" \
  "ft1-bypass.test.ts:4 FT1" "ft1-bypass.test.ts:5 FT1" "ft1-bypass.test.ts:6 FT1" \
  "ft1-bypass.test.ts:7 FT1" "ft1-bypass.test.ts:8 FT1"

# --- Case J (2026-10-17): .exec ---
new_case J packages/api/__tests__/citation-exec.test.ts <<'EOF'
it('a', () => { expect(/Bug 1234/.exec(closeout)).toBeTruthy(); });
it('b', () => { expect(/Bug 1234/.exec(closeout)).not.toBeNull(); });
EOF
expect_reject J "citation-exec.test.ts:1 FT2" "citation-exec.test.ts:2 FT2"

# --- Case K (2026-10-17): other separators after "Bug", and file names ---
new_case K packages/api/__tests__/citation-separators.test.ts <<'EOF'
it('1', () => { expect(closeout).toMatch(/Bug.1234/); });
it('2', () => { expect(closeout).toMatch(/Bug-1234/); });
it('3', () => { expect(closeout).toContain('BUG_1234'); });
it('4', () => { expect(closeout).toContain('Bug1234'); });
it('5', () => { expect(closeout).toMatch(/Bug[-_ ]?1234/); });
it('6', () => { expect(closeout).toMatch(/\bBug\s+\d+/); });
it('7', () => { expect(closeout).toContain('Bug-UX-018'); });
it('8', () => { expect(closeout).toMatch(/bug-ux-372-chat-send\.real\.test\.tsx/); });
it('9', () => { expect(closeout).toContain('Bug R-CUS-09'); });
EOF
expect_reject K \
  "citation-separators.test.ts:1 FT2" "citation-separators.test.ts:2 FT2" \
  "citation-separators.test.ts:3 FT2" "citation-separators.test.ts:4 FT2" \
  "citation-separators.test.ts:5 FT2" "citation-separators.test.ts:6 FT2" \
  "citation-separators.test.ts:7 FT2" "citation-separators.test.ts:8 FT2" \
  "citation-separators.test.ts:9 FT2"

# --- Case L (2026-10-17): object and array helpers ---
new_case L packages/api/__tests__/citation-objects.test.ts <<'EOF'
it('1', () => { expect(obj).toMatchObject({ note: expect.stringContaining('Bug 1234') }); });
it('2', () => { expect(obj).toMatchObject({ note: 'Bug 1234' }); });
it('3', () => { expect(obj).toEqual(expect.objectContaining({ note: 'Bug 1234' })); });
it('4', () => { expect(list).toEqual(expect.arrayContaining(['Bug 1234'])); });
it('5', () => { expect(obj).toHaveProperty('note', expect.stringContaining('Bug 1234')); });
EOF
expect_reject L \
  "citation-objects.test.ts:1 FT2" "citation-objects.test.ts:2 FT2" \
  "citation-objects.test.ts:3 FT2" "citation-objects.test.ts:4 FT2" \
  "citation-objects.test.ts:5 FT2"

# --- Case M (2026-10-17): not-equal asserts, values either way round, positions ---
new_case M packages/api/__tests__/citation-asserts.test.ts <<'EOF'
it('1', () => { assert.notEqual(closeout.indexOf('Bug 1234'), -1); });
it('2', () => { assert.notStrictEqual(closeout.match(/Bug 1234/), null); });
it('3', () => { assert.strictEqual(true, closeout.includes('Bug 1234')); });
it('4', () => { expect(true).toBe(closeout.includes('Bug 1234')); });
it('5', () => { expect(closeout.indexOf('Bug 1234')).toBe(0); });
it('6', () => { expect(closeout.search(/Bug 1234/)).toBe(0); });
it('7', () => { expect(closeout.indexOf('Bug 1234')).toBeFalsy(); });
it('8', () => { assert.equal(closeout.indexOf('Bug 1234'), 3); });
it('9', () => { expect(closeout.match(/Bug 1234/)?.[0]).toBe('Bug 1234'); });
it('10', () => { assert.notDeepStrictEqual(closeout.match(/Bug 1234/), null); });
EOF
expect_reject M \
  "citation-asserts.test.ts:1 FT2" "citation-asserts.test.ts:2 FT2" \
  "citation-asserts.test.ts:3 FT2" "citation-asserts.test.ts:4 FT2" \
  "citation-asserts.test.ts:5 FT2" "citation-asserts.test.ts:6 FT2" \
  "citation-asserts.test.ts:7 FT2" "citation-asserts.test.ts:8 FT2" \
  "citation-asserts.test.ts:9 FT2" "citation-asserts.test.ts:10 FT2"

# --- Case N (2026-10-17): files mobile jest runs without a .test name, .mts, .cts ---
# apps/mobile uses jest's default testMatch, which runs every source file
# under __tests__. A file outside __tests__ and without a test name is run by
# no test runner here, so it must NOT be reported.
new_case N apps/mobile/__tests__/no-suffix.tsx <<'EOF'
it('exists', () => { expect(existsSync('x')).toBe(true); });
EOF
new_case N packages/api/__tests__/esm.test.mts <<'EOF'
it('exists', () => { expect(existsSync('x')).toBe(true); });
EOF
new_case N packages/api/src/legacy.spec.cts <<'EOF'
it('exists', () => { expect(existsSync('x')).toBe(true); });
EOF
new_case N packages/api/src/not-a-test.ts <<'EOF'
it('exists', () => { expect(existsSync('x')).toBe(true); });
EOF
expect_reject N \
  "apps/mobile/__tests__/no-suffix.tsx:1 FT1" \
  "packages/api/__tests__/esm.test.mts:1 FT1" \
  "packages/api/src/legacy.spec.cts:1 FT1"
out_n=$(cd "$WORK/N" && python3 "$ARTICLE" 2>&1 || true)
if grep -qF "not-a-test.ts" <<<"$out_n" || ! grep -qF "3 fake-test assertion(s) or block(s) in 3 file(s)" <<<"$out_n"; then
  echo "FAIL (N): a file no test runner runs was reported, or a test file was missed"
  echo "$out_n"
  exit 1
fi
echo "OK (N): a file outside __tests__ without a test name is not read"

# --- Allowed shapes: all in one repo, the article must pass ---
new_case OK packages/api/__tests__/allowed.test.tsx <<'EOF'
import fs, { existsSync, readFileSync } from 'fs';
import { join } from 'path';

let dir: string;
beforeAll(() => {
  dir = makeTempDir();
  expect(existsSync(dir)).toBe(true); // setup is not a test block
});

function helperExists(p: string) { return existsSync(p); }

it('upload stores the file (real code runs first)', async () => {
  const saved = await uploadFile(dir, 'photo.jpg');
  expect(fs.existsSync(join(dir, saved))).toBe(true);
});

it('existence plus a real assertion', () => {
  const p = join(dir, 'report.json');
  expect(existsSync(p)).toBe(true);
  expect(JSON.parse(readFileSync(p, 'utf8'))).toEqual({ ok: true });
});

it('cleanup removed the old file (absence only)', () => {
  expect(existsSync(join(dir, 'old.tmp'))).toBe(false);
});

it('Bug 1234 — a Bug ID in a title is fine', () => {
  expect(add(1, 2)).toBe(3);
});

it.todo('Bug 5678 — needs a behaviour test: the route is not wired yet');

it('a removed citation stays removed', () => {
  expect(readFileSync('src/x.ts', 'utf8')).not.toMatch(/Bug 36/);
  expect(text.match(/Bug 36/)).toBeNull();
  expect(text.includes('Bug 36')).toBe(false);
  assert.doesNotMatch(text, /Bug 36/);
});

it('comments and strings are not code', () => {
  // expect(existsSync(x)).toBe(true)
  /* expect(closeout.match(/Bug 1/)).toBeTruthy() */
  const doc = "expect(existsSync(p)).toBe(true) and Bug 99";
  expect(doc.length).toBeGreaterThan(10);
});

it('regex literals with brackets do not confuse the reader', () => {
  expect(format('(a)')).toMatch(/\(a\)/);
  expect(format('[b]')).toMatch(/[)(]b/);
  expect(1 / 2).toBe(0.5);
});

it('rendered text queries are allowed', () => {
  render(<Screen title="x" />);
  expect(screen.getByText(/Bug 12/)).toBeTruthy();
});

it('a log message assertion is allowed', () => {
  run();
  expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Bug 7'));
});
EOF
new_case OK scripts/server/__tests__/release.test.mjs <<'EOF'
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
test('publish writes the release folder', async () => {
  await publish(tmp);
  assert.ok(existsSync(`${tmp}/release`));
});
EOF
# A helper file inside __tests__ is read (2026-10-17), but a check outside an
# it()/test() block is not a test block, so it passes.
new_case OK packages/api/__tests__/helpers/paths.ts <<'EOF'
export const ok = () => expect(existsSync('x')).toBe(true);
EOF
# A file outside __tests__ without a test name is not read at all.
new_case OK packages/api/src/check.ts <<'EOF'
it('exists', () => { expect(existsSync('x')).toBe(true); });
EOF
# 2026-10-17: the absence and mock-call forms that match the new reject cases.
new_case OK packages/api/__tests__/allowed-2026-10-17.test.ts <<'EOF'
it('absence written with positions, lengths and not- asserts', () => {
  expect(text.indexOf('Bug 36')).toBe(-1);
  expect(text.search(/Bug 36/)).toBeLessThan(0);
  expect((text.match(/Bug 36/g) || []).length).toBe(0);
  expect(-1).toBe(text.lastIndexOf('Bug 36'));
  assert.equal(text.indexOf('Bug 36'), -1);
  assert.strictEqual(false, text.includes('Bug 36'));
  assert.notOk(text.includes('Bug 36'));
  expect(obj).not.toMatchObject({ note: 'Bug 36' });
});
it('mock calls with object helpers are allowed', () => {
  run();
  expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ msg: 'Bug 7' }));
});
it('existence after real code, with a literal-only line as well', async () => {
  await build(dir);
  expect(existsSync(join(dir, 'out.js'))).toBe(true);
  expect(true).toBe(true);
});
it('debug, bugs and bugfix are not citations', () => {
  expect(log).toContain('debug-2 debug_3 bugs 4 bugfix-5');
});
EOF
set +e
out_ok=$(cd "$WORK/OK" && python3 "$ARTICLE" 2>&1)
status_ok=$?
set -e
# The exact count also proves the reader found every file and test block (9
# in allowed.test.tsx, 1 in the .mjs file, 4 in allowed-2026-10-17.test.ts,
# none in helpers/paths.ts; it.todo is not a block; src/check.ts is not read),
# so this pass is not an empty scan.
if [ "$status_ok" -ne 0 ] || ! grep -qF "no-fake-tests [BLOCKING]: OK (4 test files, 14 test blocks scanned)" <<<"$out_ok"; then
  echo "FAIL (OK): the article rejected allowed test shapes (false positive) or missed test blocks"
  echo "$out_ok"
  exit 1
fi
echo "OK (allowed): real behaviour, setup-only existsSync, absence checks, titles, todo, comments, strings and mock calls all pass"

# --- Wired through c-constitution.sh: BLOCKING failure, then pass ---
TREE="$WORK/tree"
mkdir -p "$TREE/scripts/gates" "$TREE/packages/api/__tests__" "$TREE/packages/api/src" \
         "$TREE/apps/mobile/src" "$TREE/apps/mobile/app" "$TREE/apps/admin/src" \
         "$TREE/.ai-coder/dispatches"
# (2026-10-17: the no-admin-password-seeds script added when that article
# was wired in, and c-db-tests-fail-closed.py when that article was added.
# Every script Gate C calls must be here.)
for f in c-constitution.sh MODES.json get-mode.py mode-lookup.sh c-no-fake-tests.py \
         c-unique-regression-ids.py c-constitution-no-shield-references.sh \
         c-constitution-no-admin-password-seeds.sh c-db-tests-fail-closed.py; do
  cp "$REPO_ROOT/scripts/gates/$f" "$TREE/scripts/gates/"
done
# One test per line: article 12 counts lines that start with test( or it(, so
# five tests on one line would make it fail and hide what this case checks.
cat > "$TREE/packages/api/__tests__/bigint-money-precision.test.ts" <<'EOF'
test('1', () => {});
test('2', () => {});
test('3', () => {});
test('4', () => {});
test('5', () => {});
EOF
echo "<!-- gate-b: no-bugs-this-dispatch -->" > "$TREE/.ai-coder/dispatches/D99-closeout.md"
cat > "$TREE/packages/api/__tests__/fake.test.ts" <<'EOF'
it('service file exists', () => { expect(existsSync('src/service.ts')).toBe(true); });
EOF
set +e
out_gate=$(cd "$TREE" && DISPATCH=99 bash scripts/gates/c-constitution.sh 2>&1)
status_gate=$?
set -e
# The fake test must be the only BLOCKING failure, so the failure is caused
# by this article and not by a gap in the fixture.
if [ "$status_gate" -eq 0 ] \
   || ! grep -qF "Gate C VIOLATION (no-fake-tests) [BLOCKING]" <<<"$out_gate" \
   || ! grep -qF "BLOCKING failed: 1" <<<"$out_gate" \
   || ! grep -qF "Gate C FAILED" <<<"$out_gate"; then
  echo "FAIL (gate): c-constitution.sh did not fail on a fake test (or another article also failed)"
  echo "$out_gate"
  exit 1
fi
echo "OK (gate): c-constitution.sh fails with the no-fake-tests article BLOCKING"

cat > "$TREE/packages/api/__tests__/fake.test.ts" <<'EOF'
it('service builds the label', () => { expect(buildLabel('a')).toBe('A'); });
EOF
set +e
out_gate2=$(cd "$TREE" && DISPATCH=99 bash scripts/gates/c-constitution.sh 2>&1)
status_gate2=$?
set -e
if [ "$status_gate2" -ne 0 ] \
   || ! grep -qE "no-fake-tests \[BLOCKING\]: OK" <<<"$out_gate2" \
   || ! grep -qF "Gate C PASSED" <<<"$out_gate2"; then
  echo "FAIL (gate): Gate C did not pass after the fake test was replaced"
  echo "$out_gate2"
  exit 1
fi
echo "OK (gate): no-fake-tests reports OK and Gate C passes once the test asserts behaviour"
