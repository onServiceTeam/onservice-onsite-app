# PHASE 00 — BOOTSTRAP

**Goal:** Set up the AI coder infrastructure: checkpoint scripts, design tokens, branch hygiene, log directory. After this phase, every subsequent phase has the tooling it needs to verify itself.


> **⚠️ READ FIRST:** Before starting this phase, read `.ai-coder/phases/PHASE-HEADER.md`. After every meaningful change in this phase you must run the after-every-change sanity ritual and log to `.ai-coder/checkpoints/logs/PHASE-NN/sanity-checks.log`. `verify-master.sh` checks this at end of phase.


**Branch:** `phase/00-bootstrap`
**Estimated time:** 1 hour
**Dependencies:** None (this is the first phase)
**Risk:** Very low — only adds files, no business logic

---

## Step 0 — Pre-flight check

Run from repo root:

```bash
git status
# Expected: working tree clean on main

git log -1 --oneline
# Expected: 322330a or later

npm install
# Expected: zero errors

npm run typecheck
# Expected: zero errors

npm run api:test
# Expected: all tests pass

ls -la .ai-coder/ 2>/dev/null && echo "EXISTS" || echo "MISSING"
# .ai-coder folder must already exist (Ken installed it from this package)

ls -la .ai-coder/CONSTITUTION.md .ai-coder/DEFINITION-OF-DONE.md .ai-coder/SELF-VERIFICATION-PROTOCOL.md .ai-coder/ESCALATION-PROTOCOL.md
# All four files must exist
```

If any of the above fail, STOP and report to Ken before proceeding.

## Step 1 — Create the branch

```bash
git checkout -b phase/00-bootstrap
```

## Step 2 — Create the checkpoint logs directory

```bash
mkdir -p .ai-coder/checkpoints/logs
mkdir -p .ai-coder/checkpoints/logs/escalations
touch .ai-coder/checkpoints/logs/.gitkeep
touch .ai-coder/checkpoints/logs/escalations/.gitkeep
```

## Step 3 — Write the checkpoint scripts

Create `.ai-coder/checkpoints/verify-phase.sh`:

```bash
#!/bin/bash
# verify-phase.sh — runs all standard checks and writes to log
# Usage: bash .ai-coder/checkpoints/verify-phase.sh PHASE-NN

set -e

PHASE_NAME="${1:-UNKNOWN}"
LOG_FILE=".ai-coder/checkpoints/logs/${PHASE_NAME}.log"
mkdir -p "$(dirname "$LOG_FILE")"

{
  echo "=== Phase Verification Log: $PHASE_NAME ==="
  echo "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo ""

  echo "=== Step 1: TypeScript ==="
  npm run typecheck 2>&1
  echo ""

  echo "=== Step 2: Lint ==="
  npm run lint 2>&1
  echo ""

  echo "=== Step 3: API Tests ==="
  npm run api:test 2>&1
  echo ""

  echo "=== Step 4: Forbidden Patterns Check ==="
  bash .ai-coder/checkpoints/verify-no-forbidden.sh
  echo ""

  echo "=== Step 5: Money Conservation ==="
  bash .ai-coder/checkpoints/verify-money-conservation.sh
  echo ""

  echo "=== Step 6: Git status ==="
  git status
  echo ""

  echo "=== Step 7: Final commit ==="
  git log -1 --format=fuller
  echo ""

  echo "=== Phase Verification Complete: $PHASE_NAME ==="
  echo "Finished: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} | tee "$LOG_FILE"
```

Create `.ai-coder/checkpoints/verify-no-forbidden.sh`:

```bash
#!/bin/bash
# Detects forbidden patterns in committed code.
# Exits 1 if any are found.

set -e

EXIT_CODE=0
FOUND_FILES=""

check_pattern() {
    local pattern="$1"
    local description="$2"
    local result
    result=$(grep -rn "$pattern" packages/api/src apps/admin/src apps/mobile/app 2>/dev/null | grep -v node_modules | grep -v __tests__ | grep -v ".test.ts" | grep -v ".spec.ts" || true)
    if [ -n "$result" ]; then
        echo "FORBIDDEN PATTERN: $description"
        echo "$result"
        echo ""
        EXIT_CODE=1
    fi
}

check_pattern "// TODO" "TODO comments"
check_pattern "// FIXME" "FIXME comments"
check_pattern "// HACK" "HACK comments"
check_pattern "// PENDING" "PENDING comments"
check_pattern "console\.log" "console.log statements"
check_pattern ": any\b" "explicit any type"
check_pattern "as any\b" "any cast"
check_pattern "@ts-ignore" "ts-ignore"
check_pattern "Math\.random()" "Math.random for IDs"
check_pattern '\$' "USD dollar sign in source code"

if [ $EXIT_CODE -eq 0 ]; then
    echo "PASS: No forbidden patterns found in production code."
else
    echo "FAIL: Forbidden patterns found. See above."
fi

exit $EXIT_CODE
```

