#!/bin/bash
# verify-no-forbidden.sh
#
# Detects forbidden patterns. These are constitutional violations and any
# match here is a hard fail. The pre-commit hook calls this script.
#
# Patterns detected:
#  - TODO / FIXME / HACK / XXX / PENDING / KLUDGE / TEMP comments
#  - console.log / console.warn / console.error in production code
#  - 'any' type or 'as any' or 'as unknown as' casts
#  - @ts-ignore, @ts-nocheck, @ts-expect-error
#  - eslint-disable (broad disable; line-disable with justification OK)
#  - Empty catch blocks
#  - alert() / confirm() / prompt() in code (UI should use proper modals)
#  - hardcoded credentials patterns

set -e

EXIT_CODE=0
SEARCH_DIRS="packages/api/src apps/admin/src apps/mobile/app apps/mobile/src apps/mobile/components"
EXCLUDE='--exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build --exclude-dir=.next --exclude-dir=coverage --exclude=*.test.ts --exclude=*.spec.ts --exclude=*.test.tsx --exclude=*.spec.tsx'

check_pattern() {
  local pattern="$1"
  local description="$2"
  local hits

  hits=$(grep -rnE $EXCLUDE "$pattern" $SEARCH_DIRS 2>/dev/null || true)

  if [ -n "$hits" ]; then
    echo ""
    echo "FORBIDDEN: $description"
    echo "$hits" | head -20
    local count
    count=$(echo "$hits" | wc -l)
    if [ "$count" -gt 20 ]; then
      echo "... and $((count - 20)) more"
    fi
    EXIT_CODE=1
  fi
}

# Comments that signal incomplete work
check_pattern "//\s*TODO" "TODO comments — finish the work or open a tracked issue"
check_pattern "//\s*FIXME" "FIXME comments — fix it now"
check_pattern "//\s*HACK" "HACK comments — refactor or escalate"
check_pattern "//\s*XXX" "XXX comments — fix or remove"
check_pattern "//\s*PENDING" "PENDING comments — finish it"
check_pattern "//\s*KLUDGE" "KLUDGE comments — fix it"
check_pattern "//\s*TEMP" "TEMP comments — finish the proper implementation"

# Console statements
check_pattern "console\.(log|debug)\(" "console.log/debug — use the structured logger"
check_pattern "console\.warn\(" "console.warn — use the structured logger"

# Type system bypass
check_pattern ":\s*any[\s,;\)\>]" "explicit 'any' type"
check_pattern "as any[\s,;\)]" "'as any' type assertion"
check_pattern "as unknown as " "double cast — escalate, do not bypass"

# TypeScript directive bypass
check_pattern "@ts-ignore" "@ts-ignore — fix the underlying type issue"
check_pattern "@ts-nocheck" "@ts-nocheck — type-check this file"
check_pattern "@ts-expect-error" "@ts-expect-error — fix the underlying type issue"

# ESLint bypass (file or block-level)
check_pattern "/\*\s*eslint-disable\s*\*/" "block-level eslint-disable"
check_pattern "/\*\s*eslint-disable\s+[a-z\-/@]" "block-level eslint-disable for specific rule"

# Empty catch
check_pattern "catch\s*\([^\)]*\)\s*\{\s*\}" "empty catch block — handle the error or rethrow"
check_pattern "\.catch\(\(\)\s*=>\s*\{\s*\}\)" "empty .catch() — handle or rethrow"

# Browser dialogs (use proper UI)
check_pattern "window\.alert\(" "window.alert — use a proper modal/toast"
check_pattern "window\.confirm\(" "window.confirm — use a proper confirmation dialog"
check_pattern "window\.prompt\(" "window.prompt — use a proper input modal"

# DOM manipulation that bypasses React. Allowed only in main.tsx (root mount).
DOM_GET=$(grep -rnE $EXCLUDE "document\.getElementById" $SEARCH_DIRS 2>/dev/null | grep -v "main.tsx" || true)
if [ -n "$DOM_GET" ]; then
  echo ""
  echo "FORBIDDEN: document.getElementById outside main.tsx — use refs instead"
  echo "$DOM_GET"
  EXIT_CODE=1
fi
check_pattern "document\.querySelector" "document.querySelector in app code — use refs"

# Hardcoded patterns
check_pattern "password\s*[:=]\s*['\"][a-zA-Z0-9]" "possible hardcoded password"
check_pattern "secret\s*[:=]\s*['\"][a-zA-Z0-9]" "possible hardcoded secret"
check_pattern "apiKey\s*[:=]\s*['\"][a-zA-Z0-9]" "possible hardcoded API key"

# Currency violations (PH project — must use ₱)
# Skip SQL parameter patterns ($1, $2, ...) and template literal placeholders.
# We look for actual currency-amount strings: $123, $1.50, $1,000 — never $1 in template/SQL context.
check_pattern '\\\$[0-9]+\\.[0-9]|\\\$[0-9]{2,3},[0-9]{3}|"[^"]*\\\$[0-9]+[^"]*"' "wrong currency symbol — PH uses ₱"
check_pattern "['\\\"](USD|EUR|GBP)['\\\"]" "wrong currency code — PH uses PHP"

# Date violations (PH project — must use Asia/Manila)
check_pattern "America/|Europe/|Pacific/Honolulu|Pacific/Auckland" "wrong timezone — PH uses Asia/Manila"

# Direct DB pool usage (must go through helper). Allowed only in database.config.ts.
DIRECT_POOL=$(grep -rnE $EXCLUDE "new Pool\(" $SEARCH_DIRS 2>/dev/null | grep -v "database.config.ts" || true)
if [ -n "$DIRECT_POOL" ]; then
  echo ""
  echo "FORBIDDEN: direct Pool instantiation outside database.config.ts"
  echo "$DIRECT_POOL"
  EXIT_CODE=1
fi

if [ $EXIT_CODE -eq 0 ]; then
  echo "PASS: No forbidden patterns detected."
else
  echo ""
  echo "FAIL: Forbidden patterns found. Fix all before committing."
  echo "These are constitutional violations under Article 4 (Code Quality Standards)."
fi

exit $EXIT_CODE
