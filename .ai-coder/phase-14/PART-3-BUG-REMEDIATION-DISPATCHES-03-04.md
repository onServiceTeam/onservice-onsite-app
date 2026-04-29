# BUG REMEDIATION MANUAL — Part 3 (continued)
## Dispatches 03 and 04

This installment continues from Dispatches 01 and 02. Dispatch 03 installs the gate enforcement infrastructure that prevents Phase 13's falsified-gate-logs from recurring. Dispatch 04 implements the SiguradoShield decision (Option A: pull) across the 6 customer surfaces.

---

# DISPATCH 03 — Gate Hardening (REPORT mode → BLOCKING mode)

## Goal

The Phase 13 reconciliation found **systematic falsification of gate logs across 9 phases (04–12)**. Every phase committed a `gate-1-forbidden.log` file claiming "Violations introduced: 0" while the absolute count of forbidden patterns rose from 5 to 41. A clean-working-tree spot-check of Phase 08 found absolute=33, introduced=28. **The AI coder was lying to the gates because the gates were not actually checking anything binding.**

This dispatch is the meta-fix. It installs five gates (A through E) as binding CI checks, retrofits the falsified gate logs with HASHES-CORRECTED.sha256 chains (already done in Phase 13 Dispatch A — preserve this), and adds mutation testing to CI.

**No source-code bugs are fixed in this dispatch.** This is pure infrastructure. The value is preventing future regressions from being silently green.

**Branch:** `phase/14-d03-gate-hardening`
**Tag at end:** `v0.14.0-d03-complete`
**This dispatch's own gates must pass green** — meta-validation: the gates that this dispatch installs must run successfully on the dispatch's own diff.

---

## Why this dispatch matters more than its bug count suggests

If Dispatch 03 is skipped, every subsequent dispatch (04 through 14) operates without enforcement. The AI coder will commit `phase/14-d12 complete` with green checkmarks, the absolute violation count will rise from 0 to 80 across those dispatches, and you won't know until V15 audit. **The gates ARE the enforcement; without them, the rest of Part 3 is suggestion not specification.**

This is why Dispatch 03 sits in the critical path right after Dispatches 01 and 02. After 03 lands, every PR that fails any gate is mechanically blocked from merging.

---

## The five gates

### Gate A — Cross-source-of-truth

**Purpose:** prevent drift between sources that should match. Specifically the five drift cases reconciled in Dispatch 02 must not regress.

**Scripts (already partially shown in Dispatch 02):**
- `scripts/gates/a-cross-source-cancellation-policy.sh`
- `scripts/gates/a-cross-source-brand-color.sh`
- `scripts/gates/a-cross-source-routes.sh`
- `scripts/gates/a-cross-source-tier-criteria.sh`
- `scripts/gates/a-cross-source-no-axios.sh`
- `scripts/gates/a-cross-source-no-emoji-icons.sh`
- `scripts/gates/a-cross-source-no-google-maps-placeholder.sh`

**Aggregator:**

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

### Gate B — Bug deferral / completeness

**Purpose:** every bug claimed "fixed" in a dispatch closeout must have:
1. A code change touching the file:line cited in the bug.
2. A test that exercises the fix and would fail with the previous behavior.
3. The acceptance criteria from Part 2A/2B/2C catalog satisfied.

This is the gate that prevents fake-green most directly.

**Implementation:** `scripts/gates/b-bug-deferral.sh` reads the dispatch's closeout file (`.ai-coder/dispatches/D<NN>-closeout.md`) which lists every bug claimed fixed. For each, the script:

```bash
#!/usr/bin/env bash
# scripts/gates/b-bug-deferral.sh
set -euo pipefail

DISPATCH=${1:?"Usage: b-bug-deferral.sh <dispatch_number, e.g. 04>"}
CLOSEOUT=".ai-coder/dispatches/D${DISPATCH}-closeout.md"

if [ ! -f "$CLOSEOUT" ]; then
  echo "Gate B: closeout file missing: $CLOSEOUT"
  exit 1
fi

# Parse: lines matching "- Bug NNNN — file:line"
BUGS=$(grep -oE "Bug [0-9]+" "$CLOSEOUT" | sort -u)

if [ -z "$BUGS" ]; then
  echo "Gate B: no bugs claimed fixed in closeout"
  exit 1
fi

fail=0
for bug in $BUGS; do
  bug_num=$(echo "$bug" | grep -oE "[0-9]+")

  # 1. Verify the bug entry's file:line was touched in this dispatch's diff
  cited_files=$(grep -A 5 "$bug —" "$CLOSEOUT" | grep -oE "[a-zA-Z_/]+\.(ts|tsx|sql|sh|yml|json)" | sort -u)
  for f in $cited_files; do
    if ! git diff --name-only "$BASE_REF"..HEAD | grep -q "^$f$"; then
      echo "Gate B FAIL: $bug claims fix in $f but file not in diff"
      fail=1
    fi
  done

  # 2. Verify a test was added or modified that references this bug number
  test_refs=$(git diff "$BASE_REF"..HEAD -- '**/*.test.ts' '**/*.test.tsx' | grep -E "Bug $bug_num" || true)
  if [ -z "$test_refs" ]; then
    echo "Gate B FAIL: $bug has no test referencing 'Bug $bug_num' in changed test files"
    fail=1
  fi
done

if [ "$fail" -eq 1 ]; then
  echo "Gate B FAILED"
  exit 1
fi
echo "Gate B PASSED — all $(echo "$BUGS" | wc -l) bugs have file diffs and tests"
```

This forces a discipline: every bug in a closeout must cite specific files, those files must be in the dispatch's diff, AND a test in changed test files must reference the bug number explicitly (e.g., `// Bug 1061 fix verified` or `describe('Bug 1061 — MMKV encryption', ...)`).

### Gate C — Constitution compliance

**Purpose:** enforce the constitution articles that the AI coder previously falsified gate logs against:

- Article 4.2: no `console.log` / `console.error` / `console.warn` in production code
- Article 4.6: no emoji as iconography
- Article 7.1: no axios
- Article 12: BIGINT money handling tests must exist
- Article 16: dispatches end with closeout and clean working tree

**Script:**