Create `.ai-coder/checkpoints/verify-money-conservation.sh`:

```bash
#!/bin/bash
# Runs the money conservation tests specifically.

set -e

echo "Running escrow-money-conservation.test.ts..."
npm run api:test -- escrow-money-conservation.test.ts

echo ""
echo "Running commission.test.ts..."
npm run api:test -- commission.test.ts

echo ""
echo "Running dispute-refund-processing.test.ts..."
npm run api:test -- dispute-refund-processing.test.ts

echo ""
echo "Running booking-state-machine.test.ts..."
npm run api:test -- booking-state-machine.test.ts

echo ""
echo "PASS: All money conservation and state machine tests passed."
```

Create `.ai-coder/checkpoints/verify-no-emoji.sh`:

```bash
#!/bin/bash
# Detects emoji used as iconography in production code.
# After Phase 02, this should always pass.
# Returns 1 if any emoji is found in icon-position contexts.

set -e

EXIT_CODE=0

# Common emoji used as icons
EMOJI_PATTERNS=$(printf '%s|' \
  "🧹" "🔧" "⚡" "🏠" "💰" "📋" "⚠️" "👤" "🎨" "🚿" "📊" "👥" "📦" \
  "💹" "⚖️" "💸" "📣" "🔄" "🏢" "📍" "📈" "🔍" "🎫" "⚙️" "🚨" "⏰" "📅" \
  "🎉" "📁" "🔒" "🛠️" "🚀" "✅" "❌" | sed 's/|$//')

# Search admin pages and components, mobile app, but skip tests and content fields
RESULT=$(grep -rnE "$EMOJI_PATTERNS" apps/admin/src apps/mobile/app 2>/dev/null \
  | grep -v node_modules \
  | grep -v __tests__ \
  | grep -v ".test.ts" \
  | grep -v ".spec.ts" \
  | grep -vE "(message|notification|review|chat|description|title)\s*[:=]\s*['\"]" \
  || true)

if [ -n "$RESULT" ]; then
    echo "FORBIDDEN: Emoji used as iconography. After Phase 02, this is a violation."
    echo "$RESULT"
    EXIT_CODE=1
fi

if [ $EXIT_CODE -eq 0 ]; then
    echo "PASS: No emoji-as-iconography found."
fi

exit $EXIT_CODE
```

Create `.ai-coder/checkpoints/verify-screens.sh`:

```bash
#!/bin/bash
# Verifies the screen count matches the spec.

set -e

MOBILE_SCREENS=$(find apps/mobile/app -name "*.tsx" -not -path "*/node_modules/*" | wc -l | tr -d ' ')
ADMIN_PAGES=$(ls apps/admin/src/pages/*.tsx 2>/dev/null | wc -l | tr -d ' ')
ADMIN_COMPONENTS=$(find apps/admin/src/components -name "*.tsx" -not -path "*/node_modules/*" | wc -l | tr -d ' ')

echo "Mobile screens: $MOBILE_SCREENS"
echo "Admin pages: $ADMIN_PAGES"
echo "Admin components: $ADMIN_COMPONENTS"

if [ "$MOBILE_SCREENS" -lt 83 ]; then
    echo "FAIL: Mobile screen count $MOBILE_SCREENS is below baseline 83. Did you delete screens?"
    exit 1
fi

if [ "$ADMIN_PAGES" -lt 19 ]; then
    echo "FAIL: Admin page count $ADMIN_PAGES is below baseline 19. Did you delete pages?"
    exit 1
fi

echo "PASS: Screen counts at or above baseline."
exit 0
```

Create `.ai-coder/checkpoints/verify-database.sh`:

