#!/usr/bin/env python3
"""Gate C article "no-fake-tests": reject the two fake-test shapes CLAUDE.md bans.

Added 2026-10-14 under decision D40 (.ai-coder/decisions/
D40-adopt-engineering-standard-v2.md). Mode: BLOCKING (scripts/gates/
MODES.json, gate_c_articles.no-fake-tests). Wired into scripts/gates/
c-constitution.sh. Self-test: scripts/gates/__tests__/
gate-c-no-fake-tests.test.sh. This file is a gate script. Changing it follows
the gate-change rule in .ai-coder/governance/GATE-AMENDMENTS.md.

CLAUDE.md names two shapes that are not tests:
    expect(existsSync(...)).toBe(true)
    expect(closeout.match(/Bug NNNN/)).toBeTruthy()
This article turns those two shapes into the exact rules below.

WHAT IS SCANNED
  Every file that jest or vitest, as set up in this repo, can run as a test
  (Node's own runner is covered under LIMITS). That means every tracked
  file, or untracked file that git does not ignore, that is either:
    - named like a test: the file name is <anything>.test.<ext> or
      <anything>.spec.<ext> (or just test.<ext> / spec.<ext>), or
    - any source file inside a folder named __tests__,
  where <ext> is js, jsx, ts, tsx, mjs, cjs, mts or cts. The second form is
  there because apps/mobile uses jest's default file pattern, which runs
  every source file under __tests__ as a test, with or without .test in the
  name (added 2026-10-17, see CHANGES below). Helper and fixture files inside
  __tests__ are read too; they only produce a finding if they contain an
  it(...) or test(...) block of a banned shape. The whole repository is
  scanned. Folders named node_modules, dist, build, coverage, test-results,
  .expo and .git are skipped. Comments are ignored.

RULE FT1: existence-only test
  A test block is it(...) or test(...), including .only, .skip, .concurrent,
  .failing, .fails, .sequential, .each, .for, .runIf and .skipIf. it.todo and
  test.todo are never flagged. A test block is rejected when all of these hold:
    1. It makes at least one assertion that is not literal-only. A
       literal-only assertion compares fixed values with each other, for
       example expect(true).toBe(true), expect(1).toBeGreaterThan(0) or
       assert.ok(true). It checks nothing, so it is ignored here and cannot
       be used to switch this rule off.
    2. Every other assertion in it is a file-existence check. That means
       expect(<something with existsSync(...)>) ended by .toBe(true|false),
       .toEqual(...), .toStrictEqual(...), .toBeTruthy() or .toBeFalsy(), with
       or without .not; expect(<existsSync(...)>).toBeDefined(),
       .not.toBeUndefined() or .not.toBeNull(), which always pass because
       existsSync always returns true or false (they count as "exists");
       assert(existsSync(...)), assert.ok(...), assert.notOk(...); or
       assert.equal / strictEqual / deepEqual / deepStrictEqual or their
       not- forms comparing existsSync(...) with true or false. The two
       values may be written either way round, so expect(true).toBe(
       existsSync(p)) and assert.equal(true, existsSync(p)) count too.
    3. At least one of those checks says a file EXISTS.
    4. Apart from those checks it only builds paths. Every function it calls
       is in PATH_ONLY_CALLS below: expect, existsSync, the path helpers,
       require, the matcher names, and the array helpers forEach, map,
       every, some, filter, find and includes (so wrapping the checks in
       ['a', 'b'].every(...) does not get around this rule). Calls inside
       literal-only assertions are not counted.
  So existsSync stays allowed:
    - in beforeAll, beforeEach, afterEach and helper functions, because those
      are not test blocks;
    - in a test that also makes any other kind of assertion that is not
      literal-only;
    - in a test that runs real code first (an upload, a server start, a
      cleanup job) and then checks the file that code produced;
    - in a test whose existence checks all say a file is GONE.

RULE FT2: bug-citation text assertion
  An assertion is rejected when it checks that some text CONTAINS a bug
  citation. A citation is the word "Bug" (any letter case, not part of a
  longer word or number) followed by either
    - spaces or "#", any number of LETTERS plus one of . _ - (such as "UX-"
      or "R-CUS-"), and a digit: "Bug 1234", "Bug UX-018", "bug #12",
      "Bug R-CUS-09"; or
    - one of . _ - and any number of LETTERS plus one of . _ -, and a digit:
      "Bug-1234", "Bug.1234", "BUG_1234", "Bug-UX-018", "bug-ops-387"; or
    - a digit straight away: "Bug1234".
  A test file name that carries a bug ID, such as
  "bug-ux-372-chat-send.real.test.tsx", is a citation too, so
  expect(doc).toMatch(/bug-ux-372-chat-send/) is rejected: it only proves the
  document names the file. Check that the named file exists instead.
  In a regex literal, \\s, \\W, ".", a character class made only of these
  separators (such as [-_ ]) and a quantifier after a separator are read as
  a separator, and \\d or [0-9] as a digit: /Bug\\s+\\d+/, /Bug.1234/,
  /Bug[-_ ]?1234/. The citation must sit in a string, template or regex
  literal inside the assertion, and the assertion must be a contains-check:
      expect(text).toMatch(<citation>)       expect(text).toContain(<citation>)
      expect(obj).toMatchObject({ ... <citation> ... })
      expect(x).toEqual(expect.stringContaining(<citation>))  (or stringMatching,
        objectContaining, arrayContaining; also with toStrictEqual, toBe and
        toHaveProperty)
      expect(text.match(<citation>)).toBeTruthy()  (or .not.toBeNull() etc.)
      expect(<citation>.test(text)).toBe(true)   expect(<citation>.exec(text)).toBeTruthy()
      expect(text.includes(<citation>)).toBe(true)
        (also .matchAll .search .indexOf .lastIndexOf .startsWith .endsWith)
      expect(true).toBe(text.includes(<citation>))  (values either way round)
      assert.match(text, <citation>)    assert.ok(text.includes(<citation>))
      assert.equal(text.includes(<citation>), true)  (either way round)
      assert.notEqual(text.indexOf(<citation>), -1)
      assert.notStrictEqual(text.match(<citation>), null)
  For .indexOf, .lastIndexOf and .search only -1 (or "less than 0") means
  absent. 0 means the text STARTS with the citation, so
  expect(text.indexOf('Bug 1')).toBe(0) and .toBeFalsy() are rejected.
  Allowed:
    - checks that a citation is ABSENT, for example .not.toMatch(/Bug 1/),
      expect(text.match(/Bug 1/)).toBeNull(), expect(text.indexOf('Bug 1'))
      .toBe(-1), assert.doesNotMatch(...);
    - a Bug ID in a test TITLE. That is the one-bug-one-test rule working.
    - RTL queries on rendered output such as getByText(/Bug 1/), because
      getByText is not one of the contains methods above.
    - checks on what a mock was called with, such as
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Bug 7')),
      because the code under test produced that text when it ran.

LIMITS (stated plainly; these still get through)
  - The reader is a small JavaScript/TypeScript tokenizer, not a full parser.
    It handles comments, strings, template literals and regex literals.
  - It does not catch every weak test. A general source-text test such as
    expect(source).toMatch(/someFunction/) is NOT flagged. CLAUDE.md rule 4
    (behaviour on real renders, not source regex) is still checked by review
    only.
  - Helper wrappers are not followed. A banned check moved into a helper
    function (function hasBug(t) { return t.includes('Bug 1'); } and then
    expect(hasBug(text)).toBe(true)), or into a custom matcher, is not seen.
  - It reads literals only. A citation kept in a variable or constant, built
    at run time (a template literal `Bug ${id}`), or split across strings
    ('Bu' + 'g 1234'), is not seen. Neither is a regex written in other ways,
    for example /B[u]g 1/ or /Bug\\D1/.
  - Only existsSync counts as an existence check. statSync, accessSync,
    fs.promises.access, glob results and similar are not seen. Neither is an
    existsSync result stored in a variable first, compared with something
    other than true or false (for example
    expect(files.filter(existsSync)).toEqual(files)), or checked with other
    always-passing matchers such as toBeTypeOf('boolean') or
    toEqual(expect.any(Boolean)).
  - A comparison written inside the checked value, such as
    expect(text.indexOf('Bug 1') === -1).toBe(true), is read as a presence
    check and REJECTED even though it checks absence. Write it as
    expect(text.indexOf('Bug 1')).toBe(-1). This errs on the strict side.
  - Only file names that jest's and vitest's settings in this repo can run
    are read. Node's own test runner run with no file list ("node --test",
    as in qa/api-security, not run in CI) also picks files named like
    test-x.mjs, x-test.mjs or x_test.mjs, or anything in a test/ folder.
    On 2026-10-17 no such file existed outside the .ai-coder audit scripts,
    which no test runner runs.
  - There is no inline allow marker. A false positive goes through the
    gate-change rule in .ai-coder/governance/GATE-AMENDMENTS.md.

CHANGES
  2026-10-14  Added (D40).
  2026-10-17  Tightened after an agent review found ways around both rules
              (D40, gate-change rule: tightening only, its own commit, every
              new form has a self-test case in
              __tests__/gate-c-no-fake-tests.test.sh, cases I to N):
              literal-only assertions no longer switch FT1 off; toBeDefined
              and similar always-passing checks on existsSync count as
              existence checks; values written either way round are read;
              .exec added; citations may use . _ - or no separator;
              toMatchObject, objectContaining and arrayContaining count as
              contains-checks; assert.notEqual / notStrictEqual / notOk are
              read; 0 no longer counts as "absent" for indexOf and search;
              equality values are read from the source, so a string such as
              '0' is no longer mistaken for the number 0; source files in
              __tests__ folders and .mts/.cts test files are read. On the
              whole worktree it then found one more case, a check in
              packages/api/__tests__/d07-encompassed-bugs.test.ts that a
              document names a test file carrying a bug ID; it was replaced
              in the same change by a check that the named files exist.

EXIT CODES
  0 = no violations. 1 = violations found. 2 = a test file could not be read.
"""