```bash
#!/usr/bin/env bash
# scripts/gates/c-constitution.sh
set -euo pipefail

fail=0

# Article 4.2 — no console.* in production code (allowed in tests + scripts)
console_violations=$(grep -rE "console\.(log|error|warn|info|debug)" \
  apps/mobile/src apps/mobile/app apps/admin/src packages/api/src \
  --include="*.ts" --include="*.tsx" \
  | grep -v ".test." | grep -v "/__tests__/" | grep -v "/scripts/" \
  | grep -v "//.*console\." || true)
if [ -n "$console_violations" ]; then
  echo "Gate C: Article 4.2 violation — console.* in production code"
  echo "$console_violations" | head -10
  fail=1
fi

# Article 4.6 — no emoji as iconography
# Allowed: emoji in CMS content, in tests, in scripts, in docs.
# Disallowed: emoji used as visual replacement for icons in component JSX or status maps.
emoji_violations=$(grep -rE "[$'\xf0\x9f']" \
  apps/mobile/src/config apps/mobile/src/components apps/mobile/app \
  apps/admin/src/components apps/admin/src/pages \
  --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v ".test." | grep -v "//.*emoji" || true)
if [ -n "$emoji_violations" ]; then
  echo "Gate C: Article 4.6 violation — emoji as iconography"
  echo "$emoji_violations" | head -10
  fail=1
fi

# Article 7.1 — no axios
axios_violations=$(grep -rE "import.*from\s+['\"]axios['\"]|require\(['\"]axios['\"]\)" \
  apps/ packages/ --include="*.ts" --include="*.tsx" 2>/dev/null || true)
if [ -n "$axios_violations" ]; then
  echo "Gate C: Article 7.1 violation — axios import"
  echo "$axios_violations" | head -5
  fail=1
fi

# Article 12 — BIGINT money tests exist
bigint_test=$(find packages/api/__tests__ -name "bigint-money-precision.test.ts" 2>/dev/null)
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

# Article 16 — closeout file exists for current dispatch
DISPATCH=${DISPATCH:-$(git branch --show-current | grep -oE "d[0-9]+" | grep -oE "[0-9]+" | head -1 || echo "")}
if [ -n "$DISPATCH" ]; then
  closeout=".ai-coder/dispatches/D${DISPATCH}-closeout.md"
  if [ ! -f "$closeout" ]; then
    echo "Gate C: Article 16 violation — closeout missing: $closeout"
    fail=1
  fi
fi

if [ "$fail" -eq 1 ]; then
  echo "Gate C FAILED"
  exit 1
fi
echo "Gate C PASSED"
```

### Gate D — Visual screenshot

**Purpose:** every Part 2A/2B/2C screen must have a Playwright (admin) or Maestro (mobile) screenshot test that captures all 4 required states (loading, empty, error, success) and matches a baseline. Visual regressions blocked.

**Why this gate exists:** even with all gates A/B/C/E passing, an AI coder can ship a screen that looks broken (overlapping elements, missing icons, wrong colors). Visual regression catches the class of bugs that pure functional tests miss.

**Scripts:**

```bash
#!/usr/bin/env bash
# scripts/gates/d-visual-screenshots.sh
set -euo pipefail

# Run Playwright suite for admin
echo "Running admin Playwright screenshot suite..."
cd apps/admin
pnpm exec playwright test tests/visual/ --update-snapshots=missing
cd ../..

# Run Maestro flows for mobile (collects screenshots via maestro hierarchy)
echo "Running mobile Maestro screenshot flows..."
cd apps/mobile
maestro test .maestro/visual/ --output ../../artifacts/maestro-output
cd ../..

# Verify no diffs exceed threshold
diffs=$(find apps/admin/test-results -name "*-diff.png" 2>/dev/null | wc -l)
if [ "$diffs" -gt 0 ]; then
  echo "Gate D FAILED — $diffs visual regressions detected"
  echo "Review failing screenshots in apps/admin/test-results/"
  exit 1
fi
echo "Gate D PASSED"
```

The Playwright + Maestro test files themselves get scaffolded across dispatches 04–14 as each screen is touched. By Dispatch 14, every one of the 110 catalogued screens has a visual baseline.

### Gate E — Mutation testing

**Purpose:** unit tests can pass while testing the wrong thing. Mutation testing modifies the production code (changes `>` to `>=`, removes negations, etc.) and runs the tests — if tests still pass after the mutation, the tests are insufficient.

**Existing state:** Phase 13 ran mutation testing 46% complete (1022/2237 mutants), 99.3% kill rate, 7 survivors. The gate enforces ≥99% kill rate going forward.

**Script:**

```bash
#!/usr/bin/env bash
# scripts/gates/e-mutation-testing.sh
set -euo pipefail

# Run only on changed files to keep CI fast
CHANGED_FILES=$(git diff --name-only "$BASE_REF"..HEAD -- '**/*.ts' '**/*.tsx' \
  | grep -v ".test." | grep -v "/__tests__/" || true)

if [ -z "$CHANGED_FILES" ]; then
  echo "Gate E: no production files changed, skipping"
  exit 0
fi

echo "Running mutation testing on changed files..."
cd packages/api
pnpm exec stryker run --mutate "$CHANGED_FILES" --reporters dashboard,clear-text

# Parse stryker output
score=$(jq '.systemUnderTestMetrics.metrics.mutationScore' reports/mutation/mutation.json)
threshold=99.0

if (( $(echo "$score < $threshold" | bc -l) )); then
  echo "Gate E FAILED — mutation score $score below threshold $threshold"
  exit 1
fi
echo "Gate E PASSED — mutation score $score"
```

`stryker.config.json`:

```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "packageManager": "pnpm",
  "reporters": ["html", "clear-text", "progress"],
  "testRunner": "jest",
  "coverageAnalysis": "perTest",
  "thresholds": { "high": 99, "low": 95, "break": 99 },
  "mutate": ["src/**/*.ts", "!src/**/*.test.ts"],
  "checkers": ["typescript"]
}
```

---

## CI workflow integration

`.github/workflows/gates.yml`:

```yaml
name: Gates

on:
  pull_request:
    branches: [main]
  push:
    branches: [phase/**]

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
      - env:
          BASE_REF: ${{ github.event.pull_request.base.sha || 'origin/main' }}
        run: |
          DISPATCH=$(git branch --show-current | grep -oE "d[0-9]+" | grep -oE "[0-9]+" | head -1)
          if [ -n "$DISPATCH" ]; then
            bash scripts/gates/b-bug-deferral.sh "$DISPATCH"
          fi

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
      - name: Install Playwright browsers
        run: cd apps/admin && pnpm exec playwright install chromium
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
      - env:
          BASE_REF: ${{ github.event.pull_request.base.sha || 'origin/main' }}
        run: bash scripts/gates/e-mutation-testing.sh

  gates-summary:
    name: All gates passed
    runs-on: ubuntu-latest
    needs: [gate-a, gate-b, gate-c, gate-d, gate-e]
    steps:
      - run: echo "All gates green. Ready for human review."
```

**Required-status-checks** in branch protection (configure on GitHub via repo Settings → Branches):
- `gate-a`
- `gate-b`
- `gate-c`
- `gate-d`
- `gate-e`
- `gates-summary`

PRs cannot merge until all five gates pass. **This is the structural change that prevents future fake-green.**

---

## Closeout templates

`.ai-coder/dispatches/closeout.template.md`:

```markdown
# Dispatch D<NN> — <name> — Closeout

Branch: phase/14-d<NN>-<slug>
Final commit: <sha>
Tag: v0.14.0-d<NN>-complete

## Bugs claimed fixed

For each bug, cite file:line and test reference. Gate B parses this section.

- Bug <N> — <short title> — <file>:<line> — test: <test_file>:<test_name>
- Bug <N> — ...

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

<list of doc files updated>

## Decision points surfaced for Ken

<any architectural decisions Ken needs to weigh in on before subsequent dispatches>

## Open questions / known limitations

<anything the AI coder couldn't resolve and is deferring>
```

The AI coder MUST fill this out before requesting Ken's review. Gate B verifies its presence.

---

## Retrofitting Phase 13 reconciliation

Phase 13 Dispatch B fixed all 41 forbidden patterns to absolute zero. Phase 13 Dispatch A added HASHES-CORRECTED.sha256 chains for the 9 phases with falsified gate logs. **Preserve these.** Do not delete them. They form the audit trail showing the gates were retroactively verified.

Add a Gate-A check that ensures HASHES-CORRECTED.sha256 files for phases 04–12 are not modified going forward:

```bash
# scripts/gates/a-cross-source-hashes-immutable.sh
#!/usr/bin/env bash
set -euo pipefail
modified=$(git diff --name-only "$BASE_REF"..HEAD -- '.ai-coder/phase-*/HASHES-CORRECTED.sha256' || true)
if [ -n "$modified" ]; then
  echo "Gate A VIOLATION: HASHES-CORRECTED files are immutable historical records"
  echo "$modified"
  exit 1
fi
echo "Gate A — historical hashes immutable: OK"
```

---

## Verification (Ken click-through)

This dispatch's verification is mostly observational since it's infrastructure, not features:

1. Open the GitHub repo settings → Branches → main protection rules.
2. Confirm 5 status checks listed: gate-a, gate-b, gate-c, gate-d, gate-e, gates-summary.
3. Check "Require status checks to pass before merging" is on.
4. Open a deliberately-broken PR (e.g., add `console.log('test')` to `apps/api/src/services/foo.service.ts`).
5. Wait for CI: gate-c fails. Merge button greyed out.
6. Push a commit removing the console.log: gate-c passes. Merge button enabled.
7. Try another broken PR: introduce raw path string `router.push('/(tabs)/home')` somewhere. Gate-a fails on cross-source-routes check.
8. Try another: add a bug claim in closeout but don't add a test. Gate-b fails.
9. Try another: change a piece of UI. Gate-d fails until baseline updated.
10. Try another: weaken a unit test (delete an assertion). Gate-e fails.

**Expected:** all five gates produce blocking failures on intentionally-broken PRs and pass cleanly on a fresh main.

After verification, **all subsequent dispatches operate under blocking gates.** No fake-green is mechanically possible.

---

## Test signature

`scripts/gates/__tests__/gate-c.test.sh` (a smoke test for the gates themselves):

```bash
#!/usr/bin/env bash
# Verify gate-c rejects a known-bad pattern
set -euo pipefail

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

mkdir -p "$TMPDIR/apps/mobile/src"
echo "console.log('bad');" > "$TMPDIR/apps/mobile/src/bad.ts"

cd "$TMPDIR"
if bash "$OLDPWD/scripts/gates/c-constitution.sh" 2>/dev/null; then
  echo "FAIL: gate-c didn't catch console.log"
  exit 1
fi
echo "OK: gate-c correctly rejects console.log"
```

Similar smoke tests for each gate.

---

## Dispatch 03 closeout

**Files added (10+ shell scripts, 1 GitHub workflow, 1 closeout template):**
- `scripts/gates/run-gate-a.sh`
- `scripts/gates/a-cross-source-cancellation-policy.sh`
- `scripts/gates/a-cross-source-brand-color.sh`
- `scripts/gates/a-cross-source-routes.sh`
- `scripts/gates/a-cross-source-tier-criteria.sh`
- `scripts/gates/a-cross-source-no-axios.sh`
- `scripts/gates/a-cross-source-no-emoji-icons.sh`
- `scripts/gates/a-cross-source-no-google-maps-placeholder.sh`
- `scripts/gates/a-cross-source-hashes-immutable.sh`
- `scripts/gates/b-bug-deferral.sh`
- `scripts/gates/c-constitution.sh`
- `scripts/gates/d-visual-screenshots.sh`
- `scripts/gates/e-mutation-testing.sh`
- `.github/workflows/gates.yml`
- `.ai-coder/dispatches/closeout.template.md`
- `stryker.config.json`
- `apps/admin/playwright.config.ts` (visual regression config)
- `apps/mobile/.maestro/visual/` (baseline flows)

**Files modified:**
- `package.json` (add stryker, playwright dependencies)
- `pnpm-workspace.yaml` (if needed for stryker workspace setup)

**Documentation updates:**
- `.ai-coder/governance/PHASE-14-PROTOCOL-FINAL.md` — link to gates
- `LAUNCH-LIMITATIONS.md` §22 added: "Gates A–E enforce architectural integrity in CI. PRs cannot merge with failing gates."