```bash
#!/bin/bash
# Verifies the database is in expected shape.
# Requires DATABASE_URL env var.

set -e

if [ -z "$DATABASE_URL" ]; then
    echo "WARN: DATABASE_URL not set. Skipping database verification."
    exit 0
fi

# Check migration count
MIGRATION_COUNT=$(ls packages/api/migrations/*.sql 2>/dev/null | wc -l | tr -d ' ')
echo "Migration files: $MIGRATION_COUNT"

if [ "$MIGRATION_COUNT" -lt 49 ]; then
    echo "FAIL: Migration count $MIGRATION_COUNT below baseline 49. Did you delete migrations?"
    exit 1
fi

# Verify critical tables exist (this requires psql installed and DATABASE_URL set)
if command -v psql &> /dev/null; then
    REQUIRED_TABLES=(
        "users" "providers" "service_categories" "service_subcategories"
        "services" "bookings" "wallets" "payouts" "disputes" "messages"
        "reviews" "audit_log" "addresses" "service_areas" "pricing_rules"
        "platform_settings" "admin_staff_roles"
    )

    for table in "${REQUIRED_TABLES[@]}"; do
        EXISTS=$(psql "$DATABASE_URL" -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '$table')" 2>/dev/null | tr -d ' ')
        if [ "$EXISTS" != "t" ]; then
            echo "FAIL: Required table '$table' does not exist."
            exit 1
        fi
    done

    echo "PASS: All required tables present."
else
    echo "INFO: psql not installed; skipping table check."
fi

exit 0
```

## Step 4 — Make scripts executable

```bash
chmod +x .ai-coder/checkpoints/*.sh
ls -la .ai-coder/checkpoints/
```

## Step 5 — Create the design tokens file

Create `docs/design-system/tokens.json`:

```json
{
  "$schema": "https://design-tokens.github.io/community-group/format/",
  "metadata": {
    "version": "1.0.0",
    "platform": "onService PH",
    "updated": "2026-04-27"
  },
  "color": {
    "brand": {
      "primary": { "value": "#0F62FE", "type": "color", "description": "Primary brand blue — admin sidebar, primary buttons" },
      "primary-hover": { "value": "#0353E9", "type": "color" },
      "primary-active": { "value": "#002D9C", "type": "color" },
      "secondary": { "value": "#6F6F6F", "type": "color" },
      "accent": { "value": "#FA4D56", "type": "color", "description": "Accent for alerts, dispute badges" }
    },
    "status": {
      "success": { "value": "#24A148", "type": "color" },
      "success-bg": { "value": "#DEFBE6", "type": "color" },
      "warning": { "value": "#F1C21B", "type": "color" },
      "warning-bg": { "value": "#FCF4D6", "type": "color" },
      "danger": { "value": "#DA1E28", "type": "color" },
      "danger-bg": { "value": "#FFF1F1", "type": "color" },
      "info": { "value": "#0043CE", "type": "color" },
      "info-bg": { "value": "#EDF5FF", "type": "color" }
    },
    "neutral": {
      "0": { "value": "#FFFFFF", "type": "color" },
      "50": { "value": "#F4F4F4", "type": "color" },
      "100": { "value": "#E0E0E0", "type": "color" },
      "200": { "value": "#C6C6C6", "type": "color" },
      "300": { "value": "#A8A8A8", "type": "color" },
      "400": { "value": "#8D8D8D", "type": "color" },
      "500": { "value": "#6F6F6F", "type": "color" },
      "600": { "value": "#525252", "type": "color" },
      "700": { "value": "#393939", "type": "color" },
      "800": { "value": "#262626", "type": "color" },
      "900": { "value": "#161616", "type": "color" }
    },
    "semantic": {
      "text-primary": { "value": "{color.neutral.900}", "type": "color" },
      "text-secondary": { "value": "{color.neutral.600}", "type": "color" },
      "text-tertiary": { "value": "{color.neutral.400}", "type": "color" },
      "background": { "value": "{color.neutral.0}", "type": "color" },
      "background-secondary": { "value": "{color.neutral.50}", "type": "color" },
      "border": { "value": "{color.neutral.100}", "type": "color" },
      "border-strong": { "value": "{color.neutral.200}", "type": "color" }
    }
  },
  "spacing": {
    "0": { "value": "0", "type": "dimension" },
    "1": { "value": "4px", "type": "dimension" },
    "2": { "value": "8px", "type": "dimension" },
    "3": { "value": "12px", "type": "dimension" },
    "4": { "value": "16px", "type": "dimension" },
    "5": { "value": "20px", "type": "dimension" },
    "6": { "value": "24px", "type": "dimension" },
    "8": { "value": "32px", "type": "dimension" },
    "10": { "value": "40px", "type": "dimension" },
    "12": { "value": "48px", "type": "dimension" },
    "16": { "value": "64px", "type": "dimension" }
  },
  "radius": {
    "none": { "value": "0", "type": "dimension" },
    "sm": { "value": "4px", "type": "dimension" },
    "md": { "value": "8px", "type": "dimension" },
    "lg": { "value": "12px", "type": "dimension" },
    "xl": { "value": "16px", "type": "dimension" },
    "full": { "value": "9999px", "type": "dimension" }
  },
  "typography": {
    "font-family": {
      "sans": { "value": "Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif", "type": "fontFamily" },
      "mono": { "value": "JetBrains Mono, Menlo, monospace", "type": "fontFamily" }
    },
    "font-weight": {
      "regular": { "value": 400, "type": "fontWeight" },
      "medium": { "value": 500, "type": "fontWeight" },
      "semibold": { "value": 600, "type": "fontWeight" },
      "bold": { "value": 700, "type": "fontWeight" }
    },
    "size": {
      "xs": { "value": "11px", "type": "dimension" },
      "sm": { "value": "12px", "type": "dimension" },
      "base": { "value": "14px", "type": "dimension" },
      "md": { "value": "16px", "type": "dimension" },
      "lg": { "value": "18px", "type": "dimension" },
      "xl": { "value": "20px", "type": "dimension" },
      "2xl": { "value": "24px", "type": "dimension" },
      "3xl": { "value": "30px", "type": "dimension" },
      "4xl": { "value": "36px", "type": "dimension" }
    },
    "line-height": {
      "tight": { "value": 1.25, "type": "number" },
      "normal": { "value": 1.5, "type": "number" },
      "relaxed": { "value": 1.625, "type": "number" }
    }
  },
  "shadow": {
    "sm": { "value": "0 1px 2px 0 rgb(0 0 0 / 0.05)", "type": "shadow" },
    "md": { "value": "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)", "type": "shadow" },
    "lg": { "value": "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)", "type": "shadow" }
  },
  "currency": {
    "symbol": { "value": "₱", "type": "string" },
    "iso": { "value": "PHP", "type": "string" },
    "locale": { "value": "en-PH", "type": "string" }
  },
  "timezone": {
    "default": { "value": "Asia/Manila", "type": "string" }
  }
}
```

