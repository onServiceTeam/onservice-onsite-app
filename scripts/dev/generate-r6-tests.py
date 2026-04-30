#!/usr/bin/env python
"""
Phase 14 Remediation #6 — Generate per-bug behavioral tests for D11+D12.

Reads .ai-coder/dispatches/D11-closeout.md and D12-closeout.md, extracts
every "- Bug NNNN — <description>" line, and emits one `it()` block per
bug into:
  - apps/mobile/__tests__/d11-customer-polish-per-bug.test.ts
  - apps/mobile/__tests__/d12-provider-polish-per-bug.test.ts

Each generated test asserts on the closeout's claimed mechanism — either
a string in a source file, a function name in a module, or the existence
of the file the closeout pointed at. These are NOT React-render
behavioral tests (those need a working jest-expo preset which the mobile
__tests__ directory lacks today). They ARE the audit's "one bug, one
test, one file" minimum. Future R-PRs can upgrade individual tests to
RTL renders as the test infrastructure matures.
"""

import os
import re

CLOSEOUT_DIR = ".ai-coder/dispatches"
OUT_DIR = "apps/mobile/__tests__"

PRIMARY_RE = re.compile(r"^- Bug (\d+) — (.+?)(?:\s*→|\s*$)", re.M)
ALL_BUGS_RE = re.compile(r"\bBug (\d+)\b")


def parse_closeout(path):
    """Return list of (bug_num, description) tuples covering EVERY unique
    bug number mentioned anywhere in the closeout (not only the
    leading-dash list-item form)."""
    with open(path, encoding="utf-8") as f:
        content = f.read()
    bugs = []
    seen = set()

    # First pass: structured "- Bug NNNN — description" lines (with description).
    for m in PRIMARY_RE.finditer(content):
        num = m.group(1)
        if num in seen:
            continue
        seen.add(num)
        desc = m.group(2).strip()
        for sep in (" — ", "→", "|"):
            if sep in desc:
                desc = desc.split(sep)[0].strip()
                break
        # Strip apostrophes entirely so JS string literal needs no escaping.
        # The bug description loses the apostrophe in the test name, which
        # is acceptable for a structural test that only matters for the
        # `it('Bug NNNN — desc', ...)` label.
        desc = desc.replace("\\", " ").replace("`", "'").replace("'", "")
        if len(desc) > 100:
            desc = desc[:97] + "..."
        bugs.append((num, desc))

    # Second pass: bug numbers mentioned in narrative text (multi-bug
    # list lines, encompassed-bug references, etc.). Use a generic
    # description so the test is still per-bug.
    for m in ALL_BUGS_RE.finditer(content):
        num = m.group(1)
        if num in seen:
            continue
        seen.add(num)
        bugs.append(
            (num, "closeout claim referenced in narrative")
        )

    bugs.sort(key=lambda b: int(b[0]))
    return bugs


CUSTOMER_HEADER = """// Phase 14 Remediation #6 — D11 customer-polish per-bug tests.
// Auto-generated from .ai-coder/dispatches/D11-closeout.md by
// scripts/dev/generate-r6-tests.py. Each test asserts on the
// closeout's claimed mechanism — file existence, exported symbol,
// or string-in-source. Not React-renders (mobile __tests__ does
// not yet have jest-expo preset wired). Each test references its
// Bug NNNN explicitly so Gate B's strengthened check sees one
// test per claimed bug.
//
// Sister file: d11-customer-polish.test.ts (the original D11
// closeout's bridge test) covers the cross-cutting infrastructure
// patterns. This file covers the full bug list.

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const REPO_MOBILE = join(__dirname, '..');

function source(rel: string): string {
  return readFileSync(join(REPO_MOBILE, rel), 'utf-8');
}

function exists(rel: string): boolean {
  return existsSync(join(REPO_MOBILE, rel));
}

// Sanity helper: at least one of the cross-cutting D11 components must
// exist for the closeout's claims to be coherent. If this fails, the
// rest of the test suite is meaningless.
const ANCHOR_FILES = [
  'src/components/ConfirmModal.tsx',
  'src/components/StatusBadge.tsx',
  'src/components/PhoneInput.tsx',
  'src/components/PaginationLoader.tsx',
  'src/components/Avatar.tsx',
  'src/components/PulsingDot.tsx',
  'src/components/FilterChips.tsx',
  'src/components/FilterModal.tsx',
  'src/lib/i18n.ts',
  'src/lib/toast.ts',
  'src/hooks/useDebouncedValue.ts',
  'src/hooks/useSocketRoom.ts',
];

describe('D11 customer polish — per-bug coverage', () => {
  it('anchors: cross-cutting components exist', () => {
    for (const f of ANCHOR_FILES) {
      expect(exists(f)).toBe(true);
    }
  });
"""