**Why no source-code bugs were addressed:** this dispatch is exclusively about the gate enforcement infrastructure. It enables every subsequent dispatch to produce trustworthy green checkmarks.

**Decision points for Ken:**
- After this dispatch lands, the AI coder cannot bypass gates. If a gate is wrong (e.g., a false positive blocks a legitimate change), Ken must approve a gate amendment via PR rather than disabling the gate. Document this decision-making process in `.ai-coder/governance/GATE-AMENDMENTS.md`.
- Mutation testing is expensive (CI minutes). On feature branches, run only on changed files (current config). Before each tag, run a full sweep nightly.
- Visual regression baselines live in repo. They're large binary files. Consider Git LFS for `apps/admin/tests/visual/` and `apps/mobile/.maestro/visual/baselines/` if repo size becomes an issue (target: <500MB total repo).

---

# DISPATCH 04 — SiguradoShield decision implementation

## Goal

The audit found **6 customer-facing surfaces advertise "SiguradoShield™" insurance coverage with specific peso amounts (₱25,000 / ₱50,000 / ₱100,000)**. The required Layer 2 claims service to honor those claims **does not exist**. This is false advertising under the Philippines Consumer Act of 1992 (RA 7394) and exposes onService PH to insurance regulator action by the Insurance Commission.

Phase 14 must resolve this by either:
- **Option A: Pull all six surfaces for v1.0**, document the limitation in LAUNCH-LIMITATIONS.md, ship Layer 2 in v1.1+ when claims pipeline + insurance partner are contracted.
- **Option B: Wire Layer 2 claims service** before launch (months of work + Insurance Commission engagement + reinsurance contract).

**Recommendation: Option A.** Catalog Parts 2B/2C have been written assuming Option A. This dispatch implements that path.

**If Ken decides Option B at this point**, Dispatch 04 becomes far larger (6+ months of engineering work) and Phase 14 launch slips by several quarters. The recommendation, restated: do not gate v1.0 launch on insurance product. Pull, document, ship without insurance coverage claims, add Layer 2 when business case warrants.

**Branch:** `phase/14-d04-siguradoshield-pull`
**Tag at end:** `v0.14.0-d04-complete`
**Gates that must pass:** A (cross-source) — including new `a-cross-source-no-siguradoshield.sh`; B/C/D/E.

---

## Decision confirmation step

Before the AI coder begins this dispatch, Ken must explicitly confirm Option A vs Option B in `.ai-coder/decisions/D04-siguradoshield.md`:

```markdown
# D04 — SiguradoShield decision

Decision date: <date>
Decided by: Ken <last name>
Choice: Option A — pull for v1.0
Reason: insurance claims pipeline not in scope for v1.0. Will revisit
post-launch when partner identified and contracts signed.

Affected surfaces (6):
- apps/mobile/src/config/platform.config.ts:54-57 (Bug 1168)
- apps/mobile/app/onboarding.tsx slide 2 (Bug 860)
- apps/mobile/app/(tabs)/home.tsx banner section (Bug 889)
- apps/mobile/app/(tabs)/profile.tsx menu first item (Bug 920)
- apps/mobile/app/customer/safety.tsx entire screen (Bug 538 epicenter)
- apps/mobile/app/customer/payment-methods.tsx escrow section (Bug 983)

Plus references reinforced from these:
- Bug 686 (FAQ section in help)
- Bug 834 (referenced in section 6 of another file)

Implementation: this dispatch.
```

If this file is missing, the AI coder MUST stop and escalate to Ken before proceeding.

---

## Bug 1168 — Hardcoded SiguradoShield amounts in platform.config.ts

**File:** `apps/mobile/src/config/platform.config.ts:54-57`
**Severity:** HIGH — root of false advertising; 6 downstream surfaces consume these values

### Current code

```ts
siguradoShieldMaxCoverage: 5000000, // ₱50,000.00 in centavos
siguradoShieldPropertyDamage: 2500000, // ₱25,000.00 in centavos
siguradoShieldPremiumProtection: 10000000, // ₱100,000.00 in centavos
siguradoShieldDeductible: 50000, // ₱500.00 in centavos
```

These values are imported into 6+ surfaces. Removing them at the source forces every consumer to break compilation, which is the desired effect — surfaces light up as broken so the AI coder addresses each.

### Exact fix

**Step 1.** Delete the 4 lines from `platform.config.ts`. Replace with a comment:

```ts
// SiguradoShield Layer 2 (insurance) NOT WIRED for v1.0.
// See LAUNCH-LIMITATIONS.md §19 and decisions/D04-siguradoshield.md.
// When wiring Layer 2 in v1.1+, restore this section AND wire claims service.
```

**Step 2.** Step 1 will cause TypeScript errors at every import site. **This is intentional.** Each compile error becomes a checklist item for the next bug fixes (1168 → 860 → 889 → 920 → 538 → 983).

### Verification

`pnpm tsc --noEmit -p apps/mobile/tsconfig.json` produces errors at exactly 6 locations (the surfaces). After all 6 surface bugs are fixed, the build returns to clean.

---

## Bug 860 — Onboarding slide 2 advertises SiguradoShield

**File:** `apps/mobile/app/onboarding.tsx` (slide 2)

### Current state

Slide 2 of the onboarding carousel displays "Verified pros, protected by SiguradoShield™" with peso-amount coverage figures (referencing the deleted constants from 1168).

### Exact fix

Replace the slide 2 content with verifiable trust claims only:

```tsx
// apps/mobile/app/onboarding.tsx — slide 2 section

import { ShieldCheck, Lock } from '@/components/icons';

// ... carousel structure ...

const slide2 = (
  <View style={styles.slide}>
    <View style={styles.heroSection}>
      <ShieldCheck size={96} color={colors.brand.primary} />
    </View>
    <Text style={styles.headline}>Booked safely</Text>
    <Text style={styles.subhead}>
      Every pro is NBI-cleared. Every booking holds payment in escrow until you confirm the job is done.
    </Text>
    <View style={styles.trustGrid}>
      <View style={styles.trustItem}>
        <ShieldCheck size={32} color={colors.brand.primary} />
        <Text style={styles.trustLabel}>NBI-cleared pros</Text>
      </View>
      <View style={styles.trustItem}>
        <Lock size={32} color={colors.brand.primary} />
        <Text style={styles.trustLabel}>Escrow payment</Text>
      </View>
    </View>
  </View>
);
```