## Step 6 — Create templates

Create `.ai-coder/templates/PHASE-LOG-TEMPLATE.md`:

```markdown
# Phase NN — [Title]

**Branch:** phase/NN-name
**Started:** YYYY-MM-DDTHH:MM:SSZ
**Finished:** YYYY-MM-DDTHH:MM:SSZ
**Status:** PASS | FAIL

## Self-Attestation

I attest that all 14 Conditions of Done are met for Phase NN. I ran every checkpoint script myself in this session. I read every error message in full. I did not skip, suppress, or work around any check. If any of this is untrue, I commit a constitutional violation.

## Summary

3-5 sentences describing what changed.

## Files Changed

- path/to/file: one-line description
- path/to/file: one-line description

## Tests

- Tests added: N
- Tests passing before: M
- Tests passing after: M+N
- Money conservation: PASS
- State machine: PASS

## Self-Audit Answers

1. What did this phase change? ...
2. What is the riskiest line of code in the diff, and why? ...
3. What edge case am I least confident about? ...
4. If this phase introduced a bug that won't surface for 2 weeks, what is it most likely to be? ...
5. What did I almost do but caught myself? ...
6. Is there any code that exists only to make a test pass? No.
7. Did I read every error message in full? ...
8. Did I rerun the failing tests after fixing? ...
9. Did I check empty database state? ...
10. Did I check no-permission state? ...
11. Anything missing tests? ...
12. Anything missing types? ...
13. Followed existing patterns or invented new? ...
14. Would I be embarrassed if Ken read every line? ...

## Screens to Review

- [URL or screen name]: what to verify

## Open Questions

(or "None")

## Next Phase

PHASE-XX (per the phases index)
```

Create `.ai-coder/templates/BUG-REPORT-TEMPLATE.md`:

```markdown
# Bug Report

**Severity:** Critical | High | Medium | Low
**Affects:** [users / providers / admin / data / money]
**Discovered during:** Phase NN

## What's wrong

Plain language description.

## How to reproduce

1. Step 1
2. Step 2
3. Expected: ...
4. Actual: ...

## Impact

Who is affected and how.

## Recommendation

Fix in current phase | Defer to phase NN | Fix immediately as hotfix

## Reference

- File: path/to/file:line
- Related: any related issues
```

Create `.ai-coder/templates/SCREEN-AUDIT-TEMPLATE.md`:

```markdown
# Screen Audit — [Screen Name]

**Path:** apps/[admin|mobile]/...
**Stitch reference:** [URL or N/A]
**Audited:** YYYY-MM-DD

## Visual

- Matches design tokens: ✅ | ❌
- Uses lucide icons (no emoji): ✅ | ❌
- Responsive: ✅ | ❌
- Loading state: ✅ | ❌
- Error state: ✅ | ❌
- Empty state: ✅ | ❌

## Interactions

- All buttons functional: ✅ | ❌
- Form validation: ✅ | ❌
- Submit flow: ✅ | ❌
- Cancel flow: ✅ | ❌
- Back navigation: ✅ | ❌

## Data

- Loading from real API: ✅ | ❌ (no hardcoded mock data)
- Error handling on API failure: ✅ | ❌
- Stale data refresh: ✅ | ❌

## Accessibility

- Keyboard nav: ✅ | ❌
- Screen reader labels: ✅ | ❌
- Color contrast: ✅ | ❌
- Touch targets >= 44px: ✅ | ❌

## Issues

(list any issues found)
```

## Step 7 — Verify everything

Run from repo root:

```bash
# Make sure scripts are executable
chmod +x .ai-coder/checkpoints/*.sh

# Run the verify script (this will create logs/PHASE-00.log)
bash .ai-coder/checkpoints/verify-phase.sh PHASE-00

# Inspect the log
cat .ai-coder/checkpoints/logs/PHASE-00.log | tail -30
```

Expected output ends with `=== Phase Verification Complete: PHASE-00 ===` and no FAIL lines.

## Step 8 — Commit

```bash
git add .ai-coder/checkpoints/
git add docs/design-system/tokens.json
git add .ai-coder/templates/

git commit -m "phase 00: bootstrap — checkpoint scripts, design tokens, templates

Adds:
- .ai-coder/checkpoints/ scripts (verify-phase, verify-no-forbidden, verify-money-conservation, verify-no-emoji, verify-screens, verify-database)
- .ai-coder/templates/ (PHASE-LOG, BUG-REPORT, SCREEN-AUDIT)
- docs/design-system/tokens.json (color, spacing, typography, currency tokens)
- .ai-coder/checkpoints/logs/ directory with .gitkeep

Files changed:
- .ai-coder/checkpoints/verify-phase.sh: master verification script
- .ai-coder/checkpoints/verify-no-forbidden.sh: detects TODO, FIXME, console.log, any-type
- .ai-coder/checkpoints/verify-money-conservation.sh: runs money tests
- .ai-coder/checkpoints/verify-no-emoji.sh: detects emoji-as-iconography (Phase 02+)
- .ai-coder/checkpoints/verify-screens.sh: ensures screen counts don't regress
- .ai-coder/checkpoints/verify-database.sh: validates DB schema
- docs/design-system/tokens.json: design tokens (locked)
- .ai-coder/templates/*: log and report templates

Checkpoints: see .ai-coder/checkpoints/logs/PHASE-00.log
"
```

## Step 9 — Phase report to Ken

Send to Ken in chat:

```
**Phase 00 — Bootstrap**
Status: PASS

Summary: Set up the AI coder verification infrastructure. Added 6 checkpoint scripts in .ai-coder/checkpoints/. Created design tokens at docs/design-system/tokens.json. Added log and report templates. Verified all scripts run successfully.

Files changed:
- 6 checkpoint scripts (.sh)
- 1 design tokens file (tokens.json)
- 3 templates (.md)
- 1 log directory created

Checkpoint log: .ai-coder/checkpoints/logs/PHASE-00.log

Screens to review: None (no UI changes)

Open questions: None

Next phase: PHASE-01 (Design System) — pending your approval.
```

STOP here. Wait for Ken's "approved, proceed to Phase 01."