from __future__ import annotations

import bisect
import os
from pathlib import Path
import re
import subprocess
import sys


SOURCE_EXTENSIONS = ("js", "jsx", "ts", "tsx", "mjs", "cjs", "mts", "cts")
SOURCE_SUFFIXES = tuple(f".{ext}" for ext in SOURCE_EXTENSIONS)
# jest's default testMatch, which apps/mobile uses (2026-10-17):
#   **/__tests__/**/*.?([mc])[jt]s?(x)   and   **/?(*.)+(spec|test).?([mc])[jt]s?(x)
TEST_NAME_RE = re.compile(r"(?:^|\.)(?:spec|test)+\.[mc]?[jt]sx?$")
TESTS_FOLDER = "__tests__"
SKIP_DIRECTORIES = {
    ".expo",
    ".git",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "test-results",
}

# Words after which a "/" starts a regex literal instead of a division.
KEYWORDS_BEFORE_REGEX = {
    "await", "case", "delete", "do", "else", "in", "instanceof", "new", "of",
    "return", "throw", "typeof", "void", "yield",
}
PUNCT_BEFORE_REGEX = set("(,=:[!&|?{};+-*%<>~^")

# Words that look like calls ("if (") but are not.
CALL_KEYWORDS = {
    "async", "await", "catch", "delete", "do", "else", "for", "function", "if",
    "in", "instanceof", "of", "return", "switch", "typeof", "void", "while",
    "with", "yield",
}