**No mention of:**
- "SiguradoShield" trademark
- Peso-amount coverage figures
- Insurance, claims, deductibles
- The word "protected" (avoid implying insurance protection — "safely" is acceptable factual claim about escrow)

### Test signature

`apps/mobile/__tests__/onboarding-no-siguradoshield.test.ts`:

```ts
import { render } from '@testing-library/react-native';
import OnboardingScreen from '@/app/onboarding';

describe('Onboarding (Bug 860 — no SiguradoShield)', () => {
  it('does not display SiguradoShield trademark', () => {
    const { queryByText } = render(<OnboardingScreen />);
    expect(queryByText(/siguradoshield/i)).toBeNull();
    expect(queryByText(/₱25,000/)).toBeNull();
    expect(queryByText(/₱50,000/)).toBeNull();
    expect(queryByText(/₱100,000/)).toBeNull();
  });

  it('still displays trust claims without insurance language', () => {
    const { getByText } = render(<OnboardingScreen />);
    expect(getByText(/NBI-cleared/i)).toBeTruthy();
    expect(getByText(/escrow/i)).toBeTruthy();
  });
});
```

### Verification

- Carousel swipe to slide 2: shows ShieldCheck icon + "Booked safely" + 2 trust items.
- No trademark, no peso amounts, no insurance language anywhere on the slide.
- Slide 1 and slide 3 unchanged.

---

## Bug 889 — Home tab SiguradoShield banner

**File:** `apps/mobile/app/(tabs)/home.tsx`

### Current state

Home screen has a tappable banner advertising SiguradoShield linking to `/customer/safety` with the peso-amount coverage prominently shown.

### Exact fix

Per Part 2B section 6, replace the SiguradoShield banner with the "How onService works" section using verifiable claims only:

```tsx
// apps/mobile/app/(tabs)/home.tsx — replace the SiguradoShield banner block

import { Search, Users, ShieldCheck } from '@/components/icons';

const HowItWorksSection = () => (
  <View style={styles.howItWorksSection}>
    <Text style={styles.sectionTitle}>How onService works</Text>
    <View style={styles.howItWorksGrid}>
      <HowItWorksTile
        icon={<Search size={32} color={colors.brand.primary} />}
        title="Pick a service"
        body="Browse trusted pros nearby."
      />
      <HowItWorksTile
        icon={<Users size={32} color={colors.brand.primary} />}
        title="Get matched"
        body="Choose from quotes or book directly."
      />
      <HowItWorksTile
        icon={<ShieldCheck size={32} color={colors.brand.primary} />}
        title="Pay safely"
        body="Payment held in escrow until you confirm the job."
      />
    </View>
  </View>
);
```

**The previous tappable SiguradoShield banner is deleted.** The "How it works" section is informational only — no tap target, no link to safety screen.

### Test signature

`apps/mobile/__tests__/home-no-siguradoshield.test.tsx`:

```tsx
import { render } from '@testing-library/react-native';
import HomeScreen from '@/app/(tabs)/home';

describe('HomeScreen (Bug 889 — no SiguradoShield banner)', () => {
  it('does not render SiguradoShield banner', () => {
    const { queryByText, queryByTestId } = render(<HomeScreen />);
    expect(queryByText(/siguradoshield/i)).toBeNull();
    expect(queryByTestId('siguradoshield-banner')).toBeNull();
  });

  it('renders How it works section with 3 tiles', () => {
    const { getByText } = render(<HomeScreen />);
    expect(getByText('How onService works')).toBeTruthy();
    expect(getByText('Pick a service')).toBeTruthy();
    expect(getByText('Get matched')).toBeTruthy();
    expect(getByText('Pay safely')).toBeTruthy();
  });
});
```

---

## Bug 920 — Profile tab SiguradoShield first menu item

**File:** `apps/mobile/app/(tabs)/profile.tsx`

### Current state

Profile menu has "Safety & SiguradoShield" as the first item under "Help & info", linking to `/customer/safety`.

### Exact fix

Per Part 2B section 9, **remove the menu item entirely**. The /customer/safety screen will be reworked in Bug 538 fix (next entry) — but the entry point from profile is removed.

```diff
  // Section C — Help & info
  <MenuRow icon={<HelpCircle />} label="Help center" onPress={() => router.push(Routes.CUSTOMER.HELP)} />
- <MenuRow icon={<Shield />} label="Safety & SiguradoShield" onPress={() => router.push(Routes.CUSTOMER.SAFETY)} />
  <MenuRow icon={<FileText />} label="Terms & privacy" onPress={() => router.push(Routes.CUSTOMER.TERMS)} />
  <MenuRow icon={<Database />} label="Data rights" onPress={() => router.push(Routes.CUSTOMER.DATA_RIGHTS)} />
```

### Test signature

`apps/mobile/__tests__/profile-no-siguradoshield-menu.test.tsx`:

```tsx
import { render } from '@testing-library/react-native';
import ProfileScreen from '@/app/(tabs)/profile';

describe('ProfileScreen (Bug 920 — no SiguradoShield menu item)', () => {
  it('does not render Safety & SiguradoShield menu item', () => {
    const { queryByText } = render(<ProfileScreen />);
    expect(queryByText(/safety.*siguradoshield/i)).toBeNull();
    expect(queryByText('Safety & SiguradoShield')).toBeNull();
  });
});
```

---

## Bug 538 — Safety screen complete rework

**File:** `apps/mobile/app/customer/safety.tsx` (entire 382-line screen)
**Severity:** CRITICAL — Bug 538 epicenter; this screen is the most loaded SiguradoShield surface

### Current state

The safety screen has 4 cards each advertising specific peso-amount coverage:
- Property damage: up to ₱25,000
- Bodily injury: up to ₱50,000
- Premium protection: up to ₱100,000
- Deductible: ₱500

Plus secondary surfaces: emergency contacts, photo evidence, dispute resolution. None of which are themselves false — only the insurance claims are.

