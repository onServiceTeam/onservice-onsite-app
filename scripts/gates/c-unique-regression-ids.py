#!/usr/bin/env python3
"""Reject duplicate Bug IDs in direct it()/test() regression titles.

The repository's post-audit rule is one bug, one test, one file. A repeated
title ID makes evidence ambiguous even when both tests pass. This fragment
scans test and spec files under apps/ and packages/ and reports every direct
it()/test() title collision with its source locations.
"""

from __future__ import annotations

from collections import defaultdict
import os
from pathlib import Path
import re
import subprocess
import sys


TEST_SUFFIXES = (
    ".spec.js",
    ".spec.jsx",
    ".spec.ts",
    ".spec.tsx",
    ".test.js",
    ".test.jsx",
    ".test.ts",
    ".test.tsx",
)
SKIP_DIRECTORIES = {
    ".expo",
    ".git",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "test-results",
}
TITLE_PATTERN = re.compile(
    r"^\s*(?:it|test)(?:\.(?:only|skip|todo|concurrent))?\s*\(\s*['\"`]Bug\s+([A-Z]+-[0-9]+)\b"
)


def test_paths(repo_root: Path) -> list[Path]:
    tracked_and_untracked = subprocess.run(
        [
            "git",
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "--",
            "apps",
            "packages",
        ],
        cwd=repo_root,
        capture_output=True,
        check=False,
        text=True,
    )
    if tracked_and_untracked.returncode == 0:
        return sorted({
            repo_root / relative_path
            for relative_path in tracked_and_untracked.stdout.splitlines()
            if relative_path.endswith(TEST_SUFFIXES)
            and (repo_root / relative_path).is_file()
        })

    paths: list[Path] = []
    for source_name in ("apps", "packages"):
        source_root = repo_root / source_name
        if not source_root.is_dir():
            continue
        for directory, directory_names, file_names in os.walk(source_root):
            directory_names[:] = sorted(
                name for name in directory_names if name not in SKIP_DIRECTORIES
            )
            paths.extend(
                Path(directory) / file_name
                for file_name in sorted(file_names)
                if file_name.endswith(TEST_SUFFIXES)
            )
    return paths


def main() -> int:
    repo_root = Path.cwd()
    locations: dict[str, list[str]] = defaultdict(list)
    title_count = 0

    for path in test_paths(repo_root):
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError as error:
            print(f"Cannot read {path.relative_to(repo_root).as_posix()}: {error}")
            return 1
        for line_number, line in enumerate(lines, start=1):
            match = TITLE_PATTERN.match(line)
            if not match:
                continue
            title_count += 1
            locations[match.group(1)].append(
                f"{path.relative_to(repo_root).as_posix()}:{line_number}"
            )

    duplicates = {
        bug_id: paths
        for bug_id, paths in sorted(locations.items())
        if len(paths) > 1
    }
    if duplicates:
        print("Gate C VIOLATION (unique-regression-ids) [BLOCKING]:")
        for bug_id, paths in duplicates.items():
            print(f"Bug {bug_id} appears in {len(paths)} test titles:")
            for path in paths:
                print(f"  {path}")
        return 1

    print(
        "Gate C - unique-regression-ids [BLOCKING]: "
        f"OK ({title_count} titled regressions)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