# FT1 rule 4: the only calls an existence-only test may make.
# 2026-10-14 (D40, review fix): every, some, filter, find and includes added,
# so ['a', 'b'].every((f) => existsSync(f)) no longer skips FT1. Tightening
# only. Self-test case A2 in __tests__/gate-c-no-fake-tests.test.sh.
# 2026-10-17 (D40, review fix): the not- assert forms and the always-passing
# matchers toBeDefined, toBeNull and toBeUndefined added, because FT1 now
# reads them as existence checks. Tightening only. Self-test cases I and J.
PATH_ONLY_CALLS = {
    "assert", "basename", "cwd", "deepEqual", "deepStrictEqual", "dirname",
    "equal", "every", "existsSync", "expect", "fileURLToPath", "filter",
    "find", "forEach", "includes", "join", "map", "normalize",
    "notDeepEqual", "notDeepStrictEqual", "notEqual", "notOk",
    "notStrictEqual", "ok", "relative", "require", "resolve", "some",
    "strictEqual", "String", "toBe", "toBeDefined", "toBeFalsy", "toBeNull",
    "toBeTruthy", "toBeUndefined", "toEqual", "toStrictEqual", "URL",
}

TEST_MODIFIERS = {
    "concurrent", "each", "fails", "failing", "for", "only", "runIf",
    "sequential", "skip", "skipIf", "todo",
}
MODIFIERS_WITH_ARGUMENT = {"each", "for", "runIf", "skipIf"}

EQUALITY_MATCHERS = {"toBe", "toEqual", "toStrictEqual"}
EXISTENCE_MATCHERS = EQUALITY_MATCHERS | {"toBeTruthy", "toBeFalsy"}
# A matcher that is itself a contains-check on its argument.
CONTAINS_MATCHERS = {"toMatch", "toContain", "toContainEqual", "toMatchObject"}
# A matcher that becomes a contains-check when its argument uses one of the
# STRING_HELPER_RE helpers. Mock-call matchers such as toHaveBeenCalledWith
# are deliberately not here (see "Allowed" in the header).
HELPER_MATCHERS = EQUALITY_MATCHERS | {"toHaveProperty"}
ASSERT_EQUAL_METHODS = {"equal", "strictEqual", "deepEqual", "deepStrictEqual"}
ASSERT_NOT_EQUAL_METHODS = {
    "notEqual", "notStrictEqual", "notDeepEqual", "notDeepStrictEqual",
}
# Fixed values that make an assertion literal-only (FT1 rule 1). String,
# template and regex literals are already masked to "0" by the reader.
LITERAL_WORDS = {"Infinity", "NaN", "false", "null", "true", "undefined"}
LITERAL_PUNCT = set("0123456789.+-*/%!,()[]{}<>=&|?:~^")
TOKEN_RE = re.compile(r"[A-Za-z_$][\w$]*|\S")