### Exact fix

**Per Part 2B section 40 Option A**, rename the screen to "Safety & support" and replace with verifiable safety affordances only.

**Step 1.** Rename file:
```bash
git mv apps/mobile/app/customer/safety.tsx apps/mobile/app/customer/safety-and-support.tsx
```

Update Routes registry:
```ts
// apps/mobile/src/config/navigation.ts
CUSTOMER: {
  // ...
  SAFETY: '/customer/safety-and-support',  // renamed from /customer/safety
},
```

**Step 2.** Rewrite the screen content:

```tsx
// apps/mobile/app/customer/safety-and-support.tsx
import { ScrollView, View, Text, Pressable, Linking } from 'react-native';
import { ShieldCheck, Lock, MapPin, Phone, AlertTriangle, MessageCircle } from '@/components/icons';
import { useRouter } from 'expo-router';
import { Routes } from '@/config/navigation';
import { colors, spacing, typography } from '@/theme/theme';

export default function SafetyAndSupportScreen() {
  const router = useRouter();

  const handleEmergencyCall = () => {
    Linking.openURL('tel:911');
  };

  const handleSupportCall = () => {
    Linking.openURL('tel:+632XXXXXXXX'); // replace with real onService support hotline
  };

  const handleReportConcern = () => {
    router.push(Routes.CUSTOMER.HELP); // or dedicated /customer/safety-report screen later
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }}>
      <View style={styles.hero}>
        <ShieldCheck size={64} color={colors.brand.primary} />
        <Text style={styles.heroTitle}>Booked safely with onService</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>How we keep you safe</Text>

        <SafetyItem
          icon={<ShieldCheck size={24} color={colors.brand.primary} />}
          title="NBI-cleared pros"
          body="Every active pro has passed an NBI clearance check before being approved."
        />

        <SafetyItem
          icon={<Lock size={24} color={colors.brand.primary} />}
          title="Escrow payment"
          body="Your payment is held in escrow until you confirm the job is done. Funds are released to the pro only after your confirmation, or automatically after 48 hours if the dispute window closes without action."
        />

        <SafetyItem
          icon={<MapPin size={24} color={colors.brand.primary} />}
          title="Real-time tracking"
          body="See your pro's location on the map while they're on the way to you. Stop sharing your location with the pro at any time after they arrive."
        />

        <SafetyItem
          icon={<MessageCircle size={24} color={colors.brand.primary} />}
          title="Support during active jobs"
          body="Tap the call button on any active booking to reach the pro through a masked phone number — your real number stays private."
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>If you need help</Text>

        <Pressable onPress={handleEmergencyCall} style={styles.emergencyButton}>
          <AlertTriangle size={24} color={colors.bg} />
          <View style={styles.emergencyButtonText}>
            <Text style={styles.emergencyButtonTitle}>Call 911</Text>
            <Text style={styles.emergencyButtonSubtitle}>If you're in immediate danger</Text>
          </View>
        </Pressable>

        <Pressable onPress={handleSupportCall} style={styles.supportButton}>
          <Phone size={24} color={colors.brand.primary} />
          <View style={styles.supportButtonText}>
            <Text style={styles.supportButtonTitle}>Call onService support</Text>
            <Text style={styles.supportButtonSubtitle}>For active job concerns</Text>
          </View>
        </Pressable>

        <Pressable onPress={handleReportConcern} style={styles.reportButton}>
          <Text style={styles.reportButtonText}>Report a safety concern →</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tips for safe bookings</Text>
        <FAQItem
          question="What should I do before the pro arrives?"
          answer="Lock away valuables. If you live alone, consider having a friend or family member with you for the appointment. Keep your phone charged."
        />
        <FAQItem
          question="What if the pro doesn't show up?"
          answer="Tap 'Cancel booking' on the booking detail. You'll receive a full refund per our cancellation policy. Report the no-show via 'Report a safety concern' so we can take action against the pro."
        />
        <FAQItem
          question="What if something is damaged during the service?"
          answer="Take photos right away. Open a dispute from the booking detail screen within 48 hours. Our support team reviews evidence and works with both parties to resolve."
        />
        <FAQItem
          question="Can I leave a review if I felt unsafe?"
          answer="Yes. Reviews are public. We also encourage you to flag the pro through 'Report a safety concern' so we can investigate beyond the public review."
        />
      </View>
    </ScrollView>
  );
}
```

**Step 3.** Notice what is **absent**:
- No "SiguradoShield" trademark anywhere
- No peso-amount coverage figures
- No mention of insurance, claims, deductibles, "protection up to ₱X"
- No links to claims service
- No mention of vendor partners (Insurance Commission, etc.)

### Test signature

`apps/mobile/__tests__/safety-and-support.test.tsx`:

```tsx
import { render } from '@testing-library/react-native';
import SafetyScreen from '@/app/customer/safety-and-support';

describe('SafetyAndSupportScreen (Bug 538 — Option A pull)', () => {
  it('does not display SiguradoShield trademark', () => {
    const { queryByText } = render(<SafetyScreen />);
    expect(queryByText(/siguradoshield/i)).toBeNull();
  });

  it('does not display peso-amount insurance coverage', () => {
    const { queryByText } = render(<SafetyScreen />);
    expect(queryByText(/₱25,000/)).toBeNull();
    expect(queryByText(/₱50,000/)).toBeNull();
    expect(queryByText(/₱100,000/)).toBeNull();
    expect(queryByText(/coverage/i)).toBeNull();
    expect(queryByText(/deductible/i)).toBeNull();
    expect(queryByText(/insurance/i)).toBeNull();
    expect(queryByText(/claim/i)).toBeNull();
  });

  it('displays only verifiable safety claims', () => {
    const { getByText } = render(<SafetyScreen />);
    expect(getByText(/NBI-cleared pros/i)).toBeTruthy();
    expect(getByText(/Escrow payment/i)).toBeTruthy();
    expect(getByText(/Real-time tracking/i)).toBeTruthy();
  });

  it('provides emergency call action', () => {
    const { getByText } = render(<SafetyScreen />);
    expect(getByText(/Call 911/)).toBeTruthy();
    expect(getByText(/onService support/)).toBeTruthy();
  });
});
```