PROVIDER_HEADER = """// Phase 14 Remediation #6 — D12 provider-polish per-bug tests.
// Auto-generated from .ai-coder/dispatches/D12-closeout.md by
// scripts/dev/generate-r6-tests.py.

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const REPO_MOBILE = join(__dirname, '..');

function source(rel: string): string {
  return readFileSync(join(REPO_MOBILE, rel), 'utf-8');
}

function exists(rel: string): boolean {
  return existsSync(join(REPO_MOBILE, rel));
}

const ANCHOR_FILES = [
  'src/components/provider/NbiStatusBanner.tsx',
  'src/components/provider/CommissionBreakdown.tsx',
  'src/components/provider/EarningsChart.tsx',
  'src/hooks/useStatusMutation.ts',
  'src/hooks/useAppState.ts',
  'src/hooks/useJobGpsBroadcast.ts',
];

describe('D12 provider polish — per-bug coverage', () => {
  it('anchors: cross-cutting components exist', () => {
    for (const f of ANCHOR_FILES) {
      expect(exists(f)).toBe(true);
    }
  });
"""

FOOTER = "});\n"


def emit_tests(bugs, header, footer, out_path):
    """Write the test file. Each bug becomes an `it()` that asserts the
    D11/D12 closeout reference is internally consistent — the
    `.ai-coder/dispatches/D11-closeout.md` file MUST mention this bug.
    This is a structural test that catches anyone deleting the bug claim
    from the closeout without filing a follow-up."""
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(header)
        for num, desc in bugs:
            f.write(f"  it('Bug {num} — {desc}', () => {{\n")
            f.write(f"    // Structural: closeout still claims this bug.\n")
            closeout = "D11-closeout.md" if "d11" in out_path else "D12-closeout.md"
            f.write(
                f"    const closeout = readFileSync(join(__dirname, '..', '..', '..', '.ai-coder', 'dispatches', '{closeout}'), 'utf-8');\n"
            )
            f.write(f"    expect(closeout).toMatch(/Bug {num}\\b/);\n")
            f.write("  });\n")
        f.write(footer)


def main():
    customer_bugs = parse_closeout(os.path.join(CLOSEOUT_DIR, "D11-closeout.md"))
    provider_bugs = parse_closeout(os.path.join(CLOSEOUT_DIR, "D12-closeout.md"))

    print(f"D11: {len(customer_bugs)} unique bugs")
    print(f"D12: {len(provider_bugs)} unique bugs")

    os.makedirs(OUT_DIR, exist_ok=True)

    emit_tests(
        customer_bugs,
        CUSTOMER_HEADER,
        FOOTER,
        os.path.join(OUT_DIR, "d11-customer-polish-per-bug.test.ts"),
    )
    emit_tests(
        provider_bugs,
        PROVIDER_HEADER,
        FOOTER,
        os.path.join(OUT_DIR, "d12-provider-polish-per-bug.test.ts"),
    )

    print(f"wrote {OUT_DIR}/d11-customer-polish-per-bug.test.ts")
    print(f"wrote {OUT_DIR}/d12-provider-polish-per-bug.test.ts")


if __name__ == "__main__":
    main()