TEST_HEAD_RE = re.compile(
    r"(?<![\w$.])(?:it|test)((?:\s*\.\s*[A-Za-z_$][\w$]*)*)"
)
EXPECT_RE = re.compile(r"(?<![\w$.])expect(?:\s*\.\s*(?:soft|poll))?\s*\(")
ASSERT_RE = re.compile(r"(?<![\w$.])assert(?:\s*\.\s*([A-Za-z_$][\w$]*))?\s*\(")
IDENT_RE = re.compile(r"[A-Za-z_$][\w$]*")
CALL_RE = re.compile(r"([A-Za-z_$][\w$]*)\s*\(")
EXISTS_CALL_RE = re.compile(r"(?<![\w$])existsSync\s*\(")
CONTAINS_METHOD_RE = re.compile(
    r"\.\s*(?:match|matchAll|exec|test|includes|indexOf|lastIndexOf|search|"
    r"startsWith|endsWith)\s*\("
)
# Contains methods that return a position: -1 means absent, 0 means "starts
# with" (2026-10-17: 0 used to be read as absent for these).
INDEX_METHOD_RE = re.compile(r"\.\s*(?:indexOf|lastIndexOf|search)\s*\(")
OTHER_CONTAINS_METHOD_RE = re.compile(
    r"\.\s*(?:match|matchAll|exec|test|includes|startsWith|endsWith)\s*\("
)
STRING_HELPER_RE = re.compile(
    r"\b(?:stringContaining|stringMatching|objectContaining|arrayContaining)\s*\("
)
ALL_TRUE_ARRAY_RE = re.compile(r"^\[\s*true(?:\s*,\s*true)*\s*,?\s*\]$")
BUG_CITATION_RE = re.compile(
    r"(?<![A-Za-z0-9])bug"
    r"(?:"
    r"(?:\s*#\s*|\s+)(?:[A-Za-z]+[._-])*"  # "Bug 1234", "bug #12", "Bug R-CUS-09"
    r"|[._-](?:[A-Za-z]+[._-])*"           # "Bug-1234", "BUG_1234", "bug-ops-387"
    r"|"                                   # "Bug1234"
    r")\d",
    re.IGNORECASE,
)
# Regex-literal pieces that stand for a separator in a citation (2026-10-17).
REGEX_SEPARATOR_CLASS_RE = re.compile(r"\[(?:\\[sW._#\- ]|[._# -])+\]")
QUANTIFIER_AFTER_SEPARATOR_RE = re.compile(r"(?<=[\s._#-])(?:[+*?]|\{\d*,?\d*\})+")


# ---------------------------------------------------------------------------
# Tokenizer: blank out comments and literals so brackets and calls can be
# found safely, and keep the literal texts for rule FT2.
# ---------------------------------------------------------------------------