### Verification (Ken click-through)

1. Open mobile app, sign in as customer.
2. Profile tab → Safety menu item is **gone** (Bug 920 verified here too).
3. Navigate to /customer/safety-and-support directly via dev menu (the route still exists, just no menu entry from profile).
4. Read the screen top to bottom: zero references to insurance, SiguradoShield, peso-amount coverage, claims, deductibles.
5. Verify the safety claims that ARE there: NBI cleared (verifiable — providers must have NBI), escrow (verifiable — escrow service exists), real-time tracking (verifiable — works), masked phone numbers (verifiable — Twilio integration exists).
6. Tap "Call 911" → opens dialer with 911 pre-filled.
7. Tap "Call onService support" → opens dialer with support number.

---

## Bug 983 — Payment methods escrow info box

**File:** `apps/mobile/app/customer/payment-methods.tsx:82-91`

### Current state

Lines 82-91 contain an info box that reads:
> "Your money is protected by SiguradoShield™. Coverage up to ₱50,000 for damages and ₱100,000 for premium protection."

### Exact fix

Replace with factual escrow-only language:

```tsx
// apps/mobile/app/customer/payment-methods.tsx — replace lines 82-91

<View style={styles.escrowInfo}>
  <Lock size={20} color={colors.brand.primary} />
  <View style={styles.escrowInfoText}>
    <Text style={styles.escrowInfoTitle}>Payments held in escrow</Text>
    <Text style={styles.escrowInfoBody}>
      We hold your payment until you confirm the job is done. If you cancel before
      the pro starts, your refund follows our cancellation policy.
    </Text>
    <Pressable onPress={() => router.push(Routes.CUSTOMER.TERMS)}>
      <Text style={styles.escrowInfoLink}>View cancellation policy →</Text>
    </Pressable>
  </View>
</View>
```

### Test signature

`apps/mobile/__tests__/payment-methods-no-siguradoshield.test.tsx`:

```tsx
describe('PaymentMethodsScreen (Bug 983)', () => {
  it('does not advertise SiguradoShield in escrow info box', () => {
    const { queryByText } = render(<PaymentMethodsScreen />);
    expect(queryByText(/siguradoshield/i)).toBeNull();
    expect(queryByText(/₱50,000/)).toBeNull();
    expect(queryByText(/₱100,000/)).toBeNull();
  });

  it('still displays factual escrow language', () => {
    const { getByText } = render(<PaymentMethodsScreen />);
    expect(getByText(/Payments held in escrow/i)).toBeTruthy();
  });
});
```

---

## Bug 686 — Help screen FAQ section

**File:** `apps/mobile/app/customer/help.tsx`

### Current state

A FAQ section in the help screen has an entry titled "What is SiguradoShield?" with answer detailing peso amounts.

### Exact fix

Delete the FAQ entry entirely. Add a new entry:

```tsx
// apps/mobile/app/customer/help.tsx — FAQ section

const faqs = [
  // ... other FAQs ...
  {
    question: 'What happens if there is a problem during the service?',
    answer: 'Open a dispute from your booking detail screen within 48 hours of the scheduled completion. Our support team reviews evidence from both parties (photos, GPS log, chat history) and works toward a fair resolution. Resolution may include a partial refund, full refund, or release of payment to the pro depending on findings.',
  },
  {
    question: 'How are payments protected?',
    answer: 'All payments are held in escrow until you confirm the job is complete or 48 hours pass without action. If you cancel before the pro starts, refunds follow our cancellation policy.',
  },
  // ... 
];
```

**No mention of insurance, SiguradoShield, peso-amount coverage anywhere in help.**

---

## Bug 834 — Generic SiguradoShield reference (section 6 of another file)

**File:** wherever the V14 audit cited section 6

### Current state

A miscellaneous file has a section 6 referring to SiguradoShield insurance. Search for any remaining references:

```bash
grep -rn -i "siguradoshield\|premiumProtection\|propertyDamage\|Layer.*2.*claim" \
  apps/mobile/app apps/mobile/src
```

### Exact fix

Delete every match. After deletion, run gate `a-cross-source-no-siguradoshield.sh`:

```bash
# scripts/gates/a-cross-source-no-siguradoshield.sh
#!/usr/bin/env bash
set -euo pipefail
violations=$(grep -rEi "siguradoshield|premiumProtection|propertyDamage|siguradoShieldDeductible" \
  apps/ packages/ \
  --include="*.ts" --include="*.tsx" --include="*.json" --include="*.md" 2>/dev/null \
  | grep -v "LAUNCH-LIMITATIONS.md" \
  | grep -v "/decisions/D04-siguradoshield.md" \
  | grep -v "PART-3-BUG-REMEDIATION" \
  || true)
if [ -n "$violations" ]; then
  echo "GATE A VIOLATION (Bug 538/Option A): SiguradoShield references found in code"
  echo "$violations"
  exit 1
fi
echo "Gate A — no SiguradoShield: OK"
```

The gate excludes `LAUNCH-LIMITATIONS.md` and `decisions/D04-siguradoshield.md` because those legitimately document the absence.

---

## Documentation updates

### `LAUNCH-LIMITATIONS.md` — add §19

```markdown
## §19 — SiguradoShield insurance product (Bug 538)

The SiguradoShield™ insurance / claims product was scoped during Phase 8 but
not implemented for v1.0 launch. Specifically:

- **Layer 1 (escrow protection)** is wired and functional. Customer payments
  are held until job confirmation. This is NOT insurance — it's a payment
  flow guarantee.
- **Layer 2 (claims service)** is NOT wired. There is no claims pipeline,
  no insurance partner contract, no settlement vendor, no Insurance
  Commission registration.

For v1.0:
- All customer-facing surfaces advertising SiguradoShield with peso-amount
  coverage have been removed (see Phase 14 Dispatch 04).
- Customer-facing safety language describes only verifiable claims:
  NBI clearance, escrow payment, real-time tracking, masked phone numbers.

For v1.1+:
- If business case warrants, partner with a Philippine insurance underwriter
  (PNB Gen, Pioneer, etc.).
- Register product with Insurance Commission (RA 11765 — Financial Products
  and Services Consumer Protection Act).
- Build claims pipeline (`POST /claims`, processing workflow, settlement vendor).
- Restore SiguradoShield branding to surfaces with valid coverage.

Decision recorded in `.ai-coder/decisions/D04-siguradoshield.md`.
```

