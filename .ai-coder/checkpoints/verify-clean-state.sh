#!/bin/bash
# verify-clean-state.sh
#
# Verifies the codebase works from a fresh clone.
# Defends against The Local-Only laziness pattern.
#
# Procedure:
#   1. Stash any local changes
#   2. Clean all build artifacts and node_modules
#   3. Reinstall from package-lock.json
#   4. Run typecheck, lint, build, test
#   5. Restore stash
#
# Run at end of every phase. Logs to gates/gate-5-cleanstate.log.

set -e

LOG_FILE="${LOG_FILE:-.ai-coder/checkpoints/logs/cleanstate-$(date +%Y%m%d-%H%M%S).log}"
mkdir -p "$(dirname "$LOG_FILE")"

{
  echo "=== Clean State Verification ==="
  echo "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo ""

  # Capture state before
  echo "--- Pre-state ---"
  git status
  echo ""

  STASH_NAME="cleanstate-verify-$(date +%s)"
  if [ -n "$(git status --porcelain)" ]; then
    echo "Stashing local changes as $STASH_NAME..."
    git stash push -u -m "$STASH_NAME"
    HAVE_STASH=1
  else
    HAVE_STASH=0
  fi

  # Clean
  echo "--- Cleaning build artifacts and node_modules ---"
  git clean -fdx -e ".env" -e ".env.local" -e "*.log"
  echo ""

  # Reinstall
  echo "--- npm ci (reinstalling from lock file) ---"
  npm ci 2>&1
  echo ""

  # Typecheck
  echo "--- Typecheck ---"
  npm run typecheck 2>&1
  echo ""

  # Lint
  echo "--- Lint ---"
  npm run lint 2>&1
  echo ""

  # Build (admin)
  echo "--- Admin build ---"
  cd apps/admin && npm run build 2>&1
  cd ../..
  echo ""

  # Test
  echo "--- Tests ---"
  npm run api:test 2>&1
  echo ""

  # Restore
  if [ "$HAVE_STASH" = "1" ]; then
    echo "--- Restoring stashed changes ---"
    git stash pop
  fi

  echo ""
  echo "=== Clean State Verification Complete ==="
  echo "Finished: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo ""
  echo "PASS: Codebase works from clean state."

} | tee "$LOG_FILE"