class Lexed:
    def __init__(self, source: str) -> None:
        self.source = source
        self.n = len(source)
        self.out = list(source)
        self.literals: list[tuple[int, int, str, str]] = []
        position = 0
        while position < self.n:
            position = self._lex_code(position, in_expression=False)
            if position < self.n:
                # A stray "}" at top level: step over it.
                position += 1
        self.masked = "".join(self.out)
        self.literals.sort()
        self.literal_starts = [literal[0] for literal in self.literals]
        self.literal_by_start = {literal[0]: literal for literal in self.literals}

    def _blank(self, start: int, end: int) -> None:
        out = self.out
        for index in range(start, min(end, self.n)):
            if out[index] != "\n":
                out[index] = " "

    def _mark_literal(self, start: int, end: int) -> None:
        # Literal becomes "0" followed by spaces: it still reads as a value,
        # but nothing inside it can look like a bracket or a call.
        self._blank(start, end)
        if start < self.n and self.out[start] != "\n":
            self.out[start] = "0"

    def _regex_allowed(self, index: int) -> bool:
        out = self.out
        back = index - 1
        while back >= 0 and out[back] in " \t\r\n":
            back -= 1
        if back < 0:
            return True
        previous = out[back]
        if previous in PUNCT_BEFORE_REGEX:
            return True
        if previous.isalnum() or previous in "_$":
            word_end = back + 1
            while back >= 0 and (out[back].isalnum() or out[back] in "_$"):
                back -= 1
            return "".join(out[back + 1:word_end]) in KEYWORDS_BEFORE_REGEX
        return False

    def _scan_regex(self, index: int) -> tuple[int, str] | None:
        source = self.source
        cursor = index + 1
        in_class = False
        while cursor < self.n:
            char = source[cursor]
            if char == "\\":
                cursor += 2
                continue
            if char == "\n":
                return None
            if in_class:
                if char == "]":
                    in_class = False
            elif char == "[":
                in_class = True
            elif char == "/":
                break
            cursor += 1
        if cursor >= self.n:
            return None
        body = source[index + 1:cursor]
        cursor += 1
        while cursor < self.n and source[cursor].isalpha():
            cursor += 1
        return cursor, body

    def _scan_string(self, index: int) -> int:
        source = self.source
        quote = source[index]
        cursor = index + 1
        while cursor < self.n:
            char = source[cursor]
            if char == "\\":
                cursor += 2
                continue
            if char == quote:
                cursor += 1
                self.literals.append((index, cursor, "string", source[index + 1:cursor - 1]))
                self._mark_literal(index, cursor)
                return cursor
            if char == "\n":
                break
            cursor += 1
        # Unterminated string: keep its text, stop at the line end.
        self.literals.append((index, cursor, "string", source[index + 1:cursor]))
        self._mark_literal(index, cursor)
        return cursor

    def _scan_template(self, index: int) -> int:
        source = self.source
        cursor = index + 1
        segment_start = cursor
        parts: list[str] = []
        while cursor < self.n:
            char = source[cursor]
            if char == "\\":
                cursor += 2
                continue
            if char == "`":
                parts.append(source[segment_start:cursor])
                self._blank(segment_start, cursor + 1)
                cursor += 1
                break
            if char == "$" and cursor + 1 < self.n and source[cursor + 1] == "{":
                parts.append(source[segment_start:cursor])
                self._blank(segment_start, cursor + 2)
                close = self._lex_code(cursor + 2, in_expression=True)
                self._blank(close, close + 1)
                cursor = close + 1
                segment_start = cursor
                continue
            cursor += 1
        else:
            parts.append(source[segment_start:cursor])
            self._blank(segment_start, cursor)
        if self.out[index] != "\n":
            self.out[index] = "0"
        self.literals.append((index, cursor, "template", "".join(parts)))
        return cursor

    _INTERESTING = re.compile(r"[/'\"`{}]")

    def _lex_code(self, position: int, in_expression: bool) -> int:
        """Lex code. In a template expression, return the index of its "}"."""
        source = self.source
        depth = 0
        while position < self.n:
            found = self._INTERESTING.search(source, position)
            if not found:
                return self.n
            position = found.start()
            char = source[position]
            if char == "{":
                depth += 1
                position += 1
            elif char == "}":
                if depth == 0:
                    return position
                depth -= 1
                position += 1
            elif char in "'\"":
                position = self._scan_string(position)
            elif char == "`":
                position = self._scan_template(position)
            else:  # "/"
                following = source[position + 1] if position + 1 < self.n else ""
                if following == "/":
                    line_end = source.find("\n", position)
                    line_end = self.n if line_end == -1 else line_end
                    self._blank(position, line_end)
                    position = line_end
                elif following == "*":
                    comment_end = source.find("*/", position + 2)
                    comment_end = self.n if comment_end == -1 else comment_end + 2
                    self._blank(position, comment_end)
                    position = comment_end
                elif self._regex_allowed(position):
                    scanned = self._scan_regex(position)
                    if scanned is None:
                        position += 1
                    else:
                        end, body = scanned
                        self.literals.append((position, end, "regex", body))
                        self._mark_literal(position, end)
                        position = end
                else:
                    position += 1
        return self.n

    def literals_in(self, start: int, end: int) -> list[tuple[int, int, str, str]]:
        first = bisect.bisect_left(self.literal_starts, start)
        found = []
        for literal in self.literals[first:]:
            if literal[0] >= end:
                break
            found.append(literal)
        return found


def match_paren(masked: str, open_index: int) -> int:
    depth = 0
    for index in range(open_index, len(masked)):
        char = masked[index]
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth == 0:
                return index
    return -1


def skip_space(masked: str, index: int) -> int:
    while index < len(masked) and masked[index] in " \t\r\n":
        index += 1
    return index


def parse_chain(masked: str, index: int) -> tuple[list[tuple[str, int, int]], int]:
    """Read ".name" / ".name(args)" members after a call. Returns (members, end)."""
    members: list[tuple[str, int, int]] = []
    while True:
        cursor = skip_space(masked, index)
        if masked.startswith("?.", cursor):
            cursor += 2
        elif cursor < len(masked) and masked[cursor] == "." and not masked.startswith("...", cursor):
            cursor += 1
        else:
            break
        cursor = skip_space(masked, cursor)
        name_match = IDENT_RE.match(masked, cursor)
        if not name_match:
            break
        name = name_match.group(0)
        cursor = name_match.end()
        after = skip_space(masked, cursor)
        if after < len(masked) and masked[after] == "(":
            close = match_paren(masked, after)
            if close < 0:
                break
            members.append((name, after, close))
            index = close + 1
        else:
            members.append((name, -1, -1))
            index = cursor
    return members, index


def normalize_literal(kind: str, text: str) -> str:
    if kind != "regex":
        return text
    # 2026-10-17: separator classes such as [-_ ], \W, and a quantifier after
    # any separator (Bug.?1, Bug[-_ ]*1) are read as a separator.
    # A word boundary (\b) is dropped, so /\bBug \d/ is not read as "bBug".
    normalized = REGEX_SEPARATOR_CLASS_RE.sub(" ", text)
    normalized = re.sub(r"\\[bB]", "", normalized)
    normalized = re.sub(r"\\[sW]|\\x20|\\u0020|\\ ", " ", normalized)
    normalized = re.sub(
        r"(?:\\d|\[0-9\])(?:[+*?]|\{\d+(?:,\d*)?\})?", "0", normalized
    )
    normalized = normalized.replace("(?:", "")
    normalized = re.sub(r"[()]", "", normalized)
    normalized = re.sub(r"\\(.)", r"\1", normalized)
    normalized = QUANTIFIER_AFTER_SEPARATOR_RE.sub("", normalized)
    return normalized