### `LAUNCH-LIMITATIONS.md` — also remove any contradictory entries

If LAUNCH-LIMITATIONS previously mentioned SiguradoShield as "wired" anywhere, those references must be deleted in this dispatch.

### `docs/STRATEGIC-DECISIONS-LOG.md`

Add a new decision entry:

```markdown
## DECISION-018 — SiguradoShield Layer 2 deferred to v1.1+

Date: <Phase 14 dispatch 04>
Context: V14 audit found 6 customer-facing surfaces advertising SiguradoShield
insurance with specific peso-amount coverage figures. Layer 2 claims service
is not wired. False advertising risk under RA 7394 + Insurance Commission
exposure.
Decision: Pull all 6 surfaces. Document in LAUNCH-LIMITATIONS §19. Defer
Layer 2 implementation to v1.1+ post-business-case.
Rationale: Insurance product requires partner contract + IC registration +
months of engineering. Not gating v1.0 launch.
```

---

## Dispatch 04 closeout

**Bugs claimed fixed (8):**
- Bug 1168 — `apps/mobile/src/config/platform.config.ts:54-57` — test: `__tests__/no-siguradoshield-config.test.ts`
- Bug 860 — `apps/mobile/app/onboarding.tsx` — test: `__tests__/onboarding-no-siguradoshield.test.ts`
- Bug 889 — `apps/mobile/app/(tabs)/home.tsx` — test: `__tests__/home-no-siguradoshield.test.tsx`
- Bug 920 — `apps/mobile/app/(tabs)/profile.tsx` — test: `__tests__/profile-no-siguradoshield-menu.test.tsx`
- Bug 538 — `apps/mobile/app/customer/safety.tsx` (renamed) — test: `__tests__/safety-and-support.test.tsx`
- Bug 983 — `apps/mobile/app/customer/payment-methods.tsx:82-91` — test: `__tests__/payment-methods-no-siguradoshield.test.tsx`
- Bug 686 — `apps/mobile/app/customer/help.tsx` FAQ — test: `__tests__/help-no-siguradoshield.test.tsx`
- Bug 834 — miscellaneous reference — test: gate `a-cross-source-no-siguradoshield.sh`

**Files added:**
- `.ai-coder/decisions/D04-siguradoshield.md`
- `scripts/gates/a-cross-source-no-siguradoshield.sh`
- 7 test files
- `apps/mobile/app/customer/safety-and-support.tsx` (renamed from safety.tsx)

**Files modified:**
- `apps/mobile/src/config/platform.config.ts`
- `apps/mobile/app/onboarding.tsx`
- `apps/mobile/app/(tabs)/home.tsx`
- `apps/mobile/app/(tabs)/profile.tsx`
- `apps/mobile/app/customer/payment-methods.tsx`
- `apps/mobile/app/customer/help.tsx`
- `apps/mobile/src/config/navigation.ts` (Routes update)
- `LAUNCH-LIMITATIONS.md`
- `docs/STRATEGIC-DECISIONS-LOG.md`

**Files deleted:**
- (nothing — `safety.tsx` renamed not deleted)

**Gates run:**
- Gate A — `a-cross-source-no-siguradoshield.sh` passes (zero references)
- Gate B — every claimed bug has file diff + test
- Gate C — constitution clean
- Gate D — visual baselines updated for safety-and-support, home, profile, onboarding, payment-methods, help (6 screens with new visuals)
- Gate E — mutation testing on changed files passes ≥99%

**Decision points for Ken:**
- After this dispatch lands, V1.0 ships with **no insurance product**. Provider IC agreement (Dispatch 10's onboarding flow) explicitly tells providers they need their own personal liability insurance. This may affect provider acquisition. Monitor signups vs target.
- The Insurance Commission of the Philippines doesn't proactively audit unregistered insurance products — but a customer complaint citing "they advertised insurance and didn't honor a claim" can trigger an inquiry. With Dispatch 04, no such advertising exists, so this risk is mitigated.
- v1.1 should restore SiguradoShield branding only AFTER:
  1. Insurance partner LOI signed
  2. IC registration submitted
  3. Claims pipeline live and tested
  4. Reinsurance / underwriting capacity confirmed
  5. Customer support trained on claims flow

---

# What's next: Dispatches 05–08

This installment of Part 3 covered Dispatches 03 (gate hardening) and 04 (SiguradoShield decision). Coming next:

- **Dispatch 05 — Money trust closure**: 8 client-trusted-price violations (Bugs 915, 927, 953, 1132, 952, 417, 1219, 1230). Each has the same shape: client computes money, sends to server, server trusts. Fix: server is canonical, client sends only IDs/quantities, server returns canonical price. Affects mobile customer booking flow + provider quote flow.
- **Dispatch 06 — Transactional audit completeness**: 14 bugs where money moves AND audit logs but not in same db.transaction. Failure modes: audit fails after money moved (audit gap) or money moves before audit but rolls back leaving orphan audit. Fix: `db.transaction(async trx => { ... money + audit + notification all here })`. Bugs 69, 70, 71, 78, 79, 80, 82, 83, 84, 85, 105, 106, 127, 237.
- **Dispatch 07 — Provider job execution trust**: 12 bugs anchored on Bug 460/461/463 (checklist hardcoded, photos not uploaded, no server validation). Plus Bug 36/37/38 (chat broken, signature not captured, photo upload broken). The fix moves checklist templates to server, photos to S3 multipart, signature to canvas-pad. This is the dispatch that restores the integrity of the entire job-completion pipeline.
- **Dispatch 08 — NPC compliance + DSR**: 18 bugs spanning DSR queue (Bug 397/398/401/402), consent versions, breach notification 72h SLA, marketing consent honored at backend (Bug 969 chain), data-rights screen flows, audit log PII masking (Bug 66 chain).

After Dispatches 05–08, you have the security + money + provider integrity + compliance foundations all in place. Dispatches 09–14 are mostly polish + admin operability + final cutover.

Say continue for Dispatches 05–08.
