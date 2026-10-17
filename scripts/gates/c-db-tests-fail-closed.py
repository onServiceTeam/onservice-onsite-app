#!/usr/bin/env python3
"""Gate C article "db-tests-fail-closed": real-database tests never skip silently in CI.

Added 2026-10-17 under decision D40 (.ai-coder/governance/
STANDARD-V2-ADOPTION.md, item AD-09: "the fail-closed guard on the database
test files that lack it"). Mode: BLOCKING (scripts/gates/MODES.json,
gate_c_articles.db-tests-fail-closed). Wired into scripts/gates/
c-constitution.sh. Self-test: scripts/gates/__tests__/
gate-c-db-tests-fail-closed.test.sh. This file is a gate script. Changing it
follows the gate-change rule in .ai-coder/governance/GATE-AMENDMENTS.md.

WHY
  The real-database tests pick "it" or "it.skip" from a flag that is true
  only when DATABASE_URL points at a local *_test database:
      const safeDatabase = (() => { ... })();
      const sqlIt = safeDatabase ? it : it.skip;
  On a developer PC with no database that skip is fine. In CI it is not: if
  DATABASE_URL were missing or wrong there, every such test would be skipped
  and the CI job would still be green. The guard that prevents this, used
  since OPS-478, is a top-level line that stops the test file in CI:
      if (process.env.CI && !safeDatabase) {
        throw new Error('... requires the isolated localhost *_test PostgreSQL service in CI.');
      }
  On 2026-10-17 four test files had the skip but not the guard
  (bug-ops-387, bug-ops-390, bug-ops-408, bug-ux-350). They were given the
  guard in the same change that added this article.

WHAT IS SCANNED
  Every tracked file, and every untracked file git does not ignore, whose
  name ends in .js, .jsx, .ts, .tsx, .mjs or .cjs. Folders named
  node_modules, dist, build, coverage, test-results, .expo and .git are
  skipped. Without git, the folders are walked instead.

RULE DB1
  A file is in scope when it contains the text DATABASE_URL and a
  conditional skip of the form
      <flag> ? it : it.skip        (it, test or describe on either side)
  For every <flag> used that way, the file must also have a guard line that
  starts at the beginning of a line (top level, no indent):
      if (process.env.CI && !<flag>) throw ...
      if (process.env.CI && !<flag>) {      with throw as the next statement
  Lines that start with //, /* or * are comments and are ignored, so a
  commented-out guard does not count.

LIMITS (stated plainly)
  - It reads text. It does not parse JavaScript or TypeScript.
  - Only files that name DATABASE_URL are in scope. A database test that gets
    its connection some other way is not seen.
  - Only the "<flag> ? it : it.skip" form is seen. A test that returns early
    when there is no database, and so passes without checking anything, is
    not seen.
  - It checks that the guard is there. It does not check how the flag is
    computed, or that CI really provides the database (ci.yml does today:
    the api-check job's postgres service).
  - There is no inline allow marker. A false positive goes through the
    gate-change rule in .ai-coder/governance/GATE-AMENDMENTS.md.

EXIT CODES
  0 = no violations. 1 = violations found. 2 = a file could not be read.
"""

from __future__ import annotations

import os
from pathlib import Path
import re
import subprocess
import sys


SOURCE_SUFFIXES = (".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs")
SKIP_DIRECTORIES = {
    ".expo",
    ".git",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "test-results",
}

SKIP_TERNARY_RE = re.compile(
    r"(?<![\w$.])([A-Za-z_$][\w$]*)\s*\?\s*(?:it|test|describe)\s*:\s*"
    r"(?:it|test|describe)\s*\.\s*skip\b"
)
COMMENT_LINE_RE = re.compile(r"^[ \t]*(?://|/\*|\*)")


def guard_re(flag: str) -> re.Pattern[str]:
    return re.compile(
        r"^if\s*\(\s*process\.env\.CI\s*&&\s*!\s*" + re.escape(flag)
        + r"\s*\)\s*(?:\{\s*)?throw\b",
        re.MULTILINE,
    )


def without_comment_lines(source: str) -> str:
    """Blank every line that starts with //, /* or *, keeping line numbers."""
    return "\n".join(
        "" if COMMENT_LINE_RE.match(line) else line
        for line in source.split("\n")
    )


def scan_file(relative: str, source: str) -> tuple[list[str], int, int]:
    """Return (violations, 1 if the file is in scope else 0, guarded flag count)."""
    if "DATABASE_URL" not in source:
        return [], 0, 0
    code = without_comment_lines(source)
    first_use: dict[str, int] = {}
    for found in SKIP_TERNARY_RE.finditer(code):
        flag = found.group(1)
        if flag not in first_use:
            first_use[flag] = code.count("\n", 0, found.start()) + 1
    if not first_use:
        return [], 0, 0

    violations = []
    guarded = 0
    for flag, line in sorted(first_use.items(), key=lambda item: item[1]):
        if guard_re(flag).search(code):
            guarded += 1
            continue
        violations.append(
            f"{relative}:{line} DB1 database test can skip silently in CI: "
            f"'{flag} ? it : it.skip' has no top-level "
            f"'if (process.env.CI && !{flag}) throw ...' guard. Without it, "
            "CI with a missing or wrong DATABASE_URL skips these tests and "
            "stays green. Add the guard (see bug-ops-478-bounded-migration-"
            "runner.test.ts)."
        )
    return violations, 1, guarded


def is_skipped(relative: str) -> bool:
    return any(part in SKIP_DIRECTORIES for part in relative.split("/")[:-1])


def source_paths(repo_root: Path) -> list[str]:
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
            if name.endswith(SOURCE_SUFFIXES)
            and not is_skipped(name)
            and (repo_root / name).is_file()
        })

    found: list[str] = []
    for directory, directory_names, file_names in os.walk(repo_root):
        directory_names[:] = sorted(
            name for name in directory_names if name not in SKIP_DIRECTORIES
        )
        for file_name in sorted(file_names):
            if file_name.endswith(SOURCE_SUFFIXES):
                found.append((Path(directory) / file_name).relative_to(repo_root).as_posix())
    return found


def main() -> int:
    repo_root = Path.cwd()
    all_violations: list[str] = []
    in_scope = 0
    guarded = 0
    paths = source_paths(repo_root)
    for relative in paths:
        try:
            # Only ASCII patterns are searched, so undecodable bytes are
            # replaced instead of failing the scan.
            source = (repo_root / relative).read_text(encoding="utf-8", errors="replace")
        except OSError as error:
            print(f"Gate C VIOLATION (db-tests-fail-closed) [BLOCKING]: cannot read {relative}: {error}")
            return 2
        violations, scoped, guarded_here = scan_file(relative, source)
        in_scope += scoped
        guarded += guarded_here
        all_violations.extend(violations)

    if all_violations:
        print("Gate C VIOLATION (db-tests-fail-closed) [BLOCKING]:")
        print(
            f"{len(all_violations)} database test skip(s) without a CI guard. "
            "Rules: header of scripts/gates/c-db-tests-fail-closed.py."
        )
        for violation in all_violations:
            print(violation)
        return 1

    print(
        "Gate C - db-tests-fail-closed [BLOCKING]: "
        f"OK ({in_scope} database test file(s) with a skip, {guarded} skip flag(s), "
        f"all guarded; {len(paths)} source files scanned)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