def citation_literals(lexed: Lexed, start: int, end: int) -> list[str]:
    citations = []
    for _, _, kind, text in lexed.literals_in(start, end):
        if BUG_CITATION_RE.search(normalize_literal(kind, text)):
            citations.append(text)
    return citations


# ---------------------------------------------------------------------------
# Assertion classification
# ---------------------------------------------------------------------------

class Assertion:
    def __init__(self, offset: int, end: int) -> None:
        self.offset = offset
        self.end = end
        self.existence: str | None = None  # "present", "absent" or None
        self.citation: str | None = None   # FT2 citation text, when flagged
        self.trivial = False               # literal-only (FT1 rule 1)


def is_literal_only(masked_text: str) -> bool:
    """True when the (masked) text holds fixed values only: true, 1, 'a', /x/."""
    for token in TOKEN_RE.findall(masked_text):
        if token[0].isalpha() or token[0] in "_$":
            if token not in LITERAL_WORDS:
                return False
        elif token not in LITERAL_PUNCT:
            return False
    return True


def arg_spans(masked: str, open_index: int, close_index: int) -> list[tuple[int, int]]:
    """Top-level argument spans between a "(" and its ")"."""
    spans: list[tuple[int, int]] = []
    depth, start = 0, open_index + 1
    for index in range(open_index + 1, close_index):
        char = masked[index]
        if char in "([{":
            depth += 1
        elif char in ")]}":
            depth -= 1
        elif char == "," and depth == 0:
            spans.append((start, index))
            start = index + 1
    spans.append((start, close_index))
    return spans


def absence_check(matcher: str, value: str, negated: bool, subject: str) -> bool:
    """True when the assertion proves the text does NOT contain the citation.

    value is the matcher argument as written in the source, so a string such
    as "0" is not mistaken for the number 0.
    """
    index_only = (
        INDEX_METHOD_RE.search(subject) is not None
        and OTHER_CONTAINS_METHOD_RE.search(subject) is None
    )
    if index_only:
        # indexOf / lastIndexOf / search: -1 is absent, 0 is "starts with".
        if subject.startswith("!"):
            return False  # "!" on a position tests position 0, not absence
        base = (
            (matcher in EQUALITY_MATCHERS and value == "-1")
            or (matcher == "toBeLessThan" and value == "0")
            # Never true for a number: such a test fails, it cannot fake-pass.
            or matcher in {"toBeNull", "toBeUndefined"}
        )
        return base != negated
    base = False
    if matcher in {"toBeNull", "toBeFalsy", "toBeUndefined"}:
        base = True
    elif matcher in EQUALITY_MATCHERS and value in {"false", "null", "undefined", "-1", "0"}:
        base = True
    elif matcher == "toHaveLength" and value == "0":
        base = True
    if subject.startswith("!"):
        base = not base
    return base != negated


def classify_expect(lexed: Lexed, match: re.Match[str]) -> tuple[Assertion, int] | None:
    masked, source = lexed.masked, lexed.source
    arg_open = match.end() - 1
    arg_close = match_paren(masked, arg_open)
    if arg_close < 0:
        return None
    members, chain_end = parse_chain(masked, arg_close + 1)
    assertion = Assertion(match.start(), chain_end)
    called = [member for member in members if member[1] >= 0]
    if not called:
        return assertion, chain_end
    matcher, matcher_open, matcher_close = called[-1]
    negated = any(name == "not" for name, _, _ in members)
    subject_span = (arg_open, arg_close)
    matcher_span = (matcher_open, matcher_close)
    subject = masked[arg_open + 1:arg_close].strip()
    matcher_arg = masked[matcher_open + 1:matcher_close].strip()
    assertion.trivial = is_literal_only(subject) and all(
        is_literal_only(masked[open_index + 1:close_index])
        for _, open_index, close_index in called
    )

    # Values written the other way round: expect(true).toBe(existsSync(p)),
    # expect(-1).toBe(text.indexOf(...)). Read them in the usual order.
    if (
        matcher in EQUALITY_MATCHERS
        and is_literal_only(subject)
        and not is_literal_only(matcher_arg)
    ):
        subject_span, matcher_span = matcher_span, subject_span
        subject, matcher_arg = matcher_arg, subject
    matcher_value = source[matcher_span[0] + 1:matcher_span[1]].strip()

    # FT1: file-existence check?
    if EXISTS_CALL_RE.search(subject):
        if matcher in EXISTENCE_MATCHERS:
            says_true = matcher == "toBeTruthy" or (
                matcher in EQUALITY_MATCHERS
                and (matcher_value == "true" or ALL_TRUE_ARRAY_RE.match(matcher_value) is not None)
            )
            says_false = matcher == "toBeFalsy" or (
                matcher in EQUALITY_MATCHERS and matcher_value == "false"
            )
            if says_true or says_false:
                present = says_true != negated
                if subject.startswith("!"):
                    present = not present
                assertion.existence = "present" if present else "absent"
        elif (matcher == "toBeDefined" and not negated) or (
            matcher in {"toBeNull", "toBeUndefined"} and negated
        ):
            # existsSync always returns true or false, so this always passes
            # and checks nothing. 2026-10-17: counted as "exists".
            assertion.existence = "present"

    # FT2: contains-check on a bug citation?
    by_matcher = matcher in CONTAINS_MATCHERS or (
        matcher in HELPER_MATCHERS and STRING_HELPER_RE.search(matcher_arg) is not None
    )
    by_subject = CONTAINS_METHOD_RE.search(subject) is not None
    citations: list[str] = []
    if by_matcher:
        citations += citation_literals(lexed, *matcher_span)
    if by_subject:
        citations += citation_literals(lexed, *subject_span)
    if citations:
        if by_matcher and not by_subject:
            # toMatch / toContain / toMatchObject / stringContaining: .not means "absent".
            proves_absence = negated
        else:
            proves_absence = absence_check(matcher, matcher_value, negated, subject)
        if not proves_absence:
            assertion.citation = citations[0]
    return assertion, chain_end


