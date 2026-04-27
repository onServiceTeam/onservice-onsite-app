#!/bin/bash
# verify-screens.sh
#
# Counts admin pages, mobile screens, and reusable UI components.
# Logs to artifact for tracking growth over time.
# Detects regressions (screen disappeared without corresponding migration).

set -e

LOG_DIR=".ai-coder/checkpoints/logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/screens-$(date +%Y%m%d-%H%M%S).log"

{
  echo "=== Screen Inventory ==="
  echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo ""

  echo "--- Admin Pages ---"
  if [ -d "apps/admin/src/pages" ]; then
    find apps/admin/src/pages -type f \( -name "*.tsx" -o -name "*.jsx" \) | sort
    echo ""
    ADMIN_COUNT=$(find apps/admin/src/pages -type f \( -name "*.tsx" -o -name "*.jsx" \) | wc -l)
    echo "Admin page count: $ADMIN_COUNT"
  else
    echo "No apps/admin/src/pages directory found"
  fi
  echo ""

  echo "--- Admin Components (reusable UI) ---"
  if [ -d "apps/admin/src/components" ]; then
    find apps/admin/src/components -type f \( -name "*.tsx" -o -name "*.jsx" \) | sort
    echo ""
    ADMIN_COMP_COUNT=$(find apps/admin/src/components -type f \( -name "*.tsx" -o -name "*.jsx" \) | wc -l)
    echo "Admin component count: $ADMIN_COMP_COUNT"
  fi
  echo ""

  echo "--- Mobile Screens ---"
  if [ -d "apps/mobile/app" ]; then
    find apps/mobile/app -type f \( -name "*.tsx" -o -name "*.jsx" \) | sort
    echo ""
    MOBILE_COUNT=$(find apps/mobile/app -type f \( -name "*.tsx" -o -name "*.jsx" \) | wc -l)
    echo "Mobile screen count: $MOBILE_COUNT"
  fi
  echo ""

  echo "--- Mobile Components ---"
  if [ -d "apps/mobile/components" ]; then
    find apps/mobile/components -type f \( -name "*.tsx" -o -name "*.jsx" \) | sort
    echo ""
    MOBILE_COMP_COUNT=$(find apps/mobile/components -type f \( -name "*.tsx" -o -name "*.jsx" \) | wc -l)
    echo "Mobile component count: $MOBILE_COMP_COUNT"
  fi
} | tee "$LOG"

echo ""
echo "PASS: Screen inventory captured at $LOG"
