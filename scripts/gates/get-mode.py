#!/usr/bin/env python3
"""
Look up a fragment's or article's mode from scripts/gates/MODES.json.

Usage:
  python3 scripts/gates/get-mode.py gate_a_fragments a-cross-source-routes
  python3 scripts/gates/get-mode.py gate_c_articles article-7.1-no-axios

Prints "BLOCKING" or "REPORT" to stdout. Exits 0 on success.

If the category or key is missing, prints "BLOCKING" and exits 0 (fail-closed
default per the constitution: unknown fragments must be treated as binding so
that a missing MODES.json entry cannot silently demote a check to REPORT).
The fail-closed default is also why this script does not fail on a malformed
MODES.json — a broken file shouldn't hide violations.

This script is the single source of truth lookup for run-gate-a.sh,
c-constitution.sh, and any other gate consumer. Do not duplicate the lookup
logic elsewhere.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 3:
        print("BLOCKING")
        return 0

    category = sys.argv[1]
    key = sys.argv[2]

    modes_path = Path(__file__).resolve().parent / "MODES.json"
    if not modes_path.exists():
        # Fail-closed: missing MODES means treat as BLOCKING
        print("BLOCKING")
        return 0

    try:
        modes = json.loads(modes_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        print("BLOCKING")
        return 0

    entry = modes.get(category, {}).get(key)
    if not isinstance(entry, dict):
        print("BLOCKING")
        return 0

    mode = entry.get("mode", "BLOCKING")
    if mode not in ("BLOCKING", "REPORT"):
        print("BLOCKING")
        return 0

    print(mode)
    return 0


if __name__ == "__main__":
    sys.exit(main())