def classify_assert(lexed: Lexed, match: re.Match[str]) -> tuple[Assertion, int] | None:
    masked, source = lexed.masked, lexed.source
    method = match.group(1) or ""
    arg_open = match.end() - 1
    arg_close = match_paren(masked, arg_open)
    if arg_close < 0:
        return None
    assertion = Assertion(match.start(), arg_close + 1)
    spans = arg_spans(masked, arg_open, arg_close)
    texts = [masked[start:end].strip() for start, end in spans]
    values = [source[start:end].strip() for start, end in spans]
    assertion.trivial = all(is_literal_only(text) for text in texts)
    first = texts[0]

    def citations_in(*indexes: int) -> list[str]:
        found: list[str] = []
        for index in indexes:
            if index < len(spans):
                found += citation_literals(lexed, spans[index][0], spans[index][1])
        return found

    if method in {"", "ok", "notOk"}:
        falsy = method == "notOk"
        if EXISTS_CALL_RE.search(first):
            present = not first.startswith("!")
            if falsy:
                present = not present
            assertion.existence = "present" if present else "absent"
        if CONTAINS_METHOD_RE.search(first):
            citations = citations_in(0)
            matcher = "toBeFalsy" if falsy else "toBeTruthy"
            if citations and not absence_check(matcher, "", False, first):
                assertion.citation = citations[0]
    elif method in ASSERT_EQUAL_METHODS or method in ASSERT_NOT_EQUAL_METHODS:
        negated = method in ASSERT_NOT_EQUAL_METHODS
        if len(spans) >= 2:
            subject_index, value_index = 0, 1
            if is_literal_only(texts[0]) and not is_literal_only(texts[1]):
                subject_index, value_index = 1, 0  # assert.equal(true, x)
            subject, value = texts[subject_index], values[value_index]
            if EXISTS_CALL_RE.search(subject) and value in {"true", "false"}:
                present = (value == "true") != negated
                if subject.startswith("!"):
                    present = not present
                assertion.existence = "present" if present else "absent"
            if CONTAINS_METHOD_RE.search(subject):
                citations = citations_in(subject_index)
                if citations and not absence_check("toBe", value, negated, subject):
                    assertion.citation = citations[0]
    elif method == "match":
        citations = citations_in(0, 1)
        if citations:
            assertion.citation = citations[0]
    return assertion, arg_close + 1


# ---------------------------------------------------------------------------
# Test-block discovery
# ---------------------------------------------------------------------------

def test_blocks(lexed: Lexed) -> list[tuple[int, int, int]]:
    """Return (head_offset, open_paren, close_paren) for each test block."""
    masked = lexed.masked
    blocks = []
    for head in TEST_HEAD_RE.finditer(masked):
        modifiers = [
            part.strip() for part in head.group(1).split(".") if part.strip()
        ]
        if any(modifier not in TEST_MODIFIERS for modifier in modifiers):
            continue  # test.describe, test.step, test.use and so on
        if "todo" in modifiers:
            continue
        cursor = skip_space(masked, head.end())
        if any(modifier in MODIFIERS_WITH_ARGUMENT for modifier in modifiers):
            literal = lexed.literal_by_start.get(cursor)
            if cursor < len(masked) and masked[cursor] == "(":
                close = match_paren(masked, cursor)
                if close < 0:
                    continue
                cursor = skip_space(masked, close + 1)
            elif literal is not None and literal[2] == "template":
                cursor = skip_space(masked, literal[1])
            else:
                continue
        if cursor >= len(masked) or masked[cursor] != "(":
            continue
        close = match_paren(masked, cursor)
        if close < 0:
            continue
        blocks.append((head.start(), cursor, close))
    return blocks


