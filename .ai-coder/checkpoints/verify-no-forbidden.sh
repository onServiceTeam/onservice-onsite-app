#!/bin/bash
# verify-no-forbidden.sh
#
# Detects forbidden patterns. These are constitutional violations.
#
# MODES:
#   Legacy (no --phase):  fails if ANY violation exists in the repo.
#                         Used by pre-commit hooks and ad-hoc scans.
#   Baseline-delta (--phase PHASE-NN):
#                         fails ONLY if THIS phase introduced a NEW violation
#                         (file in `git diff --diff-filter=AM baseline..HEAD`).
#                         Pre-existing violations are reported informationally
#                         and accumulated by verify-master.sh into BASELINE-DEBT.md.
#                         See TD-001.
#
# Patterns detected: TODO/FIXME/HACK/XXX/PENDING/KLUDGE/TEMP, console.log,
#  any/as any/double-cast, @ts-ignore/@ts-nocheck/@ts-expect-error, eslint-disable
#  blocks, empty catch, browser dialogs, hardcoded secrets, wrong currency,
#  wrong timezone, direct Pool() outside database.config.ts.

set -e

PHASE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --phase) PHASE="$2"; shift 2 ;;
    *) shift ;;
  esac
done

SEARCH_DIRS="packages/api/src apps/admin/src apps/mobile/app apps/mobile/src apps/mobile/components"
EXCLUDE='--exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build --exclude-dir=.next --exclude-dir=coverage --exclude=*.test.ts --exclude=*.spec.ts --exclude=*.test.tsx --exclude=*.spec.tsx'

VIOLATIONS_FILE=$(mktemp)
trap "rm -f $VIOLATIONS_FILE ${VIOLATIONS_FILE}.delta" EXIT

# Collect all violations into VIOLATIONS_FILE (one per line, format:
# `file:line:content  [DESC: <description>]`).
collect_pattern() {
  local pattern="$1"
  local description="$2"
  grep -rnE $EXCLUDE "$pattern" $SEARCH_DIRS 2>/dev/null | while IFS= read -r hit; do
    printf '%s\n' "${hit}  [DESC: ${description}]"
  done >> "$VIOLATIONS_FILE" || true
}

# Comments that signal incomplete work
collect_pattern "//\s*TODO" "TODO comment"
collect_pattern "//\s*FIXME" "FIXME comment"
collect_pattern "//\s*HACK" "HACK comment"
collect_pattern "//\s*XXX" "XXX comment"
collect_pattern "//\s*PENDING" "PENDING comment"
collect_pattern "//\s*KLUDGE" "KLUDGE comment"
collect_pattern "//\s*TEMP" "TEMP comment"

# Console statements
collect_pattern "console\.(log|debug)\(" "console.log/debug"
collect_pattern "console\.warn\(" "console.warn"

# Type system bypass
collect_pattern ":\s*any[\s,;\)\>]" "explicit 'any' type"
collect_pattern "as any[\s,;\)]" "'as any' assertion"
collect_pattern "as unknown as " "double cast"

# TypeScript directive bypass
collect_pattern "@ts-ignore" "@ts-ignore"
collect_pattern "@ts-nocheck" "@ts-nocheck"
collect_pattern "@ts-expect-error" "@ts-expect-error"

# ESLint bypass
collect_pattern "/\*\s*eslint-disable\s*\*/" "block-level eslint-disable"
collect_pattern "/\*\s*eslint-disable\s+[a-z\-/@]" "block-level eslint-disable for rule"

# Empty catch
collect_pattern "catch\s*\([^\)]*\)\s*\{\s*\}" "empty catch block"
collect_pattern "\.catch\(\(\)\s*=>\s*\{\s*\}\)" "empty .catch()"

# Browser dialogs
collect_pattern "window\.alert\(" "window.alert"
collect_pattern "window\.confirm\(" "window.confirm"
collect_pattern "window\.prompt\(" "window.prompt"

# DOM manipulation outside main.tsx
grep -rnE $EXCLUDE "document\.getElementById" $SEARCH_DIRS 2>/dev/null \
  | grep -v "main.tsx" \
  | while IFS= read -r hit; do
      printf '%s\n' "${hit}  [DESC: document.getElementById outside main.tsx]"
    done >> "$VIOLATIONS_FILE" || true
collect_pattern "document\.querySelector" "document.querySelector in app code"

# Hardcoded patterns
collect_pattern "password\s*[:=]\s*['\"][a-zA-Z0-9]" "possible hardcoded password"
collect_pattern "secret\s*[:=]\s*['\"][a-zA-Z0-9]" "possible hardcoded secret"
collect_pattern "apiKey\s*[:=]\s*['\"][a-zA-Z0-9]" "possible hardcoded API key"

# Currency violations
collect_pattern '\$[0-9]+\.[0-9]|\$[0-9]{2,3},[0-9]{3}|"[^"]*\$[0-9]+[^"]*"' "wrong currency symbol (PH uses ₱)"
collect_pattern "['\"](USD|EUR|GBP)['\"]" "wrong currency code (PH uses PHP)"

# Date violations
collect_pattern "America/|Europe/|Pacific/Honolulu|Pacific/Auckland" "wrong timezone (PH uses Asia/Manila)"

# Direct Pool() outside database.config.ts
grep -rnE $EXCLUDE "new Pool\(" $SEARCH_DIRS 2>/dev/null \
  | grep -v "database.config.ts" \
  | while IFS= read -r hit; do
      printf '%s\n' "${hit}  [DESC: direct Pool instantiation outside database.config.ts]"
    done >> "$VIOLATIONS_FILE" || true

# Sort + dedupe (same line may match multiple patterns; keep all for visibility
# but make output deterministic).
sort -u -o "$VIOLATIONS_FILE" "$VIOLATIONS_FILE"

ABSOLUTE_COUNT=$(wc -l < "$VIOLATIONS_FILE" | tr -d ' ')

# === BASELINE-DELTA MODE ===
if [ -n "$PHASE" ]; then
  source "$(dirname "$0")/lib/baseline-diff.sh"
  filter_to_phase_diff "$PHASE" < "$VIOLATIONS_FILE" > "${VIOLATIONS_FILE}.delta" || true
  DELTA_COUNT=$(wc -l < "${VIOLATIONS_FILE}.delta" | tr -d ' ')

  report_baseline_delta "gate-1-forbidden" "$ABSOLUTE_COUNT" "$DELTA_COUNT" "$VIOLATIONS_FILE"

  if [ "$DELTA_COUNT" -gt 0 ]; then
    echo ""
    echo "FAIL: ${PHASE} introduced ${DELTA_COUNT} new forbidden-pattern violation(s):"
    cat "${VIOLATIONS_FILE}.delta"
    echo ""
    echo "Each is a constitutional violation under Article 4 (Code Quality Standards)."
    exit 1
  fi

  echo "GATE: PASS (no new violations introduced by ${PHASE})"
  exit 0
fi

# === LEGACY ABSOLUTE MODE ===
if [ "$ABSOLUTE_COUNT" -gt 0 ]; then
  echo "FORBIDDEN PATTERNS DETECTED (${ABSOLUTE_COUNT}):"
  head -n 50 "$VIOLATIONS_FILE"
  if [ "$ABSOLUTE_COUNT" -gt 50 ]; then
    echo "... and $((ABSOLUTE_COUNT - 50)) more"
  fi
  echo ""
  echo "FAIL: Forbidden patterns found. Fix all before committing."
  echo "These are constitutional violations under Article 4 (Code Quality Standards)."
  exit 1
fi

echo "PASS: No forbidden patterns detected."
exit 0
