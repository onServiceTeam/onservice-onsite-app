# PART 4 — GATE HARDENING REFERENCE

This is the standalone reference for the five-gate enforcement system installed in Phase 14 Dispatch 03 and exercised across Dispatches 04-14. It serves three audiences:

1. **The AI coder** — when implementing a new feature, the AI coder consults this document to know which gates apply, how to write code that passes them, and how to add a 16th gate when a new architectural invariant emerges.
2. **Ken** — when reviewing a PR, this document explains what each gate checks for and what failure means.
3. **A future maintainer** — when the AI coder is replaced, this document is the operating manual for the gate system that prevents architectural drift.

The five gates collectively answer "is this PR safe to merge?" with a binary answer derived from automated checks. Phase 13's reconciliation found 9 phases of falsified gate logs because the original gates ran in REPORT mode (logging without enforcing). Phase 14 moved them to BLOCKING mode via GitHub branch protection. **No PR can merge with a failing gate.** This is the structural change that prevents fake-green from recurring.

---

# Why five gates and not one big check

Each gate addresses a distinct failure mode. A monolithic "is this code good?" check would fail to catch most of the real failures because no single check covers them all. The decomposition:

- **Gate A — Cross-source-of-truth.** Catches drift between sources that should match. Multiple files declaring the same value (cancellation policy in 4 places, brand color in 3 places, founding tier committed but not in code).
- **Gate B — Bug-deferral / completeness.** Catches fake-green claims. A dispatch closeout claims 14 bugs fixed; Gate B verifies each has both a code change and a test referencing the bug number.
- **Gate C — Constitution compliance.** Catches violations of declared architectural rules (no console.log, no axios, no emoji icons, money mutations inside transactions).
- **Gate D — Visual screenshots.** Catches visual regressions (the screen functions but looks broken; overlapping elements, missing icons, wrong colors). Pure functional tests miss this.
- **Gate E — Mutation testing.** Catches insufficient test assertions (tests pass but would also pass with broken code because the tests don't actually assert).

A PR can pass Gate A (no drift), Gate C (no banned patterns), Gate D (visually correct), and Gate E (tests assert correctly) but fail Gate B (closeout claims a bug fixed but no test references it). That's the scenario where each gate earns its place. The redundancy is intentional.

---

# Gate A — Cross-source-of-truth

## What it checks

Every architectural invariant where a value or pattern must match across multiple files. Each invariant is a separate fragment script. The aggregator runs all fragments; failure of any fragment fails the gate.

## Fragment scripts (10 total at end of Phase 14)

### `scripts/gates/a-cross-source-cancellation-policy.sh`

Bug 1170 + 1198 fix. The cancellation policy was declared in 4 places. After Dispatch 02, server is canonical and clients consume via `<CancellationPolicyTable>` component.

```bash
#!/usr/bin/env bash
set -euo pipefail

# No hardcoded cancellation percent strings outside CancellationPolicyTable component
violations=$(grep -rE '(beforeMatch|afterMatch|afterPayment|afterEnRoute|24h|48h).*[0-9]+%|refund_percent.*=.*[0-9]+' \
  apps/mobile/app/ apps/mobile/src/ apps/admin/src/ 2>/dev/null \
  | grep -v ".test." \
  | grep -v "CancellationPolicyTable" \
  | grep -v "//.*comment" \
  | grep -v "// gate-a-allowed:" \
  || true)

if [ -n "$violations" ]; then
  echo "GATE A VIOLATION (Bug 1170): hardcoded cancellation percentages outside CancellationPolicyTable"
  echo "$violations"
  exit 1
fi
echo "Gate A — cancellation policy single source: OK"
```

### `scripts/gates/a-cross-source-brand-color.sh`

Bug 1324 fix. Brand primary `#1B3A4B` everywhere; old hex values forbidden.

```bash
#!/usr/bin/env bash
set -euo pipefail

old_colors=("#0066FF" "#0F62FE" "0066ff" "0f62fe")
fail=0
for color in "${old_colors[@]}"; do
  hits=$(grep -rE "$color" apps/ packages/ \
    --include="*.ts" --include="*.tsx" --include="*.css" \
    2>/dev/null | grep -v "design-tokens/" || true)
  if [ -n "$hits" ]; then
    echo "GATE A VIOLATION (Bug 1324): old brand color $color found"
    echo "$hits"
    fail=1
  fi
done
test $fail -eq 0 && echo "Gate A — brand color single source: OK" || exit 1
```

### `scripts/gates/a-cross-source-routes.sh`

Bug 1185 fix. All navigation uses `Routes` registry constants, never raw path strings.

```bash
#!/usr/bin/env bash
set -euo pipefail

violations=$(grep -rE "router\.(push|replace)\(['\"]\/" \
  apps/mobile/app/ apps/mobile/src/ \
  --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v ".test." \
  | grep -v "// gate-a-allowed:" \
  || true)

if [ -n "$violations" ]; then
  echo "GATE A VIOLATION (Bug 1185): raw path strings in router.push/replace; use Routes registry"
  echo "$violations"
  exit 1
fi
echo "Gate A — routes registry: OK"
```

### `scripts/gates/a-cross-source-tier-criteria.sh`

Bug 974 + 1247 fix. Tier criteria from server `/suki/provider-tiers`, never hardcoded in client.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Catch hardcoded tier requirement constants in client code
violations=$(grep -rE "(VERIFIED_TIER_JOBS|PRO_TIER_JOBS|ELITE_TIER_RATING|FOUNDING_TIER_).*=.*[0-9]" \
  apps/mobile/ apps/admin/ \
  --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v ".test." \
  | grep -v "// gate-a-allowed:" \
  || true)

if [ -n "$violations" ]; then
  echo "GATE A VIOLATION (Bug 974): hardcoded tier criteria in client code"
  echo "$violations"
  exit 1
fi
echo "Gate A — tier criteria from server: OK"
```

### `scripts/gates/a-cross-source-no-axios.sh`

Bug 1271 fix. Constitution Article 7.1: native fetch wrapper only, no axios.

```bash
#!/usr/bin/env bash
set -euo pipefail

violations=$(grep -rE "import.*from\s+['\"]axios['\"]|require\(['\"]axios['\"]\)" \
  apps/ packages/ \
  --include="*.ts" --include="*.tsx" 2>/dev/null \
  || true)

if [ -n "$violations" ]; then
  echo "GATE A VIOLATION (Bug 1271): axios import detected"
  echo "$violations"
  exit 1
fi
echo "Gate A — no axios: OK"
```

### `scripts/gates/a-cross-source-no-emoji-icons.sh`

Constitution Article 4.6 fix. No emoji as iconography in components or screens.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Allowed: emoji in CMS content, in tests, in scripts, in docs
# Disallowed: emoji as visual replacement for icons in component JSX or status maps

# Use Python for reliable emoji detection across encodings
violations=$(python3 -c "
import re, os, sys

EMOJI_RE = re.compile(
    '[\U0001F300-\U0001F9FF'    # symbols, pictographs, transport, etc.
    '\U00002600-\U000027BF'      # misc symbols, dingbats
    '\U0001F000-\U0001F02F'      # mahjong, etc.
    ']'
)

for root in ['apps/mobile/src/config', 'apps/mobile/src/components',
             'apps/mobile/app', 'apps/admin/src/components',
             'apps/admin/src/pages']:
    if not os.path.isdir(root): continue
    for dirpath, _, files in os.walk(root):
        for f in files:
            if not f.endswith(('.ts', '.tsx')): continue
            if '.test.' in f: continue
            p = os.path.join(dirpath, f)
            try:
                with open(p, encoding='utf-8') as fh:
                    for ln, line in enumerate(fh, 1):
                        if '// gate-a-allowed:' in line: continue
                        if 'emoji' in line.lower() and '//' in line: continue
                        if EMOJI_RE.search(line):
                            print(f'{p}:{ln}: {line.strip()}')
            except Exception:
                pass
" || true)

if [ -n "$violations" ]; then
  echo "GATE A VIOLATION (Article 4.6): emoji as iconography"
  echo "$violations" | head -20
  exit 1
fi
echo "Gate A — no emoji icons: OK"
```

### `scripts/gates/a-cross-source-no-google-maps-placeholder.sh`

Bug 1286 fix. Production builds must not ship `YOUR_GOOGLE_MAPS_API_KEY` placeholder.

```bash
#!/usr/bin/env bash
set -euo pipefail

if grep -r "YOUR_GOOGLE_MAPS_API_KEY" apps/mobile/ 2>/dev/null; then
  echo "GATE A VIOLATION (Bug 1286): Google Maps placeholder found"
  exit 1
fi
echo "Gate A — no Google Maps placeholder: OK"
```

### `scripts/gates/a-cross-source-hashes-immutable.sh`

Phase 13 reconciliation artifact preservation. HASHES-CORRECTED.sha256 files are historical records and never modified going forward.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Defaults to comparing against origin/main if BASE_REF unset
BASE_REF=${BASE_REF:-origin/main}

modified=$(git diff --name-only "$BASE_REF"..HEAD -- '.ai-coder/phase-*/HASHES-CORRECTED.sha256' 2>/dev/null || true)
if [ -n "$modified" ]; then
  echo "GATE A VIOLATION: HASHES-CORRECTED files are immutable historical records"
  echo "$modified"
  exit 1
fi
echo "Gate A — historical hashes immutable: OK"
```

### `scripts/gates/a-cross-source-no-client-money.sh`

Bug 175/176/208/261 etc. fix from Dispatch 05. No money values accepted from clients in any Zod schema.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Reject any Zod schema accepting money from clients
violations=$(grep -rEn "(servicePrice|totalAmount|totalAmountCents|addonPrice|discountValue|discountAmount|priceCents)\s*:\s*z\.(number|coerce\.number)" \
  packages/api/src/validators/ packages/api/src/routes/ 2>/dev/null \
  | grep -v "// gate-a-allowed:" \
  | grep -v "adminWalletAdjustmentSchema" \
  | grep -v "createAddonSchema\|updateAddonSchema" \
  || true)

if [ -n "$violations" ]; then
  echo "GATE A VIOLATION (Bug 175/176/208): schema accepts money from client"
  echo "$violations"
  exit 1
fi
echo "Gate A — no client money in schemas: OK"
```

### `scripts/gates/a-cross-source-no-siguradoshield.sh`

Bug 538 + chain. After Dispatch 04 Option A (pull), SiguradoShield references must not appear in code.

```bash
#!/usr/bin/env bash
set -euo pipefail

violations=$(grep -rEi "siguradoshield|premiumProtection|propertyDamage|siguradoShieldDeductible" \
  apps/ packages/ \
  --include="*.ts" --include="*.tsx" --include="*.json" --include="*.md" 2>/dev/null \
  | grep -v "LAUNCH-LIMITATIONS.md" \
  | grep -v "/decisions/D04-siguradoshield.md" \
  | grep -v "PART-3-BUG-REMEDIATION" \
  | grep -v "STRATEGIC-DECISIONS-LOG" \
  || true)

if [ -n "$violations" ]; then
  echo "GATE A VIOLATION (Bug 538/Option A): SiguradoShield references found in code"
  echo "$violations"
  exit 1
fi
echo "Gate A — no SiguradoShield: OK"
```

## Aggregator script

```bash
#!/usr/bin/env bash
# scripts/gates/run-gate-a.sh
set -euo pipefail
echo "=== Gate A: Cross-source-of-truth ==="
fail=0
for script in scripts/gates/a-cross-source-*.sh; do
  if ! bash "$script"; then fail=1; fi
done
if [ "$fail" -eq 1 ]; then
  echo "Gate A FAILED — cross-source drift detected"
  exit 1
fi
echo "Gate A PASSED"
```

## Adding a new Gate A fragment

When a new architectural invariant emerges (e.g., "all dates display in Asia/Manila timezone"), add a new fragment:

1. Create `scripts/gates/a-cross-source-<topic>.sh` following the pattern.
2. The script must `set -euo pipefail`, exit non-zero on violation, exit 0 on pass.
3. Print clear violation lines (file:line:context) for human debugging.
4. Support `// gate-a-allowed:` inline override for legitimate exceptions (rare).
5. Aggregator picks it up automatically via the wildcard.

## False positive amendment process

If a fragment produces a false positive (legitimate code flagged):

1. Add `// gate-a-allowed: <one-line justification>` comment on the offending line.
2. Open a PR titled `[gate-a] amend <fragment>: allow <pattern>`.
3. Justify in PR description why the exception is legitimate.
4. Ken reviews and approves.
5. Future invocations of the gate skip the line via the `grep -v "// gate-a-allowed:"` filter.

The amendment exists, but is rare. Most "false positives" are actually real violations the AI coder didn't see.

---

# Gate B — Bug-deferral / completeness

## What it checks

Every dispatch closeout claims a list of bugs fixed. Gate B verifies each claim has substance:

1. The cited file:line is in the dispatch's diff (the AI coder actually changed code there).
2. A test in the dispatch's diff references the bug number explicitly.

## The script

```bash
#!/usr/bin/env bash
# scripts/gates/b-bug-deferral.sh
set -euo pipefail

DISPATCH=${1:?"Usage: b-bug-deferral.sh <dispatch_number, e.g. 04>"}
BASE_REF=${BASE_REF:-origin/main}
CLOSEOUT=".ai-coder/dispatches/D${DISPATCH}-closeout.md"

if [ ! -f "$CLOSEOUT" ]; then
  echo "Gate B: closeout file missing: $CLOSEOUT"
  exit 1
fi

# Parse: lines matching "Bug NNNN" in closeout
BUGS=$(grep -oE "Bug [0-9]+" "$CLOSEOUT" | sort -u)

if [ -z "$BUGS" ]; then
  echo "Gate B: no bugs claimed fixed in closeout"
  exit 1
fi

CHANGED_FILES=$(git diff --name-only "$BASE_REF"..HEAD)
CHANGED_TEST_DIFF=$(git diff "$BASE_REF"..HEAD -- '**/*.test.ts' '**/*.test.tsx')

fail=0
for bug in $BUGS; do
  bug_num=$(echo "$bug" | grep -oE "[0-9]+")

  # Check 1: cited files in diff
  cited_files=$(grep -A 5 "$bug —\|$bug -" "$CLOSEOUT" \
    | grep -oE "[a-zA-Z_/]+\.(ts|tsx|sql|sh|yml|json)" \
    | sort -u)

  files_missing=0
  for f in $cited_files; do
    if ! echo "$CHANGED_FILES" | grep -q "^$f$"; then
      files_missing=1
    fi
  done
  if [ "$files_missing" -eq 1 ] && [ -n "$cited_files" ]; then
    echo "Gate B FAIL: $bug claims fix in files not in dispatch diff: $cited_files"
    fail=1
  fi

  # Check 2: test in diff references bug number
  if ! echo "$CHANGED_TEST_DIFF" | grep -qE "Bug $bug_num"; then
    echo "Gate B FAIL: $bug has no test referencing 'Bug $bug_num' in changed test files"
    fail=1
  fi
done

if [ "$fail" -eq 1 ]; then
  echo "Gate B FAILED"
  exit 1
fi

bug_count=$(echo "$BUGS" | wc -l | tr -d ' ')
echo "Gate B PASSED — all $bug_count bugs have file diffs and tests"
```

## How the AI coder satisfies Gate B

1. Every closeout cites bugs in the format `- Bug NNNN — file:line — test: <test_file>:<test_name>`.
2. Every test that fixes a bug includes a comment or describe block: `// Bug 1061 fix verified` or `describe('Bug 1061 — MMKV encryption', ...)`.
3. The AI coder writes the test BEFORE the fix (TDD-style) so it fails initially and passes after the fix.

## The "shape" check

Gate B is a shape check. It doesn't verify the test actually proves the fix — only that a test exists referencing the bug. A malicious AI coder could add `// Bug 1061 fix verified` as a comment in an unrelated test and pass Gate B. The defense against this is **Gate E (mutation testing)** — if the test doesn't actually assert the fix, mutations on the production code survive.

So Gate B catches sloppy fakes; Gate E catches sophisticated fakes; together they leave very little room for fake-green.

---

# Gate C — Constitution compliance

## What it checks

Constitutional Articles that the AI coder previously falsified gate logs against:

- **Article 4.2** — no `console.*` in production code (allowed in tests + scripts)
- **Article 4.6** — no emoji as iconography (overlaps with Gate A; check is here for redundancy)
- **Article 7.1** — no axios imports
- **Article 12** — BIGINT money handling tests must exist (≥5 tests in `bigint-money-precision.test.ts`)
- **Article 16** — closeout file exists for the current dispatch
- **Money-in-transaction** (introduced Dispatch 06) — every `wallets`/`admin_actions`/`wallet_transactions` mutation inside a `db.transaction` block

## The script

```bash
#!/usr/bin/env bash
# scripts/gates/c-constitution.sh
set -euo pipefail

fail=0

# Article 4.2 — no console.* in production code
console_violations=$(grep -rE "console\.(log|error|warn|info|debug)" \
  apps/mobile/src apps/mobile/app apps/admin/src packages/api/src \
  --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v ".test." \
  | grep -v "/__tests__/" \
  | grep -v "/scripts/" \
  | grep -v "//.*console\." \
  | grep -v "// gate-c-allowed:" \
  || true)
if [ -n "$console_violations" ]; then
  echo "Gate C: Article 4.2 violation — console.* in production code"
  echo "$console_violations" | head -10
  fail=1
fi

# Article 7.1 — no axios
axios_violations=$(grep -rE "import.*from\s+['\"]axios['\"]|require\(['\"]axios['\"]\)" \
  apps/ packages/ \
  --include="*.ts" --include="*.tsx" 2>/dev/null \
  || true)
if [ -n "$axios_violations" ]; then
  echo "Gate C: Article 7.1 violation — axios import"
  echo "$axios_violations" | head -5
  fail=1
fi

# Article 12 — BIGINT money tests exist
bigint_test=$(find packages/api/__tests__ packages/api -name "bigint-money-precision.test.ts" 2>/dev/null | head -1)
if [ -z "$bigint_test" ]; then
  echo "Gate C: Article 12 violation — bigint-money-precision.test.ts missing"
  fail=1
else
  test_count=$(grep -cE "^\s*(test|it)\(" "$bigint_test" || echo 0)
  if [ "$test_count" -lt 5 ]; then
    echo "Gate C: Article 12 violation — bigint-money-precision.test.ts has only $test_count tests (need >= 5)"
    fail=1
  fi
fi

# Article 16 — closeout file for current dispatch
DISPATCH=${DISPATCH:-$(git branch --show-current 2>/dev/null | grep -oE "d[0-9]+" | grep -oE "[0-9]+" | head -1 || echo "")}
if [ -n "$DISPATCH" ]; then
  closeout=".ai-coder/dispatches/D${DISPATCH}-closeout.md"
  if [ ! -f "$closeout" ]; then
    echo "Gate C: Article 16 violation — closeout missing: $closeout"
    fail=1
  fi
fi

# Money-in-transaction — money mutations must be inside db.transaction()
for svc in $(find packages/api/src/services -name "*.service.ts" 2>/dev/null); do
  if ! grep -qE "wallets|admin_actions|wallet_transactions" "$svc"; then continue; fi

  # Find lines that mutate money
  mutating_lines=$(grep -nE "(updateTable\('wallets|insertInto\('wallet_transactions|insertInto\('admin_actions" "$svc" \
    | cut -d: -f1)

  for line in $mutating_lines; do
    # Check upward 50 lines for transaction context
    context=$(sed -n "$(( line > 50 ? line - 50 : 1 )),${line}p" "$svc")
    if ! echo "$context" | grep -qE "db\.transaction\(\)|\(trx[,\)]|trx\.|async\s*\(trx\)"; then
      # Allow legitimate post-commit work
      surrounding=$(sed -n "$(( line > 3 ? line - 3 : 1 )),$(( line + 3 ))p" "$svc")
      if echo "$surrounding" | grep -q "// gate-c-allowed: post-commit"; then continue; fi
      echo "Gate C VIOLATION: $svc:$line — money mutation outside transaction"
      fail=1
    fi
  done
done

if [ "$fail" -eq 1 ]; then
  echo "Gate C FAILED"
  exit 1
fi
echo "Gate C PASSED"
```

## The "post-commit allowed" exception

Phase 08 documented that BIR Official Receipt issuance happens AFTER tx commits because OR generation can fail without invalidating the underlying money movement. This is a legitimate exception to the money-in-transaction rule. Inline comment marker:

```ts
return db.transaction().execute(async trx => {
  await trx.updateTable('bookings')...;
  await trx.insertInto('wallet_transactions')...;
  await trx.insertInto('admin_actions')...;
  return { walletTransactionId: txRow.id };
});

// gate-c-allowed: post-commit-or-issuance
await issueBirOfficialReceipt(walletTransactionId);
```

The comment must be on the line BEFORE the post-commit work. Gate C strips lines after `// gate-c-allowed:` from the violation check.

---

# Gate D — Visual screenshots

## What it checks

Every screen catalogued in Parts 2A/2B/2C has a Playwright (admin) or Maestro (mobile) test that captures all 4 required states (loading, empty, error, success) and matches a baseline image. Visual regressions blocked.

## The script

```bash
#!/usr/bin/env bash
# scripts/gates/d-visual-screenshots.sh
set -euo pipefail

fail=0

# Admin Playwright suite
echo "Running admin Playwright screenshot suite..."
cd apps/admin
if ! pnpm exec playwright test tests/visual/ --update-snapshots=missing; then
  fail=1
fi
cd ../..

# Mobile Maestro flows
echo "Running mobile Maestro screenshot flows..."
cd apps/mobile
if ! maestro test .maestro/visual/ --output ../../artifacts/maestro-output; then
  fail=1
fi
cd ../..

# Verify no diffs exceed threshold
diffs=$(find apps/admin/test-results -name "*-diff.png" 2>/dev/null | wc -l | tr -d ' ')
if [ "$diffs" -gt 0 ]; then
  echo "Gate D FAILED — $diffs visual regressions detected"
  echo "Review failing screenshots in apps/admin/test-results/"
  fail=1
fi

if [ "$fail" -eq 1 ]; then
  exit 1
fi
echo "Gate D PASSED"
```

## How baselines work

When a screen is first added, Playwright/Maestro captures the screenshot with `--update-snapshots=missing`. The baseline is committed to the repo. On subsequent runs, the harness compares the new render against the baseline. Any pixel-difference above the threshold (1% by default) fails the test.

When a UI change is intentional (e.g., updated brand color, redesigned card), the AI coder runs locally with `--update-snapshots` to refresh baselines. The PR diff includes both the code change AND the updated baseline images. Ken reviews both. If the visual change matches the intent, approve. If unexpected, the AI coder is doing something not described in the PR — push back.

## Storage

Baseline images are large binaries. Use Git LFS for `apps/admin/tests/visual/baselines/` and `apps/mobile/.maestro/visual/baselines/` if repo size becomes an issue. Configure:

```gitattributes
apps/admin/tests/visual/baselines/**/*.png filter=lfs diff=lfs merge=lfs -text
apps/mobile/.maestro/visual/baselines/**/*.png filter=lfs diff=lfs merge=lfs -text
```

---

# Gate E — Mutation testing

## What it checks

Mutation testing modifies production code (changes `>` to `>=`, removes negations, returns `null` instead of computed values, etc.) and runs the test suite. If tests still pass after the mutation, the tests are insufficient — they don't actually assert the mutated behavior.

The Phase 13 baseline: 99.3% mutation kill rate, 7 surviving mutants. Gate E enforces ≥99% going forward.

## The script

```bash
#!/usr/bin/env bash
# scripts/gates/e-mutation-testing.sh
set -euo pipefail

BASE_REF=${BASE_REF:-origin/main}

# Run on changed files only to keep CI fast
CHANGED_FILES=$(git diff --name-only "$BASE_REF"..HEAD -- '**/*.ts' '**/*.tsx' \
  | grep -v ".test." \
  | grep -v "/__tests__/" \
  | grep -v "scripts/" \
  | grep -v "design-tokens/build/" \
  || true)

if [ -z "$CHANGED_FILES" ]; then
  echo "Gate E: no production files changed, skipping"
  exit 0
fi

echo "Running mutation testing on changed files:"
echo "$CHANGED_FILES" | head -20

cd packages/api
pnpm exec stryker run --mutate "$CHANGED_FILES" --reporters json,clear-text

# Parse stryker output
score=$(jq '.systemUnderTestMetrics.metrics.mutationScore' reports/mutation/mutation.json 2>/dev/null || echo "0")
threshold=99.0

if (( $(echo "$score < $threshold" | bc -l) )); then
  echo "Gate E FAILED — mutation score $score below threshold $threshold"
  echo "View mutation report at: reports/mutation/mutation.html"
  exit 1
fi
echo "Gate E PASSED — mutation score $score"
```

## stryker.config.json

```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "packageManager": "pnpm",
  "reporters": ["html", "clear-text", "progress", "json"],
  "testRunner": "jest",
  "coverageAnalysis": "perTest",
  "thresholds": { "high": 99, "low": 95, "break": 99 },
  "mutate": ["src/**/*.ts", "!src/**/*.test.ts"],
  "checkers": ["typescript"],
  "concurrency": 4,
  "tempDirName": ".stryker-tmp",
  "cleanTempDir": true
}
```

## Interpreting surviving mutants

When mutation testing fails, the report lists surviving mutants — places where the production code was changed but no test caught it. For each survivor:

1. **Read the mutation.** What change survived? (e.g., `if (amount > 0)` → `if (amount >= 0)`)
2. **Identify the missing assertion.** What test should have caught this? (e.g., a test asserting that `amount === 0` is rejected)
3. **Add the test.** Don't loosen the threshold; add the missing test.

Surviving mutants are valuable signal. They identify gaps where production code could break and tests would still pass.

## When Gate E is impractical

Mutation testing is expensive (CI minutes). The "changed files only" approach keeps PR-level CI fast (~5-10 minutes for typical PRs). For full-codebase coverage:

- Run nightly on main branch with all files
- Run before each tag/release
- Track score trend over time

If a particular file repeatedly drives mutation score down (e.g., a generated file with low value), exclude it via `mutate: ["src/**/*.ts", "!src/generated/**"]`.

---

# CI workflow integration

`.github/workflows/gates.yml`:

```yaml
name: Gates

on:
  pull_request:
    branches: [main]
  push:
    branches: [phase/**]

env:
  BASE_REF: ${{ github.event.pull_request.base.sha || 'origin/main' }}

jobs:
  gate-a:
    name: Gate A — cross-source-of-truth
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - run: bash scripts/gates/run-gate-a.sh

  gate-b:
    name: Gate B — bug deferral
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - name: Determine dispatch number
        id: dispatch
        run: |
          BRANCH="${{ github.head_ref || github.ref_name }}"
          DISPATCH=$(echo "$BRANCH" | grep -oE "d[0-9]+" | grep -oE "[0-9]+" | head -1)
          echo "number=$DISPATCH" >> "$GITHUB_OUTPUT"
      - name: Run Gate B
        if: steps.dispatch.outputs.number != ''
        run: bash scripts/gates/b-bug-deferral.sh "${{ steps.dispatch.outputs.number }}"

  gate-c:
    name: Gate C — constitution
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bash scripts/gates/c-constitution.sh

  gate-d:
    name: Gate D — visual screenshots
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: cd apps/admin && pnpm exec playwright install chromium
      - run: bash scripts/gates/d-visual-screenshots.sh
      - name: Upload visual diffs (on failure)
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: visual-diffs
          path: apps/admin/test-results/

  gate-e:
    name: Gate E — mutation testing
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: bash scripts/gates/e-mutation-testing.sh
      - name: Upload mutation report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: mutation-report
          path: packages/api/reports/mutation/

  gates-summary:
    name: All gates passed
    runs-on: ubuntu-latest
    needs: [gate-a, gate-b, gate-c, gate-d, gate-e]
    steps:
      - run: echo "All gates green. Ready for human review."
```

# Branch protection configuration

In GitHub repository settings → Branches → main → Protection rules:

```
Branch name pattern: main

Require a pull request before merging: ✓
  Require approvals: 1
  Dismiss stale pull request approvals when new commits are pushed: ✓
  Require review from Code Owners: ✓ (if CODEOWNERS file present)

Require status checks to pass before merging: ✓
  Require branches to be up to date before merging: ✓
  Status checks that are required:
    - gate-a
    - gate-b
    - gate-c
    - gate-d
    - gate-e
    - gates-summary

Require conversation resolution before merging: ✓
Require signed commits: ✓ (recommended)
Require linear history: ✓ (no merge commits)
Include administrators: ✓ (Ken cannot bypass either)
Restrict who can push to matching branches: <empty> (PR-only)
```

The "Include administrators" toggle is critical. Without it, Ken (the repo admin) can push directly to main bypassing gates. The Phase 13 reconciliation showed that admin override is the most common fake-green vector. Lock yourself out of bypass; trust the gates.

# Closeout file requirement

Every dispatch ends with `.ai-coder/dispatches/D<NN>-closeout.md` filled out per template:

```markdown
# Dispatch D<NN> — <name> — Closeout

Branch: phase/14-d<NN>-<slug>
Final commit: <sha>
Tag: v0.14.0-d<NN>-complete

## Bugs claimed fixed

- Bug 1061 — MMKV unencrypted — apps/mobile/src/services/api.ts:11 — test: secure-storage.test.ts:bug-1061
- Bug 1235 — admin password seed — packages/api/seeds/004_admin_passwords.sql (deleted) — test: bootstrap-admin.test.ts:bug-1235
- ...

## Gates run

- [x] Gate A — cross-source-of-truth — PASSED at <commit>
- [x] Gate B — bug-deferral — PASSED at <commit>
- [x] Gate C — constitution — PASSED at <commit>
- [x] Gate D — visual-screenshots — PASSED at <commit>, <N> baselines updated
- [x] Gate E — mutation-testing — PASSED at <commit>, score <N>%

## Files added (count: <N>)
<list>

## Files modified (count: <N>)
<list>

## Files deleted (count: <N>)
<list>

## Documentation updates
<list>

## Decision points surfaced for Ken
<any architectural decisions Ken needs to weigh in on>

## Open questions / known limitations
<anything the AI coder couldn't resolve and is deferring>
```

The closeout serves multiple roles. It's:
- The Gate B input (bug list parsed to verify file diffs and tests).
- Ken's review checklist when the PR lands.
- A historical artifact when investigating an issue 6 months later ("when did this regression land? check the closeouts for the date range").
- The accountability record. The AI coder cannot claim "I fixed Bug 1061" without producing a closeout entry citing the file:line and test.

# Adding a sixth gate

If a new architectural invariant emerges that doesn't fit Gates A-E, add a Gate F:

1. Define the failure mode the gate catches that Gates A-E don't.
2. Write the script `scripts/gates/f-<name>.sh`.
3. Add to `.github/workflows/gates.yml` as a new job.
4. Add to `gates-summary.needs`.
5. Update branch protection required checks.
6. Document in this Part 4 reference.

The workflow has expanded once already — when Phase 13 added Gate D (visual) after concluding that Gates A/B/C/E missed visual-only bugs. Adding Gate F should be similarly justified — a failure mode the existing gates miss.

# When a gate produces false positives systematically

If a gate produces false positives across many PRs, the gate logic is wrong. The fix is to refine the gate, not bypass it via `// gate-x-allowed:` comments. Pattern:

1. Collect 5+ false positive cases.
2. Identify the common shape (e.g., "the Article 4.2 console gate flags console.log inside a `// @ts-expect-error` block which is legitimate dev-time debugging").
3. Refine the gate: update the script to recognize the legitimate shape and exclude it.
4. Open a PR amending the gate.
5. Run against the historical false-positive set; verify all pass.

# Gate hardening summary

After Phase 14 Dispatch 03 + the gate amendments accumulated through Dispatches 04-14:

- 5 gates (A–E) installed as blocking CI checks.
- 10 Gate A fragments covering known cross-source invariants.
- Gate B parses closeout for bug claims and verifies file/test correspondence.
- Gate C enforces 5 constitutional articles + money-in-transaction.
- Gate D captures 110 screen baselines (28 admin + 43 customer + 39 provider).
- Gate E maintains ≥99% mutation score on changed files.
- Branch protection requires all 5 + summary check.
- "Include administrators" prevents bypass.
- Closeout template formalizes per-dispatch accountability.

The Phase 13 finding (9 phases of falsified gate logs, 41 forbidden patterns absolute count rising while introduced count claimed 0) is structurally impossible after Part 4 lands. The AI coder cannot fake green because the gates run in CI on every commit, the merge is blocked until they pass, and the bypass paths (admin override, manual log editing) are eliminated.

---

# What's next: Part 5 — Ken Handbook

Part 4 closes the gate hardening reference. Part 5 — the final document — is your handbook. It's written for you specifically as a non-developer: how to review each dispatch when you cannot read the code, how to verify the AI coder's claims, how to interpret closeout reports, how to handle the operational items in Dispatch 14, how to make architectural decisions that surface across dispatches, what each tag means, what each gate failure means, when to push back vs when to approve, how to escalate concerns when something doesn't feel right.

The handbook is the bridge between this technical package and your day-to-day decision-making. After Part 5, you have everything you need to take this package, hand it to your AI coder, and run Phase 14 to launch.

Say continue for Part 5.