def scan_file(relative: str, source: str) -> tuple[list[str], int]:
    lexed = Lexed(source)
    masked = lexed.masked
    line_starts = [0] + [index + 1 for index, char in enumerate(source) if char == "\n"]

    def line_of(offset: int) -> int:
        return bisect.bisect_right(line_starts, offset)

    violations: list[str] = []
    reported_citations: set[int] = set()
    blocks = test_blocks(lexed)
    for head_offset, open_index, close_index in blocks:
        assertions: list[Assertion] = []
        for pattern, classify in ((EXPECT_RE, classify_expect), (ASSERT_RE, classify_assert)):
            for found in pattern.finditer(masked, open_index + 1, close_index):
                result = classify(lexed, found)
                if result is not None:
                    assertions.append(result[0])

        for assertion in assertions:
            if assertion.citation is not None and assertion.offset not in reported_citations:
                reported_citations.add(assertion.offset)
                shown = assertion.citation.strip()
                if len(shown) > 60:
                    shown = shown[:57] + "..."
                violations.append(
                    f"{relative}:{line_of(assertion.offset)} FT2 bug-citation assertion: "
                    f"checks that text contains \"{shown}\". A Bug ID inside a file "
                    "proves nothing. Assert the behaviour the fix changed, or use "
                    "it.todo('<reason>')."
                )

        # FT1 rule 1 (2026-10-17): literal-only assertions such as
        # expect(true).toBe(true) check nothing, so they are left out here,
        # together with any call written inside them.
        meaningful = [assertion for assertion in assertions if not assertion.trivial]
        if not meaningful:
            continue
        if any(assertion.existence is None for assertion in meaningful):
            continue
        if not any(assertion.existence == "present" for assertion in meaningful):
            continue
        body = list(masked[open_index + 1:close_index])
        for assertion in assertions:
            if assertion.trivial:
                for index in range(max(assertion.offset, open_index + 1), min(assertion.end, close_index)):
                    if body[index - open_index - 1] != "\n":
                        body[index - open_index - 1] = " "
        calls = {
            name for name in CALL_RE.findall("".join(body))
            if name not in CALL_KEYWORDS
        }
        if calls - PATH_ONLY_CALLS:
            continue
        violations.append(
            f"{relative}:{line_of(head_offset)} FT1 existence-only test: every "
            "assertion is an existsSync(...) check and the test runs no other "
            "code. Assert real behaviour or use it.todo('<reason>')."
        )
    return violations, len(blocks)


# ---------------------------------------------------------------------------
# File discovery and main
# ---------------------------------------------------------------------------

def is_skipped(relative: str) -> bool:
    return any(part in SKIP_DIRECTORIES for part in relative.split("/")[:-1])


def is_test_path(relative: str) -> bool:
    """A file some test runner here can run as a test (see WHAT IS SCANNED)."""
    parts = relative.split("/")
    if TEST_NAME_RE.search(parts[-1]):
        return True
    return TESTS_FOLDER in parts[:-1] and parts[-1].endswith(SOURCE_SUFFIXES)


def test_paths(repo_root: Path) -> list[str]:
    listed = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=repo_root,
        capture_output=True,
        check=False,
    )
    if listed.returncode == 0:
        names = listed.stdout.decode("utf-8", errors="surrogateescape").split("\0")
        return sorted({
            name for name in names
            if name
            and is_test_path(name)
            and not is_skipped(name)
            and (repo_root / name).is_file()
        })

    found: list[str] = []
    for directory, directory_names, file_names in os.walk(repo_root):
        directory_names[:] = sorted(
            name for name in directory_names if name not in SKIP_DIRECTORIES
        )
        for file_name in sorted(file_names):
            relative = (Path(directory) / file_name).relative_to(repo_root).as_posix()
            if is_test_path(relative):
                found.append(relative)
    return found


def main() -> int:
    repo_root = Path.cwd()
    all_violations: list[str] = []
    files_with_violations = 0
    block_count = 0
    paths = test_paths(repo_root)
    for relative in paths:
        try:
            source = (repo_root / relative).read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as error:
            print(f"Gate C VIOLATION (no-fake-tests) [BLOCKING]: cannot read {relative}: {error}")
            return 2
        violations, blocks = scan_file(relative, source)
        block_count += blocks
        if violations:
            files_with_violations += 1
            all_violations.extend(violations)

    if all_violations:
        print("Gate C VIOLATION (no-fake-tests) [BLOCKING]:")
        print(
            f"{len(all_violations)} fake-test assertion(s) or block(s) in "
            f"{files_with_violations} file(s). Rules: header of "
            "scripts/gates/c-no-fake-tests.py."
        )
        for violation in all_violations:
            print(violation)
        return 1

    print(
        "Gate C - no-fake-tests [BLOCKING]: "
        f"OK ({len(paths)} test files, {block_count} test blocks scanned)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
